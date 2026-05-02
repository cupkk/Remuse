import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  AnalysisError,
  analyzeItemImageTask,
  canUseLocalCoverCutout,
  generateCollectionCoverTask,
  generateEmojiPackTask,
  preparePerlerSourceTask,
  generateTransformationGuideTask,
  generateStickerTask,
} from '../services/aiService.ts';
import { isAdminUserRestricted } from '../services/adminInsights.ts';
import { createSticker, createTransformationGuide, getItemById, getTransformationGuideById } from '../services/database.ts';
import { readManagedUploadAsOptimizedDataUrl } from '../services/managedImageSource.ts';
import { assertWithinUsageQuota, recordAiUsageEvent, recordProductUsageEvent, type AiUsageScope } from '../services/usageQuota.ts';
import { serverLogger } from '../services/serverLogger.ts';
import { saveBase64Image, toClientAssetUrl } from '../services/storage.ts';
import { EMOJI_STYLE_PRESETS } from '../types.ts';

const router = Router();

const imageBase64Schema = z.string().trim().min(1, '\u8bf7\u4e0a\u4f20\u56fe\u7247\u5185\u5bb9\u3002');

const analyzeSchema = z.object({
  imageBase64: imageBase64Schema,
});

const transformationGuideItemSchema = z.object({
  id: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(120).optional(),
  material: z.string().trim().max(120).optional(),
  description: z.string().trim().max(400).optional(),
  story: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  imageBase64: imageBase64Schema.optional(),
}).refine((item) => Boolean(item.id || item.name), {
  message: '\u6bcf\u4e2a\u6539\u9020\u6307\u5357\u6765\u6e90\u90fd\u9700\u8981\u85cf\u54c1 ID \u6216\u85cf\u54c1\u540d\u79f0\u3002',
});

const transformationGuideSchema = z.object({
  items: z.array(transformationGuideItemSchema).min(1).max(12),
});

const persistedTransformationGuideSchema = transformationGuideSchema.extend({
  dateCreated: z.string().optional(),
});

const stickerSchema = z.object({
  itemId: z.string().trim().min(1).max(120).optional(),
  imageBase64: imageBase64Schema.optional(),
  itemName: z.string().trim().min(1).max(120).optional(),
}).refine((payload) => Boolean(payload.itemId || payload.imageBase64), {
  message: '\u751f\u6210\u8d34\u7eb8\u65f6\u81f3\u5c11\u9700\u8981\u4e00\u4ef6\u85cf\u54c1\u6216\u4e00\u5f20\u56fe\u7247\u3002',
});

const persistedStickerSchema = stickerSchema.extend({
  category: z.string().trim().min(1).max(100).optional(),
  dateCreated: z.string().optional(),
});

const coverSchema = z.object({
  imageBase64: imageBase64Schema,
  itemName: z.string().trim().min(1).max(120),
  hallId: z.string().trim().min(1).max(120),
});

const perlerSourceSchema = z.object({
  itemId: z.string().trim().min(1).max(120).optional(),
  imageBase64: imageBase64Schema.optional(),
  itemName: z.string().trim().min(1).max(120).optional(),
}).refine((payload) => Boolean(payload.itemId || payload.imageBase64), {
  message: '\u751f\u6210\u62fc\u8c46\u56fe\u7eb8\u65f6\u81f3\u5c11\u9700\u8981\u4e00\u4ef6\u85cf\u54c1\u6216\u4e00\u5f20\u56fe\u7247\u3002',
});

const emojiPackSchema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(120)).min(1).max(9).optional(),
  stickerInputs: z.array(z.object({
    base64: imageBase64Schema,
    name: z.string().trim().min(1).max(120),
    mimeType: z.string().trim().max(80).optional(),
  })).min(1).max(9).optional(),
  count: z.number().int().min(1).max(12).optional(),
  userMood: z.string().trim().max(200).optional(),
  stylePreset: z.enum(EMOJI_STYLE_PRESETS).optional(),
}).refine((payload) => Boolean(payload.itemIds?.length || payload.stickerInputs?.length), {
  message: '\u751f\u6210\u8868\u60c5\u5305\u81f3\u5c11\u9700\u8981\u4e00\u4e2a\u6765\u6e90\u85cf\u54c1\u3002',
});

