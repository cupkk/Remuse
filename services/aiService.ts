import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { EMOJI_STYLE_PRESETS, EmojiStylePreset, ItemCategory, TransformationGuide } from '../types.js';
import { APP_CONFIG } from './appConfig.ts';
import { composeCollectionCoverDataUrl } from './collectionCoverComposer.ts';
import { serverLogger } from './serverLogger.ts';
import {
  parseJsonFromModelText,
  requestStepfunChatCompletion,
  StepfunMultipartContentPart,
  STEPFUN_TEXT_MODEL_CANDIDATES,
  STEPFUN_VISION_MODEL_CANDIDATES,
} from './stepfunTextService.ts';
import {
  assessCutoutQualityDataUrl,
  canUseLocalCoverCutout,
  removeBackgroundWithRembgDataUrl,
  removeSolidBackgroundDataUrl,
} from './subjectCutout.ts';

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GUIDE_TEXT_MODEL_CANDIDATES = parseModelCandidates(
  process.env.STEPFUN_GUIDE_TEXT_MODEL_CANDIDATES,
  STEPFUN_TEXT_MODEL_CANDIDATES,
);
const GUIDE_IMAGE_MODEL_CANDIDATES = parseModelCandidates(
  process.env.GEMINI_GUIDE_IMAGE_MODEL_CANDIDATES,
  [process.env.GEMINI_GUIDE_IMAGE_MODEL || 'gemini-3.1-flash-image-preview', IMAGE_MODEL, 'gemini-2.5-flash-image-preview'],
);
const STEPFUN_SCAN_TIMEOUT_MS = parseIntegerEnv(process.env.STEPFUN_SCAN_TIMEOUT_MS, 30_000);
const STEPFUN_GUIDE_TIMEOUT_MS = parseIntegerEnv(process.env.STEPFUN_GUIDE_TIMEOUT_MS, 35_000);
const STEPFUN_SHORT_TEXT_TIMEOUT_MS = parseIntegerEnv(process.env.STEPFUN_SHORT_TEXT_TIMEOUT_MS, 12_000);
const GUIDE_IMAGE_TIMEOUT_MS = parseIntegerEnv(process.env.GEMINI_GUIDE_IMAGE_TIMEOUT_MS, 110_000);
const ENABLE_COVER_AI_FALLBACK = ['1', 'true', 'yes'].includes((process.env.ENABLE_COVER_AI_FALLBACK || '').trim().toLowerCase());
const STICKER_IMAGE_TIMEOUT_MS = parseIntegerEnv(process.env.GEMINI_STICKER_IMAGE_TIMEOUT_MS, 90_000);
const COVER_IMAGE_TIMEOUT_MS = parseIntegerEnv(process.env.GEMINI_COVER_IMAGE_TIMEOUT_MS, 90_000);
const PERLER_IMAGE_TIMEOUT_MS = parseIntegerEnv(process.env.GEMINI_PERLER_IMAGE_TIMEOUT_MS, 90_000);
const EMOJI_IMAGE_TIMEOUT_MS = parseIntegerEnv(process.env.GEMINI_EMOJI_IMAGE_TIMEOUT_MS, 140_000);
const ENABLE_GUIDE_AI_IMAGE = !['0', 'false', 'no'].includes((process.env.ENABLE_GUIDE_AI_IMAGE || 'true').trim().toLowerCase());
const IMAGE_MODEL_CANDIDATES = parseModelCandidates(
  process.env.GEMINI_IMAGE_MODEL_CANDIDATES,
  [IMAGE_MODEL, 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image-preview'],
);
const AI_MOCK_MODE = ['1', 'true', 'mock', 'demo'].includes((process.env.AI_MOCK_MODE || '').trim().toLowerCase());

export type AiFeature = 'scan-analysis' | 'sticker-generate' | 'emoji-pack' | 'cover-generate' | 'guide-generate' | 'perler-preprocess';
export type ErrorCategory =
  | 'NETWORK'
  | 'IMAGE_QUALITY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
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

interface EmojiCaptionPlanEntry {
  text: string;
  emotion: string;
  expression: string;
  pose: string;
  visualCue: string;
}

function parseModelCandidates(
  envValue: string | undefined,
  defaults: string[],
) {
  const parsed = (envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const merged = [...parsed, ...defaults];
  return [...new Set(merged)];
}

function escapeSvgText(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildGuideFallbackImageDataUrl(
  items: Array<{ imageBase64?: string }>,
  concept: string,
) {
  const firstImage = items.find((item) => item.imageBase64?.trim());
  if (firstImage?.imageBase64) {
    return `data:image/jpeg;base64,${firstImage.imageBase64.trim()}`;
  }

  const conceptText = escapeSvgText((concept || '综合改造示意图').slice(0, 42));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 1280 960">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#171b1f"/>
      <stop offset="50%" stop-color="#1f252b"/>
      <stop offset="100%" stop-color="#101419"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="960" fill="url(#bg)"/>
  <rect x="80" y="80" width="1120" height="800" rx="28" fill="rgba(0,0,0,0.24)" stroke="rgba(255,255,255,0.12)"/>
  <text x="640" y="408" fill="#cfff00" text-anchor="middle" font-size="34" font-family="Arial, Helvetica, sans-serif" letter-spacing="2">综合改造指南</text>
  <text x="640" y="468" fill="#d9dee3" text-anchor="middle" font-size="26" font-family="Arial, Helvetica, sans-serif">${conceptText}</text>
  <text x="640" y="836" fill="#8d98a3" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif">图片生成临时降级，已先返回可执行的文字方案</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  feature: AiFeature,
  modelCandidates: string[],
  requestBuilder: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0],
  options: { attempts?: number; timeoutMs?: number } = {},
) {
  let lastError: unknown;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    try {
      const response = await withAiRetries(
        feature,
        () => withOptionalTimeout(
          ai.models.generateContent(requestBuilder(model)),
          options.timeoutMs,
          `${feature}:${model}`,
        ),
        options.attempts ?? 4,
      );
      return response;
    } catch (error) {
      lastError = error;
      serverLogger.warn('ai.model_fallback', {
        feature,
        model,
        step: index + 1,
        total: modelCandidates.length,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!shouldFallbackModel(error) || index >= modelCandidates.length - 1) {
        break;
      }
    }
  }

  throw lastError;
}

function parseIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, label: string) {
  if (!timeoutMs) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} AI 配图响应超时。`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function shouldFallbackModel(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('429')
    || message.includes('rate limit')
    || message.includes('too many')
    || message.includes('no capacity')
    || message.includes('service unavailable')
    || message.includes('model is overloaded')
    || message.includes('insufficient_user_quota')
    || message.includes('quota exceeded')
    || message.includes('user quota')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('响应超时')
    || message.includes('用户额度不足')
    || message.includes('预扣费额度失败')
    || message.includes('model not found')
    || message.includes('unsupported model')
    || message.includes('not available for')
    || message.includes('does not support')
  );
}

function createAiClient() {
  if (APP_CONFIG.disableLiveAi && !AI_MOCK_MODE) {
    throw createAnalysisError(
      'NETWORK',
      'AI \u670d\u52a1\u4e0d\u53ef\u7528',
      '\u5f53\u524d\u73af\u5883\u5df2\u5173\u95ed\u5b9e\u65f6 AI \u80fd\u529b',
      '\u8bf7\u68c0\u67e5 AI \u670d\u52a1\u914d\u7f6e\uff0c\u6216\u542f\u7528 AI mock \u6a21\u5f0f\u3002',
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
    const response = await requestStepfunChatCompletion({
      feature: 'scan-analysis',
      modelCandidates: STEPFUN_VISION_MODEL_CANDIDATES,
      responseFormat: 'json_object',
      temperature: 0.2,
      userContent: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
          },
        },
        {
          type: 'text',
          text: `请分析这张旧物图片，并返回一份适合 Re-Museum 归档的 JSON。
要求：
1. 所有字段使用简体中文。
2. category 必须严格从以下值中选择一个：${Object.values(ItemCategory).join('、')}。
3. description 用 1-2 句话概括外观、材质细节、使用场景或可再生方向，控制在 45-90 字。
4. story 保持温柔叙事风格，写出这件旧物可能承载的时间感、情绪和生活痕迹，控制在 80-140 字。
5. tags 返回 3-5 个短标签。
6. 只返回合法 JSON，不要补充解释。
返回格式：
{
  "name": "物品名称",
  "category": "分类",
  "material": "主要材质",
  "description": "一句简介",
  "story": "带有记忆感的描述",
  "tags": ["标签1", "标签2", "标签3"]
}`,
        },
      ] satisfies StepfunMultipartContentPart[],
      maxTokens: 900,
      timeoutMs: STEPFUN_SCAN_TIMEOUT_MS,
      attempts: 2,
    });

    const data = parseJsonFromModelText<{
      name?: string;
      category?: string;
      material?: string;
      description?: string;
      story?: string;
      tags?: string[];
    }>(response.text);

    return {
      name: (data.name || '未命名藏品').trim(),
      category: normalizeCategory(data.category),
      material: (data.material || '综合材质').trim(),
      description: (data.description || '').trim(),
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

    let parsed: Partial<TransformationGuide>;
    let concept = '一件由旧物组合而成的温和实用改造成品。';
    try {
      const textResponse = await requestStepfunChatCompletion({
        feature: 'guide-generate',
        modelCandidates: GUIDE_TEXT_MODEL_CANDIDATES,
        responseFormat: 'json_object',
        temperature: 0.35,
        maxTokens: 1400,
        timeoutMs: STEPFUN_GUIDE_TIMEOUT_MS,
        attempts: 2,
        userContent: `请基于以下藏品，生成一份综合“改造指南”JSON，用于再生工坊中的旧物新生局。
${itemSummary}

要求：
1. 这是综合方案，不要按单个藏品分别写重复内容。
2. 方案要适合 1 件或多件藏品联合改造。
3. 全部使用简体中文，语气清晰、可执行、不空泛。
4. materials / steps / tips 都必须是字符串数组。
5. 只返回合法 JSON，不要添加解释或代码块。
4. 返回字段：
{
  "title": "方案标题",
  "summary": "80字以内的整体概述",
  "concept": "对最终成品形态的描述，便于生成示意图",
  "materials": ["补充材料1", "补充材料2"],
  "steps": ["步骤1", "步骤2", "步骤3", "步骤4"],
  "tips": ["提示1", "提示2", "提示3"]
}`,
      });

      parsed = parseJsonFromModelText<Partial<TransformationGuide>>(textResponse.text);
      concept = (parsed.concept || parsed.summary || parsed.title || concept).trim();
    } catch (textError) {
      const classified = classifyError(textError);
      const canFallback =
        classified.category === 'QUOTA_EXCEEDED'
        || classified.category === 'RATE_LIMIT'
        || classified.category === 'NETWORK'
        || classified.category === 'PARSE_ERROR';

      if (!canFallback) {
        throw textError;
      }

      const localGuide = mockTransformationGuide(items);
      parsed = {
        title: localGuide.title,
        summary: localGuide.summary,
        concept: localGuide.concept,
        materials: localGuide.materials,
        steps: localGuide.steps,
        tips: localGuide.tips,
      };
      concept = localGuide.concept;

      serverLogger.warn('guide.text.fallback_used', {
        category: classified.category,
        message: classified.message,
      });
    }

    let imageUrl = buildGuideFallbackImageDataUrl(items, concept);
    if (ENABLE_GUIDE_AI_IMAGE) {
      try {
        const ai = createAiClient();
        const imageResponse = await generateContentWithFallback(ai, 'guide-generate', GUIDE_IMAGE_MODEL_CANDIDATES, (model) => ({
          model,
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
        }), {
          attempts: 1,
          timeoutMs: GUIDE_IMAGE_TIMEOUT_MS,
        });

        const imageData = extractInlineImageData(imageResponse);
        if (!imageData) {
          throw new Error('未能从 AI 图像生成结果中提取到图像数据。');
        }
        imageUrl = `data:image/png;base64,${imageData}`;
      } catch (imageError) {
        const classified = classifyError(imageError);
        const canFallback =
          classified.category === 'QUOTA_EXCEEDED'
          || classified.category === 'RATE_LIMIT'
          || classified.category === 'NETWORK'
          || classified.category === 'IMAGE_QUALITY'
          || classified.category === 'PARSE_ERROR'
          || classified.category === 'UNKNOWN';

        if (!canFallback) {
          throw imageError;
        }

        serverLogger.warn('guide.image.fallback_used', {
          category: classified.category,
          message: classified.message,
        });
      }
    }

    return {
      title: (parsed.title || '综合改造指南').trim(),
      summary: (parsed.summary || '将已入馆藏品重新组合，形成一个更适合继续陪伴日常生活的改造方案。').trim(),
      concept,
      materials: Array.isArray(parsed.materials) ? parsed.materials.filter(Boolean).slice(0, 8) : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps.filter(Boolean).slice(0, 8) : [],
      tips: Array.isArray(parsed.tips) ? parsed.tips.filter(Boolean).slice(0, 6) : [],
      imageUrl,
    };
  } catch (error) {
    throw classifyError(error);
  }
}
export async function generateStickerTask(base64Image: string, itemName: string) {
  if (AI_MOCK_MODE) {
    return {
      stickerImageUrl: `data:image/png;base64,${base64Image}`,
      dramaText: buildLocalStickerDramaText(itemName),
    };
  }

  try {
    const ai = createAiClient();
    const originalDataUrl = `data:image/jpeg;base64,${base64Image}`;

    if (canUseLocalCoverCutout()) {
      const [textResult, localStickerResult] = await Promise.allSettled([
        generateStickerCaptionText(itemName),
        generateLocalStickerDataUrl(originalDataUrl),
      ]);

      if (localStickerResult.status === 'fulfilled' && localStickerResult.value) {
        return {
          stickerImageUrl: localStickerResult.value,
          dramaText: textResult.status === 'fulfilled' && textResult.value.trim()
            ? textResult.value.trim()
            : buildLocalStickerDramaText(itemName),
        };
      }

      if (localStickerResult.status === 'rejected') {
        serverLogger.warn('sticker.local_render.failed', {
          itemName,
          message: localStickerResult.reason instanceof Error ? localStickerResult.reason.message : String(localStickerResult.reason),
        });
      }
    }

    const [textResult, imageResult] = await Promise.allSettled([
      generateStickerCaptionText(itemName),
      generateContentWithFallback(ai, 'sticker-generate', IMAGE_MODEL_CANDIDATES, (model) => ({
        model,
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
      }), {
        attempts: 1,
        timeoutMs: STICKER_IMAGE_TIMEOUT_MS,
      }),
    ]);

    if (textResult.status === 'rejected') {
      serverLogger.warn('sticker.caption.fallback_used', {
        itemName,
        message: textResult.reason instanceof Error ? textResult.reason.message : String(textResult.reason),
      });
    }

    if (imageResult.status !== 'fulfilled') {
      throw imageResult.reason;
    }

    const dramaText = textResult.status === 'fulfilled' && textResult.value.trim()
      ? textResult.value.trim()
      : buildLocalStickerDramaText(itemName);
    const generated = extractInlineImageData(imageResult.value);
    const stickerImageUrl = generated
      ? await removeSolidBackgroundDataUrl(`data:image/png;base64,${generated}`, 34, 48)
      : originalDataUrl;

    return {
      stickerImageUrl,
      dramaText,
    };
  } catch (error) {
    throw classifyError(error);
  }
}
export async function generateCollectionCoverTask(base64Image: string, itemName: string, hallId: string) {
  try {
    const originalDataUrl = `data:image/jpeg;base64,${base64Image}`;
    let cutoutDataUrl = '';
    let rembgCandidateDataUrl = '';
    let usedFallback = false;
    let provider: 'rembg' | 'gemini' | 'fallback' = 'fallback';

    if (canUseLocalCoverCutout()) {
      cutoutDataUrl = await removeBackgroundWithRembgDataUrl(originalDataUrl);
      if (cutoutDataUrl) {
        const quality = await assessCutoutQualityDataUrl(cutoutDataUrl);
        if (quality.status === 'good') {
          provider = 'rembg';
        } else {
          rembgCandidateDataUrl = cutoutDataUrl;
          cutoutDataUrl = '';
          usedFallback = true;
          serverLogger.info('cover.rembg.low_quality', {
            hallId,
            itemName,
            haloScore: quality.haloScore,
            edgePixelCount: quality.edgePixelCount,
            opaqueCoverage: quality.opaqueCoverage,
          });
        }
      } else {
        usedFallback = true;
      }
    }

    const shouldTryAiCover = !canUseLocalCoverCutout() || ENABLE_COVER_AI_FALLBACK;
    if (!cutoutDataUrl && !AI_MOCK_MODE && !APP_CONFIG.disableLiveAi && shouldTryAiCover) {
      const ai = createAiClient();

      try {
        const imageResponse = await generateContentWithFallback(ai, 'cover-generate', IMAGE_MODEL_CANDIDATES, (model) => ({
          model,
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
        }), {
          attempts: 1,
          timeoutMs: COVER_IMAGE_TIMEOUT_MS,
        });

        const generated = extractInlineImageData(imageResponse);
        if (generated) {
          cutoutDataUrl = await removeSolidBackgroundDataUrl(`data:image/png;base64,${generated}`, 34, 52);
          provider = 'gemini';
        } else {
          usedFallback = true;
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

    if (!cutoutDataUrl && rembgCandidateDataUrl) {
      cutoutDataUrl = rembgCandidateDataUrl;
      provider = 'rembg';
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

export async function preparePerlerSourceTask(base64Image: string, itemName: string) {
  try {
    const originalDataUrl = `data:image/jpeg;base64,${base64Image}`;
    let preparedImageUrl = '';
    let usedFallback = false;
    let provider: 'rembg' | 'gemini' | 'original' = 'original';

    if (canUseLocalCoverCutout()) {
      const cutoutDataUrl = await removeBackgroundWithRembgDataUrl(originalDataUrl);
      if (cutoutDataUrl) {
        preparedImageUrl = await normalizePerlerSourceDataUrl(cutoutDataUrl);
        provider = 'rembg';
      } else {
        usedFallback = true;
      }
    }

    if (!preparedImageUrl && !AI_MOCK_MODE && !APP_CONFIG.disableLiveAi) {
      const ai = createAiClient();

      try {
        const response = await generateContentWithFallback(ai, 'perler-preprocess', IMAGE_MODEL_CANDIDATES, (model) => ({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                text: buildPerlerCutoutPrompt(itemName),
              },
            ],
          },
          config: {
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: '1:1',
            },
          },
        }), {
          attempts: 1,
          timeoutMs: PERLER_IMAGE_TIMEOUT_MS,
        });

        const generated = extractInlineImageData(response);
        if (generated) {
          const aiCutoutDataUrl = await removeSolidBackgroundDataUrl(`data:image/png;base64,${generated}`, 28, 42);
          preparedImageUrl = await normalizePerlerSourceDataUrl(aiCutoutDataUrl);
          provider = 'gemini';
        } else {
          usedFallback = true;
        }
      } catch (error) {
        usedFallback = true;
        serverLogger.warn('perler.foreground.failed', {
          itemName,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!preparedImageUrl) {
      preparedImageUrl = await normalizePerlerSourceDataUrl(originalDataUrl);
      provider = 'original';
      usedFallback = true;
    }

    return {
      preparedImageUrl,
      usedFallback,
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
  stylePreset: EmojiStylePreset = '可爱软萌',
) {
  if (!stickerInputs.length) {
    throw createAnalysisError(
      'IMAGE_QUALITY',
      '缺少贴纸输入',
      '生成表情包至少需要一张来源图片。',
      '请先选择一张或多张来源图片后再试。',
    );
  }

  if (AI_MOCK_MODE) {
    return [{
      imageUrl: `data:${stickerInputs[0].mimeType || 'image/png'};base64,${stickerInputs[0].base64}`,
      text: `emoji-sheet-${Math.max(1, count)}`,
    }];
  }

  try {
    const itemCount = stickerInputs.length;
    const parsedCaptions = await planEmojiCaptions(
      Math.max(1, count),
      userMood,
      stickerInputs.map((item) => item.name),
      stylePreset,
    );
    const ai = createAiClient();
    const { rows, cols } = resolveEmojiGrid(Math.max(1, count));
    const gridDescription = parsedCaptions
      .slice(0, count)
      .map((caption, index) => [
        `Cell ${index + 1}:`,
        `- caption: ${caption.text}`,
        `- emotion: ${caption.emotion}`,
        `- expression: ${caption.expression}`,
        `- pose: ${caption.pose}`,
        `- visual cue: ${caption.visualCue}`,
      ].join('\n'))
      .join('\n');

    const response = await generateContentWithFallback(ai, 'emoji-pack', IMAGE_MODEL_CANDIDATES, (model) => ({
      model,
      contents: {
        parts: [
          ...stickerInputs.map((input) => ({
            inlineData: {
              mimeType: input.mimeType || 'image/png',
              data: input.base64,
            },
          })),
          {
            text: buildEmojiPackPrompt(count, rows, cols, gridDescription, itemCount, stylePreset, userMood),
          },
        ],
      },
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: cols >= rows ? '4:3' : '3:4',
        },
      },
    }), {
      attempts: 1,
      timeoutMs: EMOJI_IMAGE_TIMEOUT_MS,
    });

    const imageData = extractInlineImageData(response);
    if (!imageData) {
      throw new Error('\u672a\u80fd\u4ece \u0041\u0049 \u56fe\u50cf\u751f\u6210\u7ed3\u679c\u4e2d\u53d6\u5230\u56fe\u50cf\u6570\u636e\u3002');
    }

    return [{
      imageUrl: `data:image/png;base64,${imageData}`,
      text: `emoji-sheet-${count}`,
    }];
  } catch (error) {
    throw classifyError(error);
  }
}

async function withAiRetries<T>(feature: AiFeature, task: () => Promise<T>, attempts = 4) {
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

      const baseDelayMs = Math.min(5000, 450 * (2 ** (attempt - 1)));
      const jitterMs = Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
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
    || message.includes('429')
    || message.includes('503')
    || message.includes('502')
    || message.includes('no capacity')
    || message.includes('service unavailable')
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

async function generateLocalStickerDataUrl(dataUrl: string) {
  const cutoutDataUrl = await removeBackgroundWithRembgDataUrl(dataUrl);
  if (!cutoutDataUrl) {
    return '';
  }

  const { buffer } = decodeDataUrl(cutoutDataUrl);
  const canvasSize = 1024;
  const contentSize = 820;
  const fittedBuffer = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .trim({ threshold: 8 })
    .resize(contentSize, contentSize, {
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const fittedMetadata = await sharp(fittedBuffer).metadata();
  const width = fittedMetadata.width || contentSize;
  const height = fittedMetadata.height || contentSize;
  const alphaMask = await sharp(fittedBuffer)
    .extractChannel('alpha')
    .threshold(8)
    .png()
    .toBuffer();
  const outlineAlpha = await sharp(alphaMask)
    .dilate(10)
    .blur(0.9)
    .png()
    .toBuffer();
  const shadowAlpha = await sharp(alphaMask)
    .dilate(12)
    .blur(12)
    .linear(0.28, 0)
    .png()
    .toBuffer();
  const outlineLayer = await alphaMaskToRgba(outlineAlpha, width, height, { r: 255, g: 255, b: 255 });
  const shadowLayer = await alphaMaskToRgba(shadowAlpha, width, height, { r: 0, g: 0, b: 0 });
  const left = Math.max(0, Math.floor((canvasSize - width) / 2));
  const top = Math.max(0, Math.floor((canvasSize - height) / 2) - 10);

  const outputBuffer = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadowLayer, left, top: Math.min(canvasSize - height, top + 18) },
      { input: outlineLayer, left, top },
      { input: fittedBuffer, left, top },
    ])
    .png()
    .toBuffer();

  return `data:image/png;base64,${outputBuffer.toString('base64')}`;
}

async function alphaMaskToRgba(
  alphaMask: Buffer,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .joinChannel(alphaMask)
    .png()
    .toBuffer();
}

function buildLocalStickerDramaText(itemName: string) {
  const variants = [
    `我是${itemName}，今天也想被你好好收藏。`,
    `我是${itemName}，记得带我一起继续出发。`,
    `我是${itemName}，别把我的故事放过。`,
  ];
  return variants[Math.abs(createStableHash(itemName)) % variants.length] || variants[0];
}

async function generateStickerCaptionText(itemName: string) {
  const response = await requestStepfunChatCompletion({
    feature: 'sticker-generate',
    modelCandidates: STEPFUN_TEXT_MODEL_CANDIDATES,
    responseFormat: 'json_object',
    temperature: 0.7,
    maxTokens: 900,
    timeoutMs: STEPFUN_SHORT_TEXT_TIMEOUT_MS,
    attempts: 1,
    userContent: `请为名为“${itemName}”的物品写一句适合贴纸使用的中文短句，并只返回合法 JSON。
要求：
1. 只返回 {"text":"..."} 这一种 JSON 结构，不要加解释。
2. 用第一人称，短、可爱、有情绪。
3. 语气温柔俏皮，不要恐怖、攻击性或过度鸡汤。
4. 控制在 8-18 个中文字符。`,
  });

  const parsed = parseJsonFromModelText<{ text?: string }>(response.text);
  return (parsed.text || '').trim();
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
  return `Create an exact isolated cut-out of the uploaded foreground subjects on a pure black background.

Reference item name: ${itemName}

Requirements:
1. Preserve all major foreground subjects from the original photo faithfully, not just a single object.
2. If the photo includes a person, face, hand, pet, doll, accessory, or any other important foreground subject together with the item, keep them together in the cut-out. Do not delete the person and keep only the item.
3. Preserve the original silhouette, printed text, colors, wear, texture, and camera angle of the whole foreground group.
4. Remove only the background and replace it with pure black (#000000).
5. Keep one complete foreground group with comfortable padding so the full silhouette is visible.
6. Do not beautify, redesign, repaint, relight, stylize, cartoonize, or change the material.
7. Do not add any text, watermark, frame, props, duplicate subject, or background scene.
8. Keep the edges clean and accurate for later compositing.`;
}

function buildPerlerCutoutPrompt(itemName: string) {
  return `Create an accurate isolated reference image of the uploaded object for pixel-art bead conversion.

Object name: ${itemName}

Requirements:
1. Preserve the original object faithfully: same silhouette, printed text, colors, wear, texture, and viewing angle.
2. Remove the background and place the object alone on a pure white background.
3. Keep exactly one complete object, centered, with comfortable empty space around it.
4. Do not stylize, beautify, cartoonize, repaint, relight, or redesign the object.
5. Do not add text, watermark, extra props, extra objects, frame, or scene.
6. Keep the outline clean and readable for later perler pattern conversion.`;
}

function buildEmojiPackPrompt(
  count: number,
  rows: number,
  cols: number,
  gridDescription: string,
  itemCount: number,
  stylePreset: EmojiStylePreset,
  userMood: string,
) {
  const preset = EMOJI_STYLE_PROMPTS[stylePreset];
  const moodLine = userMood.trim() ? `User mood / extra direction: ${userMood.trim()}` : 'User mood / extra direction: not provided';

  return `Create a ${rows}x${cols} emoji sticker grid with ${count} cute chat stickers.

Reference images: ${itemCount}
Theme preset: ${stylePreset} (${preset.title})
${moodLine}
Grid requirements:
1. Every cell contains a separate readable sticker character suitable for chat use.
2. Keep the original source recognizable.
3. If a reference image includes both a person and an item, or a hand and an item, preserve those main foreground subjects together instead of deleting the person and keeping only the object.
4. Add a thick white die-cut outline around each sticker.
5. Use a white or warm light background with visible gaps between stickers.
6. Use the exact caption text assigned to each cell below. Do not rewrite, merge, paraphrase, or replace captions.
7. All captions inside the generated emoji sheet must be Simplified Chinese only.
8. Do not use English words, pinyin, English interjections, mixed Chinese-English text, or Roman letters in captions.
9. The visual language must look unmistakably like ${preset.title}. Do not collapse back into a generic cute sticker sheet.
10. ${preset.visual}
11. ${preset.caption}
12. Translate the user's mood directly into face, pose, body language, and caption semantics. If the mood sounds tired, annoyed, anxious, or low-energy, do not make the entire sheet uniformly cheerful.
13. Make the cells meaningfully different from one another in expression, gesture, crop rhythm, and acting beat.
14. Different style presets must produce clearly different palette, texture, line quality, and presentation, not just minor color shifts.
15. Keep the final sheet readable at mobile chat sticker size. Do not let style details overpower the face, silhouette, or captions.

Cell details:
${gridDescription}`;
}

async function planEmojiCaptions(
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
) {
  if (!APP_CONFIG.useAiEmojiCaptions) {
    return normalizeEmojiCaptionPlanEntries([], count, userMood, itemNames, stylePreset);
  }

  try {
    const planned = await requestAiEmojiCaptionPlan(count, userMood, itemNames, stylePreset);
    return normalizeEmojiCaptionPlanEntries(planned, count, userMood, itemNames, stylePreset);
  } catch (error) {
    serverLogger.warn('emoji.caption_plan.fallback', {
      stylePreset,
      userMood,
      count,
      message: error instanceof Error ? error.message : String(error),
    });
    return normalizeEmojiCaptionPlanEntries([], count, userMood, itemNames, stylePreset);
  }
}

async function requestAiEmojiCaptionPlan(
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
) {
  const response = await requestStepfunChatCompletion({
    feature: 'emoji-pack',
    modelCandidates: STEPFUN_TEXT_MODEL_CANDIDATES,
    responseFormat: 'json_object',
    temperature: 0.7,
    maxTokens: 1800,
    timeoutMs: STEPFUN_SHORT_TEXT_TIMEOUT_MS,
    attempts: 1,
    userContent: buildEmojiCaptionPlanningPrompt(count, userMood, itemNames, stylePreset),
  });

  const parsed = parseJsonFromModelText<{ entries?: Array<Partial<EmojiCaptionPlanEntry>> }>(response.text);
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error('\u0041\u0049 \u672a\u8fd4\u56de\u53ef\u7528\u7684\u8868\u60c5\u5305\u6587\u6848\u89c4\u5212\u3002');
  }

  return parsed.entries;
}


const STYLE_PLAYFUL = '\u6709\u6897\u6709\u8da3';
const STYLE_CUTE = '\u53ef\u7231\u8f6f\u840c';
const STYLE_HEALING = '\u6cbb\u6108\u624b\u7ed8';
const STYLE_ORIENTAL = '\u56fd\u6f6e\u4e2d\u5f0f';
const STYLE_RETRO = '\u590d\u53e4\u6d82\u9e26';
const STYLE_OIL = '\u827a\u672f\u6cb9\u753b';

const EMOTION_HAPPY = '\u5f00\u5fc3';
const EMOTION_CUTE = '\u8f6f\u840c';
const EMOTION_COMFORT = '\u5b89\u6170';
const EMOTION_CALM = '\u6de1\u5b9a';
const EMOTION_SLEEPY = '\u72af\u56f0';
const EMOTION_SASSY = '\u5410\u69fd';

function buildEmojiCaptionPlanningPrompt(
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
) {
  const preset = EMOJI_STYLE_PROMPTS[stylePreset] || EMOJI_STYLE_PROMPTS[STYLE_CUTE];
  const itemLine = itemNames.filter(Boolean).join('\u3001') || '\u672a\u547d\u540d\u85cf\u54c1';
  const moodLine = userMood.trim() || '\u672a\u63d0\u4f9b\u989d\u5916\u60c5\u7eea\u63cf\u8ff0\uff0c\u8bf7\u6839\u636e\u85cf\u54c1\u672c\u8eab\u8054\u60f3';

  return `\u4f60\u662f Re-Museum \u7684\u8868\u60c5\u5305\u6587\u6848\u7b56\u5212\u52a9\u624b\u3002\u8bf7\u56f4\u7ed5\u85cf\u54c1\u6765\u6e90\u3001\u7528\u6237\u5fc3\u60c5\u548c\u98ce\u683c\u8981\u6c42\uff0c\u8f93\u51fa\u4e00\u7ec4\u53ef\u76f4\u63a5\u7528\u4e8e\u8868\u60c5\u5305\u751f\u6210\u7684 JSON \u5bf9\u8c61\u3002
\u85cf\u54c1\u6765\u6e90\uff1a${itemLine}
\u7528\u6237\u5fc3\u60c5\uff1a${moodLine}
\u98ce\u683c\u9884\u8bbe\uff1a${stylePreset}\uff08${preset.title}\uff09
\u89c6\u89c9\u8981\u6c42\uff1a${preset.visual}
\u6587\u6848\u53e3\u5f84\uff1a${preset.caption}

\u8f93\u51fa\u8981\u6c42\uff1a
1. \u53ea\u8fd4\u56de\u4e00\u4e2a JSON \u5bf9\u8c61\uff0c\u5bf9\u8c61\u5fc5\u987b\u662f { "entries": [...] } \u8fd9\u4e2a\u7ed3\u6784\u3002
2. entries \u91cc\u9762\u653e ${count} \u6761 JSON \u5bf9\u8c61\u3002
3. \u6bcf\u6761\u5bf9\u8c61\u90fd\u5fc5\u987b\u5305\u542b text\u3001emotion\u3001expression\u3001pose\u3001visualCue \u4e94\u4e2a\u5b57\u6bb5\u3002
4. text \u5fc5\u987b\u662f 2-6 \u4e2a\u4e2d\u6587\u5b57\u7b26\uff0c\u9002\u5408\u804a\u5929\u53d1\u9001\uff0c\u907f\u514d\u7a7a\u6cdb\u9e21\u6c64\u548c\u6d41\u6c34\u7ebf\u53e3\u53f7\u3002
5. \u6587\u6848\u8981\u548c\u7528\u6237\u5fc3\u60c5\u76f4\u63a5\u76f8\u5173\uff0c\u4e5f\u8981\u80fd\u4f53\u73b0\u85cf\u54c1\u4e3b\u9898\uff0c\u4e0d\u8981\u53ea\u662f\u91cd\u590d\u201c\u597d\u53ef\u7231\u201d\u201c\u8d34\u8d34\u201d\u3002
6. \u4e0d\u540c\u6761\u76ee\u4e4b\u95f4\u8981\u6709\u660e\u786e\u533a\u5206\uff0c\u8bed\u6c14\u3001\u52a8\u4f5c\u3001\u8868\u60c5\u3001\u6784\u56fe\u63d0\u793a\u4e0d\u80fd\u9ad8\u5ea6\u91cd\u590d\u3002
7. expression\u3001pose\u3001visualCue \u7528\u7b80\u77ed\u4e2d\u6587\u77ed\u8bed\u63cf\u8ff0\uff0c\u4fbf\u4e8e\u56fe\u50cf\u6a21\u578b\u7406\u89e3\u3002
8. \u4e0d\u8981\u8f93\u51fa\u82f1\u6587\u6587\u6848\uff0c\u4e0d\u8981\u5e26\u5e8f\u53f7\uff0c\u4e0d\u8981\u5e26\u89e3\u91ca\u3002
9. \u7981\u6b62\u4f7f\u7528\u8fd9\u4e9b\u6587\u6848\uff1a${EMOJI_CAPTION_BLACKLIST.join('\u3001')}\u3002
10. \u53ea\u8f93\u51fa\u5408\u6cd5 JSON\uff0c\u4e0d\u8981\u6dfb\u52a0\u4ee3\u7801\u5757\u3002`;
}

function normalizeEmojiCaptionPlanEntries(
  entries: Array<Partial<EmojiCaptionPlanEntry>>,
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
) {
  const normalized: EmojiCaptionPlanEntry[] = [];
  const usedTexts = new Set<string>();

  for (const entry of entries) {
    const text = sanitizeEmojiCaptionText(entry.text);
    if (!text || usedTexts.has(text)) {
      continue;
    }

    usedTexts.add(text);
    const emotion = normalizeEmojiEmotion(entry.emotion, userMood);
    const visualSeed = createEmojiVisualSeed(stylePreset, emotion, normalized.length);
    normalized.push({
      text,
      emotion,
      expression: sanitizeEmojiInstructionField(entry.expression, visualSeed.expression),
      pose: sanitizeEmojiInstructionField(entry.pose, visualSeed.pose),
      visualCue: sanitizeEmojiInstructionField(entry.visualCue, visualSeed.visualCue),
    });

    if (normalized.length >= count) {
      return normalized.slice(0, count);
    }
  }

  const fallbackEntries = toLocalEmojiCaptionPlanEntries(count * 2, userMood, itemNames, stylePreset, usedTexts);
  for (const entry of fallbackEntries) {
    if (usedTexts.has(entry.text)) {
      continue;
    }
    usedTexts.add(entry.text);
    normalized.push(entry);
    if (normalized.length >= count) {
      break;
    }
  }

  return normalized.slice(0, count);
}

function toLocalEmojiCaptionPlanEntries(
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
  usedTexts: ReadonlySet<string>,
) {
  const fallbackPlan = buildEmojiCaptionPlan(count, userMood, itemNames, stylePreset);
  return fallbackPlan
    .map((entry, index) => {
      const text = sanitizeEmojiCaptionText(entry.text);
      if (!text || usedTexts.has(text)) {
        return null;
      }

      const emotion = normalizeEmojiEmotion(entry.emotion, userMood);
      const visualSeed = createEmojiVisualSeed(stylePreset, emotion, index);
      return {
        text,
        emotion,
        expression: visualSeed.expression,
        pose: visualSeed.pose,
        visualCue: visualSeed.visualCue,
      } satisfies EmojiCaptionPlanEntry;
    })
    .filter((entry): entry is EmojiCaptionPlanEntry => Boolean(entry));
}

function sanitizeEmojiCaptionText(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value
    .trim()
    .replace(/["'\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[\u3001\uff0c\u3002\uff01\uff1f\uff1b\uff1a,.!?;:\s]/g, '');

  if (!normalized || /[A-Za-z]/.test(normalized)) {
    return '';
  }

  if (EMOJI_CAPTION_BLACKLIST.includes(normalized)) {
    return '';
  }

  const length = Array.from(normalized).length;
  return length >= 2 && length <= 6 ? normalized : '';
}

function sanitizeEmojiInstructionField(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/["'\u2018\u2019\u201c\u201d]/g, '').replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 24) : fallback;
}

function normalizeEmojiEmotion(value: unknown, userMood: string) {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const mapped = EMOJI_EMOTION_ALIASES[trimmed.toLowerCase()] || EMOJI_EMOTION_ALIASES[trimmed];
    if (mapped) {
      return mapped;
    }

    if (!/[A-Za-z]/.test(trimmed)) {
      return trimmed.slice(0, 6);
    }
  }

  return orderEmojiCaptionPools(userMood)[0]?.emotion || EMOTION_HAPPY;
}

function createEmojiVisualSeed(
  stylePreset: EmojiStylePreset,
  emotion: string,
  index: number,
) {
  const emotionVisual = EMOJI_EMOTION_VISUALS[emotion] || EMOJI_EMOTION_VISUALS[EMOTION_HAPPY];
  const styleCues = EMOJI_STYLE_VISUAL_CUES[stylePreset] || EMOJI_STYLE_VISUAL_CUES[STYLE_CUTE];

  return {
    expression: emotionVisual.expressions[index % emotionVisual.expressions.length] || emotionVisual.expressions[0],
    pose: emotionVisual.poses[index % emotionVisual.poses.length] || emotionVisual.poses[0],
    visualCue: styleCues[index % styleCues.length] || styleCues[0],
  };
}

function buildTransformationGuidePrompt(
  items: Array<{ name: string; material?: string; category?: string }>,
  concept: string,
) {
  const itemText = items
    .map((item) => `${item.name}${item.material ? `\uff08${item.material}\uff09` : ''}`)
    .join('\u3001');

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

function buildEmojiCaptionPlan(
  count: number,
  userMood: string,
  itemNames: string[],
  stylePreset: EmojiStylePreset,
) {
  const moodKeywords = `${extractEmojiMoodKeywords(userMood).join(' ')} ${(userMood || '').trim()}`.trim();
  const normalizedMood = `${EMOJI_STYLE_CAPTION_HINTS[stylePreset]} ${moodKeywords}`.trim();
  const pools = orderEmojiCaptionPools(normalizedMood);
  const captions: Array<{ text: string; emotion: string }> = [];
  const used = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const pool = pools[index % pools.length] || EMOJI_CAPTION_POOLS[0];
    const nextText = pool.texts.find((text) => !used.has(text)) || `${pickEmojiFallbackPrefix(itemNames)}${index + 1}`;
    used.add(nextText);
    captions.push({
      text: nextText,
      emotion: pool.emotion,
    });
  }

  return captions;
}

function extractEmojiMoodKeywords(userMood: string) {
  const normalized = (userMood || '').trim().toLowerCase();
  const keywords: string[] = [];

  const push = (value: string) => {
    if (!keywords.includes(value)) {
      keywords.push(value);
    }
  };

  if (!normalized) {
    return keywords;
  }

  if (/(\u56f0|\u7d2f|\u75b2\u60eb|\u6ca1\u7535|\u4e0d\u60f3\u52a8|\u6446\u70c2|\u71ac\u591c|\u60f3\u8eba|\u65e0\u529b|\u597d\u56f0|\u597d\u7d2f|\u75b2\u52b3)/.test(normalized)) {
    push('\u56f0');
    push('\u7d2f');
  }
  if (/(\u6012|\u6c14|\u607c\u706b|\u65e0\u8bed|\u79bb\u8c31|\u5d29\u6e83|\u70b8\u4e86|\u5410\u69fd|\u4e0d\u723d|\u706b\u5927)/.test(normalized)) {
    push(EMOTION_SASSY);
    push('\u65e0\u8bed');
  }
  if (/(\u96be\u8fc7|\u59d4\u5c48|\u4f24\u5fc3|\u4f4e\u843d|emo|\u60f3\u54ed|\u6ca1\u72b6\u6001|\u7126\u8651|\u7d27\u5f20|\u538b\u529b)/.test(normalized)) {
    push(EMOTION_COMFORT);
    push('\u96be\u8fc7');
  }
  if (/(\u5f00\u5fc3|\u9ad8\u5174|\u5174\u594b|\u6fc0\u52a8|\u5e86\u795d|\u8036|\u54c8\u54c8|\u723d|\u987a\u5229|\u62ff\u4e0b)/.test(normalized)) {
    push(EMOTION_HAPPY);
    push('\u9ad8\u5174');
  }
  if (/(\u6de1\u5b9a|\u7a33\u4f4f|\u9760\u8c31|\u51b7\u9759|ok|\u6ca1\u95ee\u9898|\u5b89\u6392|\u653e\u5fc3|\u7a33\u4e86)/.test(normalized)) {
    push(EMOTION_CALM);
    push('\u7a33');
  }
  if (/(\u53ef\u7231|\u840c|\u6492\u5a07|\u8d34\u8d34|\u62b1\u62b1|\u8f6f\u4e4e\u4e4e|\u6cbb\u6108|\u6e29\u67d4)/.test(normalized)) {
    push(EMOTION_CUTE);
    push('\u8d34\u8d34');
  }

  return keywords;
}

function orderEmojiCaptionPools(userMood: string) {
  const normalized = userMood.toLowerCase();
  const scored = EMOJI_CAPTION_POOLS.map((pool) => ({
    ...pool,
    score: pool.keywords.reduce((total, keyword) => (
      normalized.includes(keyword) ? total + 1 : total
    ), 0),
  })).sort((left, right) => right.score - left.score);

  return scored.length > 0 ? scored : EMOJI_CAPTION_POOLS;
}

const EMOJI_STYLE_CAPTION_HINTS: Record<EmojiStylePreset, string> = {
  [STYLE_PLAYFUL]: 'happy sassy playful meme witty',
  [STYLE_CUTE]: 'cute soft sweet comfort gentle',
  [STYLE_HEALING]: 'comfort gentle calm cute cozy',
  [STYLE_ORIENTAL]: 'cool confident happy elegant',
  [STYLE_RETRO]: 'sassy cool playful bold',
  [STYLE_OIL]: 'calm elegant comfort gentle',
};

const EMOJI_STYLE_PROMPTS: Record<EmojiStylePreset, { title: string; visual: string; caption: string }> = {
  [STYLE_PLAYFUL]: {
    title: 'meme-ready humorous reactions',
    visual: 'Use lively reaction faces, playful pose exaggeration, strong readability, bright contrast, and chat-friendly comic energy.',
    caption: 'Captions should feel witty, punchy, playful, and instantly usable in chat.',
  },
  [STYLE_CUTE]: {
    title: 'cute soft plush style',
    visual: 'Use rounded silhouettes, soft pastel accents, plush-like cuteness, warm blush details, and gentle friendly expressions.',
    caption: 'Captions should feel sweet, soft, affectionate, and easy to send to friends.',
  },
  [STYLE_HEALING]: {
    title: 'healing hand-drawn illustration',
    visual: 'Use cozy hand-drawn lines, watercolor or colored-pencil texture, soft edges, and warm handmade charm.',
    caption: 'Captions should feel comforting, soothing, and emotionally warm.',
  },
  [STYLE_ORIENTAL]: {
    title: 'modern Chinese chic',
    visual: 'Use selective Chinese-inspired color accents, clean ink-like rhythm, elegant composition, and restrained cultural motifs without clutter.',
    caption: 'Captions should feel spirited and stylish while still simple and chat-ready.',
  },
  [STYLE_RETRO]: {
    title: 'retro graffiti pop',
    visual: 'Use bold doodle outlines, sticker-like pop colors, retro poster energy, halftone or marker texture, and mischievous fun.',
    caption: 'Captions should feel cheeky, expressive, and street-playful.',
  },
  [STYLE_OIL]: {
    title: 'artful oil painting',
    visual: 'Use painterly brush texture, rich color blending, and museum-like artistic polish, but keep faces, silhouettes, and captions crisp at small size.',
    caption: 'Captions should feel poetic and refined while staying short and readable.',
  },
};

const EMOJI_CAPTION_BLACKLIST = [
  '\u54c8\u54c8',
  '\u5475\u5475',
  '\u597d\u7684',
  '\u6536\u5230',
  '\u5728\u5417',
  '\u6765\u4e86',
  '\u53ef\u7231',
  '\u8d34\u8d34',
  '\u62b1\u62b1',
  '\u65e0\u8bed',
  '\u6551\u547d',
];

const EMOJI_EMOTION_ALIASES: Record<string, string> = {
  happy: EMOTION_HAPPY,
  playful: EMOTION_HAPPY,
  meme: EMOTION_SASSY,
  cute: EMOTION_CUTE,
  soft: EMOTION_CUTE,
  comfort: EMOTION_COMFORT,
  supportive: EMOTION_COMFORT,
  support: EMOTION_COMFORT,
  calm: EMOTION_CALM,
  cool: EMOTION_CALM,
  lazy: EMOTION_SLEEPY,
  sleepy: EMOTION_SLEEPY,
  tired: EMOTION_SLEEPY,
  sassy: EMOTION_SASSY,
  roast: EMOTION_SASSY,
  [EMOTION_HAPPY]: EMOTION_HAPPY,
  '\u9ad8\u5174': EMOTION_HAPPY,
  [EMOTION_CUTE]: EMOTION_CUTE,
  [EMOTION_COMFORT]: EMOTION_COMFORT,
  [EMOTION_CALM]: EMOTION_CALM,
  [EMOTION_SLEEPY]: EMOTION_SLEEPY,
  [EMOTION_SASSY]: EMOTION_SASSY,
};

const EMOJI_EMOTION_VISUALS: Record<string, { expressions: string[]; poses: string[] }> = {
  [EMOTION_HAPPY]: {
    expressions: ['\u5927\u7b11\u772f\u773c', '\u773c\u775b\u53d1\u4eae', '\u5f00\u5fc3\u54a7\u5634\u7b11', '\u5174\u594b\u626c\u7709'],
    poses: ['\u4e3e\u624b\u5e86\u795d', '\u53cc\u624b\u6bd4\u8036', '\u539f\u5730\u8e66\u4e00\u4e0b', '\u5411\u524d\u51b2\u7684\u59ff\u52bf'],
  },
  [EMOTION_CUTE]: {
    expressions: ['\u5706\u773c\u671f\u5f85', '\u8138\u988a\u5fae\u7ea2', '\u8f6f\u4e4e\u4e4e\u50bb\u7b11', '\u59d4\u5c48\u5df4\u5df4'],
    poses: ['\u53cc\u624b\u62b1\u8138', '\u8f7b\u8f7b\u6b6a\u5934', '\u5c0f\u6b65\u8d34\u8fd1', '\u6367\u5fc3\u7ad9\u59ff'],
  },
  [EMOTION_COMFORT]: {
    expressions: ['\u6e29\u67d4\u6ce8\u89c6', '\u8f7b\u58f0\u5b89\u629a', '\u8ba4\u771f\u966a\u4f34', '\u6696\u6696\u5fae\u7b11'],
    poses: ['\u5f20\u5f00\u53cc\u81c2', '\u9012\u51fa\u7eb8\u5dfe', '\u62cd\u62cd\u80a9\u8180', '\u5b89\u9759\u966a\u5750'],
  },
  [EMOTION_CALM]: {
    expressions: ['\u5e73\u9759\u6311\u7709', '\u8f7b\u677e\u7b03\u5b9a', '\u81ea\u4fe1\u5fae\u7b11', '\u7a33\u7a33\u770b\u5411\u524d\u65b9'],
    poses: ['\u5355\u624b\u53c9\u8170', '\u53cc\u624b\u62b1\u81c2', '\u70b9\u5934\u786e\u8ba4', '\u6de1\u5b9a\u7ad9\u5b9a'],
  },
  [EMOTION_SLEEPY]: {
    expressions: ['\u56f0\u5230\u7741\u4e0d\u5f00\u773c', '\u6253\u54c8\u6b20', '\u8ff7\u7cca\u653e\u7a7a', '\u773c\u76ae\u4e0b\u5782'],
    poses: ['\u62b1\u6795\u53d1\u5446', '\u6162\u6162\u5750\u4e0b', '\u8737\u7740\u4f11\u606f', '\u4e3e\u724c\u8bf4\u665a\u5b89'],
  },
  [EMOTION_SASSY]: {
    expressions: ['\u5acc\u5f03\u6311\u7709', '\u65e0\u8bed\u51dd\u89c6', '\u5634\u89d2\u4e00\u6487', '\u7ffb\u767d\u773c\u5fcd\u4f4f\u4e86'],
    poses: ['\u53cc\u624b\u644a\u5f00', '\u53c9\u8170\u5410\u69fd', '\u4fa7\u8eab\u51b7\u770b', '\u624b\u6307\u70b9\u70b9\u4f60'],
  },
};

const EMOJI_STYLE_VISUAL_CUES: Record<EmojiStylePreset, string[]> = {
  [STYLE_PLAYFUL]: ['\u5938\u5f20\u53cd\u5e94\u7ebf', '\u9ad8\u5bf9\u6bd4\u6f2b\u753b\u611f', '\u804a\u5929\u6897\u56fe\u8282\u594f', '\u6545\u610f\u8c03\u76ae\u7684\u5c0f\u52a8\u4f5c'],
  [STYLE_CUTE]: ['\u5976\u4e4e\u4e4e\u914d\u8272', '\u5706\u6da6\u8f6e\u5ed3', '\u6bdb\u7ed2\u73a9\u5076\u611f', '\u8f7b\u5fae\u8153\u7ea2\u9ad8\u5149'],
  [STYLE_HEALING]: ['\u624b\u7ed8\u7b14\u89e6', '\u67d4\u548c\u7eb8\u611f\u7eb9\u7406', '\u6696\u8272\u5149\u6655', '\u8f7b\u6c34\u5f69\u6655\u67d3'],
  [STYLE_ORIENTAL]: ['\u96c5\u81f4\u4e1c\u65b9\u914d\u8272', '\u7559\u767d\u6784\u56fe', '\u7ec6\u8282\u7eb9\u6837\u70b9\u7f00', '\u514b\u5236\u7684\u56fd\u98ce\u88c5\u9970'],
  [STYLE_RETRO]: ['\u7c97\u7ebf\u6761\u6d82\u9e26\u8fb9', '\u8d34\u7eb8\u55b7\u6f06\u611f', '\u65e7\u6d77\u62a5\u914d\u8272', '\u8857\u5934\u8da3\u5473\u7b26\u53f7'],
  [STYLE_OIL]: ['\u539a\u6d82\u7b14\u89e6', '\u535a\u7269\u9986\u9648\u5217\u611f', '\u7ec6\u817b\u51b7\u6696\u8fc7\u6e21', '\u827a\u672f\u753b\u6846\u6c1b\u56f4'],
};

function pickEmojiFallbackPrefix(itemNames: string[]) {
  const firstName = (itemNames[0] || '').trim();
  if (!firstName) {
    return '\u8d34\u8d34';
  }

  return firstName.length <= 2 ? firstName : firstName.slice(0, 2);
}

const EMOJI_CAPTION_POOLS = [
  {
    emotion: EMOTION_HAPPY,
    keywords: ['happy', 'joy', 'laugh', 'haha', 'cheerful', 'excited', '\u5f00\u5fc3', '\u9ad8\u5174', '\u54c8\u54c8', '\u8036'],
    texts: ['\u592a\u597d\u5566', '\u7a33\u7a33\u62ff\u4e0b', '\u6536\u5230\u4e86', '\u51b2\u5440', '\u597d\u8036', '\u8d77\u98de\u54af'],
  },
  {
    emotion: EMOTION_CUTE,
    keywords: ['cute', 'soft', 'sweet', 'adorable', 'gentle', '\u53ef\u7231', '\u8f6f\u840c', '\u8d34\u8d34'],
    texts: ['\u62b1\u62b1\u6211', '\u8f6f\u4e4e\u4e4e', '\u8ba9\u6211\u6765', '\u8d34\u4f60\u4e00\u4e0b', '\u53ef\u7231\u5230\u4f4d', '\u6765\u8d34\u8d34\u5440'],
  },
  {
    emotion: EMOTION_SLEEPY,
    keywords: ['lazy', 'sleepy', 'tired', 'slow', 'nap', 'rest', '\u56f0', '\u7d2f', '\u8eba\u5e73', '\u4f11\u606f'],
    texts: ['\u6211\u5148\u6b47\u4f1a', '\u56f0\u56f0\u4e86', '\u60f3\u8eba\u4e00\u4e0b', '\u7f13\u4e00\u7f13\u5148', '\u8ba9\u6211\u772f\u4f1a', '\u4eca\u5929\u5148\u8fd9\u6837'],
  },
  {
    emotion: EMOTION_SASSY,
    keywords: ['sassy', 'roast', 'tease', 'eye-roll', 'annoyed', '\u5410\u69fd', '\u65e0\u8bed', '\u79bb\u8c31'],
    texts: ['\u4f60\u8ba4\u771f\u7684', '\u53c8\u6765\u8fd9\u5957', '\u522b\u95f9\u4e86\u5427', '\u6211\u670d\u4e86\u5440', '\u771f\u6709\u4f60\u7684', '\u79bb\u8c31\u4f4f\u4e86'],
  },
  {
    emotion: EMOTION_CALM,
    keywords: ['cool', 'calm', 'steady', 'confident', 'smooth', '\u6de1\u5b9a', '\u7a33', '\u81ea\u4fe1'],
    texts: ['\u4ea4\u7ed9\u6211\u5427', '\u95ee\u9898\u4e0d\u5927', '\u90fd\u5b89\u6392\u4e86', '\u7a33\u7a33\u7684', '\u5c0f\u610f\u601d\u5566', '\u653e\u5fc3\u5c31\u597d'],
  },
  {
    emotion: EMOTION_COMFORT,
    keywords: ['comfort', 'cheer', 'sad', 'anxious', 'support', 'gentle', '\u5b89\u6170', '\u96be\u8fc7', '\u6cbb\u6108'],
    texts: ['\u6211\u5728\u5462', '\u6ca1\u4e8b\u7684\u5440', '\u6162\u6162\u6765\u54e6', '\u62b1\u62b1\u4f60\u5440', '\u4f60\u53ef\u4ee5\u7684', '\u5148\u6df1\u547c\u5438'],
  },
];
async function normalizePerlerSourceDataUrl(dataUrl: string) {
  const { buffer } = decodeImageDataUrl(dataUrl);
  const contentSize = 640;
  const canvasSize = 768;

  const fittedBuffer = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .trim({ threshold: 8 })
    .resize(contentSize, contentSize, {
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const outputBuffer = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fittedBuffer, gravity: 'center' }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${outputBuffer.toString('base64')}`;
}

function decodeImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error('\u9884\u5904\u7406\u56fe\u50cf\u8f93\u5165\u65e0\u6548\u3002');
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
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

  if (
    normalized.includes('insufficient_user_quota')
    || normalized.includes('quota exceeded')
    || normalized.includes('quota')
    || normalized.includes('额度')
    || normalized.includes('配额')
  ) {
    return createAnalysisError(
      'QUOTA_EXCEEDED',
      'AI 配额不足',
      '当前 AI 上游账户额度不足，暂时无法继续生成。',
      '请联系管理员充值/更换上游密钥后重试。',
    );
  }

  if (normalized.includes('429') || normalized.includes('rate limit') || normalized.includes('too many ai requests')) {
    return createAnalysisError(
      'RATE_LIMIT',
      'AI 服务繁忙',
      '当前 AI 请求过多，服务正在限流。',
      '请等待片刻后重试。',
    );
  }

  if (normalized.includes('safety') || normalized.includes('blocked') || normalized.includes('prohibited')) {
    return createAnalysisError(
      'SAFETY',
      '内容受限',
      '当前请求触发了 AI 安全限制，无法继续生成。',
      '请调整输入内容或更换图片后重试。',
    );
  }

  if (
    normalized.includes('parse')
    || normalized.includes('json')
    || normalized.includes('unexpected')
    || normalized.includes('未返回可用文本内容')
    || normalized.includes('未返回可用的流式文本内容')
  ) {
    return createAnalysisError(
      'PARSE_ERROR',
      'AI 结果异常',
      'AI 返回内容无法正确解析。',
      '请重试一次；若仍失败，建议切换输入内容后再试。',
    );
  }

  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('timeout') || normalized.includes('econn')) {
    return createAnalysisError(
      'NETWORK',
      '网络异常',
      'AI 服务连接失败或响应超时。',
      '请检查网络后重试。',
    );
  }

  if (normalized.includes('image') || normalized.includes('photo') || normalized.includes('empty')) {
    return createAnalysisError(
      'IMAGE_QUALITY',
      '图片质量不足',
      '上传图片不够清晰，或主体信息不足，无法稳定识别。',
      '请更换更清晰的图片，确保主体完整且背景不过于杂乱。',
    );
  }

  return createAnalysisError(
    'UNKNOWN',
    '处理失败',
    message || '发生未知异常。',
    '请稍后重试；如果问题持续存在，请联系管理员排查。',
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
    throw new Error('\u56fe\u50cf Data URL \u683c\u5f0f\u65e0\u6548\u3002');
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2], 'base64'),
  };
}







