import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { APP_CONFIG } from './appConfig.ts';
import { serverLogger } from './serverLogger.ts';

const execFileAsync = promisify(execFile);

type DecodedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

type CutoutQuality = {
  status: 'good' | 'poor';
  haloScore: number;
  edgePixelCount: number;
  opaqueCoverage: number;
};

let rembgAvailabilityPromise: Promise<boolean> | null = null;

export function canUseLocalCoverCutout() {
  return APP_CONFIG.enableRembg;
}

export async function removeBackgroundWithRembgDataUrl(dataUrl: string) {
  if (!APP_CONFIG.enableRembg) {
    return '';
  }

  const available = await ensureRembgAvailable();
  if (!available) {
    return '';
  }

  const subject = decodeDataUrl(dataUrl);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remuse-rembg-'));
  const inputPath = path.join(tempDir, 'input.png');
  const outputPath = path.join(tempDir, 'output.png');

  try {
    const normalizedInput = await sharp(subject.buffer)
      .rotate()
      .png()
      .toBuffer();

    await fs.writeFile(inputPath, normalizedInput);

    const args = ['i', '-m', APP_CONFIG.rembgModel, inputPath, outputPath];
    await execFileAsync(APP_CONFIG.rembgCommand, args, {
      timeout: APP_CONFIG.rembgTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        ...(APP_CONFIG.rembgModelHome ? { U2NET_HOME: APP_CONFIG.rembgModelHome } : {}),
      },
    });

    const outputBuffer = await fs.readFile(outputPath);
    const refinedBuffer = await refineCutoutEdgesBuffer(outputBuffer);
    return `data:image/png;base64,${refinedBuffer.toString('base64')}`;
  } catch (error) {
    serverLogger.warn('cover.rembg.failed', {
      command: APP_CONFIG.rembgCommand,
      model: APP_CONFIG.rembgModel,
      message: error instanceof Error ? error.message : String(error),
    });
    return '';
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function removeSolidBackgroundDataUrl(
  dataUrl: string,
  threshold = 34,
  feather = 46,
) {
  const subject = decodeDataUrl(dataUrl);
  const image = sharp(subject.buffer).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const visited = new Uint8Array(info.width * info.height);
  const backgroundMask = new Uint8Array(info.width * info.height);
  const queue: number[] = [];

  const cornerColors = sampleCornerColors(data, info.width, info.height, info.channels);
  if (!cornerColors.length) {
    return dataUrl;
  }

  const colorDistance = (index: number) => {
    const offset = index * info.channels;
    const r = data[offset] || 0;
    const g = data[offset + 1] || 0;
    const b = data[offset + 2] || 0;
    const alpha = data[offset + 3] ?? 255;

    if (alpha <= 8) {
      return 0;
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    for (const color of cornerColors) {
      const distance = Math.sqrt(
        (r - color.r) * (r - color.r)
        + (g - color.g) * (g - color.g)
        + (b - color.b) * (b - color.b),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
      }
    }

    return bestDistance;
  };

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= info.width || y < 0 || y >= info.height) {
      return;
    }

    const pixelIndex = y * info.width + x;
    if (visited[pixelIndex]) {
      return;
    }

    visited[pixelIndex] = 1;
    const distance = colorDistance(pixelIndex);
    if (distance <= threshold + feather) {
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

  let removedPixels = 0;
  for (let pixelIndex = 0; pixelIndex < info.width * info.height; pixelIndex += 1) {
    if (!backgroundMask[pixelIndex]) {
      continue;
    }

    removedPixels += 1;
    const alphaOffset = pixelIndex * info.channels + 3;
    const distance = colorDistance(pixelIndex);
    output[alphaOffset] = distance <= threshold
      ? 0
      : Math.max(0, Math.min(255, Math.round(((distance - threshold) / feather) * 255)));
  }

  if (removedPixels === 0) {
    return dataUrl;
  }

  const pngBuffer = await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer();

  const refinedBuffer = await refineCutoutEdgesBuffer(pngBuffer);

  return `data:image/png;base64,${refinedBuffer.toString('base64')}`;
}

export async function assessCutoutQualityDataUrl(dataUrl: string): Promise<CutoutQuality> {
  const subject = decodeDataUrl(dataUrl);
  return assessCutoutQualityBuffer(subject.buffer);
}

async function ensureRembgAvailable() {
  if (!rembgAvailabilityPromise) {
    rembgAvailabilityPromise = (async () => {
      try {
        await execFileAsync(APP_CONFIG.rembgCommand, ['--help'], {
          timeout: Math.min(APP_CONFIG.rembgTimeoutMs, 3_000),
          maxBuffer: 512 * 1024,
          env: {
            ...process.env,
            ...(APP_CONFIG.rembgModelHome ? { U2NET_HOME: APP_CONFIG.rembgModelHome } : {}),
          },
        });
        return true;
      } catch (error) {
        serverLogger.warn('cover.rembg.unavailable', {
          command: APP_CONFIG.rembgCommand,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    })();
  }

  return rembgAvailabilityPromise;
}

async function refineCutoutEdgesBuffer(buffer: Buffer) {
  const image = sharp(buffer).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  const alphaAt = (x: number, y: number) => output[(y * info.width + x) * info.channels + 3] ?? 255;
  const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = y * info.width + x;
      const offset = pixelIndex * info.channels;
      const alpha = output[offset + 3] ?? 255;

      if (alpha <= 12) {
        output[offset] = 0;
        output[offset + 1] = 0;
        output[offset + 2] = 0;
        output[offset + 3] = 0;
        continue;
      }

      if (alpha >= 248) {
        continue;
      }

      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let neighborCount = 0;

      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const sampleX = x + dx;
          const sampleY = y + dy;
          if (sampleX < 0 || sampleX >= info.width || sampleY < 0 || sampleY >= info.height) {
            continue;
          }

          const neighborAlpha = alphaAt(sampleX, sampleY);
          if (neighborAlpha < 220) {
            continue;
          }

          const neighborOffset = (sampleY * info.width + sampleX) * info.channels;
          totalR += output[neighborOffset] || 0;
          totalG += output[neighborOffset + 1] || 0;
          totalB += output[neighborOffset + 2] || 0;
          neighborCount += 1;
        }
      }

      if (neighborCount === 0) {
        continue;
      }

      const averageR = totalR / neighborCount;
      const averageG = totalG / neighborCount;
      const averageB = totalB / neighborCount;
      const currentLuma = luminance(output[offset] || 0, output[offset + 1] || 0, output[offset + 2] || 0);
      const neighborLuma = luminance(averageR, averageG, averageB);
      const darkBias = Math.max(0, neighborLuma - currentLuma) / 255;
      const blend = Math.min(0.85, Math.max(0.24, 0.24 + darkBias * 0.6 + ((255 - alpha) / 255) * 0.18));

      output[offset] = Math.round((output[offset] || 0) * (1 - blend) + averageR * blend);
      output[offset + 1] = Math.round((output[offset + 1] || 0) * (1 - blend) + averageG * blend);
      output[offset + 2] = Math.round((output[offset + 2] || 0) * (1 - blend) + averageB * blend);

      if (alpha < 42 && darkBias > 0.25) {
        output[offset + 3] = Math.max(0, alpha - Math.round(darkBias * 28));
      }
    }
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer();
}

async function assessCutoutQualityBuffer(buffer: Buffer): Promise<CutoutQuality> {
  const image = sharp(buffer).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  const getAlpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3] ?? 255;

  let haloScore = 0;
  let edgePixelCount = 0;
  let opaquePixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha >= 220) {
        opaquePixels += 1;
      }

      if (alpha <= 16 || alpha >= 220) {
        continue;
      }

      let totalNeighborLuma = 0;
      let neighborCount = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const sampleX = x + dx;
          const sampleY = y + dy;
          if (sampleX < 0 || sampleX >= info.width || sampleY < 0 || sampleY >= info.height) {
            continue;
          }

          const neighborAlpha = getAlpha(sampleX, sampleY);
          if (neighborAlpha < 220) {
            continue;
          }

          const neighborOffset = (sampleY * info.width + sampleX) * info.channels;
          totalNeighborLuma += luminance(
            data[neighborOffset] || 0,
            data[neighborOffset + 1] || 0,
            data[neighborOffset + 2] || 0,
          );
          neighborCount += 1;
        }
      }

      if (neighborCount < 2) {
        continue;
      }

      const currentLuma = luminance(data[offset] || 0, data[offset + 1] || 0, data[offset + 2] || 0);
      const neighborLuma = totalNeighborLuma / neighborCount;
      const delta = neighborLuma - currentLuma;
      if (delta <= 26) {
        continue;
      }

      haloScore += delta / 255;
      edgePixelCount += 1;
    }
  }

  const normalizedHaloScore = edgePixelCount > 0 ? haloScore / edgePixelCount : 0;
  const opaqueCoverage = opaquePixels / (info.width * info.height);

  return {
    status: normalizedHaloScore > 0.16 && edgePixelCount > 80 ? 'poor' : 'good',
    haloScore: Number(normalizedHaloScore.toFixed(4)),
    edgePixelCount,
    opaqueCoverage: Number(opaqueCoverage.toFixed(4)),
  };
}

function sampleCornerColors(data: Buffer, width: number, height: number, channels: number) {
  const sampleSize = Math.max(6, Math.min(18, Math.floor(Math.min(width, height) * 0.08)));
  const regions = [
    { startX: 0, startY: 0 },
    { startX: width - sampleSize, startY: 0 },
    { startX: 0, startY: height - sampleSize },
    { startX: width - sampleSize, startY: height - sampleSize },
  ];

  return regions
    .map((region) => averageRegionColor(data, width, height, channels, region.startX, region.startY, sampleSize))
    .filter((color): color is { r: number; g: number; b: number } => !!color);
}

function averageRegionColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  startX: number,
  startY: number,
  sampleSize: number,
) {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = startY; y < Math.min(startY + sampleSize, height); y += 1) {
    for (let x = startX; x < Math.min(startX + sampleSize, width); x += 1) {
      const offset = (y * width + x) * channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha <= 8) {
        continue;
      }

      totalR += data[offset] || 0;
      totalG += data[offset + 1] || 0;
      totalB += data[offset + 2] || 0;
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error('抠图处理收到的图片数据无效。');
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}
