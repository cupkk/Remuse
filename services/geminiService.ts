
import { GoogleGenAI, Type } from "@google/genai";
import { ItemCategory, Difficulty, RemuseIdea } from "../types";
import logger from './logger';
import { compressImageFile } from './imageUtils';
import { getAccessToken } from './apiClient';
import { getMe, loginAsGuest } from './authService';

// ============================================================
// API Key 安全策略：
//   Key 不再注入前端包，真实 Key 由服务端代理注入。
//   客户端使用占位符 'PROXIED'，SDK 仍需要一个非空值。
//   所有请求经由代理端点（开发: Vite proxy / 生产: 自建后端）。
// ============================================================
function resolveProxyUrl(): string {
  const configured = (typeof process !== 'undefined' && process.env?.GEMINI_PROXY_URL) || '/api/gemini';

  if (/^https?:\/\//i.test(configured)) {
    return configured;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const normalizedPath = configured.startsWith('/') ? configured : `/${configured}`;
    return `${window.location.origin}${normalizedPath}`;
  }

  return configured;
}

const proxyUrl = resolveProxyUrl();
const GEMINI_TEXT_MODEL = 'gemini-3-pro-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

let bootstrapGuestPromise: Promise<string | null> | null = null;

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

async function ensureGeminiAuthToken(): Promise<string | null> {
  let token = getAccessToken();

  if (token && !isJwtExpired(token)) {
    return token;
  }

  // 触发一次 /api/auth/me，利用 apiFetch 的自动 refresh 逻辑续期 access token
  try {
    await getMe();
    token = getAccessToken();
    if (token) return token;
  } catch {
    // ignore and fallback to guest bootstrap
  }

  if (!bootstrapGuestPromise) {
    bootstrapGuestPromise = (async () => {
      try {
        const { accessToken } = await loginAsGuest();
        return accessToken;
      } catch {
        return null;
      } finally {
        bootstrapGuestPromise = null;
      }
    })();
  }

  return bootstrapGuestPromise;
}

