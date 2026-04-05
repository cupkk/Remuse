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
import { readManagedUploadAsOptimizedDataUrl } from '../services/managedImageSource.ts';
import { deleteItemMemoryIndex, indexItemMemory } from '../services/memoryEmbeddings.ts';
import { serverLogger } from '../services/serverLogger.ts';
import {
  deleteManagedUpload,
  ManagedUploadError,
  saveBase64Audio,
  saveBase64Image,
  toClientAssetUrl,
} from '../services/storage.ts';
import { recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const backgroundCoverJobs = new Map<string, Promise<void>>();
const backgroundMemoryJobs = new Map<string, Promise<void>>();
const FALLBACK_HALL_ID = '\u5176\u4ed6';
const ITEM_MESSAGE_NAME_REQUIRED = '\u8bf7\u8f93\u5165\u85cf\u54c1\u540d\u79f0\u3002';
const ITEM_MESSAGE_UPDATE_REQUIRED = '\u81f3\u5c11\u9700\u8981\u63d0\u4ea4\u4e00\u4e2a\u8981\u66f4\u65b0\u7684\u5b57\u6bb5\u3002';
const ITEM_MESSAGE_INVALID_BODY = '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002';
const ITEM_MESSAGE_LOAD_FAILED = '\u52a0\u8f7d\u85cf\u54c1\u5931\u8d25\u3002';
const ITEM_MESSAGE_CREATE_FAILED = '\u521b\u5efa\u85cf\u54c1\u5931\u8d25\u3002';
const ITEM_MESSAGE_UPDATE_FAILED = '\u66f4\u65b0\u85cf\u54c1\u5931\u8d25\u3002';
const ITEM_MESSAGE_DELETE_FAILED = '\u5220\u9664\u85cf\u54c1\u5931\u8d25\u3002';
const ITEM_MESSAGE_NOT_FOUND = '\u85cf\u54c1\u4e0d\u5b58\u5728\u3002';

const itemStatusSchema = z.enum(['raw', 'in-progress', 'remused']);
const createItemSchema = z.object({
  name: z.string().trim().min(1, ITEM_MESSAGE_NAME_REQUIRED).max(100),
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
  { message: ITEM_MESSAGE_UPDATE_REQUIRED },
);

router.get('/', (req: Request, res: Response) => {
  try {
    const items = getItemsByUser(req.userId!);
    res.json({ items: items.map((item) => resolveImageUrl(item, req.userId!)) });
  } catch (error) {
    console.error('\u52a0\u8f7d\u85cf\u54c1\u5217\u8868\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: ITEM_MESSAGE_LOAD_FAILED });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || ITEM_MESSAGE_INVALID_BODY });
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
    let coverImagePath = coverImageBase64
      ? await saveBase64Image(coverImageBase64, 'item-covers', req.userId!, id)
      : '';
    const audioPath = audioBase64
      ? await saveBase64Audio(audioBase64, 'item-audio', req.userId!, id)
      : '';

    if (!coverImagePath && imagePath) {
      coverImagePath = await generateAndPersistCover({
        userId: req.userId!,
        itemId: id,
        hallId: resolvedHallId,
        itemName: name,
        imagePath,
      });
    }

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
      res.status(500).json({ error: ITEM_MESSAGE_CREATE_FAILED });
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

    scheduleItemMemoryIndex(item, req.userId!, 'create');
    if (!coverImagePath && imagePath) {
      scheduleGeneratedCoverRefresh({
        userId: req.userId!,
        itemId: item.id,
        hallId: item.hallId,
        itemName: item.name,
        imagePath,
      });
    }

    res.json({ item: resolveImageUrl(item, req.userId!) });
  } catch (error) {
    handleRouteError(res, error, ITEM_MESSAGE_CREATE_FAILED);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = getItemById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: ITEM_MESSAGE_NOT_FOUND });
      return;
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || ITEM_MESSAGE_INVALID_BODY });
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
    const shouldRefreshCoverNow = !coverImageBase64 && shouldRegenerateCover(existing, { hallId, name, imageBase64 });
    let coverRefreshedSynchronously = false;
    if (coverImageBase64) {
      coverImagePath = await saveBase64Image(coverImageBase64, 'item-covers', req.userId!, existing.id);
    } else if (shouldRefreshCoverNow && imagePath) {
      const refreshedCoverPath = await generateAndPersistCover({
        userId: req.userId!,
        itemId: existing.id,
        hallId: nextHallId,
        itemName: nextName,
        imagePath,
        previousCoverPath: existing.cover_image_path || existing.coverImageUrl || '',
      });

      if (refreshedCoverPath) {
        coverImagePath = refreshedCoverPath;
        coverRefreshedSynchronously = true;
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
      res.status(500).json({ error: ITEM_MESSAGE_UPDATE_FAILED });
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

    scheduleItemMemoryIndex(updated, req.userId!, 'update');
    if (shouldRefreshCoverNow && imagePath && !coverRefreshedSynchronously) {
      scheduleGeneratedCoverRefresh({
        userId: req.userId!,
        itemId: existing.id,
        hallId: nextHallId,
        itemName: nextName,
        imagePath,
      });
    }

    res.json({ item: resolveImageUrl(updated, req.userId!) });
  } catch (error) {
    handleRouteError(res, error, ITEM_MESSAGE_UPDATE_FAILED);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getItemById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: ITEM_MESSAGE_NOT_FOUND });
      return;
    }

    const result = deleteItem(req.params.id as string, req.userId!);
    if (result.changes === 0) {
      res.status(404).json({ error: ITEM_MESSAGE_NOT_FOUND });
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

    scheduleItemMemoryDeletion(existing.id, req.userId!);

    res.json({ success: true });
  } catch (error) {
    console.error('\u5220\u9664\u85cf\u54c1\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: ITEM_MESSAGE_DELETE_FAILED });
  }
});

