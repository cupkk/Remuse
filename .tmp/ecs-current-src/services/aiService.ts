import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import { Difficulty, ItemCategory, RemuseIdea } from '../types.js';
import { APP_CONFIG } from './appConfig.ts';
import { composeCollectionCoverDataUrl } from './collectionCoverComposer.ts';
import { serverLogger } from './serverLogger.ts';

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const AI_MOCK_MODE = ['1', 'true', 'mock', 'demo'].includes((process.env.AI_MOCK_MODE || '').trim().toLowerCase());

export type AiFeature = 'scan-analysis' | 'remuse-ideas' | 'sticker-generate' | 'emoji-pack' | 'cover-generate';
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

interface StickerInput {
  base64: string;
  name: string;
  mimeType?: string;
}

function createAiClient() {
  if (APP_CONFIG.disableLiveAi && !AI_MOCK_MODE) {
    throw createAnalysisError(
      'NETWORK',
      'AI 能力未启用',
      '当前环境关闭了实时 AI 生成能力。',
      '请联系管理员检查生产环境 AI 配置，或在测试环境开启 AI mock 模式。',
    );
  }

  return new GoogleGenAI({
    apiKey: APP_CONFIG.geminiApiKey,
    httpOptions: APP_CONFIG.geminiBaseUrl ? { baseUrl: APP_CONFIG.geminiBaseUrl } : undefined,
  });
}

