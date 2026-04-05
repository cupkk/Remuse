import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createSavedJournal,
  deleteSavedJournal,
  getSavedJournalById,
  getSavedJournalsByUser,
  updateSavedJournal,
} from '../services/database.ts';
import {
  deleteManagedUpload,
  ManagedUploadError,
  saveBase64Image,
  toClientAssetUrl,
} from '../services/storage.ts';

const router = Router();

const nullableTrimmedString = (max: number, fallback = '') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === 'string' ? value.trim() : fallback))
    .pipe(z.string().max(max))
    .default(fallback);

const stickerSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(120),
  originalItemId: nullableTrimmedString(120, ''),
  stickerImageUrl: z.string().trim().min(1).max(4096),
  dramaText: nullableTrimmedString(1000, ''),
  category: nullableTrimmedString(120, '其他'),
  dateCreated: nullableTrimmedString(120, ''),
});

const journalLayoutItemSchema = z.object({
  stickerId: z.string().trim().min(1).max(120),
  sticker: stickerSnapshotSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(),
  scale: z.number().positive(),
  zIndex: z.number().int(),
});

const baseJournalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  previewImageBase64: z.union([z.string(), z.null(), z.undefined()]).optional(),
  previewImageUrl: nullableTrimmedString(4096, '').optional(),
  backgroundImageBase64: z.union([z.string(), z.null(), z.undefined()]).optional(),
  backgroundImageUrl: nullableTrimmedString(4096, '').optional(),
  templateId: z.string().trim().min(1).max(120),
  year: z.number().int().min(1900).max(3000),
  month: z.number().int().min(1).max(12),
  headerNote: nullableTrimmedString(1000, '').optional(),
  backgroundColor: nullableTrimmedString(40, '#fffdf7').optional(),
  backgroundOverlay: z.number().min(0).max(1).optional(),
  selectedStickerIds: z.array(z.string().trim().min(1).max(120)).max(24),
  layoutItems: z.array(journalLayoutItemSchema).max(24),
  dateCreated: nullableTrimmedString(120, '').optional(),
});

const createJournalSchema = baseJournalSchema.refine(
  (value) => Boolean(value.previewImageBase64 || value.previewImageUrl),
  { message: '请提供手账预览图。' },
);

router.get('/', (req: Request, res: Response) => {
  try {
    const journals = getSavedJournalsByUser(req.userId!);
    res.json({
      journals: journals.map((journal) => resolveJournalImageUrls(journal)),
    });
  } catch (error) {
    console.error('\u52a0\u8f7d\u624b\u8d26\u5217\u8868\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: '加载手账失败。' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createJournalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
      return;
    }

    const id = uuidv4();
    const journal = await saveJournalRecord(req.userId!, id, parsed.data);
    res.json({
      journal: resolveJournalImageUrls(journal),
    });
  } catch (error) {
    handleRouteError(res, error, '保存手账失败。');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const journalId = String(req.params.id || '').trim();
    if (!journalId) {
      res.status(400).json({ error: '缺少手账 ID。' });
      return;
    }

    const existing = getSavedJournalById(journalId, req.userId!);
    if (!existing) {
      res.status(404).json({ error: '未找到该手账。' });
      return;
    }

    const parsed = createJournalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
      return;
    }

    const journal = await saveJournalRecord(req.userId!, journalId, parsed.data, existing);
    res.json({
      journal: resolveJournalImageUrls(journal),
    });
  } catch (error) {
    handleRouteError(res, error, '更新手账失败。');
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getSavedJournalById(req.params.id as string, req.userId!);
    if (!existing) {
      res.status(404).json({ error: '未找到该手账。' });
      return;
    }

    const result = deleteSavedJournal(req.params.id as string, req.userId!);
    if (result.changes === 0) {
      res.status(404).json({ error: '未找到该手账。' });
      return;
    }

    if (existing.preview_image_path) {
      deleteManagedUpload(existing.preview_image_path);
    }
    if (existing.background_image_path) {
      deleteManagedUpload(existing.background_image_path);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('\u5220\u9664\u624b\u8d26\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: '删除手账失败。' });
  }
});

async function saveJournalRecord(
  userId: string,
  id: string,
  input: z.infer<typeof createJournalSchema>,
  existing?: Record<string, unknown> | null,
) {
  const previewImagePath = input.previewImageBase64
    ? await saveBase64Image(input.previewImageBase64, 'journals-preview', userId, id)
    : normalizeStoredUploadPath(input.previewImageUrl || String(existing?.preview_image_path || existing?.previewImageUrl || ''));

  const nextBackgroundPath = input.backgroundImageBase64
    ? await saveBase64Image(input.backgroundImageBase64, 'journals-backgrounds', userId, `${id}-bg`)
    : normalizeStoredUploadPath(input.backgroundImageUrl || '');

  const existingBackgroundPath = String(existing?.background_image_path || existing?.backgroundImageUrl || '');
  if (!nextBackgroundPath && existingBackgroundPath) {
    deleteManagedUpload(existingBackgroundPath);
  }

  const payload = {
    id,
    user_id: userId,
    title: input.title,
    preview_image_path: previewImagePath,
    background_image_path: nextBackgroundPath,
    template_id: input.templateId,
    year: input.year,
    month: input.month,
    header_note: input.headerNote || '',
    background_color: input.backgroundColor || '#fffdf7',
    background_overlay: input.backgroundOverlay ?? 0.74,
    selectedStickerIds: input.selectedStickerIds,
    layoutItems: input.layoutItems,
    date_created: input.dateCreated || String(existing?.dateCreated || new Date().toISOString()),
  };

  const saved = existing
    ? updateSavedJournal(payload)
    : createSavedJournal(payload);

  if (!saved) {
    throw new Error('保存手账记录失败。');
  }

  return saved;
}

function normalizeStoredUploadPath(uploadPath: string) {
  const trimmed = uploadPath.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/api/uploads/') ? trimmed.slice('/api'.length) : trimmed;
}

function resolveJournalImageUrls<T extends {
  preview_image_path?: string;
  previewImageUrl?: string;
  background_image_path?: string;
  backgroundImageUrl?: string;
}>(journal: T | null | undefined) {
  if (!journal) {
    return journal;
  }

  return {
    ...journal,
    previewImageUrl: toClientAssetUrl(journal.preview_image_path || journal.previewImageUrl || ''),
    backgroundImageUrl: journal.background_image_path || journal.backgroundImageUrl
      ? toClientAssetUrl(journal.background_image_path || journal.backgroundImageUrl || '')
      : '',
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