async function geminiGenerateContent(request: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
  const token = await ensureGeminiAuthToken();
  const ai = new GoogleGenAI({
    apiKey: 'PROXIED',
    httpOptions: {
      baseUrl: proxyUrl,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  });
  return ai.models.generateContent(request);
}

// ============================================================
// 结构化错误系统：让用户能自助排查问题
// ============================================================

export type ErrorCategory =
  | 'NETWORK'        // 网络连接问题
  | 'IMAGE_QUALITY'  // 图片质量 / 内容问题
  | 'RATE_LIMIT'     // API 频率限制 / 额度不足
  | 'SAFETY'         // 内容安全过滤
  | 'PARSE_ERROR'    // AI 返回结果解析失败
  | 'UNKNOWN';       // 未知错误

export interface AnalysisError {
  category: ErrorCategory;
  title: string;
  message: string;
  suggestion: string;
}

/**
 * 将原始错误分类为用户友好的结构化错误
 */
function classifyError(error: unknown): AnalysisError {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStr = errMsg.toLowerCase();

  // 网络相关
  if (
    errStr.includes('fetch') ||
    errStr.includes('network') ||
    errStr.includes('failed to fetch') ||
    errStr.includes('networkerror') ||
    errStr.includes('timeout') ||
    errStr.includes('aborted') ||
    errStr.includes('econnrefused') ||
    errStr.includes('enotfound') ||
    errStr.includes('err_connection') ||
    errStr.includes('cors')
  ) {
    return {
      category: 'NETWORK',
      title: '网络连接失败',
      message: '无法连接到 AI 分析服务。',
      suggestion: '请检查网络连接后重试。如使用 VPN，尝试切换节点。',
    };
  }

  // API 频率限制 / 额度
  if (
    errStr.includes('429') ||
    errStr.includes('rate limit') ||
    errStr.includes('quota') ||
    errStr.includes('resource exhausted') ||
    errStr.includes('too many requests')
  ) {
    return {
      category: 'RATE_LIMIT',
      title: 'AI 服务繁忙',
      message: '当前请求过于频繁或 API 额度不足。',
      suggestion: '请等待 30 秒后重试，或联系管理员检查 API 额度。',
    };
  }

  // 内容安全过滤
  if (
    errStr.includes('safety') ||
    errStr.includes('blocked') ||
    errStr.includes('harm') ||
    errStr.includes('prohibited') ||
    errStr.includes('content filter')
  ) {
    return {
      category: 'SAFETY',
      title: '图片内容受限',
      message: 'AI 安全系统认为该图片内容不适合分析。',
      suggestion: '请确保图片中只有待回收的物品，避免包含人物或敏感内容。',
    };
  }

  // 认证 / API Key
  if (
    errStr.includes('401') ||
    errStr.includes('403') ||
    errStr.includes('unauthorized') ||
    errStr.includes('forbidden') ||
    errStr.includes('api key') ||
    errStr.includes('permission')
  ) {
    return {
      category: 'NETWORK',
      title: 'API 认证失败',
      message: 'API 密钥无效或已过期。',
      suggestion: '请联系管理员更新 API 密钥配置。',
    };
  }

  // 图片无法识别（AI 返回空/无效结果）
  if (
    errStr.includes('no response') ||
    errStr.includes('empty') ||
    errStr.includes('could not') ||
    errStr.includes('unable to')
  ) {
    return {
      category: 'IMAGE_QUALITY',
      title: '图片识别困难',
      message: 'AI 未能从图片中识别出物品信息。',
      suggestion: '试试：1) 确保物品在画面中清晰居中 2) 保持背景简洁 3) 光线充足 4) 避免过度模糊',
    };
  }

  // JSON 解析失败
  if (
    errStr.includes('json') ||
    errStr.includes('parse') ||
    errStr.includes('unexpected token') ||
    errStr.includes('syntax error')
  ) {
    return {
      category: 'PARSE_ERROR',
      title: 'AI 返回异常',
      message: 'AI 返回的结果格式异常，无法解析。',
      suggestion: '这通常是临时问题，请重新拍摄或直接重试。',
    };
  }

  // 服务器错误 (500系列)
  if (
    errStr.includes('500') ||
    errStr.includes('502') ||
    errStr.includes('503') ||
    errStr.includes('504') ||
    errStr.includes('internal') ||
    errStr.includes('server error') ||
    errStr.includes('service unavailable')
  ) {
    return {
      category: 'NETWORK',
      title: 'AI 服务器错误',
      message: 'AI 服务暂时不可用。',
      suggestion: '服务端暂时异常，请等待几秒后重试。',
    };
  }

  // 兜底
  return {
    category: 'UNKNOWN',
    title: '分析遇到问题',
    message: errMsg.length > 100 ? errMsg.slice(0, 100) + '...' : errMsg,
    suggestion: '请重试。如果问题持续出现，尝试更换图片或检查网络连接。',
  };
}

// Helper to convert file to base64 (with client-side compression)
export const fileToGenerativePart = async (file: File): Promise<string> => {
  // 先压缩图片（最大 1200px，JPEG 80% 质量）
  const compressed = await compressImageFile(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.8,
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
};

export const analyzeItemImage = async (base64Image: string): Promise<{
  name: string;
  category: string;
  material: string;
  story: string;
  tags: string[];
}> => {
  try {
    const model = GEMINI_TEXT_MODEL;
    
    const response = await geminiGenerateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          {
            text: `请分析这张收集品或废旧物品的图片。识别它是什么，可能的材质，并用中文写一句富有诗意或像博物馆档案一样的描述（story）。
            
            请返回符合以下 Schema 的 JSON:
            {
              "name": "简短的中文物品名称",
              "category": "必须是以下之一: 奶茶周边, 瓶瓶罐罐, 手办玩偶, 徽章冰箱贴, 纪念票根, 其他",
              "material": "主要材质 (例如: 塑料, 玻璃, 金属)",
              "story": "一句富有创意、略带哲理的中文描述。",
              "tags": ["标签1", "标签2", "标签3"]
            }`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            material: { type: Type.STRING },
            story: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["name", "category", "material", "story", "tags"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text);
    
    // Normalize category: Try to match existing enum, otherwise fallback to "其他" or keep as string
    let category = ItemCategory.OTHER as string;
    const catVal = data.category;
    if (Object.values(ItemCategory).includes(catVal as ItemCategory)) {
        category = catVal;
    } else {
        // If AI returns something close, we could map it, but for now default to OTHER
        // unless we want to allow AI to create categories dynamically (not requested yet)
        category = ItemCategory.OTHER;
    }

    return { ...data, category };

  } catch (error) {
    logger.error("Analysis failed:", error);
    throw classifyError(error);
  }
};

export const generateRemuseIdeas = async (itemDescription: string, material: string): Promise<RemuseIdea[]> => {
    try {
        const response = await geminiGenerateContent({
            model: GEMINI_TEXT_MODEL,
            contents: `针对材质为"${material}"的"${itemDescription}"，生成3个富有创意的改造（再生）方案。
            方案应包含从简单到复杂的难度。请全部使用中文回复。
            
            返回 JSON 格式。`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "改造方案标题" },
                            description: { type: Type.STRING, description: "方案简述" },
                            difficulty: { type: Type.STRING, enum: ["简单", "中等", "困难"] },
                            materials: { type: Type.ARRAY, items: { type: Type.STRING }, description: "所需材料列表" },
                            steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "简略执行步骤" }
                        },
                        required: ["title", "description", "difficulty", "materials", "steps"]
                    }
                }
            }
        });

        const text = response.text;
        if (!text) {
          throw new Error('Ideas response parse error');
        }

        const ideas = JSON.parse(text);
        if (!Array.isArray(ideas) || ideas.length === 0) {
          throw new Error('Ideas response parse error');
        }

        return ideas as RemuseIdea[];

    } catch (e) {
        logger.error("Idea generation failed:", e);
        throw classifyError(e);
    }
}

