import { promises as fs } from 'node:fs';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createItem,
  deleteItem,
  getItemById,
  getItemsByUser,
  updateItem,
} from '../services/database.ts';
import { generateCollectionCoverTask } from '../services/aiService.ts';
import { deleteItemMemoryIndex, indexItemMemory } from '../services/memoryEmbeddings.ts';
import {
  deleteManagedUpload,
  getManagedUploadInfo,
  ManagedUploadError,
  saveBase64Audio,
  saveBase64Image,
  toClientAssetUrl,
} from '../services/storage.ts';
import { recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const FALLBACK_HALL_ID = '其他';

const itemStatusSchema = z.enum(['raw', 'in-progress', 'remused']);
const createItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(100),
  hallId: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  material: z.string().trim().max(100).optional(),
  description: z.string().trim().max(400).optional(),
  imageBase64: z.string().min(1).optional(),
  coverImageBase64: z.string().min(1).optional(),
  audioBase64: z.string().min(1).optional(),
  story: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  status: itemStatusSchema.optional(),
  dateCollected: z.string().optional(),
  clearAudio: z.boolean().optional(),
});

const updateItemSchema = createItemSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

router.get('/', (req: Request, res: Response) => {
  try {
    const items = getItemsByUser(req.userId!);
    res.json({ items: items.map((item) => resolveImageUrl(item)) });
  } catch (error) {
    console.error('Failed to load items:', error);
    res.status(500).json({ error: 'Failed to load items' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
      return;
    }

    const {
      name,
      hallId,
      category,
      material,
      description,
      imageBase64,
      coverImageBase64,
      audioBase64,
      story,
      tags,
      status,
      dateCollected,
    } = parsed.data;
    const id = uuidv4();
    const resolvedHallId = hallId || category || FALLBACK_HALL_ID;
    const resolvedCategory = category || FALLBACK_HALL_ID;

    const imagePath = imageBase64
      ? await saveBase64Image(imageBase64, 'items', req.userId!, id)
      : '';
    const coverImagePayload = coverImageBase64
      || await buildGeneratedCoverPayload({
        userId: req.userId!,
        itemId: id,
        hallId: resolvedHallId,
        itemName: name,
        imageBase64,
      });
    const coverImagePath = coverImagePayload
      ? await saveBase64Image(coverImagePayload, 'item-covers', req.userId!, id)
      : '';
    const audioPath = audioBase64
      ? await saveBase64Audio(audioBase64, 'item-audio', req.userId!, id)
      : '';

    const item = createItem({
      id,
      user_id: req.userId!,
      name,
      hall_id: resolvedHallId,
      category: resolvedCategory,
      material: material || '',
      description: description || '',
      image_path: imagePath,
      cover_image_path: coverImagePath,
      audio_path: audioPath,
      story: story || '',
      tags: tags || [],
      status: status || 'raw',
      date_collected: dateCollected || new Date().toISOString(),
    });

    if (!item) {
      res.status(500).json({ error: 'Failed to create item' });
      return;
    }

    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'scan_archive',
      details: {
        hallId: item.hallId,
        category: item.category,
      },
    });

    try {
      await indexItemMemory(item, req.userId!);
    } catch (indexError) {
      console.error('Failed to index item memory embedding after create:', indexError);
    }

    res.json({ item: resolveImageUrl(item) });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create item');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = getItemById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
      return;
    }

    const {
      name,
      hallId,
      category,
      material,
      description,
      imageBase64,
      coverImageBase64,
      audioBase64,
      story,
      tags,
      status,
      clearAudio,
    } = parsed.data;
    const nextName = name ?? existing.name;
    const nextHallId = hallId ?? existing.hallId;

    let imagePath = existing.image_path;
    if (imageBase64) {
      imagePath = await saveBase64Image(imageBase64, 'items', req.userId!, existing.id);
    }
    let coverImagePath = existing.cover_image_path || existing.coverImageUrl || '';
    if (coverImageBase64) {
      coverImagePath = await saveBase64Image(coverImageBase64, 'item-covers', req.userId!, existing.id);
    } else if (shouldRegenerateCover(existing, { hallId, name, imageBase64 })) {
      const sourceImagePayload = imageBase64 || await readManagedUploadAsDataUrl(imagePath);
      const generatedCoverPayload = sourceImagePayload
        ? await buildGeneratedCoverPayload({
          userId: req.userId!,
          itemId: existing.id,
          hallId: nextHallId,
          itemName: nextName,
          imageBase64: sourceImagePayload,
        })
        : '';
      if (generatedCoverPayload) {
        coverImagePath = await saveBase64Image(generatedCoverPayload, 'item-covers', req.userId!, existing.id);
      }
    }
    let audioPath = existing.audio_path || existing.audioUrl || '';
    if (audioBase64) {
      audioPath = await saveBase64Audio(audioBase64, 'item-audio', req.userId!, existing.id);
    } else if (clearAudio) {
      audioPath = '';
    }

    const updated = updateItem({
      id: existing.id,
      user_id: req.userId!,
      name: nextName,
      hall_id: nextHallId,
      category: category ?? existing.category,
      material: material ?? existing.material,
      description: description ?? existing.description,
      image_path: imagePath,
      cover_image_path: coverImagePath,
      audio_path: audioPath,
      story: story ?? existing.story,
      tags: tags ?? existing.tags,
      status: status ?? existing.status,
    });

    if (!updated) {
      res.status(500).json({ error: 'Failed to update item' });
      return;
    }

    if (existing.image_path && existing.image_path !== imagePath) {
      deleteManagedUpload(existing.image_path);
    }
    if (existing.cover_image_path && existing.cover_image_path !== coverImagePath) {
      deleteManagedUpload(existing.cover_image_path);
    }
    if (existing.audio_path && existing.audio_path !== audioPath) {
      deleteManagedUpload(existing.audio_path);
    }

    try {
      await indexItemMemory(updated, req.userId!);
    } catch (indexError) {
      console.error('Failed to reindex item memory embedding after update:', indexError);
    }

    res.json({ item: resolveImageUrl(updated) });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update item');
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getItemById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const result = deleteItem(req.params.id as string, req.userId!);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (existing.image_path) {
      deleteManagedUpload(existing.image_path);
    }
    if (existing.cover_image_path) {
      deleteManagedUpload(existing.cover_image_path);
    }
    if (existing.audio_path) {
      deleteManagedUpload(existing.audio_path);
    }

    try {
      deleteItemMemoryIndex(existing.id, req.userId!);
    } catch (indexError) {
      console.error('Failed to remove item memory embedding after delete:', indexError);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

function resolveImageUrl<T extends {
  image_path?: string;
  imageUrl?: string;
  cover_image_path?: string;
  coverImageUrl?: string;
  audio_path?: string;
  audioUrl?: string;
}>(item: T | null | undefined) {
  if (!item) {
    return item;
  }

  return {
    ...item,
    imageUrl: toClientAssetUrl(item.image_path || item.imageUrl || ''),
    coverImageUrl: toClientAssetUrl(item.cover_image_path || item.coverImageUrl || ''),
    audioUrl: toClientAssetUrl(item.audio_path || item.audioUrl || ''),
  };
}

function handleRouteError(res: Response, error: unknown, fallbackMessage: string) {
  console.error(fallbackMessage, error);

  if (error instanceof ManagedUploadError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  res.status(500).json({ error: fallbackMessage });
}

async function buildGeneratedCoverPayload(input: {
  userId: string;
  itemId: string;
  hallId: string;
  itemName: string;
  imageBase64?: string;
}) {
  if (!input.imageBase64) {
    return '';
  }

  try {
    const { coverImageUrl } = await generateCollectionCoverTask(
      stripDataUrlPrefix(input.imageBase64),
      input.itemName,
      input.hallId,
    );
    return coverImageUrl;
  } catch (error) {
    console.error('Failed to generate collection cover:', {
      userId: input.userId,
      itemId: input.itemId,
      hallId: input.hallId,
      itemName: input.itemName,
      message: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

function shouldRegenerateCover(
  existing: ReturnType<typeof getItemById>,
  updates: {
    hallId?: string;
    name?: string;
    imageBase64?: string;
  },
) {
  if (!existing) {
    return false;
  }

  return Boolean(
    updates.imageBase64
    || !existing.cover_image_path
    || (updates.hallId && updates.hallId !== existing.hallId)
    || (updates.name && updates.name !== existing.name),
  );
}

async function readManagedUploadAsDataUrl(uploadPath: string) {
  const info = getManagedUploadInfo(uploadPath || '');
  if (!info) {
    return '';
  }

  const buffer = await fs.readFile(info.absolutePath);
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

function stripDataUrlPrefix(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/);
  return match?.[1] || trimmed;
}

export default router;