type EmojiPackPayload = z.infer<typeof emojiPackSchema>;
type EmojiPackResult = { items: Array<{ imageUrl: string; text: string }> };
type EmojiPackTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

interface EmojiPackTaskRecord {
  id: string;
  userId: string;
  status: EmojiPackTaskStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
  result?: EmojiPackResult;
  error?: AnalysisError;
  durationMs?: number;
}

const EMOJI_TASK_TTL_MS = 30 * 60 * 1000;
const EMOJI_TASK_POLL_AFTER_MS = 4000;
const emojiPackTasks = new Map<string, EmojiPackTaskRecord>();
const AI_MESSAGE_TASK_NOT_FOUND = '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u751f\u6210\u4efb\u52a1\u3002';
const AI_MESSAGE_UNKNOWN_SUGGESTION = '\u8bf7\u7a0d\u540e\u518d\u8bd5\uff0c\u82e5\u591a\u6b21\u5931\u8d25\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u6392\u67e5\u3002';
const AI_MESSAGE_ITEM_NOT_FOUND_TITLE = '\u85cf\u54c1\u4e0d\u5b58\u5728';
const AI_MESSAGE_ITEM_NOT_FOUND = '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u85cf\u54c1\u8d44\u6e90\u3002';
const AI_MESSAGE_ITEM_NOT_FOUND_SUGGESTION = '\u8bf7\u91cd\u65b0\u9009\u62e9\u85cf\u54c1\u540e\u518d\u8bd5\u3002';
const AI_MESSAGE_SOURCE_UNAVAILABLE_TITLE = '\u56fe\u7247\u4e0d\u53ef\u7528';
const AI_MESSAGE_SOURCE_UNAVAILABLE = '\u5f53\u524d\u85cf\u54c1\u56fe\u7247\u65e0\u6cd5\u8bfb\u53d6\u6216\u5df2\u4e22\u5931\u3002';
const AI_MESSAGE_SOURCE_UNAVAILABLE_SUGGESTION = '\u8bf7\u66f4\u6362\u85cf\u54c1\u56fe\u7247\u6216\u91cd\u65b0\u4e0a\u4f20\u540e\u518d\u8bd5\u3002';
const AI_MESSAGE_SOURCE_REQUIRED_TITLE = '\u7f3a\u5c11\u56fe\u7247';
const AI_MESSAGE_SOURCE_REQUIRED = '\u8bf7\u5148\u9009\u62e9\u85cf\u54c1\u6216\u4e0a\u4f20\u56fe\u7247\u3002';
const AI_MESSAGE_SOURCE_REQUIRED_SUGGESTION = '\u8bf7\u5148\u8865\u5145\u56fe\u7247\u6765\u6e90\u540e\u518d\u751f\u6210\u3002';

const FEATURE_USAGE_SCOPES: Record<'scan-analysis' | 'sticker-generate' | 'emoji-pack' | 'guide-generate', AiUsageScope[]> = {
  'scan-analysis': ['stepfun-vision'],
  'sticker-generate': ['stepfun-text', 'gemini-image'],
  'emoji-pack': ['stepfun-text', 'gemini-image'],
  'guide-generate': ['stepfun-text', 'gemini-image'],
};

function buildQuotaExceededError(
  quota?: { used: number; limit: number; remaining: number },
  scope?: AiUsageScope,
) {
  const scopeLabel = humanizeAiScope(scope);
  return {
    error: scopeLabel ? `今日${scopeLabel}额度已用完。` : '\u4eca\u65e5 AI \u8c03\u7528\u989d\u5ea6\u5df2\u7528\u5b8c\u3002',
    title: 'AI \u989d\u5ea6\u4e0d\u8db3',
    category: 'QUOTA_EXCEEDED' as const,
    suggestion: '\u8bf7\u660e\u5929\u518d\u8bd5\uff0c\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u8c03\u6574\u989d\u5ea6\u914d\u7f6e\u3002',
    usage: quota,
    scope: scope || null,
  };
}