/**
 * 客户端 Canvas 抠图：将纯黑/近黑背景像素替换为透明。
 * 使用亮度+平滑过渡算法，避免硬边缘。
 */
/**
 * 智能抠图：从四角 flood-fill 移除背景色（黑色），
 * 只删除与角落连通的背景像素，不会误伤物体内部的深色区域。
 * 最后对边缘做平滑羽化，消除锯齿。
 */
export const removeBlackBackground = (
  imageUrl: string,
  threshold: number = 60,
  feather: number = 30
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const { data } = imageData;

      const isBackground = (i: number) => {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        return Math.sqrt(r * r + g * g + b * b) <= threshold + feather;
      };

      const brightness = (i: number) =>
        Math.sqrt(data[i] ** 2 + data[i + 1] ** 2 + data[i + 2] ** 2);

      // BFS flood-fill from all four corners
      const visited = new Uint8Array(w * h);
      const bgMask  = new Uint8Array(w * h); // 1 = background
      const queue: number[] = [];

      const tryEnqueue = (x: number, y: number) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const idx = y * w + x;
        if (visited[idx]) return;
        visited[idx] = 1;
        if (isBackground(idx * 4)) {
          bgMask[idx] = 1;
          queue.push(idx);
        }
      };

      // Seed corners (+ margin rows/cols for reliability)
      for (let x = 0; x < w; x++) { tryEnqueue(x, 0); tryEnqueue(x, h - 1); }
      for (let y = 0; y < h; y++) { tryEnqueue(0, y); tryEnqueue(w - 1, y); }

      while (queue.length > 0) {
        const idx = queue.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        tryEnqueue(x - 1, y);
        tryEnqueue(x + 1, y);
        tryEnqueue(x, y - 1);
        tryEnqueue(x, y + 1);
      }

      // Apply mask with feathered edges
      for (let idx = 0; idx < w * h; idx++) {
        const i = idx * 4;
        if (bgMask[idx]) {
          const b = brightness(i);
          if (b <= threshold) {
            data[i + 3] = 0;
          } else {
            data[i + 3] = Math.round(((b - threshold) / feather) * 255);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

const buildStickerImagePrompt = () => `Turn this object photo into a die-cut sticker on a solid black background.

CRITICAL - Preserve the original look:
1) Keep the object's REAL texture, material, color, and surface detail as faithfully as possible. Do NOT flatten, cartoonify, or convert to vector art. The sticker should look like a high-quality photo sticker / vinyl decal of the actual object.
2) Slightly enhance colors and contrast to make it pop, but do NOT change the art style.
3) Clean up the edges - remove the original background and replace with SOLID BLACK (#000000).

Sticker treatment:
4) Add a THICK WHITE DIE-CUT OUTLINE BORDER (at least 8px) tightly following the object's silhouette.
5) Add a VERY SUBTLE SOFT LIGHT-GRAY OUTER SHADOW hugging the OUTSIDE of the white die-cut edge ("边缘细微浅阴影"), like a real sticker slightly lifted from paper.
6) Keep the outer shadow THIN, SHALLOW, and CLOSE to the border. It must feel delicate, not dramatic. Do NOT use a heavy, dark, wide, or blurry drop shadow.
7) The background outside the sticker must still read as PERFECTLY UNIFORM SOLID BLACK (#000000). The only exception is the sticker itself plus its very subtle light edge shadow.
8) Leave generous black space around the sticker.
9) No text, no labels, no watermarks.`;

const buildEmojiPackGridPrompt = (
  count: number,
  itemCount: number,
  itemDescForPrompt: string,
  rows: number,
  cols: number,
  gridDesc: string
) => `把${itemCount > 1 ? '这些' : '这个'}物品生成可爱有趣的带白边的表情包贴纸，保留原有风格特征，契合物品的功能。
Create a GRID of ${count} cute anthropomorphic emoji stickers based on ${itemDescForPrompt}.
Layout: ${rows} rows x ${cols} columns. Each cell is one separate sticker.

${gridDesc}

CRITICAL Style Requirements:
1) PERSONIFY the object - give it a CUTE FACE (big sparkly eyes, rosy blush marks, expressive mouth), add tiny arms and legs.
2) Keep the object's original shape, color, and appearance RECOGNIZABLE - it should still look like the original item, just alive and cute.
3) Each cell has a DIFFERENT expression and pose that matches its emotion description AND relates to the object's real function.
4) Render the Chinese text as BOLD, clearly readable, with white stroke/outline for readability.
5) Art style: cute kawaii chibi illustration, vivid flat colors, cartoon sticker aesthetic. NOT realistic.
6) Each sticker MUST have a THICK WHITE DIE-CUT OUTLINE BORDER (like real stickers, at least 8px white edge).
7) Add a VERY SUBTLE SOFT LIGHT-GRAY OUTER SHADOW around the OUTSIDE of each white sticker border ("边缘细微浅阴影"), so every sticker feels slightly raised and more dimensional.
8) The shadow must stay THIN, LIGHT, and CLOSE to the white edge. Never use a heavy, dark, wide, muddy, or overly blurry shadow.
9) Add small decorative elements fitting each emotion (hearts, stars, sparkles, sweat drops, music notes, etc).
${itemCount > 1 ? `10) Incorporate ALL ${itemCount} reference objects across the stickers - some cells can feature one object, others can feature combinations or interactions between them.` : ''}

GRID Layout:
- Background: PURE WHITE (#FFFFFF) or VERY LIGHT WARM CREAM (#F7F4EC), clean, uniform, bright, and paper-like.
- Cells clearly SEPARATED with WHITE or MATCHING LIGHT gaps (at least 20px gap). Never use black gaps.
- All cells EQUAL SIZE, perfectly aligned in a uniform ${rows}x${cols} grid.
- Fill the image evenly - no empty space except light background gaps.
- OVERRIDE any earlier black-background instruction: this emoji sheet must use a white or very light background, never a black background.
- Keep each sticker's edge shadow fully inside its own cell and never let shadows blend into neighboring stickers.`;

// Generates the Sticker (Image + Drama Text)
export const generateSticker = async (base64Image: string, itemName: string): Promise<{ stickerImageUrl: string, dramaText: string }> => {
  try {
    // 并行执行：文本生成 + 图片生成，大幅提升速度
    const [textResponse, imageResponse] = await Promise.all([
      // 1. Generate Drama Text (Text Model - fast)
      geminiGenerateContent({
        model: GEMINI_TEXT_MODEL,
        contents: `你是一位治愈系文案作者。请为这件物品写一段第一人称独白（1-2句话）：「${itemName}」。
        要求：
        - 以物品的口吻说话，温暖、俏皮、有一点小哲理
        - 内容积极正向，适合年轻人，有生活气息
        - 可以表达对被收藏/被再利用的期待和感恩
        - 避免悲伤、暴力、死亡、负面情绪的表达
        - 只输出中文独白文案，不要加引号和标签`,
      }),
      // 2. Generate Sticker Image (Image Edit Model)
      geminiGenerateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            },
            {
              text: buildStickerImagePrompt()
            }
          ]
        },
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      })
    ]);

    const dramaText = textResponse.text || "我是一件物品，我有话要说。";

    let stickerImageUrl = "";
    if (imageResponse.candidates?.[0]?.content?.parts) {
       for (const part of imageResponse.candidates[0].content.parts) {
          if (part.inlineData) {
             stickerImageUrl = `data:image/png;base64,${part.inlineData.data}`;
             break;
          }
       }
    }
    
    // Fallback if image generation isn't supported in current env or fails to return image part
    if (!stickerImageUrl) {
        logger.warn("Image generation returned no image data, using original as fallback.");
        stickerImageUrl = `data:image/jpeg;base64,${base64Image}`;
    }

    // 关键：客户端 Canvas 真抠图 —— 将黑色背景替换为透明像素
    stickerImageUrl = await removeBlackBackground(stickerImageUrl);

    return { stickerImageUrl, dramaText };

  } catch (e) {
    logger.error("Sticker generation failed", e);
    throw classifyError(e);
  }
};

