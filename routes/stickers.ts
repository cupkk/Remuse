import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createSticker,
  deleteSticker,
  getItemById,
  getStickerById,
  getStickersByUser,
} from '../services/database.ts';
import { deleteManagedUpload, ManagedUploadError, saveBase64Image, toClientAssetUrl } from '../services/storage.ts';
import { recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const FALLBACK_CATEGORY = '其他';

const createStickerSchema = z.object({
  originalItemId: z.string().trim().min(1).optional(),
  imageBase64: z.string().min(1),
  dramaText: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  dateCreated: z.string().optional(),
});

router.get('/', (req: Request, res: Response) => {
  try {
    const stickers = getStickersByUser(req.userId!);
    res.json({ stickers: stickers.map((sticker) => resolveImageUrl(sticker)) });
  } catch (error) {
    console.error('Failed to load stickers:', error);
    res.status(500).json({ error: 'Failed to load stickers' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createStickerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
      return;
    }

    const { originalItemId, imageBase64, dramaText, category, dateCreated } = parsed.data;
    const id = uuidv4();

    let safeOriginalItemId: string | null = originalItemId || null;
    if (safeOriginalItemId) {
      const sourceItem = getItemById(safeOriginalItemId, req.userId!);
      if (!sourceItem) {
        safeOriginalItemId = null;
      }
    }

    const imagePath = await saveBase64Image(imageBase64, 'stickers', req.userId!, id);
    createSticker({
      id,
      user_id: req.userId!,
      original_item_id: safeOriginalItemId,
      image_path: imagePath,
      drama_text: dramaText || '',
      category: category || FALLBACK_CATEGORY,
      date_created: dateCreated || new Date().toISOString(),
    });
    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'sticker_generate',
      details: {
        originalItemId: safeOriginalItemId,
        category: category || FALLBACK_CATEGORY,
      },
    });

    res.json({
      sticker: {
        id,
        originalItemId: safeOriginalItemId,
        stickerImageUrl: toClientAssetUrl(imagePath),
        dramaText: dramaText || '',
        category: category || FALLBACK_CATEGORY,
        dateCreated: dateCreated || new Date().toISOString(),
      },
    });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create sticker');
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getStickerById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: 'Sticker not found' });
      return;
    }

    const result = deleteSticker(req.params.id as string, req.userId!);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Sticker not found' });
      return;
    }

    if (existing.image_path) {
      deleteManagedUpload(existing.image_path);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete sticker:', error);
    res.status(500).json({ error: 'Failed to delete sticker' });
  }
});

function resolveImageUrl(sticker: Record<string, unknown>) {
  return {
    ...sticker,
    stickerImageUrl: toClientAssetUrl(
      (sticker.image_path as string) || (sticker.stickerImageUrl as string) || '',
    ),
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
