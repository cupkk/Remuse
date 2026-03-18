import { Difficulty, RemuseIdea } from '../types';
import { apiFetch, ApiError } from './apiClient';
import { compressImageFile } from './imageUtils';

export type ErrorCategory =
  | 'NETWORK'
  | 'IMAGE_QUALITY'
  | 'RATE_LIMIT'
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
    story: string;
    tags: string[];
  };
}

interface IdeasResponse {
  ideas: RemuseIdea[];
}

interface StickerResponse {
  stickerImageUrl: string;
  dramaText: string;
}

interface CollectionCoverResponse {
  coverImageUrl: string;
  usedFallback: boolean;
}

interface EmojiResponse {
  items: EmojiPackItem[];
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

export async function generateRemuseIdeas(itemDescription: string, material: string): Promise<RemuseIdea[]> {
  try {
    const data = await apiFetch<IdeasResponse>('/api/ai/remuse-ideas', {
      method: 'POST',
      body: JSON.stringify({ itemDescription, material }),
    });
    return normalizeIdeas(data.ideas);
  } catch (error) {
    throw toAnalysisError(error);
  }
}

export async function generateSticker(base64Image: string, itemName: string): Promise<StickerResponse> {
  try {
    return await apiFetch<StickerResponse>('/api/ai/generate-sticker', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: base64Image, itemName }),
    });
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
  stickerInputs: StickerInput[],
  count = 9,
  userMood = '',
): Promise<EmojiPackItem[]> {
  try {
    const data = await apiFetch<EmojiResponse>('/api/ai/generate-emoji-pack', {
      method: 'POST',
      body: JSON.stringify({
        stickerInputs,
        count,
        userMood,
      }),
    });
    return data.items;
  } catch (error) {
    throw toAnalysisError(error);
  }
}

function normalizeIdeas(ideas: RemuseIdea[]) {
  return (Array.isArray(ideas) ? ideas : []).map((idea) => ({
    ...idea,
    difficulty: normalizeDifficulty(idea.difficulty),
    materials: Array.isArray(idea.materials) ? idea.materials : [],
    steps: Array.isArray(idea.steps) ? idea.steps : [],
  }));
}

function normalizeDifficulty(value: string): Difficulty {
  if (value === Difficulty.EASY || value === Difficulty.MEDIUM || value === Difficulty.HARD) {
    return value;
  }

  return Difficulty.MEDIUM;
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
    return {
      category: body.category || inferCategoryFromStatus(error.status),
      title: body.title || inferTitleFromStatus(error.status),
      message: body.message || body.error || error.message,
      suggestion: body.suggestion || inferSuggestionFromStatus(error.status),
    };
  }

  const message = error instanceof Error ? error.message : '未知错误';
  return {
    category: 'UNKNOWN',
    title: 'AI 请求失败',
    message,
    suggestion: '请稍后重试；如果持续失败，请联系管理员。',
  };
}

function inferCategoryFromStatus(status: number): ErrorCategory {
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) return 'SAFETY';
  if (status >= 400 && status < 500) return 'IMAGE_QUALITY';
  return 'NETWORK';
}

function inferTitleFromStatus(status: number) {
  if (status === 429) return 'AI 服务繁忙';
  if (status === 403) return '内容受限';
  if (status >= 400 && status < 500) return '请求无效';
  return '网络连接失败';
}

function inferSuggestionFromStatus(status: number) {
  if (status === 429) return '请等待片刻后重试，或联系管理员检查额度配置。';
  if (status === 403) return '请更换图片或输入内容后重试。';
  if (status >= 400 && status < 500) return '请检查上传内容和输入参数后重新尝试。';
  return '请稍后重试；如果持续失败，请联系管理员。';
}