export async function analyzeItemImageTask(base64Image: string) {
  if (AI_MOCK_MODE) {
    return mockAnalysis(base64Image);
  }

  try {
    const ai = createAiClient();
    const response = await withAiRetries('scan-analysis', () => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `请分析这张旧物图片，并返回一份适合 Re-Museum 归档的 JSON。

要求：
1. 所有字段都必须使用中文。
2. category 必须严格从以下值中选择一个：${Object.values(ItemCategory).join('、')}。
3. story 要像馆藏卡片里的温柔描述，控制在 30-60 字。
4. tags 返回 3-5 个短标签。

返回格式：
{
  "name": "物品名称",
  "category": "分类",
  "material": "主要材质",
  "story": "带一点温度和记忆感的描述",
  "tags": ["标签1", "标签2", "标签3"]
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            material: { type: Type.STRING },
            story: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['name', 'category', 'material', 'story', 'tags'],
        },
      },
    }));

    const text = response.text?.trim();
    if (!text) {
      throw new Error('No response from AI');
    }

    const data = JSON.parse(text) as {
      name?: string;
      category?: string;
      material?: string;
      story?: string;
      tags?: string[];
    };

    return {
      name: (data.name || '未命名藏品').trim(),
      category: normalizeCategory(data.category),
      material: (data.material || '综合材质').trim(),
      story: (data.story || '这件旧物正在等待一次新的归档与再生。').trim(),
      tags: Array.isArray(data.tags) ? data.tags.map((tag) => `${tag || ''}`.trim()).filter(Boolean).slice(0, 5) : [],
    };
  } catch (error) {
    throw classifyError(error);
  }
}

export async function generateRemuseIdeasTask(itemDescription: string, material: string): Promise<RemuseIdea[]> {
  if (AI_MOCK_MODE) {
    return mockIdeas(itemDescription, material);
  }

  try {
    const ai = createAiClient();
    const response = await withAiRetries('remuse-ideas', () => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `请为材质是“${material || '综合材质'}”的“${itemDescription}”生成 3 个再生改造方案。

要求：
1. 使用中文。
2. 按照简单 / 中等 / 困难三个层级覆盖。
3. 方案要可执行，不要空泛。
4. 返回 JSON 数组。

返回格式：
[
  {
    "title": "方案标题",
    "description": "一句话介绍",
    "difficulty": "简单",
    "materials": ["材料1", "材料2"],
    "steps": ["步骤1", "步骤2", "步骤3"]
  }
]`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              difficulty: { type: Type.STRING, enum: [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD] },
              materials: { type: Type.ARRAY, items: { type: Type.STRING } },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'description', 'difficulty', 'materials', 'steps'],
          },
        },
      },
    }));

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Ideas response parse error');
    }

    const ideas = JSON.parse(text) as RemuseIdea[];
    if (!Array.isArray(ideas) || ideas.length === 0) {
      throw new Error('Ideas response parse error');
    }

    return ideas.slice(0, 3);
  } catch (error) {
    throw classifyError(error);
  }
}

export async function generateStickerTask(base64Image: string, itemName: string) {
  if (AI_MOCK_MODE) {
    return {
      stickerImageUrl: `data:image/png;base64,${base64Image}`,
      dramaText: `我叫${itemName}，今天也想被你认真收藏。`,
    };
  }

  try {
    const ai = createAiClient();
    const [textResponse, imageResponse] = await Promise.all([
      withAiRetries('sticker-generate', () => ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `你是一位温柔又有点俏皮的旧物文案编辑。请为“${itemName}”写 1-2 句第一人称贴纸文案。

要求：
1. 只输出中文文案，不要引号和标签。
2. 语气轻巧、可爱、适合贴纸。
3. 不要消极、惊悚、攻击性表达。`,
      })),
      withAiRetries('sticker-generate', () => ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: buildStickerPrompt(),
            },
          ],
        },
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      })),
    ]);

    const dramaText = textResponse.text?.trim() || `我叫${itemName}，今天也想被你认真收藏。`;
    const generated = extractInlineImageData(imageResponse);
    const stickerImageUrl = generated
      ? await removeBlackBackgroundDataUrl(`data:image/png;base64,${generated}`)
      : `data:image/jpeg;base64,${base64Image}`;

    return {
      stickerImageUrl,
      dramaText,
    };
  } catch (error) {
    throw classifyError(error);
  }
}

export async function generateCollectionCoverTask(base64Image: string, itemName: string, hallId: string) {
  if (AI_MOCK_MODE) {
    return {
      coverImageUrl: await composeCollectionCoverDataUrl({
        hallId,
        subjectDataUrl: `data:image/jpeg;base64,${base64Image}`,
        useCutoutLayout: false,
      }),
      usedFallback: true,
    };
  }

  try {
    const ai = createAiClient();
    let cutoutDataUrl = '';
    let usedFallback = false;

    try {
      const imageResponse = await withAiRetries('cover-generate', () => ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: buildCollectionCoverPrompt(itemName),
            },
          ],
        },
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '3:4',
          },
        },
      }));

      const generated = extractInlineImageData(imageResponse);
      if (generated) {
        cutoutDataUrl = await removeBlackBackgroundDataUrl(`data:image/png;base64,${generated}`, 70, 28);
      }
    } catch (error) {
      usedFallback = true;
      serverLogger.warn('cover.foreground.failed', {
        hallId,
        itemName,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const coverImageUrl = await composeCollectionCoverDataUrl({
      hallId,
      subjectDataUrl: cutoutDataUrl || `data:image/jpeg;base64,${base64Image}`,
      useCutoutLayout: Boolean(cutoutDataUrl),
    });

    return {
      coverImageUrl,
      usedFallback: usedFallback || !cutoutDataUrl,
    };
  } catch (error) {
    throw classifyError(error);
  }
}

export async function generateEmojiPackTask(
  stickerInputs: StickerInput[],
  count = 9,
  userMood = '',
) {
  if (!stickerInputs.length) {
    throw createAnalysisError('IMAGE_QUALITY', '缺少贴纸素材', '表情包生成需要至少一张贴纸图像。', '请先选择 1 张以上贴纸，再重新尝试。');
  }

  if (AI_MOCK_MODE) {
    return [{
      imageUrl: `data:${stickerInputs[0].mimeType || 'image/png'};base64,${stickerInputs[0].base64}`,
      text: `emoji-sheet-${Math.max(1, count)}`,
    }];
  }

  try {
    const ai = createAiClient();
    const itemCount = stickerInputs.length;
    const captions = await withAiRetries('emoji-pack', () => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `请为 ${itemCount} 个旧物贴纸角色生成 ${count} 条中文表情包文案。

对象名称：${stickerInputs.map((item) => item.name).join('、')}
用户心情补充：${userMood || '未提供'}

要求：
1. 每条文案 2-6 个汉字。
2. 语气要口语化、适合社交聊天。
3. 返回 JSON 数组，每项包含 text 和 emotion。`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              emotion: { type: Type.STRING },
            },
            required: ['text', 'emotion'],
          },
        },
      },
    }));

    const parsedCaptions = JSON.parse(captions.text?.trim() || '[]') as Array<{ text: string; emotion: string }>;
    if (!Array.isArray(parsedCaptions) || parsedCaptions.length === 0) {
      throw new Error('No captions generated');
    }

    const { rows, cols } = resolveEmojiGrid(Math.max(1, count));
    const gridDescription = parsedCaptions
      .slice(0, count)
      .map((caption, index) => `Cell ${index + 1}: 文案“${caption.text}”，情绪“${caption.emotion}”`)
      .join('\n');

    const response = await withAiRetries('emoji-pack', () => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          ...stickerInputs.map((input) => ({
            inlineData: {
              mimeType: input.mimeType || 'image/png',
              data: input.base64,
            },
          })),
          {
            text: buildEmojiPackPrompt(count, rows, cols, gridDescription, itemCount),
          },
        ],
      },
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: cols >= rows ? '4:3' : '3:4',
        },
      },
    }));

    const imageData = extractInlineImageData(response);
    if (!imageData) {
      throw new Error('Grid image generation returned no image data');
    }

    return [{
      imageUrl: `data:image/png;base64,${imageData}`,
      text: `emoji-sheet-${count}`,
    }];
  } catch (error) {
    throw classifyError(error);
  }
}

async function withAiRetries<T>(feature: AiFeature, task: () => Promise<T>, attempts = 2) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      serverLogger.warn('ai.retry', {
        feature,
        attempt,
        message: error instanceof Error ? error.message : String(error),
      });

      if (attempt >= attempts || !shouldRetry(error)) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }

  throw lastError;
}

function shouldRetry(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch')
    || message.includes('503')
    || message.includes('502')
    || message.includes('rate limit')
  );
}

function extractInlineImageData(response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>) {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }

  return '';
}

function buildStickerPrompt() {
  return `Turn this object photo into a die-cut sticker on a solid black background.

Requirements:
1. Preserve the object's real texture, material, and color.
2. Remove the original background and replace it with pure black.
3. Add a thick white die-cut outline around the silhouette.
4. Add only a very subtle outer shadow around the white edge.
5. No extra text, no watermark, no decorative frame.`;
}

function buildCollectionCoverPrompt(itemName: string) {
  return `Create a clean collectible cut-out of this object on a pure black background.

Object name: ${itemName}

Requirements:
1. Keep the uploaded object recognizable, with its real silhouette, texture, and material.
2. Remove the original environment completely and replace it with pure black.
3. Keep only one centered main object with the full silhouette visible.
4. Do not add any text, watermark, frame, props, background scene, or duplicate object.
5. Keep the render polished and premium, but do not turn it into a cartoon.
6. If a thin edge is needed for separation, make it subtle and clean.`;
}

function buildEmojiPackPrompt(count: number, rows: number, cols: number, gridDescription: string, itemCount: number) {
  return `Create a ${rows}x${cols} emoji sticker grid with ${count} cute anthropomorphic stickers.

Reference objects: ${itemCount}
Grid requirements:
1. Every cell contains a separate cute sticker character.
2. Keep the original item recognizable.
3. Add a thick white die-cut outline around each sticker.
4. Use a white or warm light background with visible gaps between stickers.
5. Render the Chinese caption clearly in each cell.

Cell details:
${gridDescription}`;
}

function resolveEmojiGrid(count: number) {
  if (count <= 1) return { rows: 1, cols: 1 };
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: 2, cols: 3 };
  if (count <= 9) return { rows: 3, cols: 3 };
  return { rows: Math.ceil(count / 4), cols: 4 };
}

function normalizeCategory(category?: string | null) {
  if (category && Object.values(ItemCategory).includes(category as ItemCategory)) {
    return category as ItemCategory;
  }

  return ItemCategory.OTHER;
}

function createAnalysisError(
  category: ErrorCategory,
  title: string,
  message: string,
  suggestion: string,
): AnalysisError {
  return { category, title, message, suggestion };
}

function classifyError(error: unknown): AnalysisError {
  if (isAnalysisError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('429') || normalized.includes('rate limit') || normalized.includes('quota')) {
    return createAnalysisError(
      'RATE_LIMIT',
      'AI 服务繁忙',
      '当前请求频率过高，AI 服务暂时拒绝了这次生成。',
      '请等待几十秒后重试，或联系管理员检查额度配置。',
    );
  }

  if (normalized.includes('safety') || normalized.includes('blocked') || normalized.includes('prohibited')) {
    return createAnalysisError(
      'SAFETY',
      '内容受限',
      'AI 安全系统阻止了这次生成请求。',
      '请换一张更明确、无敏感内容的图片后再试。',
    );
  }

  if (normalized.includes('parse') || normalized.includes('json') || normalized.includes('unexpected')) {
    return createAnalysisError(
      'PARSE_ERROR',
      'AI 返回异常',
      'AI 已响应，但结果格式无法被系统解析。',
      '请重新尝试一次；如果持续出现，请联系管理员排查模型输出。',
    );
  }

  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('timeout') || normalized.includes('econn')) {
    return createAnalysisError(
      'NETWORK',
      '连接失败',
      'AI 服务当前无法稳定连接。',
      '请检查网络或稍后重试。',
    );
  }

  if (normalized.includes('image') || normalized.includes('photo') || normalized.includes('empty')) {
    return createAnalysisError(
      'IMAGE_QUALITY',
      '图片识别困难',
      '当前图片无法稳定识别出需要的物品信息。',
      '请换一张更清晰、主体更靠中的图片再试。',
    );
  }

  return createAnalysisError(
    'UNKNOWN',
    '生成失败',
    message || '未知错误',
    '请稍后重试；如果持续失败，请联系管理员查看服务端日志。',
  );
}

function isAnalysisError(error: unknown): error is AnalysisError {
  return Boolean(
    error
    && typeof error === 'object'
    && 'category' in error
    && 'title' in error
    && 'message' in error
    && 'suggestion' in error,
  );
}

function mockAnalysis(base64Image: string) {
  const categories = Object.values(ItemCategory);
  const hash = createStableHash(base64Image);
  const category = categories[hash % categories.length] || ItemCategory.OTHER;

  return {
    name: '测试旧物样本',
    category,
    material: category === ItemCategory.CONTAINER ? '玻璃' : '综合材质',
    story: '这件测试旧物已经被识别并准备进入再生博物馆的数字档案。',
    tags: ['测试样本', '自动归档', 'Playwright'],
  };
}

function mockIdeas(itemDescription: string, material: string): RemuseIdea[] {
  return [
    {
      title: `${itemDescription} 微型展示台`,
      description: `把这件${material || '旧物'}改造成桌面展示摆件，保留原本的记忆感。`,
      difficulty: Difficulty.EASY,
      materials: ['双面胶', '支撑板', '小卡片'],
      steps: ['清洁旧物表面', '固定到底座上', '补上一句标签说明'],
    },
    {
      title: `${itemDescription} 记忆收纳件`,
      description: '把它和一段故事结合，做成可继续保存记忆的小物件。',
      difficulty: Difficulty.MEDIUM,
      materials: ['透明盒', '麻绳', '标签贴纸'],
      steps: ['整理可保留部分', '组合成新的收纳件', '写下物品来历'],
    },
    {
      title: `${itemDescription} 再生装置`,
      description: '在保留原物特征的基础上，做成更有展示感的再生作品。',
      difficulty: Difficulty.HARD,
      materials: ['小灯带', '结构件', '固定夹'],
      steps: ['规划结构', '安装支撑与照明', '完成陈列与拍照归档'],
    },
  ];
}

function createStableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

async function removeBlackBackgroundDataUrl(dataUrl: string, threshold = 60, feather = 30) {
  const { mimeType, buffer } = decodeDataUrl(dataUrl);
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const backgroundMask = new Uint8Array(info.width * info.height);
  const queue: number[] = [];

  const brightnessAt = (index: number) => {
    const offset = index * info.channels;
    const r = data[offset] || 0;
    const g = data[offset + 1] || 0;
    const b = data[offset + 2] || 0;
    return Math.sqrt(r * r + g * g + b * b);
  };

  const isBackground = (index: number) => brightnessAt(index) <= threshold + feather;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= info.width || y < 0 || y >= info.height) {
      return;
    }

    const pixelIndex = y * info.width + x;
    if (visited[pixelIndex]) {
      return;
    }

    visited[pixelIndex] = 1;
    if (isBackground(pixelIndex)) {
      backgroundMask[pixelIndex] = 1;
      queue.push(pixelIndex);
    }
  };

  for (let x = 0; x < info.width; x += 1) {
    tryEnqueue(x, 0);
    tryEnqueue(x, info.height - 1);
  }

  for (let y = 0; y < info.height; y += 1) {
    tryEnqueue(0, y);
    tryEnqueue(info.width - 1, y);
  }

  while (queue.length > 0) {
    const pixelIndex = queue.pop()!;
    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  const output = Buffer.from(data);
  for (let pixelIndex = 0; pixelIndex < info.width * info.height; pixelIndex += 1) {
    if (!backgroundMask[pixelIndex]) {
      continue;
    }

    const alphaOffset = pixelIndex * info.channels + 3;
    const brightness = brightnessAt(pixelIndex);
    output[alphaOffset] = brightness <= threshold
      ? 0
      : Math.max(0, Math.min(255, Math.round(((brightness - threshold) / feather) * 255)));
  }

  const pngBuffer = await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer();

  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2], 'base64'),
  };
}