function scheduleGeneratedCoverRefresh(input: {
  userId: string;
  itemId: string;
  hallId: string;
  itemName: string;
  imagePath: string;
}) {
  const jobKey = `${input.userId}:${input.itemId}`;
  if (backgroundCoverJobs.has(jobKey)) {
    return;
  }

  const job = (async () => {
    try {
      const sourceImagePayload = await readManagedUploadAsOptimizedDataUrl(input.imagePath, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 78,
      });
      if (!sourceImagePayload) {
        return;
      }

      const generatedCoverPayload = await buildGeneratedCoverPayload({
        userId: input.userId,
        itemId: input.itemId,
        hallId: input.hallId,
        itemName: input.itemName,
        imageBase64: sourceImagePayload,
      });
      if (!generatedCoverPayload) {
        return;
      }

      const nextCoverPath = await saveBase64Image(generatedCoverPayload, 'item-covers', input.userId, input.itemId);
      const current = getItemById(input.itemId, input.userId);
      if (!current) {
        deleteManagedUpload(nextCoverPath);
        return;
      }

      const previousCoverPath = current.cover_image_path || current.coverImageUrl || '';
      updateItem({
        id: current.id,
        user_id: input.userId,
        name: current.name,
        hall_id: current.hallId,
        category: current.category,
        material: current.material,
        description: current.description,
        image_path: current.image_path || current.imageUrl || '',
        cover_image_path: nextCoverPath,
        audio_path: current.audio_path || current.audioUrl || '',
        story: current.story,
        tags: current.tags,
        status: current.status,
      });

      if (previousCoverPath && previousCoverPath !== nextCoverPath) {
        deleteManagedUpload(previousCoverPath);
      }

      serverLogger.info('item.cover.refresh.completed', {
        userId: input.userId,
        itemId: input.itemId,
        hallId: input.hallId,
      });
    } catch (error) {
      if (isBackgroundShutdownError(error)) {
        return;
      }

      serverLogger.warn('item.cover.refresh.failed', {
        userId: input.userId,
        itemId: input.itemId,
        hallId: input.hallId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      backgroundCoverJobs.delete(jobKey);
    }
  })();

  backgroundCoverJobs.set(jobKey, job);
  void job;
}

function scheduleItemMemoryIndex(
  item: NonNullable<ReturnType<typeof getItemById>>,
  userId: string,
  reason: 'create' | 'update',
) {
  const jobKey = `${userId}:${item.id}`;
  if (backgroundMemoryJobs.has(jobKey)) {
    return;
  }

  const job = (async () => {
    try {
      await indexItemMemory(item, userId);
      serverLogger.info('item.memory_index.completed', {
        userId,
        itemId: item.id,
        reason,
      });
    } catch (error) {
      if (isBackgroundShutdownError(error)) {
        return;
      }

      serverLogger.warn('item.memory_index.failed', {
        userId,
        itemId: item.id,
        reason,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      backgroundMemoryJobs.delete(jobKey);
    }
  })();

  backgroundMemoryJobs.set(jobKey, job);
  void job;
}

function scheduleItemMemoryDeletion(itemId: string, userId: string) {
  const jobKey = `${userId}:${itemId}:delete`;
  if (backgroundMemoryJobs.has(jobKey)) {
    return;
  }

  const job = Promise.resolve()
    .then(() => deleteItemMemoryIndex(itemId, userId))
    .catch((error) => {
      if (isBackgroundShutdownError(error)) {
        return;
      }

      serverLogger.warn('item.memory_index.delete_failed', {
        userId,
        itemId,
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      backgroundMemoryJobs.delete(jobKey);
    });

  backgroundMemoryJobs.set(jobKey, job);
}

function isBackgroundShutdownError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /database connection is not open/i.test(message);
}

function resolveImageUrl<T extends {
  id?: string;
  image_path?: string;
  imageUrl?: string;
  cover_image_path?: string;
  coverImageUrl?: string;
  audio_path?: string;
  audioUrl?: string;
}>(item: T | null | undefined, userId?: string) {
  if (!item) {
    return item;
  }

  const imageUrl = toClientAssetUrl(item.image_path || item.imageUrl || '');
  const hasCoverRefreshJob = Boolean(userId && item.id && backgroundCoverJobs.has(`${userId}:${item.id}`));

  return {
    ...item,
    imageUrl,
    coverImageUrl: toClientAssetUrl(item.cover_image_path || item.coverImageUrl || item.image_path || item.imageUrl || ''),
    coverPending: hasCoverRefreshJob,
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
    console.error('\u751f\u6210\u85cf\u54c1\u5c01\u9762\u5931\u8d25\uff1a', {
      userId: input.userId,
      itemId: input.itemId,
      hallId: input.hallId,
      itemName: input.itemName,
      message: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

async function generateAndPersistCover(input: {
  userId: string;
  itemId: string;
  hallId: string;
  itemName: string;
  imagePath: string;
  previousCoverPath?: string;
}) {
  const sourceImagePayload = await readManagedUploadAsOptimizedDataUrl(input.imagePath, {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 78,
  });

  if (!sourceImagePayload) {
    return '';
  }

  const generatedCoverPayload = await buildGeneratedCoverPayload({
    userId: input.userId,
    itemId: input.itemId,
    hallId: input.hallId,
    itemName: input.itemName,
    imageBase64: sourceImagePayload,
  });

  if (!generatedCoverPayload) {
    return '';
  }

  const nextCoverPath = await saveBase64Image(
    generatedCoverPayload,
    'item-covers',
    input.userId,
    input.itemId,
  );

  if (input.previousCoverPath && input.previousCoverPath !== nextCoverPath) {
    deleteManagedUpload(input.previousCoverPath);
  }

  return nextCoverPath;
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

function stripDataUrlPrefix(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/);
  return match?.[1] || trimmed;
}

export default router;
