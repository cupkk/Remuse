import fs from 'node:fs/promises';
import sharp from 'sharp';
import { getManagedUploadInfo } from './storage.ts';

interface ManagedImageDataUrlOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

const DEFAULT_OPTIONS: Required<ManagedImageDataUrlOptions> = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 76,
};

const managedImageDataUrlCache = new Map<string, Promise<string>>();
const MAX_CACHE_ENTRIES = 256;

export async function readManagedUploadAsOptimizedDataUrl(
  uploadPath: string,
  options: ManagedImageDataUrlOptions = {},
): Promise<string> {
  const info = getManagedUploadInfo(uploadPath || '');
  if (!info) {
    return '';
  }

  let stat;
  try {
    stat = await fs.stat(info.absolutePath);
  } catch {
    return '';
  }

  if (!stat.isFile()) {
    return '';
  }

  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = [
    info.absolutePath,
    stat.size,
    stat.mtimeMs,
    resolvedOptions.maxWidth,
    resolvedOptions.maxHeight,
    resolvedOptions.quality,
  ].join('|');

  const cached = managedImageDataUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    const buffer = await fs.readFile(info.absolutePath);
    const optimizedBuffer = await sharp(buffer)
      .rotate()
      .resize(resolvedOptions.maxWidth, resolvedOptions.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: resolvedOptions.quality,
        mozjpeg: true,
      })
      .toBuffer();

    return `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
  })();

  managedImageDataUrlCache.set(cacheKey, loader);
  trimManagedImageCache();

  try {
    return await loader;
  } catch (error) {
    managedImageDataUrlCache.delete(cacheKey);
    throw error;
  }
}

function trimManagedImageCache() {
  if (managedImageDataUrlCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const keys = managedImageDataUrlCache.keys();
  while (managedImageDataUrlCache.size > MAX_CACHE_ENTRIES) {
    const nextKey = keys.next().value;
    if (!nextKey) {
      break;
    }
    managedImageDataUrlCache.delete(nextKey);
  }
}
