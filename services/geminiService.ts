import { EmojiStylePreset, SavedTransformationGuide, Sticker, TransformationGuide } from '../types';
import { apiFetch, ApiError } from './apiClient';
import { compressImageFile } from './imageUtils';

export type ErrorCategory =
  | 'NETWORK'
  | 'IMAGE_QUALITY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'SAFETY'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

export interface AnalysisError {
  category: ErrorCategory;
  title: string;
  message: string;
  suggestion: string;
}

export interface EmojiPackItem {
  imageUrl: string;
  text: string;
}

export interface StickerInput {
  base64: string;
  name: string;
  mimeType?: string;
}

interface AnalyzeResponse {
  analysis: {
    name: string;
    category: string;
    material: string;
    description?: string;
    story: string;
    tags: string[];
  };
}

interface StickerResponse {
  stickerImageUrl: string;
  dramaText: string;
}

interface CollectionCoverResponse {
  coverImageUrl: string;
  usedFallback: boolean;
}

interface PerlerSourceResponse {
  preparedImageUrl: string;
  usedFallback: boolean;
  provider: 'rembg' | 'gemini' | 'original';
}

interface GuideResponse {
  guide: TransformationGuide;
}

interface SavedGuideResponse {
  guide: SavedTransformationGuide;
}

interface SavedStickerResponse {
  sticker: Sticker;
}

interface EmojiTaskSubmitResponse {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  pollAfterMs?: number;
  items?: EmojiPackItem[];
  error?: string;
  title?: string;
  category?: ErrorCategory;
  suggestion?: string;
}

interface EmojiTaskStatusResponse extends EmojiTaskSubmitResponse {
  durationMs?: number | null;
}

export interface GuideSourceItem {
  id: string;
  name: string;
  category: string;
  material: string;
  description?: string;
  story?: string;
  tags?: string[];
  imageBase64?: string;
}

