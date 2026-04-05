// ============================================================
// 客户端图片压缩工具 — 使用 Canvas API
// 在上传/分析前压缩图片，减少体积并加快传输
// ============================================================

/**
 * 压缩配置
 */
export interface CompressOptions {
  /** 最大宽度（px），默认 1200 */
  maxWidth?: number;
  /** 最大高度（px），默认 1200 */
  maxHeight?: number;
  /** JPEG 压缩质量 0-1，默认 0.8 */
  quality?: number;
  /** 输出 MIME 类型，默认 image/jpeg */
  outputType?: string;
}

export interface ImageToBase64Options extends CompressOptions {
  compress?: boolean;
  useCache?: boolean;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.8,
  outputType: 'image/jpeg',
};

const DEFAULT_IMAGE_TO_BASE64_OPTIONS: Required<Pick<ImageToBase64Options, 'compress' | 'useCache'>> = {
  compress: false,
  useCache: true,
};

const imageBase64Cache = new Map<string, Promise<string>>();

export function getImageFetchOptions(imageUrl: string): RequestInit {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return {};
  }

  try {
    const resolvedUrl = new URL(imageUrl, window.location.origin);
    if (resolvedUrl.origin === window.location.origin) {
      return { credentials: 'include' };
    }
  } catch {
    // Fall through to the default cross-origin-safe behavior below.
  }

  return { credentials: 'omit' };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('\u56fe\u50cf Data URL \u683c\u5f0f\u65e0\u6548');
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = /;base64/i.test(metadata);
  const mimeType = (metadata.split(';')[0] || 'text/plain;charset=US-ASCII').trim();

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  const normalized = payload.replace(/\s/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export function fetchImageAsset(imageUrl: string): Promise<Response> {
  if (imageUrl.startsWith('data:')) {
    return Promise.resolve(new Response(dataUrlToBlob(imageUrl), { status: 200 }));
  }

  return fetch(imageUrl, getImageFetchOptions(imageUrl));
}

async function svgSourceToPngBase64(source: string | Blob): Promise<string> {
  const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法解析 SVG 图片内容'));
      img.src = objectUrl;
    });

    const width = Math.max(1, image.naturalWidth || image.width || 1200);
    const height = Math.max(1, image.naturalHeight || image.height || 900);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('\u65e0\u6cd5\u521b\u5efa SVG \u6805\u683c\u5316\u6240\u9700\u7684 Canvas \u4e0a\u4e0b\u6587');
    }

    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('无法将 SVG 图片栅格化'));
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => reject(new Error('无法读取栅格化后的 SVG 图片'));
          reader.readAsDataURL(blob);
        },
        'image/png',
        0.92,
      );
    });
  } finally {
    if (typeof source !== 'string') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * 将 File 压缩后返回压缩后的 File
 * @param file 原始图片 File
 * @param options 压缩选项
 * @returns 压缩后的 File（如果图片已经够小或无法处理，返回原 File）
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  // 非图片文件直接返回
  if (!file.type.startsWith('image/')) return file;

  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    // 计算目标尺寸
    let targetW = width;
    let targetH = height;

    if (width > opts.maxWidth || height > opts.maxHeight) {
      const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
      targetW = Math.round(width * ratio);
      targetH = Math.round(height * ratio);
    } else if (file.size < 500 * 1024) {
      // 图片小于 500KB 且尺寸在限制内，不压缩
      bitmap.close();
      return file;
    }

    // Canvas 绘制压缩
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: opts.outputType,
      quality: opts.quality,
    });

    // 压缩后反而更大，返回原文件
    if (blob.size >= file.size) return file;

    const ext = opts.outputType === 'image/jpeg' ? '.jpg' : '.png';
    const compressedName = file.name.replace(/\.[^.]+$/, ext);

    return new File([blob], compressedName, {
      type: opts.outputType,
      lastModified: Date.now(),
    });
  } catch {
    // OffscreenCanvas 不可用时回退
    return compressImageFileFallback(file, opts);
  }
}

/**
 * 回退方案：使用普通 Canvas（DOM）
 */
