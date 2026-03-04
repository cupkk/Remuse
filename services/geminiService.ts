
import { GoogleGenAI, Type } from "@google/genai";
import { ItemCategory, Difficulty, RemuseIdea } from "../types";
import logger from './logger';

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

const ai = new GoogleGenAI({
  apiKey: 'PROXIED',
  httpOptions: { baseUrl: proxyUrl },
});

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

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
    const model = "gemini-3-flash-preview";
    
    const response = await ai.models.generateContent({
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
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
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
        if (!text) return [];
        return JSON.parse(text);

    } catch (e) {
        logger.error("Idea generation failed:", e);
        return [];
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

// Generates the Sticker (Image + Drama Text)
export const generateSticker = async (base64Image: string, itemName: string): Promise<{ stickerImageUrl: string, dramaText: string }> => {
  try {
    // 并行执行：文本生成 + 图片生成，大幅提升速度
    const [textResponse, imageResponse] = await Promise.all([
      // 1. Generate Drama Text (Text Model - fast)
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你是一位治愈系文案作者。请为这件物品写一段第一人称独白（1-2句话）：「${itemName}」。
        要求：
        - 以物品的口吻说话，温暖、俏皮、有一点小哲理
        - 内容积极正向，适合年轻人，有生活气息
        - 可以表达对被收藏/被再利用的期待和感恩
        - 避免悲伤、暴力、死亡、负面情绪的表达
        - 只输出中文独白文案，不要加引号和标签`,
      }),
      // 2. Generate Sticker Image (Image Edit Model)
      ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            },
            {
              text: "Transform this object into a cute flat vector-art sticker illustration. Requirements: 1) Subject must have a THICK WHITE DIE-CUT OUTLINE BORDER (at least 8px). 2) Background must be PERFECTLY UNIFORM SOLID BLACK (#000000) everywhere — no gradients, no noise, no shadows on the background. 3) Use vivid flat colors, minimal shading. 4) Leave generous black space around the sticker. 5) No text, no labels."
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
// 表情包生成：基于贴纸图片，生成带有可爱文案气泡的表情包
// ============================================================

export interface EmojiPackItem {
  imageUrl: string;   // base64 data URL
  text: string;       // 表情包文案
}

/**
 * 基于一张贴纸图片，批量生成多张表情包贴纸。
 * 每张表情包会带有不同的可爱文案+表情/动作。
 */
export const generateEmojiPack = async (
  stickerBase64: string,
  itemName: string,
  count: number = 9
): Promise<EmojiPackItem[]> => {
  try {
    // Step 1: 生成表情包文案列表
    const textResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `你是一位微信表情包设计师。请为「${itemName}」这个物品角色设计 ${count} 条表情包短文案。

要求：
- 每条文案 2-6 个字，简短有力
- 涵盖常用表情场景：打招呼、开心、伤心、生气、加油、晚安、干杯、谢谢、哈哈、无语等
- 文案风格：可爱、俏皮、年轻人社交常用
- 要有创意，结合物品本身的特点和功能
- 只返回 JSON 数组，每项格式：{"text": "文案", "emotion": "表情描述词(英文)"}

示例输出：
[{"text": "干杯！", "emotion": "cheering happily"}, {"text": "晚安", "emotion": "sleepy and cute"}]`,
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

    // Step 2: 逐张生成表情包图片（带文案气泡）
    const results: EmojiPackItem[] = [];
    
    // 并行生成所有图片（最多 count 张）
    const generatePromises = captions.slice(0, count).map(async (caption) => {
      try {
        const imageResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: stickerBase64
                }
              },
              {
                text: `Transform this cute sticker character into an emoji/emoticon sticker with the text "${caption.text}" and the emotion: ${caption.emotion}.

IMPORTANT Requirements:
1) Keep the SAME character/object style from the original sticker, maintain all original visual features and colors.
2) Add the Chinese text "${caption.text}" as a prominent speech bubble or bold overlay text with white outline.
3) Adjust the character's pose/expression to match the emotion: ${caption.emotion}.
4) The character should have exaggerated cute expressions (big eyes, blush marks, sweat drops, etc as appropriate).
5) THICK WHITE DIE-CUT OUTLINE BORDER around the entire sticker (at least 8px).
6) Background must be PERFECTLY UNIFORM SOLID BLACK (#000000) — no gradients, no noise.
7) Flat vector art style, vivid colors.
8) The text must be clearly readable Chinese characters.
9) Leave generous black space around the sticker.`
              }
            ]
          },
          config: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
            },
          },
        });

        let emojiUrl = "";
        if (imageResponse.candidates?.[0]?.content?.parts) {
          for (const part of imageResponse.candidates[0].content.parts) {
            if (part.inlineData) {
              emojiUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (emojiUrl) {
          // 抠掉黑色背景
          emojiUrl = await removeBlackBackground(emojiUrl);
          return { imageUrl: emojiUrl, text: caption.text };
        }
        return null;
      } catch (err) {
        logger.warn(`Emoji pack item "${caption.text}" generation failed:`, err);
        return null;
      }
    });

    const settled = await Promise.all(generatePromises);
    for (const item of settled) {
      if (item) results.push(item);
    }

    if (results.length === 0) {
      throw new Error('All emoji pack items failed to generate');
    }

    return results;
  } catch (e) {
    logger.error("Emoji pack generation failed", e);
    throw classifyError(e);
  }
};