function buildAiRestrictionError() {
  return {
    error: '\u5f53\u524d\u8d26\u53f7\u6682\u65f6\u65e0\u6cd5\u4f7f\u7528 AI \u751f\u6210\u529f\u80fd\u3002',
    title: '\u8d26\u53f7\u53d7\u9650',
    category: 'SAFETY' as const,
    suggestion: '\u8bf7\u7a0d\u540e\u518d\u8bd5\uff0c\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u786e\u8ba4\u8d26\u53f7\u72b6\u6001\u3002',
  };
}

function mapAiErrorToStatus(error: AnalysisError) {
  if (error.category === 'RATE_LIMIT' || error.category === 'QUOTA_EXCEEDED') {
    return 429;
  }

  if (error.category === 'IMAGE_QUALITY' || error.category === 'PARSE_ERROR') {
    return 400;
  }

  if (error.category === 'SAFETY') {
    return 403;
  }

  return 502;
}

router.post('/analyze-item', (req: Request, res: Response) => handleAiTask(req, res, 'scan-analysis', analyzeSchema, async (payload) => {
  const analysis = await analyzeItemImageTask(payload.imageBase64) as Awaited<ReturnType<typeof analyzeItemImageTask>> & { description?: string };
  return {
    analysis: {
      ...analysis,
      description: analysis.description || analysis.story || '',
    },
  };
}));

router.post('/generate-transformation-guide', (req: Request, res: Response) => handleAiTask(req, res, 'guide-generate', transformationGuideSchema, async (payload) => ({
  guide: await generateTransformationGuideTask(await enrichGuideSourceItems(req.userId!, payload.items)),
})));

router.post('/generate-and-save-transformation-guide', (req: Request, res: Response) => handleAiTask(req, res, 'guide-generate', persistedTransformationGuideSchema, async (payload) => {
  const sourceItems = await enrichGuideSourceItems(req.userId!, payload.items);
  const guide = await generateTransformationGuideTask(sourceItems);
  return {
    guide: await persistGeneratedGuide(req.userId!, guide, sourceItems, payload.dateCreated),
  };
}));

router.post('/generate-sticker', (req: Request, res: Response) => handleAiTask(req, res, 'sticker-generate', stickerSchema, async (payload) => {
  const source = await resolveManagedItemSource(req.userId!, payload.itemId, {
    fallbackImageBase64: payload.imageBase64,
    fallbackItemName: payload.itemName,
    maxWidth: 1180,
    maxHeight: 1180,
    quality: 74,
  });
  return generateStickerTask(source.imageBase64, source.itemName);
}));

router.post('/generate-and-save-sticker', (req: Request, res: Response) => handleAiTask(req, res, 'sticker-generate', persistedStickerSchema, async (payload) => {
  const source = await resolveManagedItemSource(req.userId!, payload.itemId, {
    fallbackImageBase64: payload.imageBase64,
    fallbackItemName: payload.itemName,
    maxWidth: 1180,
    maxHeight: 1180,
    quality: 74,
  });
  const generated = await generateStickerTask(source.imageBase64, source.itemName);

  return {
    sticker: await persistGeneratedSticker(req.userId!, {
      originalItemId: payload.itemId,
      stickerImageUrl: generated.stickerImageUrl,
      dramaText: generated.dramaText,
      category: payload.category,
      dateCreated: payload.dateCreated,
    }),
  };
}));