export const fileToGenerativePart = async (file: File): Promise<string> => {
  const compressed = await compressImageFile(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.8,
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
};

export async function analyzeItemImage(base64Image: string) {
  try {
    const data = await apiFetch<AnalyzeResponse>('/api/ai/analyze-item', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: base64Image }),
    });
    return data.analysis;
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateTransformationGuide(items: GuideSourceItem[]): Promise<TransformationGuide> {
  try {
    const data = await apiFetch<GuideResponse>('/api/ai/generate-transformation-guide', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });

    return {
      ...data.guide,
      materials: Array.isArray(data.guide.materials) ? data.guide.materials : [],
      steps: Array.isArray(data.guide.steps) ? data.guide.steps : [],
      tips: Array.isArray(data.guide.tips) ? data.guide.tips : [],
    };
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateAndSaveTransformationGuide(
  items: GuideSourceItem[],
  dateCreated?: string,
): Promise<SavedTransformationGuide> {
  try {
    const data = await apiFetch<SavedGuideResponse>('/api/ai/generate-and-save-transformation-guide', {
      method: 'POST',
      body: JSON.stringify({ items, dateCreated }),
    });
    return data.guide;
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateSticker(
  input: string | {
    itemId?: string;
    imageBase64?: string;
    itemName?: string;
  },
  itemName?: string,
): Promise<StickerResponse> {
  try {
    const body = typeof input === 'string'
      ? { imageBase64: input, itemName }
      : input;
    return await apiFetch<StickerResponse>('/api/ai/generate-sticker', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateAndSaveSticker(input: {
  itemId?: string;
  imageBase64?: string;
  itemName?: string;
  category?: string;
  dateCreated?: string;
}): Promise<Sticker> {
  try {
    const data = await apiFetch<SavedStickerResponse>('/api/ai/generate-and-save-sticker', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.sticker;
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateCollectionCover(
  base64Image: string,
  itemName: string,
  hallId: string,
): Promise<CollectionCoverResponse> {
  try {
    return await apiFetch<CollectionCoverResponse>('/api/ai/generate-collection-cover', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: base64Image, itemName, hallId }),
    });
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateEmojiPack(
  input: StickerInput[] | {
    itemIds?: string[];
    stickerInputs?: StickerInput[];
    count?: number;
    userMood?: string;
    stylePreset?: EmojiStylePreset;
  },
  count = 9,
  userMood = '',
  stylePreset: EmojiStylePreset = '可爱软萌',
): Promise<EmojiPackItem[]> {
  try {
    const body = Array.isArray(input)
      ? {
        stickerInputs: input,
        count,
        userMood,
        stylePreset,
      }
      : {
        itemIds: input.itemIds,
        stickerInputs: input.stickerInputs,
        count: input.count ?? count,
        userMood: input.userMood ?? userMood,
        stylePreset: input.stylePreset ?? stylePreset,
      };

    const task = await apiFetch<EmojiTaskSubmitResponse>('/api/ai/generate-emoji-pack/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (task.status === 'completed' && task.items) {
      return task.items;
    }

    if (task.status === 'failed') {
      const failedStatus = task.category === 'QUOTA_EXCEEDED' || task.category === 'RATE_LIMIT' ? 429 : 502;
      throw new ApiError(failedStatus, task.error || '表情包生成失败。', task);
    }

    return await waitForEmojiPackTask(task.taskId, task.pollAfterMs || 4000);
  } catch (error) {
    throw toAnalysisError(error);
  }
}

async function waitForEmojiPackTask(taskId: string, initialDelayMs: number): Promise<EmojiPackItem[]> {
  const startedAt = Date.now();
  let pollDelayMs = Math.max(800, initialDelayMs);

  while (Date.now() - startedAt < 8 * 60 * 1000) {
    await delay(pollDelayMs);

    const status = await apiFetch<EmojiTaskStatusResponse>(`/api/ai/generate-emoji-pack/tasks/${taskId}`, {
      method: 'GET',
    });

    if (status.status === 'completed' && status.items) {
      return status.items;
    }

    if (status.status === 'failed') {
      const failedStatus = status.category === 'QUOTA_EXCEEDED' || status.category === 'RATE_LIMIT' ? 429 : 502;
      throw new ApiError(failedStatus, status.error || '表情包生成失败。', status);
    }

    pollDelayMs = status.pollAfterMs || pollDelayMs;
  }

  throw new ApiError(504, '表情包生成超时，请稍后重试。', {
    category: 'NETWORK',
    title: '表情包生成超时',
    suggestion: '请稍后重试，或减少生成数量后再试。',
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function preparePerlerSourceImage(
  input: string | {
    itemId?: string;
    base64Image?: string;
    itemName?: string;
  },
  itemName?: string,
): Promise<PerlerSourceResponse> {
  try {
    const body = typeof input === 'string'
      ? { imageBase64: input, itemName }
      : {
        itemId: input.itemId,
        imageBase64: input.base64Image,
        itemName: input.itemName,
      };
    return await apiFetch<PerlerSourceResponse>('/api/ai/prepare-perler-source', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw toAnalysisError(error);
  }
}

function toAnalysisError(error: unknown): AnalysisError {
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

  if (error instanceof ApiError) {
    const body = error.body as Partial<AnalysisError> & { error?: string };
    const category = body.category || inferCategory(error.status, body.message || body.error || error.message);
    return {
      category,
      title: body.title || inferTitle(category),
      message: body.message || body.error || error.message,
      suggestion: body.suggestion || inferSuggestion(category),
    };
  }

  const message = error instanceof Error ? error.message : '未知错误';
  const category = inferCategory(undefined, message);
  return {
    category,
    title: inferTitle(category),
    message,
    suggestion: inferSuggestion(category),
  };
}

function inferCategory(status?: number, message = ''): ErrorCategory {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('insufficient_user_quota')
    || normalized.includes('daily ai generation quota exceeded')
    || normalized.includes('额度不足')
    || normalized.includes('配额不足')
    || normalized.includes('quota exceeded')
  ) {
    return 'QUOTA_EXCEEDED';
  }

  if (status === 429 || normalized.includes('rate limit') || normalized.includes('too many ai requests')) {
    return 'RATE_LIMIT';
  }

  if (status === 403) {
    return 'SAFETY';
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return 'IMAGE_QUALITY';
  }

  return 'NETWORK';
}

function inferTitle(category: ErrorCategory) {
  switch (category) {
    case 'QUOTA_EXCEEDED':
      return 'AI 额度不足';
    case 'RATE_LIMIT':
      return 'AI 服务繁忙';
    case 'SAFETY':
      return '内容受限';
    case 'IMAGE_QUALITY':
      return '请求无效';
    case 'NETWORK':
      return '网络连接失败';
    default:
      return 'AI 请求失败';
  }
}

function inferSuggestion(category: ErrorCategory) {
  switch (category) {
    case 'QUOTA_EXCEEDED':
      return '当前是上游 AI 额度不足，请联系管理员充值或切换可用上游后再试。';
    case 'RATE_LIMIT':
      return '当前请求过于频繁，请等待几十秒后再试。';
    case 'SAFETY':
      return '请更换图片或输入内容后重试。';
    case 'IMAGE_QUALITY':
      return '请检查上传内容和输入参数后重新尝试。';
    case 'NETWORK':
      return '请稍后重试；如果持续失败，请联系管理员检查网络和服务状态。';
    default:
      return '请稍后重试；如果持续失败，请联系管理员。';
  }
}