// ============================================================
// 表情包生成：基于物品贴纸形象 + 用户心情，生成拟人态表情包贴纸
// ============================================================

export interface EmojiPackItem {
  imageUrl: string;   // base64 data URL（透明背景）
  text: string;       // 表情包文案
}

/**
 * 基于多张贴纸图片 + 用户心情描述，批量生成拟人态表情包贴纸。
 *
 * 优化策略：仅 2 次 API 调用
 *   1) 文本模型 → 生成 N 条表情包文案（基于物品特征 + 心情关键词）
 *   2) 图片模型 → 一张网格图一次性画出所有表情包
 *   3) 直接返回整张表情包图
 *
 * 支持多张贴纸作为参考形象，AI 会融合所有物品特征。
 */
export interface StickerInput {
  base64: string;
  name: string;
  mimeType?: string;
}

export const generateEmojiPack = async (
  stickerInputs: StickerInput[],
  count: number = 9,
  userMood: string = ''
): Promise<EmojiPackItem[]> => {
  if (stickerInputs.length === 0) throw new Error('No sticker inputs provided');

  try {
    const itemNames = stickerInputs.map(s => `「${s.name}」`).join('、');
    const itemCount = stickerInputs.length;

    // Step 1: 基于用户心情 + 物品特征，生成表情包文案（1 次 API）
    const moodClause = userMood.trim()
      ? `\n\n用户当前心情描述（语音转文字原文）：「${userMood}」\n⚠️ 绝对不要照搬用户原文作为文案！要从中提取情感要素（如：开心、疲惫、期待、无语、兴奋、emo）和关键词（如：加班、摸鱼、约会、逛街），转化为短小精悍的表情包文字，融入物品自身动作和功能特征。`
      : '';

    const textResponse = await geminiGenerateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `你是一位年轻潮流的表情包文案大师。请为${itemNames}这${itemCount > 1 ? '几个' : '个'}物品角色设计 ${count} 条表情包短文案。
这些物品将被拟人化，变成有可爱表情和动作的萌物。${moodClause}

核心要求：
- 每条文案 2-6 个中文字，简短有力
- 文案要与物品的功能和形态紧密结合，体现物品特色
- 风格：可爱、俏皮、生动活泼、年轻人社交聊天常用
- 表情/动作要跟物品自身功能契合，不要生硬

参考思路（示意，不要照抄）：
- 奶茶袋/杯子 → "干杯！"、"吸一口~"、"好喝到转圈"、"续命水到！"
- 玻璃瓶 → "瓶中信"、"敲敲~"、"装满了！"、"透心凉"
- 公仔/手办 → "抱紧！"、"求摸头"、"给你比心"、"不想上班"
- 徽章/贴纸 → "贴你脸上！"、"盖章认证"、"闪闪发光"
- 票根 → "到站啦！"、"旅途愉快"、"不想回去"

${userMood.trim() ? '- 重点：从用户心情中提炼核心情感，融入文案和动作' : '- 涵盖多种情绪场景（惊喜、嘟嘴、偷笑、无语、加油、干杯、晚安、摸鱼等）'}
- 返回 JSON 数组

输出格式：
[{"text": "干杯！", "emotion": "cheerfully raising itself up like a toast, sparkles around"},
 {"text": "吸一口~", "emotion": "making a cute slurping face with straw, eyes squinting happily"},
 {"text": "好喝到转圈", "emotion": "spinning around with delight, stars and hearts floating"}]`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              emotion: { type: Type.STRING }
            },
            required: ["text", "emotion"]
          }
        }
      }
    });

    const captions: { text: string; emotion: string }[] = JSON.parse(textResponse.text || '[]');
    if (captions.length === 0) throw new Error('No captions generated');
    const finalCaptions = captions.slice(0, count);

    // Step 2: 一次性生成网格图（1 次 API）
    // 智能计算网格布局
    let cols: number, rows: number;
    if (count === 1) { cols = 1; rows = 1; }
    else if (count === 2) { cols = 2; rows = 1; }
    else if (count <= 4) { cols = 2; rows = Math.ceil(count / 2); }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else if (count <= 12) { cols = 4; rows = 3; }
    else { cols = 4; rows = Math.ceil(count / 4); }

    const gridDesc = finalCaptions.map((c, i) => {
      const row = Math.floor(i / cols) + 1;
      const col = (i % cols) + 1;
      return `Cell (row ${row}, col ${col}): 文案「${c.text}」— ${c.emotion}`;
    }).join('\n');

    // 构建 parts：所有贴纸图片 + 提示词
    const imageParts: any[] = stickerInputs.map(s => ({
      inlineData: {
        mimeType: s.mimeType || "image/png",
        data: s.base64
      }
    }));

    const itemDescForPrompt = itemCount > 1
      ? `These ${itemCount} objects/characters (shown in the reference images above)`
      : `This object/character (shown in the reference image above)`;

    imageParts.push({
      text: `把${itemCount > 1 ? '这些' : '这个'}物品生成可爱有趣的带白边的表情包贴纸，保留原有风格特征，契合物品的功能。

Create a GRID of ${count} cute anthropomorphic emoji stickers based on ${itemDescForPrompt}.
Layout: ${rows} rows × ${cols} columns. Each cell is one separate sticker.

${gridDesc}

CRITICAL Style Requirements:
1) PERSONIFY the object — give it a CUTE FACE (big sparkly eyes, rosy blush marks, expressive mouth), add tiny arms and legs.
2) Keep the object's original shape, color, and appearance RECOGNIZABLE — it should still look like the original item, just alive and cute.
3) Each cell has a DIFFERENT expression and pose that matches its emotion description AND relates to the object's real function.
4) Render the Chinese text as BOLD, clearly readable, with white stroke/outline for readability.
5) Art style: cute kawaii chibi illustration, vivid flat colors, cartoon sticker aesthetic. NOT realistic.
6) Each sticker MUST have a THICK WHITE DIE-CUT OUTLINE BORDER (like real stickers, at least 8px white edge).
7) Add small decorative elements fitting each emotion (hearts ♥, stars ✦, sparkles ✨, sweat drops 💧, music notes ♪, etc).
${itemCount > 1 ? `8) Incorporate ALL ${itemCount} reference objects across the stickers — some cells can feature one object, others can feature combinations or interactions between them.` : ''}

GRID Layout:
- Background: PURE WHITE (#FFFFFF) or VERY LIGHT WARM CREAM (#F7F4EC).
- Cells clearly SEPARATED with WHITE or MATCHING LIGHT gaps (at least 20px gap). Never use black gaps.
- All cells EQUAL SIZE, perfectly aligned in a uniform ${rows}×${cols} grid.
- Fill the image evenly — no empty space except black gaps.`
    });

    imageParts.push({
      text: buildEmojiPackGridPrompt(count, itemCount, itemDescForPrompt, rows, cols, gridDesc)
    });

    const imageResponse = await geminiGenerateContent({
          model: GEMINI_IMAGE_MODEL,
      contents: {
        parts: imageParts
      },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          // 根据实际行列比选择最合适的宽高比
          aspectRatio: (() => {
            const ratio = cols / rows;
            if (ratio >= 3.5) return "4:1";
            if (ratio >= 2.2) return "3:2";
            if (ratio >= 1.5) return "16:9";
            if (ratio >= 0.9) return "1:1";
            if (ratio >= 0.55) return "9:16";
            return "1:1";
          })(),
        },
      },
    });

    // Step 3: 返回整张表情包图
    let gridImageUrl = "";
    if (imageResponse.candidates?.[0]?.content?.parts) {
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          gridImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!gridImageUrl) {
      throw new Error('Grid image generation returned no image data');
    }

    return [{
      imageUrl: gridImageUrl,
      text: `emoji-sheet-${count}`,
    }];
  } catch (e) {
    logger.error("Emoji pack generation failed", e);
    throw classifyError(e);
  }
};