router.post('/generate-collection-cover', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json(buildAiRestrictionError());
    return;
  }

  const parsed = coverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002' });
    return;
  }

  const startedAt = Date.now();
  const localPreferred = canUseLocalCoverCutout();
  if (!localPreferred) {
    const quota = assertWithinUsageQuota(req.userId!, 'gemini-image');
    if (!quota.allowed) {
      res.status(429).json(buildQuotaExceededError(quota, 'gemini-image'));
      return;
    }
  }

  serverLogger.info('ai.task.started', {
    feature: 'cover-generate',
    userId: req.userId,
    localPreferred,
  });

  try {
    const result = await generateCollectionCoverTask(parsed.data.imageBase64, parsed.data.itemName, parsed.data.hallId);
    const durationMs = Date.now() - startedAt;

    if (result.provider === 'gemini') {
      recordAiUsageEvent({
        userId: req.userId!,
        scope: 'gemini-image',
        model: 'cover-generate',
        success: true,
        durationMs,
        details: { feature: 'cover-generate', provider: result.provider },
      });
    }

    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'collection_cover_generate',
      details: { feature: 'cover-generate', provider: result.provider, usedFallback: result.usedFallback },
    });

    serverLogger.info('ai.task.completed', {
      feature: 'cover-generate',
      userId: req.userId,
      durationMs,
      provider: result.provider,
      usedFallback: result.usedFallback,
    });

    res.json({
      coverImageUrl: result.coverImageUrl,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    const normalized = normalizeAiError(error);
    const durationMs = Date.now() - startedAt;

    if (!localPreferred) {
      recordAiUsageEvent({
        userId: req.userId!,
        scope: 'gemini-image',
        model: 'cover-generate',
        success: false,
        durationMs,
        details: {
          feature: 'cover-generate',
          category: normalized.category,
          message: normalized.message,
        },
      });
    }

    serverLogger.error('ai.task.failed', {
      feature: 'cover-generate',
      userId: req.userId,
      durationMs,
      category: normalized.category,
      message: normalized.message,
    });

    res.status(mapAiErrorToStatus(normalized)).json({
      error: normalized.message,
      title: normalized.title,
      category: normalized.category,
      suggestion: normalized.suggestion,
    });
  }
});

router.post('/generate-emoji-pack', (req: Request, res: Response) => handleAiTask(req, res, 'emoji-pack', emojiPackSchema, async (payload) => (
  createEmojiPackResult(req.userId!, payload)
)));

router.post('/generate-emoji-pack/tasks', async (req: Request, res: Response) => {
  cleanupExpiredEmojiPackTasks();

  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json(buildAiRestrictionError());
    return;
  }

  const quotaCheck = assertWithinUsageScopes(req.userId!, FEATURE_USAGE_SCOPES['emoji-pack']);
  if (!quotaCheck.allowed) {
    res.status(429).json(buildQuotaExceededError(quotaCheck.quota, quotaCheck.scope));
    return;
  }

  const parsed = emojiPackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002' });
    return;
  }

  const now = Date.now();
  const taskId = uuidv4();
  const taskRecord: EmojiPackTaskRecord = {
    id: taskId,
    userId: req.userId!,
    status: 'queued',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + EMOJI_TASK_TTL_MS,
  };

  emojiPackTasks.set(taskId, taskRecord);
  void runEmojiPackTask(taskId, req.userId!, parsed.data);

  res.status(202).json({
    taskId,
    status: taskRecord.status,
    pollAfterMs: EMOJI_TASK_POLL_AFTER_MS,
  });
});

router.get('/generate-emoji-pack/tasks/:taskId', async (req: Request, res: Response) => {
  cleanupExpiredEmojiPackTasks();

  const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const task = taskId ? emojiPackTasks.get(taskId) : null;
  if (!task || task.userId !== req.userId) {
    res.status(404).json({ error: AI_MESSAGE_TASK_NOT_FOUND });
    return;
  }

  if (task.status === 'completed' && task.result) {
    res.json({
      taskId: task.id,
      status: task.status,
      items: task.result.items,
      durationMs: task.durationMs || null,
    });
    return;
  }

  if (task.status === 'failed' && task.error) {
    res.json({
      taskId: task.id,
      status: task.status,
      durationMs: task.durationMs || null,
      error: task.error.message,
      title: task.error.title,
      category: task.error.category,
      suggestion: task.error.suggestion,
    });
    return;
  }

  res.json({
    taskId: task.id,
    status: task.status,
    pollAfterMs: EMOJI_TASK_POLL_AFTER_MS,
  });
});