async function compressImageFileFallback(
  file: File,
  opts: Required<CompressOptions>,
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let targetW = img.naturalWidth;
      let targetH = img.naturalHeight;

      if (targetW > opts.maxWidth || targetH > opts.maxHeight) {
        const ratio = Math.min(opts.maxWidth / targetW, opts.maxHeight / targetH);
        targetW = Math.round(targetW * ratio);
        targetH = Math.round(targetH * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const ext = opts.outputType === 'image/jpeg' ? '.jpg' : '.png';
          const compressedName = file.name.replace(/\.[^.]+$/, ext);
          resolve(
            new File([blob], compressedName, {
              type: opts.outputType,
              lastModified: Date.now(),
            }),
          );
        },
        opts.outputType,
        opts.quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/**
 * 将 base64 字符串压缩后返回新的 base64（不含 data: 前缀）
 * 用于已经是 base64 的场景（如贴纸生成）
 */
export async function compressBase64Image(
  base64: string,
  mimeType: string = 'image/jpeg',
  options: CompressOptions = {},
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // base64 → Blob → File
    const byteChars = atob(base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], 'image.jpg', { type: mimeType });

    const compressed = await compressImageFile(file, opts);

    // File → base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(compressed);
    });
  } catch {
    return base64;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function maybeCompressBlobToBase64(
  blob: Blob,
  options: Required<CompressOptions>,
): Promise<string> {
  const file = new File([blob], 'image', {
    type: blob.type || options.outputType,
    lastModified: Date.now(),
  });
  const compressed = await compressImageFile(file, options);
  return blobToBase64(compressed);
}

function buildImageBase64CacheKey(imageUrl: string, options: Required<ImageToBase64Options>) {
  return `${imageUrl}::${JSON.stringify({
    compress: options.compress,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    quality: options.quality,
    outputType: options.outputType,
  })}`;
}

/**
 * 将任意图片 URL 转为 base64 字符串（不含 data: 前缀）
 * - data:image/... URL → 直接提取 base64
 * - http(s):// 或 /api/uploads/ 相对路径 → fetch 后转换
 */
export async function imageUrlToBase64(
  imageUrl: string,
  options: ImageToBase64Options = {},
): Promise<string> {
  if (!imageUrl) throw new Error('??????');
  const resolvedOptions: Required<ImageToBase64Options> = {
    ...DEFAULT_OPTIONS,
    ...DEFAULT_IMAGE_TO_BASE64_OPTIONS,
    ...options,
  };

  // 已经是 data URL，直接提取 base64 部分
  if (imageUrl.startsWith('data:')) {
    if (imageUrl.startsWith('data:image/svg+xml')) {
      return svgSourceToPngBase64(imageUrl);
    }

    const parts = imageUrl.split(',');
    if (parts.length < 2) throw new Error('\u56fe\u50cf Data URL \u683c\u5f0f\u65e0\u6548');
    if (!resolvedOptions.compress) {
      return parts[1];
    }

    const mimeType = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || resolvedOptions.outputType;
    return compressBase64Image(parts[1], mimeType, resolvedOptions);
  }

  // HTTP/HTTPS 或相对路径 → fetch 并转 base64
  const shouldUseCache = resolvedOptions.useCache && !imageUrl.startsWith('blob:');
  const cacheKey = buildImageBase64CacheKey(imageUrl, resolvedOptions);
  if (shouldUseCache) {
    const cached = imageBase64Cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const loader = (async () => {
    const response = await fetchImageAsset(imageUrl);
    if (!response.ok) throw new Error(`读取图片失败：${response.status}`);
    const blob = await response.blob();

    if (blob.type === 'image/svg+xml') {
      return svgSourceToPngBase64(blob);
    }

    if (resolvedOptions.compress) {
      return maybeCompressBlobToBase64(blob, resolvedOptions);
    }

    return blobToBase64(blob);
  })();

  if (shouldUseCache) {
    imageBase64Cache.set(cacheKey, loader);
  }

  try {
    return await loader;
  } catch (error) {
    if (shouldUseCache) {
      imageBase64Cache.delete(cacheKey);
    }
    throw error;
  }
}
