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
import { deleteItemMemoryIndex, indexItemMemory } from '../services/memoryEmbeddings.ts';
import { deleteManagedUpload, ManagedUploadError, saveBase64Image, toClientAssetUrl } from '../services/storage.ts';
import { recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const FALLBACK_HALL_ID = '其他';

const itemStatusSchema = z.enum(['raw', 'in-progress', 'remused']);
const createItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(100),
  hallId: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  material: z.string().trim().max(100).optional(),
  imageBase64: z.string().min(1).optional(),
  coverImageBase64: z.string().min(1).optional(),
  story: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  ideas: z.array(z.unknown()).max(10).optional(),
  status: itemStatusSchema.optional(),
  dateCollected: z.string().optional(),
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

    const { name, hallId, category, material, imageBase64, coverImageBase64, story, tags, ideas, status, dateCollected } = parsed.data;
    const id = uuidv4();

    const imagePath = imageBase64
      ? await saveBase64Image(imageBase64, 'items', req.userId!, id)
      : '';
    const coverImagePath = coverImageBase64
      ? await saveBase64Image(coverImageBase64, 'item-covers', req.userId!, id)
      : '';

    const item = createItem({
      id,
      user_id: req.userId!,
      name,
      hall_id: hallId || category || FALLBACK_HALL_ID,
      category: category || FALLBACK_HALL_ID,
      material: material || '',
      image_path: imagePath,
      cover_image_path: coverImagePath,
      story: story || '',
      tags: tags || [],
      ideas: ideas || [],
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

    const { name, hallId, category, material, imageBase64, coverImageBase64, story, tags, ideas, status } = parsed.data;

    let imagePath = existing.image_path;
    if (imageBase64) {
      imagePath = await saveBase64Image(imageBase64, 'items', req.userId!, existing.id);
    }
    let coverImagePath = existing.cover_image_path || existing.coverImageUrl || '';
    if (coverImageBase64) {
      coverImagePath = await saveBase64Image(coverImageBase64, 'item-covers', req.userId!, existing.id);
    }

    const updated = updateItem({
      id: existing.id,
      user_id: req.userId!,
      name: name ?? existing.name,
      hall_id: hallId ?? existing.hallId,
      category: category ?? existing.category,
      material: material ?? existing.material,
      image_path: imagePath,
      cover_image_path: coverImagePath,
      story: story ?? existing.story,
      tags: tags ?? existing.tags,
      ideas: ideas ?? existing.ideas,
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
}>(item: T | null | undefined) {
  if (!item) {
    return item;
  }

  return {
    ...item,
    imageUrl: toClientAssetUrl(item.image_path || item.imageUrl || ''),
    coverImageUrl: toClientAssetUrl(item.cover_image_path || item.coverImageUrl || ''),
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

export default router;