router.post('/prepare-perler-source', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json(buildAiRestrictionError());
    return;
  }

  const parsed = perlerSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002' });
    return;
  }

  const startedAt = Date.now();
  const localPreferred = canUseLocalCoverCutout();
  if (!localPreferred) {
    const quota = assertWithinUsageQuota(req.userId!, 'gemini-image');
    if (!quota.allowed) {
      res.status(429).json(buildQuotaExceededError(quota, 'gemini-image'));
      return;
    }
  }

  serverLogger.info('ai.task.started', {
    feature: 'perler-preprocess',
    userId: req.userId,
    localPreferred,
  });

  try {
    const source = await resolveManagedItemSource(req.userId!, parsed.data.itemId, {
      fallbackImageBase64: parsed.data.imageBase64,
      fallbackItemName: parsed.data.itemName,
      maxWidth: 1180,
      maxHeight: 1180,
      quality: 74,
    });
    const result = await preparePerlerSourceTask(source.imageBase64, source.itemName);
    const durationMs = Date.now() - startedAt;

    if (result.provider === 'gemini') {
      recordAiUsageEvent({
        userId: req.userId!,
        scope: 'gemini-image',
        model: 'perler-preprocess',
        success: true,
        durationMs,
        details: { feature: 'perler-preprocess', provider: result.provider },
      });
    }

    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'perler_pattern_generate',
      details: { feature: 'perler-preprocess', provider: result.provider, usedFallback: result.usedFallback },
    });

    serverLogger.info('ai.task.completed', {
      feature: 'perler-preprocess',
      userId: req.userId,
      durationMs,
      provider: result.provider,
      usedFallback: result.usedFallback,
    });

    res.json(result);
  } catch (error) {
    const normalized = normalizeAiError(error);
    const durationMs = Date.now() - startedAt;

    if (!localPreferred) {
      recordAiUsageEvent({
        userId: req.userId!,
        scope: 'gemini-image',
        model: 'perler-preprocess',
        success: false,
        durationMs,
        details: {
          feature: 'perler-preprocess',
          category: normalized.category,
          message: normalized.message,
        },
      });
    }

    serverLogger.error('ai.task.failed', {
      feature: 'perler-preprocess',
      userId: req.userId,
      durationMs,
      category: normalized.category,
      message: normalized.message,
    });

    res.status(mapAiErrorToStatus(normalized)).json({
      error: normalized.message,
      title: normalized.title,
      category: normalized.category,
      suggestion: normalized.suggestion,
    });
  }
});

