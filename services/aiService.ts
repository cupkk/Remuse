import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import { ItemCategory, TransformationGuide } from '../types.js';
import { APP_CONFIG } from './appConfig.ts';
import { composeCollectionCoverDataUrl } from './collectionCoverComposer.ts';
import { serverLogger } from './serverLogger.ts';
import { canUseLocalCoverCutout, removeBackgroundWithRembgDataUrl, removeSolidBackgroundDataUrl } from './subjectCutout.ts';

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const AI_MOCK_MODE = ['1', 'true', 'mock', 'demo'].includes((process.env.AI_MOCK_MODE || '').trim().toLowerCase());

export type AiFeature = 'scan-analysis' | 'sticker-generate' | 'emoji-pack' | 'cover-generate' | 'guide-generate';
export type ErrorCategory =
  | 'NETWORK'
  | 'IMAGE_QUALITY'
  | 'RATE_LIMIT'
  | 'SAFETY'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

export { canUseLocalCoverCutout } from './subjectCutout.ts';

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
            description: { type: Type.STRING },
            story: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['name', 'category', 'material', 'description', 'story', 'tags'],
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
      description?: string;
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

export async function generateTransformationGuideTask(items: Array<{
  name: string;
  category?: string;
  material?: string;
  description?: string;
  story?: string;
  tags?: string[];
  imageBase64?: string;
}>): Promise<TransformationGuide> {
  if (!items.length) {
    throw createAnalysisError('IMAGE_QUALITY', '缺少藏品', '生成改造指南前至少需要选择 1 件藏品。', '请先选择 1 件或多件藏品，再重新尝试。');
  }

  if (AI_MOCK_MODE) {
    return mockTransformationGuide(items);
  }

  try {
    const ai = createAiClient();
    const itemSummary = items
      .map((item, index) => {
        const parts = [
          `名称：${item.name}`,
          `分类：${item.category || '未记录'}`,
          `材质：${item.material || '未记录'}`,
          `描述：${item.description || '未补充'}`,
          `故事：${item.story || '未补充'}`,
          `标签：${Array.isArray(item.tags) && item.tags.length ? item.tags.join('、') : '未补充'}`,
        ];
        return `藏品 ${index + 1}\n${parts.join('\n')}`;
      })
      .join('\n\n');

    const textResponse = await withAiRetries('guide-generate', () => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `请基于以下藏品生成一份综合“改造指南”JSON，用于再生工坊中的旧物新生局。

${itemSummary}

要求：
1. 这是综合方案，不要按单个藏品分别写重复内容。
2. 方案要适合 1 件或多件藏品联合改造。
3. 全部使用中文，语气清晰、可执行、不过度空泛。
4. 返回字段：
{
  "title": "方案标题",
  "summary": "80字以内的整体概述",
  "concept": "对最终成品形态的描述，便于生成示意图",
  "materials": ["补充材料1", "补充材料2"],
  "steps": ["步骤1", "步骤2", "步骤3", "步骤4"],
  "tips": ["提示1", "提示2", "提示3"]
}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            concept: { type: Type.STRING },
            materials: { type: Type.ARRAY, items: { type: Type.STRING } },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'summary', 'concept', 'materials', 'steps', 'tips'],
        },
      },
    }));

    const parsed = JSON.parse(textResponse.text?.trim() || '{}') as Partial<TransformationGuide>;
    const concept = (parsed.concept || parsed.summary || parsed.title || '一件由旧物组合而成的温和实用改造成品').trim();

    const imageResponse = await withAiRetries('guide-generate', () => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          ...items
            .slice(0, 4)
            .filter((item) => item.imageBase64)
            .map((item) => ({
              inlineData: {
                mimeType: 'image/jpeg',
                data: item.imageBase64!,
              },
            })),
          {
            text: buildTransformationGuidePrompt(items, concept),
          },
        ],
      },
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '4:3',
        },
      },
    }));

    const imageData = extractInlineImageData(imageResponse);
    if (!imageData) {
      throw new Error('Guide image generation returned no image data');
    }

    return {
      title: (parsed.title || '综合改造指南').trim(),
      summary: (parsed.summary || '将已入馆藏品重新组合，形成一个更适合继续陪伴日常生活的改造方案。').trim(),
      concept,
      materials: Array.isArray(parsed.materials) ? parsed.materials.filter(Boolean).slice(0, 8) : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps.filter(Boolean).slice(0, 8) : [],
      tips: Array.isArray(parsed.tips) ? parsed.tips.filter(Boolean).slice(0, 6) : [],
      imageUrl: `data:image/png;base64,${imageData}`,
    };
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
      ? await removeSolidBackgroundDataUrl(`data:image/png;base64,${generated}`, 34, 48)
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
  if (AI_MOCK_MODE || APP_CONFIG.disableLiveAi) {
    return {
      coverImageUrl: await composeCollectionCoverDataUrl({
        hallId,
        subjectDataUrl: `data:image/jpeg;base64,${base64Image}`,
        useCutoutLayout: false,
      }),
      usedFallback: true,
      provider: 'fallback' as const,
    };
  }

  try {
    const originalDataUrl = `data:image/jpeg;base64,${base64Image}`;
    let cutoutDataUrl = '';
    let usedFallback = false;
    let provider: 'rembg' | 'gemini' | 'fallback' = 'fallback';

    if (canUseLocalCoverCutout()) {
      cutoutDataUrl = await removeBackgroundWithRembgDataUrl(originalDataUrl);
      if (cutoutDataUrl) {
        provider = 'rembg';
      } else {
        usedFallback = true;
      }
    }

    if (!cutoutDataUrl) {
      const ai = createAiClient();

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
          cutoutDataUrl = await removeSolidBackgroundDataUrl(`data:image/png;base64,${generated}`, 34, 52);
          provider = 'gemini';
        }
      } catch (error) {
        usedFallback = true;
        serverLogger.warn('cover.foreground.failed', {
          hallId,
          itemName,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const coverImageUrl = await composeCollectionCoverDataUrl({
      hallId,
      subjectDataUrl: cutoutDataUrl || originalDataUrl,
      useCutoutLayout: Boolean(cutoutDataUrl),
    });

    return {
      coverImageUrl,
      usedFallback: usedFallback || !cutoutDataUrl,
      provider,
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
  return `Create an exact isolated cut-out of the uploaded object on a pure black background.

Object name: ${itemName}

Requirements:
1. Preserve the original photo faithfully: keep the same object shape, printed text, colors, wear, texture, and camera angle.
2. Remove only the background and replace it with pure black (#000000).
3. Keep a single complete object with comfortable padding so the full silhouette is visible.
4. Do not beautify, redesign, repaint, relight, stylize, cartoonize, or change the material.
5. Do not add any text, watermark, frame, props, duplicate object, or background scene.
6. Keep the edges clean and accurate for later compositing.`;
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

function buildTransformationGuidePrompt(
  items: Array<{ name: string; material?: string; category?: string }>,
  concept: string,
) {
  const itemText = items
    .map((item) => `${item.name}${item.material ? `（${item.material}）` : ''}`)
    .join('、');

  return `Create a clean design mockup of an upcycled object project.

Reference objects: ${itemText}
Concept: ${concept}

Requirements:
1. Show one complete transformed result, not a collage of separate raw objects.
2. Keep visual clues from the source items so the original objects remain recognizable.
3. The result should look practical, warm, and suitable for a museum-style creative guide.
4. Use a clean tabletop or studio presentation with soft natural lighting.
5. No text, no watermark, no extra panels, no split-screen, no blueprint annotations.`;
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

function mockTransformationGuide(items: Array<{
  name: string;
  material?: string;
  imageBase64?: string;
}>): TransformationGuide {
  const firstItem = items[0];
  const itemNames = items.map((item) => item.name).join('、');

  return {
    title: `${firstItem?.name || '藏品'}综合改造指南`,
    summary: `围绕${itemNames}做一次联合改造，让旧物以更实用也更有陪伴感的形式继续留在日常生活里。`,
    concept: `把${itemNames}重新组合成一个兼具展示感与收纳感的小型生活器物，保留旧物原本的纹理和记忆痕迹。`,
    materials: ['棉绳', '热熔胶', '亚克力固定片', '环保涂层'],
    steps: ['先整理并清洁选中的藏品', '筛选可保留的结构与图案', '规划新的组合方式', '完成固定与细节处理', '拍摄并归档改造成果'],
    tips: ['优先保留最有辨识度的旧物细节', '补充材料尽量选择可逆、低损耗方案', '示意图完成后再决定最终施工比例'],
    imageUrl: firstItem?.imageBase64 ? `data:image/jpeg;base64,${firstItem.imageBase64}` : buildGuidePlaceholderDataUrl(itemNames),
  };
}

function buildGuidePlaceholderDataUrl(title: string) {
  const safeTitle = escapeXml(title || '综合改造指南');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="100%" stop-color="#1f2937" />
      </linearGradient>
    </defs>
    <rect width="960" height="720" fill="url(#bg)" rx="40" />
    <rect x="74" y="74" width="812" height="572" rx="32" fill="rgba(255,255,255,0.04)" stroke="rgba(204,255,0,0.35)" />
    <circle cx="250" cy="292" r="110" fill="rgba(96,165,250,0.22)" />
    <circle cx="510" cy="350" r="136" fill="rgba(249,115,22,0.16)" />
    <circle cx="706" cy="278" r="92" fill="rgba(204,255,0,0.16)" />
    <text x="96" y="584" fill="#e5e7eb" font-size="42" font-family="Arial, sans-serif" font-weight="700">${safeTitle}</text>
    <text x="96" y="630" fill="#9ca3af" font-size="24" font-family="Arial, sans-serif">AI concept preview</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createStableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
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
