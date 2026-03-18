import { Request, Response, Router } from 'express';
import { z } from 'zod';
import {
  AnalysisError,
  analyzeItemImageTask,
  generateCollectionCoverTask,
  generateEmojiPackTask,
  generateRemuseIdeasTask,
  generateStickerTask,
} from '../services/aiService.ts';
import { isAdminUserRestricted } from '../services/adminInsights.ts';
import { assertWithinUsageQuota, recordAiUsageEvent, recordProductUsageEvent } from '../services/usageQuota.ts';
import { serverLogger } from '../services/serverLogger.ts';

const router = Router();

const imageBase64Schema = z.string().trim().min(1, 'Image content is required.');

const analyzeSchema = z.object({
  imageBase64: imageBase64Schema,
});

const ideasSchema = z.object({
  itemDescription: z.string().trim().min(1).max(120),
  material: z.string().trim().max(120).optional(),
});

const stickerSchema = z.object({
  imageBase64: imageBase64Schema,
  itemName: z.string().trim().min(1).max(120),
});

const coverSchema = z.object({
  imageBase64: imageBase64Schema,
  itemName: z.string().trim().min(1).max(120),
  hallId: z.string().trim().min(1).max(120),
});

const emojiPackSchema = z.object({
  stickerInputs: z.array(z.object({
    base64: imageBase64Schema,
    name: z.string().trim().min(1).max(120),
    mimeType: z.string().trim().max(80).optional(),
  })).min(1).max(9),
  count: z.number().int().min(1).max(12).optional(),
  userMood: z.string().trim().max(200).optional(),
});

router.post('/analyze-item', (req: Request, res: Response) => handleAiTask(req, res, 'scan-analysis', analyzeSchema, async (payload) => ({
  analysis: await analyzeItemImageTask(payload.imageBase64),
})));

router.post('/remuse-ideas', (req: Request, res: Response) => handleAiTask(req, res, 'remuse-ideas', ideasSchema, async (payload) => ({
  ideas: await generateRemuseIdeasTask(payload.itemDescription, payload.material || ''),
})));

router.post('/generate-sticker', (req: Request, res: Response) => handleAiTask(req, res, 'sticker-generate', stickerSchema, async (payload) => (
  generateStickerTask(payload.imageBase64, payload.itemName)
)));

router.post('/generate-collection-cover', (req: Request, res: Response) => handleAiTask(req, res, 'cover-generate', coverSchema, async (payload) => (
  generateCollectionCoverTask(payload.imageBase64, payload.itemName, payload.hallId)
)));

router.post('/generate-emoji-pack', (req: Request, res: Response) => handleAiTask(req, res, 'emoji-pack', emojiPackSchema, async (payload) => ({
  items: await generateEmojiPackTask(payload.stickerInputs, payload.count || 9, payload.userMood || ''),
})));

async function handleAiTask<TPayload extends z.ZodTypeAny, TResult>(
  req: Request,
  res: Response,
  feature: 'scan-analysis' | 'remuse-ideas' | 'sticker-generate' | 'emoji-pack' | 'cover-generate',
  schema: TPayload,
  task: (payload: z.infer<TPayload>) => Promise<TResult>,
) {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({
      error: 'This account is temporarily restricted from AI generation. Please contact support.',
    });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'gemini-proxy');
  if (!quota.allowed) {
    res.status(429).json({
      error: 'Daily AI generation quota exceeded.',
      usage: quota,
    });
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid AI request payload.' });
    return;
  }

  serverLogger.info('ai.task.started', {
    feature,
    userId: req.userId,
  });

  try {
    const result = await task(parsed.data);
    const durationMs = Date.now() - startedAt;

    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'gemini-proxy',
      model: feature,
      success: true,
      durationMs,
      details: { feature },
    });

    if (feature === 'emoji-pack') {
      recordProductUsageEvent({
        userId: req.userId!,
        eventType: 'emoji_pack_generate',
        details: { feature },
      });
    }

    if (feature === 'cover-generate') {
      recordProductUsageEvent({
        userId: req.userId!,
        eventType: 'collection_cover_generate',
        details: { feature },
      });
    }

    serverLogger.info('ai.task.completed', {
      feature,
      userId: req.userId,
      durationMs,
    });

    res.json(result);
  } catch (error) {
    const normalized = normalizeAiError(error);
    const durationMs = Date.now() - startedAt;

    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'gemini-proxy',
      model: feature,
      success: false,
      durationMs,
      details: {
        feature,
        category: normalized.category,
        message: normalized.message,
      },
    });

    serverLogger.error('ai.task.failed', {
      feature,
      userId: req.userId,
      durationMs,
      category: normalized.category,
      message: normalized.message,
    });

    const status = normalized.category === 'RATE_LIMIT'
      ? 429
      : normalized.category === 'IMAGE_QUALITY' || normalized.category === 'PARSE_ERROR'
        ? 400
        : normalized.category === 'SAFETY'
          ? 403
          : 502;

    res.status(status).json({
      error: normalized.message,
      title: normalized.title,
      category: normalized.category,
      suggestion: normalized.suggestion,
    });
  }
}

function normalizeAiError(error: unknown): AnalysisError {
  if (
    error
    && typeof error === 'object'
    && 'category' in error
    && 'title' in error
    && 'message' in error
    && 'suggestion' in error
  ) {
    return error as AnalysisError;
  }

  return {
    category: 'UNKNOWN',
    title: 'AI 任务失败',
    message: error instanceof Error ? error.message : 'Unknown AI task failure.',
    suggestion: '请稍后重试，或联系管理员查看服务端日志。',
  };
}

export default router;