async function handleAiTask<TPayload extends z.ZodTypeAny, TResult>(
  req: Request,
  res: Response,
  feature: 'scan-analysis' | 'sticker-generate' | 'emoji-pack' | 'guide-generate',
  schema: TPayload,
  task: (payload: z.infer<TPayload>) => Promise<TResult>,
) {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json(buildAiRestrictionError());
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002' });
    return;
  }

  const startedAt = Date.now();
  const quotaCheck = assertWithinUsageScopes(req.userId!, FEATURE_USAGE_SCOPES[feature]);
  if (!quotaCheck.allowed) {
    res.status(429).json(buildQuotaExceededError(quotaCheck.quota, quotaCheck.scope));
    return;
  }

  serverLogger.info('ai.task.started', {
    feature,
    userId: req.userId,
  });

  try {
    const result = await task(parsed.data);
    const durationMs = Date.now() - startedAt;

    recordAiUsageEvents(req.userId!, FEATURE_USAGE_SCOPES[feature], {
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

    if (feature === 'guide-generate') {
      recordProductUsageEvent({
        userId: req.userId!,
        eventType: 'guide_generate',
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

    recordAiUsageEvents(req.userId!, FEATURE_USAGE_SCOPES[feature], {
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

    res.status(mapAiErrorToStatus(normalized)).json({
      error: normalized.message,
      title: normalized.title,
      category: normalized.category,
      suggestion: normalized.suggestion,
    });
  }
}

async function createEmojiPackResult(userId: string, payload: EmojiPackPayload): Promise<EmojiPackResult> {
  const generatedItems = await generateEmojiPackTask(
    payload.itemIds?.length
      ? await Promise.all(payload.itemIds.map((itemId) => resolveEmojiPackInput(userId, itemId)))
      : (payload.stickerInputs || []),
    payload.count || 9,
    payload.userMood || '',
    payload.stylePreset || EMOJI_STYLE_PRESETS[1],
  );

  const items = await Promise.all(generatedItems.map(async (item, index) => {
    if (!item.imageUrl?.startsWith('data:')) {
      return item;
    }

    const uploadId = `${uuidv4()}-${index + 1}`;
    const imagePath = await saveBase64Image(item.imageUrl, 'emoji-packs', userId, uploadId);
    return {
      ...item,
      imageUrl: toClientAssetUrl(imagePath),
    };
  }));

  serverLogger.info('emoji-pack.assetized', {
    userId,
    sourcePrefix: String(generatedItems[0]?.imageUrl || '').slice(0, 24),
    resultPrefix: String(items[0]?.imageUrl || '').slice(0, 24),
    convertedCount: items.filter((item) => item.imageUrl?.startsWith('/api/uploads/')).length,
  });

  return { items };
}

async function runEmojiPackTask(taskId: string, userId: string, payload: EmojiPackPayload) {
  const task = emojiPackTasks.get(taskId);
  if (!task) {
    return;
  }

  const startedAt = Date.now();
  task.status = 'running';
  task.updatedAt = new Date(startedAt).toISOString();

  serverLogger.info('ai.task.started', {
    feature: 'emoji-pack',
    userId,
    taskId,
    mode: 'async',
  });

  try {
    const result = await createEmojiPackResult(userId, payload);
    const durationMs = Date.now() - startedAt;

    recordAiUsageEvents(userId, FEATURE_USAGE_SCOPES['emoji-pack'], {
      model: 'emoji-pack',
      success: true,
      durationMs,
      details: { feature: 'emoji-pack', taskId, mode: 'async' },
    });

    recordProductUsageEvent({
      userId,
      eventType: 'emoji_pack_generate',
      details: { feature: 'emoji-pack', taskId, mode: 'async' },
    });

    task.status = 'completed';
    task.result = result;
    task.durationMs = durationMs;
    task.updatedAt = new Date().toISOString();

    serverLogger.info('ai.task.completed', {
      feature: 'emoji-pack',
      userId,
      taskId,
      durationMs,
      mode: 'async',
    });
  } catch (error) {
    const normalized = normalizeAiError(error);
    const durationMs = Date.now() - startedAt;

    recordAiUsageEvents(userId, FEATURE_USAGE_SCOPES['emoji-pack'], {
      model: 'emoji-pack',
      success: false,
      durationMs,
      details: {
        feature: 'emoji-pack',
        taskId,
        mode: 'async',
        category: normalized.category,
        message: normalized.message,
      },
    });

    task.status = 'failed';
    task.error = normalized;
    task.durationMs = durationMs;
    task.updatedAt = new Date().toISOString();

    serverLogger.error('ai.task.failed', {
      feature: 'emoji-pack',
      userId,
      taskId,
      durationMs,
      category: normalized.category,
      message: normalized.message,
      mode: 'async',
    });
  }
}

function cleanupExpiredEmojiPackTasks() {
  const now = Date.now();
  for (const [taskId, task] of emojiPackTasks.entries()) {
    if (task.expiresAt <= now) {
      emojiPackTasks.delete(taskId);
    }
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
    title: 'AI \u751f\u6210\u5931\u8d25',
    message: error instanceof Error ? error.message : '\u5f53\u524d AI \u751f\u6210\u5931\u8d25\u3002',
    suggestion: AI_MESSAGE_UNKNOWN_SUGGESTION,
  };
}

function createClientAiError(
  category: AnalysisError['category'],
  title: string,
  message: string,
  suggestion: string,
): AnalysisError {
  return { category, title, message, suggestion };
}

function assertWithinUsageScopes(userId: string, scopes: AiUsageScope[]) {
  for (const scope of scopes) {
    const quota = assertWithinUsageQuota(userId, scope);
    if (!quota.allowed) {
      return {
        allowed: false as const,
        scope,
        quota,
      };
    }
  }

  return {
    allowed: true as const,
  };
}

function recordAiUsageEvents(
  userId: string,
  scopes: AiUsageScope[],
  input: {
    model?: string | null;
    success: boolean;
    durationMs?: number;
    details?: Record<string, unknown>;
  },
) {
  for (const scope of scopes) {
    recordAiUsageEvent({
      userId,
      scope,
      model: input.model,
      success: input.success,
      durationMs: input.durationMs,
      details: input.details,
    });
  }
}

function humanizeAiScope(scope?: AiUsageScope) {
  switch (scope) {
    case 'stepfun-text':
      return 'StepFun 文本';
    case 'stepfun-vision':
      return 'StepFun 视觉';
    case 'gemini-image':
      return 'Gemini 图像';
    default:
      return '';
  }
}

async function resolveManagedItemSource(
  userId: string,
  itemId: string | undefined,
  fallback: {
    fallbackImageBase64?: string;
    fallbackItemName?: string;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  },
) {
  if (itemId) {
    const item = getItemById(itemId, userId);
    if (!item) {
      throw createClientAiError(
        'IMAGE_QUALITY',
        AI_MESSAGE_ITEM_NOT_FOUND_TITLE,
        AI_MESSAGE_ITEM_NOT_FOUND,
        AI_MESSAGE_ITEM_NOT_FOUND_SUGGESTION,
      );
    }

    const uploadPath = item.image_path || item.imageUrl || item.cover_image_path || item.coverImageUrl || '';
    const dataUrl = await readManagedUploadAsOptimizedDataUrl(uploadPath, {
      maxWidth: fallback.maxWidth,
      maxHeight: fallback.maxHeight,
      quality: fallback.quality,
    });

    if (!dataUrl) {
      throw createClientAiError(
        'IMAGE_QUALITY',
        AI_MESSAGE_SOURCE_UNAVAILABLE_TITLE,
        AI_MESSAGE_SOURCE_UNAVAILABLE,
        AI_MESSAGE_SOURCE_UNAVAILABLE_SUGGESTION,
      );
    }

    return {
      itemName: item.name,
      imageBase64: stripDataUrlPrefix(dataUrl),
      mimeType: extractDataUrlMimeType(dataUrl),
    };
  }

  if (!fallback.fallbackImageBase64 || !fallback.fallbackItemName) {
    throw createClientAiError(
      'IMAGE_QUALITY',
      AI_MESSAGE_SOURCE_REQUIRED_TITLE,
      AI_MESSAGE_SOURCE_REQUIRED,
      AI_MESSAGE_SOURCE_REQUIRED_SUGGESTION,
    );
  }

  return {
    itemName: fallback.fallbackItemName,
    imageBase64: stripDataUrlPrefix(fallback.fallbackImageBase64),
    mimeType: extractDataUrlMimeType(fallback.fallbackImageBase64),
  };
}

async function resolveEmojiPackInput(userId: string, itemId: string) {
  const source = await resolveManagedItemSource(userId, itemId, {
    maxWidth: 896,
    maxHeight: 896,
    quality: 70,
  });

  return {
    base64: source.imageBase64,
    name: source.itemName,
    mimeType: source.mimeType || 'image/jpeg',
  };
}

async function enrichGuideSourceItems(
  userId: string,
  items: Array<z.infer<typeof transformationGuideItemSchema>>,
) {
  return Promise.all(items.map(async (item, index) => {
    const storedItem = item.id ? getItemById(item.id, userId) : null;
    const name = item.name?.trim() || storedItem?.name?.trim() || '';
    if (!name) {
      throw createClientAiError('IMAGE_QUALITY', '藏品信息不完整', '改造指南需要至少一件有效藏品。', '请重新选择藏品后再试。');
    }

    let imageBase64 = item.imageBase64;
    if (!imageBase64 && index < 4 && storedItem) {
      const uploadPath = storedItem.image_path || storedItem.imageUrl || storedItem.cover_image_path || storedItem.coverImageUrl || '';
      const dataUrl = await readManagedUploadAsOptimizedDataUrl(uploadPath, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 76,
      });
      imageBase64 = stripDataUrlPrefix(dataUrl);
    }

    return {
      id: item.id || storedItem?.id,
      name,
      category: item.category || storedItem?.category || '',
      material: item.material || storedItem?.material || '',
      description: item.description || storedItem?.description || '',
      story: item.story || storedItem?.story || '',
      tags: item.tags || storedItem?.tags || [],
      imageUrl: storedItem?.image_path || storedItem?.imageUrl || '',
      coverImageUrl: storedItem?.cover_image_path || storedItem?.coverImageUrl || storedItem?.image_path || storedItem?.imageUrl || '',
      imageBase64: imageBase64 || undefined,
    };
  }));
}

function stripDataUrlPrefix(value: string) {
  const trimmed = `${value || ''}`.trim();
  const match = trimmed.match(/^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/);
  return match?.[1] || trimmed;
}

function extractDataUrlMimeType(value: string) {
  return `${value || ''}`.trim().match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
}

async function persistGeneratedSticker(
  userId: string,
  input: {
    originalItemId?: string;
    stickerImageUrl: string;
    dramaText?: string;
    category?: string;
    dateCreated?: string;
  },
) {
  const id = uuidv4();
  const imagePath = await saveBase64Image(input.stickerImageUrl, 'stickers', userId, id);
  const safeOriginalItemId = input.originalItemId && getItemById(input.originalItemId, userId)
    ? input.originalItemId
    : null;
  const category = input.category?.trim() || '其他';
  const dateCreated = input.dateCreated || new Date().toISOString();

  createSticker({
    id,
    user_id: userId,
    original_item_id: safeOriginalItemId,
    image_path: imagePath,
    drama_text: input.dramaText || '',
    category,
    date_created: dateCreated,
  });

  recordProductUsageEvent({
    userId,
    eventType: 'sticker_generate',
    details: {
      originalItemId: safeOriginalItemId,
      category,
      generatedInAiRoute: true,
    },
  });

  return {
    id,
    originalItemId: safeOriginalItemId,
    stickerImageUrl: toClientAssetUrl(imagePath),
    dramaText: input.dramaText || '',
    category,
    dateCreated,
  };
}

async function persistGeneratedGuide(
  userId: string,
  guide: Awaited<ReturnType<typeof generateTransformationGuideTask>>,
  sourceItems: Awaited<ReturnType<typeof enrichGuideSourceItems>>,
  dateCreated?: string,
) {
  const id = uuidv4();
  const imagePath = await saveBase64Image(guide.imageUrl, 'transformation-guides', userId, id);
  const createdAt = dateCreated || new Date().toISOString();

  createTransformationGuide({
    id,
    user_id: userId,
    title: guide.title,
    summary: guide.summary,
    concept: guide.concept,
    materials: guide.materials,
    steps: guide.steps,
    tips: guide.tips,
    itemIds: sourceItems.map((item) => item.id).filter(Boolean) as string[],
    sourceItems: sourceItems.map((item) => ({
      id: item.id || '',
      name: item.name,
      category: item.category || '',
      material: item.material || '',
      description: item.description || '',
      story: item.story || '',
      tags: item.tags || [],
      imageUrl: toClientAssetUrl(item.imageUrl || ''),
      coverImageUrl: toClientAssetUrl(item.coverImageUrl || item.imageUrl || ''),
    })),
    image_path: imagePath,
    date_created: createdAt,
  });

  const savedGuide = getTransformationGuideById(id, userId);
  return savedGuide
    ? {
      ...savedGuide,
      imageUrl: toClientAssetUrl(savedGuide.image_path || savedGuide.imageUrl || ''),
    }
    : {
      ...guide,
      id,
      itemIds: sourceItems.map((item) => item.id).filter(Boolean) as string[],
      sourceItems: sourceItems.map((item) => ({
        id: item.id || '',
        name: item.name,
        category: item.category || '',
        material: item.material || '',
        description: item.description || '',
        story: item.story || '',
        tags: item.tags || [],
        imageUrl: toClientAssetUrl(item.imageUrl || ''),
        coverImageUrl: toClientAssetUrl(item.coverImageUrl || item.imageUrl || ''),
      })),
      imageUrl: toClientAssetUrl(imagePath),
      dateCreated: createdAt,
    };
}

export default router;
