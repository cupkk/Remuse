import colorSystemMapping from '../shared/perlerColorSystemMapping.json';
import { fetchImageAsset } from './imageUtils';

export type PerlerPatternMode = 'dominant' | 'average';
export type PerlerColorSystem = string;
export type PerlerPatternCropMode = 'content' | 'full';

interface ColorSystemEntry {
  [system: string]: string | undefined;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface LabColor {
  l: number;
  a: number;
  b: number;
}

interface WeightedSample {
  rgb: RgbColor;
  lab: LabColor;
  weight: number;
}

export interface PerlerImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface InternalPaletteColor extends PerlerPaletteColor {
  key: string;
  lab: LabColor;
}

export interface PerlerPaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface PerlerPatternCell {
  key: string;
  color: string;
  isTransparent?: boolean;
}

export interface PerlerPatternColorCount {
  key: string;
  color: string;
  count: number;
}

export interface PerlerDisplayColorCount extends PerlerPatternColorCount {
  displayKey: string;
}

export interface PerlerPaletteEntry {
  key: string;
  color: string;
  displayKey: string;
  count: number;
  inPattern: boolean;
}

export interface PerlerPatternOptions {
  columns: number;
  similarityThreshold: number;
  mode: PerlerPatternMode;
  transparentThreshold?: number;
  cropMode?: PerlerPatternCropMode;
  edgeBias?: number;
}

export interface PerlerPatternQuality {
  score: number;
  edgeRetention: number | null;
  isolatedBeads: number;
  isolatedRatio: number;
  fragmentCount: number;
  fragmentationRatio: number;
  warnings: string[];
}

export interface PerlerPatternCellError {
  deltaE: number;
  normalized: number;
}

export interface PerlerPatternErrorSummary {
  averageDeltaE: number | null;
  maxDeltaE: number | null;
  hotCellCount: number;
  hotCellRatio: number;
}

export interface PerlerPatternAnalysis {
  sourceWidth: number;
  sourceHeight: number;
  workingWidth: number;
  workingHeight: number;
  sourceBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  representativeGrid?: Array<Array<RgbColor | null>>;
  errorGrid?: Array<Array<PerlerPatternCellError | null>>;
  errorSummary?: PerlerPatternErrorSummary;
}

export interface PerlerPatternResult {
  columns: number;
  rows: number;
  totalBeads: number;
  colorCounts: PerlerPatternColorCount[];
  cells: PerlerPatternCell[][];
  settings: Required<PerlerPatternOptions>;
  quality: PerlerPatternQuality;
  analysis?: PerlerPatternAnalysis;
}

export interface DrawPerlerPatternOptions {
  cellSize?: number;
  title?: string;
  summary?: string;
  highlightColor?: string | null;
  displayColorSystem?: PerlerColorSystem;
  showCellCodes?: boolean;
  selectedCell?: { row: number; column: number } | null;
  hoveredCell?: { row: number; column: number } | null;
  selectionRect?: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  } | null;
  showHeatmap?: boolean;
}

const TRANSPARENT_KEY = 'ERASE';
const TRANSPARENT_CELL: PerlerPatternCell = {
  key: TRANSPARENT_KEY,
  color: '#FFFFFF',
  isTransparent: true,
};

const typedColorSystemMapping = colorSystemMapping as Record<string, ColorSystemEntry>;
const availableColorSystems = Array.from(
  Object.values(typedColorSystemMapping).reduce((systems, entry) => {
    Object.keys(entry).forEach((system) => systems.add(system));
    return systems;
  }, new Set<string>()),
);

const preferredSystems = ['MARD', 'COCO'];
const orderedColorSystems = [
  ...preferredSystems.filter((system) => availableColorSystems.includes(system)),
  ...availableColorSystems.filter((system) => !preferredSystems.includes(system)),
];

export const perlerColorSystemOptions: Array<{ key: PerlerColorSystem; name: string }> =
  orderedColorSystems.map((system) => ({
    key: system,
    name: system,
  }));

const DEFAULT_SETTINGS: Required<PerlerPatternOptions> = {
  columns: 48,
  similarityThreshold: 30,
  mode: 'dominant',
  transparentThreshold: 128,
  cropMode: 'content',
  edgeBias: 0,
};

const MIN_CROP_ALPHA = 12;
const MERGE_DISTANCE_SCALE = 0.45;
const rgbToLabCache = new Map<string, LabColor>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): RgbColor | null {
  const cleaned = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return null;
  }

  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

export function colorDistance(left: RgbColor, right: RgbColor): number {
  return deltaE00(getLabColor(left), getLabColor(right));
}

function srgbChannelToLinear(channel: number): number {
  const value = clamp(channel, 0, 255) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(value: number): number {
  const normalized = clamp(value, 0, 1);
  const srgb =
    normalized <= 0.0031308
      ? normalized * 12.92
      : 1.055 * normalized ** (1 / 2.4) - 0.055;
  return Math.round(clamp(srgb * 255, 0, 255));
}

function getLabColor(rgb: RgbColor): LabColor {
  const cacheKey = `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
  const cached = rgbToLabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const xyzToLab = (value: number) =>
    value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116;

  const fx = xyzToLab(x);
  const fy = xyzToLab(y);
  const fz = xyzToLab(z);

  const lab = {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };

  rgbToLabCache.set(cacheKey, lab);
  return lab;
}

function deltaE00(left: LabColor, right: LabColor): number {
  const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

  const l1 = left.l;
  const a1 = left.a;
  const b1 = left.b;
  const l2 = right.l;
  const a2 = right.a;
  const b2 = right.b;

  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const averageC = (c1 + c2) / 2;
  const averageCPow7 = averageC ** 7;
  const g = 0.5 * (1 - Math.sqrt(averageCPow7 / (averageCPow7 + 25 ** 7)));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);

  const getHuePrime = (a: number, b: number) => {
    if (a === 0 && b === 0) {
      return 0;
    }

    const hue = radiansToDegrees(Math.atan2(b, a));
    return hue >= 0 ? hue : hue + 360;
  };

  const h1Prime = getHuePrime(a1Prime, b1);
  const h2Prime = getHuePrime(a2Prime, b2);
  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;

  let deltaHuePrime = 0;
  if (c1Prime !== 0 && c2Prime !== 0) {
    if (Math.abs(h2Prime - h1Prime) <= 180) {
      deltaHuePrime = h2Prime - h1Prime;
    } else if (h2Prime <= h1Prime) {
      deltaHuePrime = h2Prime - h1Prime + 360;
    } else {
      deltaHuePrime = h2Prime - h1Prime - 360;
    }
  }

  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degreesToRadians(deltaHuePrime / 2));
  const averageLPrime = (l1 + l2) / 2;
  const averageCPrime = (c1Prime + c2Prime) / 2;

  let averageHPrime = h1Prime + h2Prime;
  if (c1Prime === 0 || c2Prime === 0) {
    averageHPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    averageHPrime = (h1Prime + h2Prime) / 2;
  } else if (h1Prime + h2Prime < 360) {
    averageHPrime = (h1Prime + h2Prime + 360) / 2;
  } else {
    averageHPrime = (h1Prime + h2Prime - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(averageHPrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * averageHPrime)) +
    0.32 * Math.cos(degreesToRadians(3 * averageHPrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * averageHPrime - 63));

  const deltaTheta = 30 * Math.exp(-(((averageHPrime - 275) / 25) ** 2));
  const averageCPrimePow7 = averageCPrime ** 7;
  const rC = 2 * Math.sqrt(averageCPrimePow7 / (averageCPrimePow7 + 25 ** 7));
  const sL = 1 + (0.015 * ((averageLPrime - 50) ** 2)) / Math.sqrt(20 + ((averageLPrime - 50) ** 2));
  const sC = 1 + 0.045 * averageCPrime;
  const sH = 1 + 0.015 * averageCPrime * t;
  const rT = -Math.sin(degreesToRadians(2 * deltaTheta)) * rC;

  const lightness = deltaLPrime / sL;
  const chroma = deltaCPrime / sC;
  const hue = deltaHPrime / sH;

  return Math.sqrt(lightness * lightness + chroma * chroma + hue * hue + rT * chroma * hue);
}

const perlerPalette: InternalPaletteColor[] = Object.entries(typedColorSystemMapping)
  .map(([hex, entry]) => {
    const rgb = hexToRgb(hex);
    const key = entry.MARD;
    if (!rgb || !key) {
      return null;
    }

    return {
      key,
      hex: hex.toUpperCase(),
      rgb,
      lab: getLabColor(rgb),
    };
  })
  .filter((color): color is InternalPaletteColor => color !== null);

const paletteByKey = perlerPalette.reduce<Record<string, InternalPaletteColor>>((accumulator, color) => {
  accumulator[color.key] = color;
  return accumulator;
}, {});

const closestPaletteCache = new Map<string, InternalPaletteColor>();

function getPaletteCacheKey(color: RgbColor): string {
  return `${color.r},${color.g},${color.b}`;
}

function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: InternalPaletteColor[] = perlerPalette,
): InternalPaletteColor {
  const targetLab = getLabColor(targetRgb);

  if (palette === perlerPalette) {
    const cacheKey = getPaletteCacheKey(targetRgb);
    const cached = closestPaletteCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let closest = palette[0];
    let minDistance = Number.POSITIVE_INFINITY;
    for (const paletteColor of palette) {
      const distance = deltaE00(targetLab, paletteColor.lab);
      if (distance < minDistance) {
        minDistance = distance;
        closest = paletteColor;
      }

      if (distance === 0) {
        break;
      }
    }

    closestPaletteCache.set(cacheKey, closest);
    return closest;
  }

  let closest = palette[0];
  let minDistance = Number.POSITIVE_INFINITY;
  for (const paletteColor of palette) {
    const distance = deltaE00(targetLab, paletteColor.lab);
    if (distance < minDistance) {
      minDistance = distance;
      closest = paletteColor;
    }

    if (distance === 0) {
      break;
    }
  }

  return closest;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadImageData(imageUrl: string): Promise<PerlerImageDataLike> {
  let objectUrl: string | null = null;

  try {
    const resolvedUrl = imageUrl.startsWith('data:')
      ? imageUrl
      : await (async () => {
          const response = await fetchImageAsset(imageUrl);
          if (!response.ok) {
            throw new Error(`获取拼豆源图失败：${response.status}`);
          }

          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          return objectUrl;
        })();

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('拼豆源图解码失败'));
      element.src = resolvedUrl;
    });

    const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create perler analysis canvas context');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function findOpaqueBounds(
  imageData: PerlerImageDataLike,
  alphaThreshold: number,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null {
  let left = imageData.width;
  let top = imageData.height;
  let right = -1;
  let bottom = -1;

  for (let row = 0; row < imageData.height; row += 1) {
    for (let column = 0; column < imageData.width; column += 1) {
      const index = (row * imageData.width + column) * 4;
      if (imageData.data[index + 3] < alphaThreshold) {
        continue;
      }

      left = Math.min(left, column);
      top = Math.min(top, row);
      right = Math.max(right, column);
      bottom = Math.max(bottom, row);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function cropImageDataToBounds(
  imageData: PerlerImageDataLike,
  alphaThreshold: number,
): {
  imageData: PerlerImageDataLike;
  sourceBounds: { left: number; top: number; width: number; height: number };
} {
  const cropThreshold = Math.max(MIN_CROP_ALPHA, Math.round(alphaThreshold * 0.25));
  const bounds = findOpaqueBounds(imageData, cropThreshold);
  if (!bounds) {
    return {
      imageData,
      sourceBounds: {
        left: 0,
        top: 0,
        width: imageData.width,
        height: imageData.height,
      },
    };
  }

  const padding = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) * 0.02));
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const right = Math.min(imageData.width - 1, bounds.right + padding);
  const bottom = Math.min(imageData.height - 1, bounds.bottom + padding);
  const width = right - left + 1;
  const height = bottom - top + 1;

  if (width === imageData.width && height === imageData.height && left === 0 && top === 0) {
    return {
      imageData,
      sourceBounds: {
        left,
        top,
        width,
        height,
      },
    };
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * imageData.width + left) * 4;
    const sourceEnd = sourceStart + width * 4;
    data.set(imageData.data.subarray(sourceStart, sourceEnd), row * width * 4);
  }

  return {
    imageData: { data, width, height },
    sourceBounds: {
      left,
      top,
      width,
      height,
    },
  };
}

function getSpatialWeight(x: number, y: number, width: number, height: number): number {
  if (width <= 1 && height <= 1) {
    return 1;
  }

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radius = Math.max(1, Math.hypot(centerX, centerY));
  const normalizedDistance = Math.min(1, Math.hypot(x - centerX, y - centerY) / radius);
  return 1.18 - normalizedDistance * 0.28;
}

function getLuminance(rgb: RgbColor): number {
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
}

function getPixelRgb(imageData: PerlerImageDataLike, x: number, y: number): RgbColor {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
  };
}

function getLocalEdgeStrength(imageData: PerlerImageDataLike, x: number, y: number): number {
  const center = getPixelRgb(imageData, x, y);
  const centerLuminance = getLuminance(center);
  let totalDifference = 0;
  let neighborCount = 0;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [xOffset, yOffset] of offsets) {
    const neighborX = x + xOffset;
    const neighborY = y + yOffset;
    if (neighborX < 0 || neighborY < 0 || neighborX >= imageData.width || neighborY >= imageData.height) {
      continue;
    }

    const neighbor = getPixelRgb(imageData, neighborX, neighborY);
    totalDifference += Math.abs(centerLuminance - getLuminance(neighbor));
    neighborCount += 1;
  }

  if (!neighborCount) {
    return 0;
  }

  return clamp(totalDifference / neighborCount / 255, 0, 1);
}

function collectCellSamples(
  imageData: PerlerImageDataLike,
  startX: number,
  startY: number,
  width: number,
  height: number,
  alphaThreshold: number,
  edgeBias: number,
): WeightedSample[] {
  const samples: WeightedSample[] = [];
  const edgeBiasStrength = clamp(edgeBias / 100, 0, 1);

  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const x = startX + localX;
      const y = startY + localY;
      const index = (y * imageData.width + x) * 4;
      const alpha = imageData.data[index + 3];
      if (alpha < alphaThreshold) {
        continue;
      }

      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const edgeStrength = edgeBiasStrength > 0 ? getLocalEdgeStrength(imageData, x, y) : 0;
      const weight =
        (alpha / 255) *
        getSpatialWeight(localX, localY, width, height) *
        (0.92 + saturation * 0.18) *
        (1 + edgeStrength * edgeBiasStrength * 0.9);

      const rgb = { r, g, b };
      samples.push({
        rgb,
        lab: getLabColor(rgb),
        weight,
      });
    }
  }

  return samples;
}

function getWeightedAverageColor(samples: WeightedSample[]): RgbColor | null {
  if (samples.length === 0) {
    return null;
  }

  let totalWeight = 0;
  let linearRedTotal = 0;
  let linearGreenTotal = 0;
  let linearBlueTotal = 0;

  for (const sample of samples) {
    totalWeight += sample.weight;
    linearRedTotal += srgbChannelToLinear(sample.rgb.r) * sample.weight;
    linearGreenTotal += srgbChannelToLinear(sample.rgb.g) * sample.weight;
    linearBlueTotal += srgbChannelToLinear(sample.rgb.b) * sample.weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return {
    r: linearChannelToSrgb(linearRedTotal / totalWeight),
    g: linearChannelToSrgb(linearGreenTotal / totalWeight),
    b: linearChannelToSrgb(linearBlueTotal / totalWeight),
  };
}

function pickDominantRepresentativeColor(samples: WeightedSample[]): RgbColor | null {
  if (samples.length === 0) {
    return null;
  }

  const paletteVotes = new Map<string, { color: InternalPaletteColor; score: number; totalDistance: number }>();
  for (const sample of samples) {
    const paletteColor = findClosestPaletteColor(sample.rgb);
    const distance = deltaE00(sample.lab, paletteColor.lab);
    const confidence = 1 / (1 + distance / 12);
    const score = sample.weight * confidence;
    const existing = paletteVotes.get(paletteColor.key);

    if (existing) {
      existing.score += score;
      existing.totalDistance += distance * sample.weight;
    } else {
      paletteVotes.set(paletteColor.key, {
        color: paletteColor,
        score,
        totalDistance: distance * sample.weight,
      });
    }
  }

  const rankedVotes = Array.from(paletteVotes.values()).sort(
    (left, right) => right.score - left.score || left.totalDistance - right.totalDistance,
  );

  if (!rankedVotes.length) {
    return null;
  }

  if (rankedVotes.length === 1) {
    return { ...rankedVotes[0].color.rgb };
  }

  const totalScore = rankedVotes.reduce((sum, item) => sum + item.score, 0);
  const best = rankedVotes[0];
  const second = rankedVotes[1];
  const dominanceRatio = totalScore > 0 ? best.score / totalScore : 1;
  const separationRatio = second.score > 0 ? best.score / second.score : Number.POSITIVE_INFINITY;

  if (dominanceRatio >= 0.52 || separationRatio >= 1.28) {
    return { ...best.color.rgb };
  }

  const averageColor = getWeightedAverageColor(samples);
  if (!averageColor) {
    return { ...best.color.rgb };
  }

  return { ...findClosestPaletteColor(averageColor).rgb };
}

function calculateCellRepresentativeColor(
  imageData: PerlerImageDataLike,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PerlerPatternMode,
  alphaThreshold: number,
  edgeBias: number,
): RgbColor | null {
  const samples = collectCellSamples(imageData, startX, startY, width, height, alphaThreshold, edgeBias);
  if (!samples.length) {
    return null;
  }

  return mode === 'average' ? getWeightedAverageColor(samples) : pickDominantRepresentativeColor(samples);
}

function calculateRepresentativeGrid(
  imageData: PerlerImageDataLike,
  columns: number,
  rows: number,
  mode: PerlerPatternMode,
  alphaThreshold: number,
  edgeBias: number,
): Array<Array<RgbColor | null>> {
  const representativeGrid: Array<Array<RgbColor | null>> = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null),
  );

  const cellWidth = imageData.width / columns;
  const cellHeight = imageData.height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startX = Math.floor(column * cellWidth);
      const startY = Math.floor(row * cellHeight);
      const endX = Math.min(imageData.width, Math.ceil((column + 1) * cellWidth));
      const endY = Math.min(imageData.height, Math.ceil((row + 1) * cellHeight));
      const currentCellWidth = Math.max(1, endX - startX);
      const currentCellHeight = Math.max(1, endY - startY);

      const representativeRgb = calculateCellRepresentativeColor(
        imageData,
        startX,
        startY,
        currentCellWidth,
        currentCellHeight,
        mode,
        alphaThreshold,
        edgeBias,
      );

      if (!representativeRgb) {
        continue;
      }

      representativeGrid[row][column] = { ...representativeRgb };
    }
  }

  return representativeGrid;
}

function cloneRepresentativeGrid(
  representativeGrid: Array<Array<RgbColor | null>>,
): Array<Array<RgbColor | null>> {
  return representativeGrid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function applyQuantizationError(
  workingGrid: Array<Array<RgbColor | null>>,
  row: number,
  column: number,
  error: RgbColor,
  weight: number,
) {
  const target = workingGrid[row]?.[column];
  if (!target) {
    return;
  }

  target.r = clamp(target.r + error.r * weight, 0, 255);
  target.g = clamp(target.g + error.g * weight, 0, 255);
  target.b = clamp(target.b + error.b * weight, 0, 255);
}

function quantizeRepresentativeGrid(
  representativeGrid: Array<Array<RgbColor | null>>,
  palette: InternalPaletteColor[],
  mode: PerlerPatternMode,
): PerlerPatternCell[][] {
  const rows = representativeGrid.length;
  const columns = representativeGrid[0]?.length || 0;
  const mappedData: PerlerPatternCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ ...TRANSPARENT_CELL })),
  );

  const workingGrid = cloneRepresentativeGrid(representativeGrid);
  const ditherStrength = mode === 'average' ? 0.72 : 0;

  for (let row = 0; row < rows; row += 1) {
    const serpentine = row % 2 === 1;
    const traversal = serpentine
      ? Array.from({ length: columns }, (_, index) => columns - index - 1)
      : Array.from({ length: columns }, (_, index) => index);

    for (const column of traversal) {
      const current = workingGrid[row][column];
      if (!current) {
        mappedData[row][column] = { ...TRANSPARENT_CELL };
        continue;
      }

      const closestBead = findClosestPaletteColor(current, palette);
      mappedData[row][column] = {
        key: closestBead.key,
        color: closestBead.hex,
      };

      if (ditherStrength <= 0) {
        continue;
      }

      const error = {
        r: (current.r - closestBead.rgb.r) * ditherStrength,
        g: (current.g - closestBead.rgb.g) * ditherStrength,
        b: (current.b - closestBead.rgb.b) * ditherStrength,
      };

      if (serpentine) {
        applyQuantizationError(workingGrid, row, column - 1, error, 7 / 16);
        applyQuantizationError(workingGrid, row + 1, column + 1, error, 3 / 16);
        applyQuantizationError(workingGrid, row + 1, column, error, 5 / 16);
        applyQuantizationError(workingGrid, row + 1, column - 1, error, 1 / 16);
      } else {
        applyQuantizationError(workingGrid, row, column + 1, error, 7 / 16);
        applyQuantizationError(workingGrid, row + 1, column - 1, error, 3 / 16);
        applyQuantizationError(workingGrid, row + 1, column, error, 5 / 16);
        applyQuantizationError(workingGrid, row + 1, column + 1, error, 1 / 16);
      }
    }
  }

  return mappedData;
}

function mergeSimilarColors(
  cells: PerlerPatternCell[][],
  similarityThreshold: number,
): PerlerPatternCell[][] {
  const effectiveThreshold = similarityThreshold * MERGE_DISTANCE_SCALE;
  if (effectiveThreshold <= 0) {
    return cells.map((row) => row.map((cell) => ({ ...cell })));
  }

  const initialColorCounts: Record<string, number> = {};
  cells.flat().forEach((cell) => {
    if (!cell.isTransparent && cell.key && cell.key !== TRANSPARENT_KEY) {
      initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
    }
  });

  const colorsByFrequency = Object.entries(initialColorCounts)
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);

  if (!colorsByFrequency.length) {
    return cells.map((row) => row.map((cell) => ({ ...cell })));
  }

  const mergedCells = cells.map((row) => row.map((cell) => ({ ...cell })));
  const replacedColors = new Set<string>();

  for (let index = 0; index < colorsByFrequency.length; index += 1) {
    const currentKey = colorsByFrequency[index];
    if (replacedColors.has(currentKey)) {
      continue;
    }

    const currentColor = paletteByKey[currentKey];
    if (!currentColor) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < colorsByFrequency.length; nextIndex += 1) {
      const lowerFrequencyKey = colorsByFrequency[nextIndex];
      if (replacedColors.has(lowerFrequencyKey)) {
        continue;
      }

      const lowerFrequencyColor = paletteByKey[lowerFrequencyKey];
      if (!lowerFrequencyColor) {
        continue;
      }

      const currentCount = initialColorCounts[currentKey] || 0;
      const candidateCount = initialColorCounts[lowerFrequencyKey] || 0;
      if (candidateCount >= currentCount * 0.9) {
        continue;
      }

      const distance = deltaE00(currentColor.lab, lowerFrequencyColor.lab);
      if (distance >= effectiveThreshold) {
        continue;
      }

      replacedColors.add(lowerFrequencyKey);
      for (let row = 0; row < mergedCells.length; row += 1) {
        for (let column = 0; column < mergedCells[row].length; column += 1) {
          if (mergedCells[row][column].key === lowerFrequencyKey) {
            mergedCells[row][column] = {
              key: currentColor.key,
              color: currentColor.hex,
            };
          }
        }
      }
    }
  }

  return mergedCells;
}

function smoothSmallArtifacts(
  cells: PerlerPatternCell[][],
  mode: PerlerPatternMode,
  iterations = 2,
): PerlerPatternCell[][] {
  if (mode !== 'average') {
    return cells.map((row) => row.map((cell) => ({ ...cell })));
  }

  let current = cells.map((row) => row.map((cell) => ({ ...cell })));

  const getSignature = (cell: PerlerPatternCell) =>
    cell.isTransparent ? `${TRANSPARENT_KEY}|transparent` : `${cell.key}|${cell.color.toUpperCase()}`;

  const getNeighbors = (row: number, column: number) => {
    const neighbors: PerlerPatternCell[] = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) {
          continue;
        }

        const neighbor = current[row + rowOffset]?.[column + columnOffset];
        if (neighbor) {
          neighbors.push(neighbor);
        }
      }
    }
    return neighbors;
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let changed = false;
    const next = current.map((row) => row.map((cell) => ({ ...cell })));

    for (let row = 0; row < current.length; row += 1) {
      for (let column = 0; column < current[row].length; column += 1) {
        const cell = current[row][column];
        const neighbors = getNeighbors(row, column);
        if (neighbors.length < 5) {
          continue;
        }

        const counts = new Map<string, { count: number; sample: PerlerPatternCell }>();
        neighbors.forEach((neighbor) => {
          const signature = getSignature(neighbor);
          const entry = counts.get(signature);
          if (entry) {
            entry.count += 1;
          } else {
            counts.set(signature, { count: 1, sample: neighbor });
          }
        });

        const dominant = Array.from(counts.values()).sort((left, right) => right.count - left.count)[0];
        if (!dominant || dominant.count < 7) {
          continue;
        }

        if (getSignature(cell) === getSignature(dominant.sample)) {
          continue;
        }

        next[row][column] = { ...dominant.sample };
        changed = true;
      }
    }

    current = next;
    if (!changed) {
      break;
    }
  }

  return current;
}

function countColors(cells: PerlerPatternCell[][]): {
  counts: PerlerPatternColorCount[];
  totalBeads: number;
} {
  const countsByHex = new Map<string, PerlerPatternColorCount>();
  let totalBeads = 0;

  cells.flat().forEach((cell) => {
    if (cell.isTransparent) {
      return;
    }

    totalBeads += 1;
    const existing = countsByHex.get(cell.color);
    if (existing) {
      existing.count += 1;
      return;
    }

    countsByHex.set(cell.color, {
      key: cell.key,
      color: cell.color,
      count: 1,
    });
  });

  const counts = Array.from(countsByHex.values()).sort((left, right) => right.count - left.count);
  return { counts, totalBeads };
}

function getPatternCellPaletteColor(cell: PerlerPatternCell): InternalPaletteColor | null {
  if (cell.isTransparent) {
    return null;
  }

  return paletteByKey[cell.key] ?? null;
}

function countIsolatedBeads(cells: PerlerPatternCell[][]): number {
  let isolatedBeads = 0;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      const cell = cells[row][column];
      if (cell.isTransparent) {
        continue;
      }

      const matchingNeighbors = offsets.reduce((total, [rowOffset, columnOffset]) => {
        const neighbor = cells[row + rowOffset]?.[column + columnOffset];
        return total + (neighbor && !neighbor.isTransparent && neighbor.key === cell.key ? 1 : 0);
      }, 0);

      if (matchingNeighbors === 0) {
        isolatedBeads += 1;
      }
    }
  }

  return isolatedBeads;
}

function countColorFragments(cells: PerlerPatternCell[][]): number {
  const visited = cells.map((row) => row.map(() => false));
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let fragmentCount = 0;

  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      const startCell = cells[row][column];
      if (visited[row][column] || startCell.isTransparent) {
        continue;
      }

      fragmentCount += 1;
      const queue: Array<{ row: number; column: number }> = [{ row, column }];
      visited[row][column] = true;

      while (queue.length) {
        const current = queue.shift()!;
        for (const [rowOffset, columnOffset] of offsets) {
          const nextRow = current.row + rowOffset;
          const nextColumn = current.column + columnOffset;
          const neighbor = cells[nextRow]?.[nextColumn];
          if (!neighbor || neighbor.isTransparent || visited[nextRow][nextColumn] || neighbor.key !== startCell.key) {
            continue;
          }

          visited[nextRow][nextColumn] = true;
          queue.push({ row: nextRow, column: nextColumn });
        }
      }
    }
  }

  return fragmentCount;
}

function calculateEdgeRetention(
  representativeGrid: Array<Array<RgbColor | null>> | undefined,
  cells: PerlerPatternCell[][],
): number | null {
  if (!representativeGrid?.length) {
    return null;
  }

  let sourceEdges = 0;
  let preservedEdges = 0;
  const evaluatePair = (
    currentRepresentative: RgbColor | null,
    nextRepresentative: RgbColor | null,
    currentCell: PerlerPatternCell,
    nextCell: PerlerPatternCell | undefined,
  ) => {
    if (!currentRepresentative || !nextRepresentative || currentCell.isTransparent || !nextCell || nextCell.isTransparent) {
      return;
    }

    const sourceDistance = colorDistance(currentRepresentative, nextRepresentative);
    if (sourceDistance < 8) {
      return;
    }

    sourceEdges += 1;
    const currentPalette = getPatternCellPaletteColor(currentCell);
    const nextPalette = getPatternCellPaletteColor(nextCell);
    if (!currentPalette || !nextPalette) {
      return;
    }

    const quantizedDistance = colorDistance(currentPalette.rgb, nextPalette.rgb);
    if (currentCell.key !== nextCell.key && quantizedDistance >= 4) {
      preservedEdges += 1;
    }
  };

  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      evaluatePair(
        representativeGrid[row]?.[column] ?? null,
        representativeGrid[row]?.[column + 1] ?? null,
        cells[row][column],
        cells[row][column + 1],
      );
      evaluatePair(
        representativeGrid[row]?.[column] ?? null,
        representativeGrid[row + 1]?.[column] ?? null,
        cells[row][column],
        cells[row + 1]?.[column],
      );
    }
  }

  if (!sourceEdges) {
    return 100;
  }

  return Math.round((preservedEdges / sourceEdges) * 100);
}

function calculatePatternErrors(
  representativeGrid: Array<Array<RgbColor | null>> | undefined,
  cells: PerlerPatternCell[][],
): {
  errorGrid?: Array<Array<PerlerPatternCellError | null>>;
  summary: PerlerPatternErrorSummary;
} {
  if (!representativeGrid?.length) {
    return {
      summary: {
        averageDeltaE: null,
        maxDeltaE: null,
        hotCellCount: 0,
        hotCellRatio: 0,
      },
    };
  }

  const errorGrid: Array<Array<PerlerPatternCellError | null>> = Array.from(
    { length: cells.length },
    () => Array.from({ length: cells[0]?.length ?? 0 }, () => null),
  );
  let totalDeltaE = 0;
  let comparedCellCount = 0;
  let maxDeltaE = 0;
  let hotCellCount = 0;

  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      const representative = representativeGrid[row]?.[column] ?? null;
      const cell = cells[row][column];
      let deltaE: number | null = null;

      if (!representative && cell.isTransparent) {
        errorGrid[row][column] = null;
        continue;
      }

      if (!representative && !cell.isTransparent) {
        deltaE = 30;
      } else if (representative && cell.isTransparent) {
        deltaE = 34;
      } else if (representative) {
        const paletteColor = getPatternCellPaletteColor(cell);
        const resolvedRgb = paletteColor?.rgb ?? hexToRgb(cell.color);
        if (resolvedRgb) {
          deltaE = colorDistance(representative, resolvedRgb);
        }
      }

      if (deltaE === null) {
        errorGrid[row][column] = null;
        continue;
      }

      errorGrid[row][column] = {
        deltaE: Number(deltaE.toFixed(2)),
        normalized: Number(clamp(deltaE / 22, 0, 1).toFixed(4)),
      };
      totalDeltaE += deltaE;
      comparedCellCount += 1;
      maxDeltaE = Math.max(maxDeltaE, deltaE);
      if (deltaE >= 10) {
        hotCellCount += 1;
      }
    }
  }

  return {
    errorGrid,
    summary: {
      averageDeltaE:
        comparedCellCount > 0 ? Number((totalDeltaE / comparedCellCount).toFixed(2)) : null,
      maxDeltaE: comparedCellCount > 0 ? Number(maxDeltaE.toFixed(2)) : null,
      hotCellCount,
      hotCellRatio:
        comparedCellCount > 0 ? Number((hotCellCount / comparedCellCount).toFixed(4)) : 0,
    },
  };
}

function buildPatternWarnings(
  edgeRetention: number | null,
  isolatedRatio: number,
  fragmentationRatio: number,
  colorCount: number,
  errorSummary: PerlerPatternErrorSummary,
): string[] {
  const warnings: string[] = [];

  if (edgeRetention !== null && edgeRetention < 62) {
    warnings.push('轮廓细节正在丢失。建议提高列数或增强轮廓权重。');
  }

  if (isolatedRatio > 0.055) {
    warnings.push('孤立拼豆过多。建议降低轮廓权重或提高颜色合并强度。');
  }

  if (fragmentationRatio > 0.24) {
    warnings.push('图纸碎片化明显。建议加强颜色合并，或切换到预处理图。');
  }

  if (colorCount > 18) {
    warnings.push('颜色数量偏多，照图拼装会更困难。');
  }

  if (errorSummary.averageDeltaE !== null && errorSummary.averageDeltaE > 9.5) {
    warnings.push('平均色差偏高。建议增加列数，或手动修正高误差区域。');
  }

  if (errorSummary.hotCellRatio > 0.12) {
    warnings.push('检测到高误差热区，导出前请先检查热力图。');
  }

  return warnings;
}

function evaluatePatternQuality(
  cells: PerlerPatternCell[][],
  totalBeads: number,
  colorCount: number,
  representativeGrid?: Array<Array<RgbColor | null>>,
  errorSummary?: PerlerPatternErrorSummary,
): PerlerPatternQuality {
  const isolatedBeads = countIsolatedBeads(cells);
  const fragmentCount = countColorFragments(cells);
  const isolatedRatio = totalBeads > 0 ? isolatedBeads / totalBeads : 0;
  const fragmentationRatio = totalBeads > 0 ? fragmentCount / totalBeads : 0;
  const edgeRetention = calculateEdgeRetention(representativeGrid, cells);
  const resolvedErrorSummary =
    errorSummary ?? calculatePatternErrors(representativeGrid, cells).summary;
  const warnings = buildPatternWarnings(
    edgeRetention,
    isolatedRatio,
    fragmentationRatio,
    colorCount,
    resolvedErrorSummary,
  );
  const detailComponent = edgeRetention ?? 78;
  const isolationComponent = Math.max(0, 100 - isolatedRatio * 1000);
  const fragmentationComponent = Math.max(0, 100 - fragmentationRatio * 1500);
  const errorComponent =
    resolvedErrorSummary.averageDeltaE === null
      ? 82
      : Math.max(
          0,
          100 -
            resolvedErrorSummary.averageDeltaE * 6 -
            resolvedErrorSummary.hotCellRatio * 120,
        );
  const score = Math.round(
    detailComponent * 0.4 +
      isolationComponent * 0.2 +
      fragmentationComponent * 0.15 +
      errorComponent * 0.25,
  );

  return {
    score: clamp(score, 0, 100),
    edgeRetention,
    isolatedBeads,
    isolatedRatio: Number(isolatedRatio.toFixed(4)),
    fragmentCount,
    fragmentationRatio: Number(fragmentationRatio.toFixed(4)),
    warnings,
  };
}

export function rebuildPerlerPatternResult(
  pattern: PerlerPatternResult,
  cells: PerlerPatternCell[][],
): PerlerPatternResult {
  const clonedCells = cells.map((row) => row.map((cell) => ({ ...cell })));
  const { counts, totalBeads } = countColors(clonedCells);
  const analysis = pattern.analysis
    ? {
        ...pattern.analysis,
        ...calculatePatternErrors(pattern.analysis.representativeGrid, clonedCells),
      }
    : pattern.analysis;
  const quality = evaluatePatternQuality(
    clonedCells,
    totalBeads,
    counts.length,
    analysis?.representativeGrid,
    analysis?.errorSummary,
  );

  return {
    ...pattern,
    colorCounts: counts,
    totalBeads,
    cells: clonedCells,
    quality,
    analysis,
  };
}

export function getPerlerPatternCanvasMetrics(
  pattern: PerlerPatternResult,
  options: Pick<DrawPerlerPatternOptions, 'cellSize'> = {},
) {
  const cellSize =
    options.cellSize ??
    (pattern.columns <= 24 ? 26 : pattern.columns <= 36 ? 22 : pattern.columns <= 48 ? 18 : 14);
  const leftGutter = 44;
  const rightGutter = 24;
  const headerHeight = 86;
  const gridWidth = pattern.columns * cellSize;
  const gridHeight = pattern.rows * cellSize;
  const legendColumns = gridWidth >= 840 ? 3 : gridWidth >= 560 ? 2 : 1;
  const legendGap = 16;
  const legendItemHeight = 28;
  const legendRows = Math.max(1, Math.ceil(pattern.colorCounts.length / legendColumns));
  const legendHeight = 28 + legendRows * legendItemHeight;
  const contentWidth = leftGutter + gridWidth + rightGutter;
  const contentHeight = headerHeight + gridHeight + legendHeight + 32;

  return {
    cellSize,
    leftGutter,
    rightGutter,
    headerHeight,
    legendColumns,
    legendGap,
    legendItemHeight,
    gridWidth,
    gridHeight,
    contentWidth,
    contentHeight,
  };
}

export function getPerlerDisplayKey(
  hex: string,
  colorSystem: PerlerColorSystem = 'MARD',
): string {
  if (!hex || hex === TRANSPARENT_KEY) {
    return '';
  }

  const normalizedHex = hex.toUpperCase();
  const mapping = typedColorSystemMapping[normalizedHex];
  return mapping?.[colorSystem] || mapping?.MARD || '?';
}

export function getPerlerDisplayColorCounts(
  pattern: PerlerPatternResult,
  colorSystem: PerlerColorSystem = 'MARD',
): PerlerDisplayColorCount[] {
  return pattern.colorCounts.map((color) => ({
    ...color,
    displayKey: getPerlerDisplayKey(color.color, colorSystem),
  }));
}

export function getPerlerPaletteEntries(
  pattern: PerlerPatternResult | null,
  colorSystem: PerlerColorSystem = 'MARD',
): PerlerPaletteEntry[] {
  const countsByKey = new Map<string, number>(
    pattern?.colorCounts.map((color) => [color.key, color.count]) ?? [],
  );

  return perlerPalette.map((color) => ({
    key: color.key,
    color: color.hex,
    displayKey: getPerlerDisplayKey(color.hex, colorSystem),
    count: countsByKey.get(color.key) ?? 0,
    inPattern: countsByKey.has(color.key),
  }));
}

export function buildPerlerPatternCsv(
  pattern: PerlerPatternResult,
  colorSystem: PerlerColorSystem = 'MARD',
): string {
  const lines: string[] = [];
  lines.push(['row', 'column', 'colorCode', 'hex'].join(','));

  pattern.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell.isTransparent) {
        lines.push([rowIndex + 1, columnIndex + 1, '', ''].join(','));
        return;
      }

      lines.push([
        rowIndex + 1,
        columnIndex + 1,
        getPerlerDisplayKey(cell.color, colorSystem),
        cell.color,
      ].join(','));
    });
  });

  lines.push('');
  lines.push('summary');
  lines.push(['colorCode', 'hex', 'count'].join(','));
  getPerlerDisplayColorCounts(pattern, colorSystem).forEach((color) => {
    lines.push([color.displayKey, color.color, color.count].join(','));
  });

  return `\uFEFF${lines.join('\n')}`;
}

export async function generatePerlerPattern(
  imageUrl: string,
  options: PerlerPatternOptions,
): Promise<PerlerPatternResult> {
  const requestedColumns = Number.isFinite(options.columns) ? options.columns : DEFAULT_SETTINGS.columns;
  const requestedThreshold = Number.isFinite(options.similarityThreshold)
    ? options.similarityThreshold
    : DEFAULT_SETTINGS.similarityThreshold;
  const requestedTransparentThreshold = Number.isFinite(options.transparentThreshold)
    ? options.transparentThreshold
    : DEFAULT_SETTINGS.transparentThreshold;

  const settings: Required<PerlerPatternOptions> = {
    ...DEFAULT_SETTINGS,
    ...options,
    columns: clamp(Math.round(requestedColumns), 12, 160),
    similarityThreshold: clamp(Math.round(requestedThreshold), 0, 255),
    transparentThreshold: clamp(Math.round(requestedTransparentThreshold), 0, 255),
    cropMode: options.cropMode === 'full' ? 'full' : 'content',
    edgeBias: clamp(Math.round(options.edgeBias ?? DEFAULT_SETTINGS.edgeBias), 0, 100),
    mode: options.mode === 'average' ? 'average' : 'dominant',
  };

  const imageData = await loadImageData(imageUrl);
  return generatePerlerPatternFromImageData(imageData, settings);
}

export function generatePerlerPatternFromImageData(
  imageData: PerlerImageDataLike,
  options: PerlerPatternOptions,
): PerlerPatternResult {
  const requestedColumns = Number.isFinite(options.columns) ? options.columns : DEFAULT_SETTINGS.columns;
  const requestedThreshold = Number.isFinite(options.similarityThreshold)
    ? options.similarityThreshold
    : DEFAULT_SETTINGS.similarityThreshold;
  const requestedTransparentThreshold = Number.isFinite(options.transparentThreshold)
    ? options.transparentThreshold
    : DEFAULT_SETTINGS.transparentThreshold;

  const settings: Required<PerlerPatternOptions> = {
    ...DEFAULT_SETTINGS,
    ...options,
    columns: clamp(Math.round(requestedColumns), 12, 160),
    similarityThreshold: clamp(Math.round(requestedThreshold), 0, 255),
    transparentThreshold: clamp(Math.round(requestedTransparentThreshold), 0, 255),
    cropMode: options.cropMode === 'full' ? 'full' : 'content',
    edgeBias: clamp(Math.round(options.edgeBias ?? DEFAULT_SETTINGS.edgeBias), 0, 100),
    mode: options.mode === 'average' ? 'average' : 'dominant',
  };

  const cropResult =
    settings.cropMode === 'content'
      ? cropImageDataToBounds(imageData, settings.transparentThreshold)
      : {
          imageData,
          sourceBounds: {
            left: 0,
            top: 0,
            width: imageData.width,
            height: imageData.height,
          },
        };
  const workingImageData = cropResult.imageData;
  const aspectRatio = workingImageData.height / workingImageData.width;
  const rows = Math.max(1, Math.round(settings.columns * aspectRatio));
  const representativeGrid = calculateRepresentativeGrid(
    workingImageData,
    settings.columns,
    rows,
    settings.mode,
    settings.transparentThreshold,
    settings.edgeBias,
  );
  const quantizedCells = quantizeRepresentativeGrid(representativeGrid, perlerPalette, settings.mode);
  const mergedCells = mergeSimilarColors(quantizedCells, settings.similarityThreshold);
  const cells = smoothSmallArtifacts(mergedCells, settings.mode);
  const { counts, totalBeads } = countColors(cells);
  const errorAnalysis = calculatePatternErrors(representativeGrid, cells);
  const quality = evaluatePatternQuality(
    cells,
    totalBeads,
    counts.length,
    representativeGrid,
    errorAnalysis.summary,
  );

  return {
    columns: settings.columns,
    rows,
    totalBeads,
    colorCounts: counts,
    cells,
    settings,
    quality,
    analysis: {
      sourceWidth: imageData.width,
      sourceHeight: imageData.height,
      workingWidth: workingImageData.width,
      workingHeight: workingImageData.height,
      sourceBounds: cropResult.sourceBounds,
      representativeGrid,
      errorGrid: errorAnalysis.errorGrid,
      errorSummary: errorAnalysis.summary,
    },
  };
}

function getContrastTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return '#111111';
  }

  const luminance = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return luminance > 165 ? '#111111' : '#FFFFFF';
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    context.fillText(line, x, cursorY);
  }

  return cursorY;
}

export function drawPerlerPatternCanvas(
  canvas: HTMLCanvasElement,
  pattern: PerlerPatternResult,
  options: DrawPerlerPatternOptions = {},
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const {
    cellSize,
    leftGutter,
    rightGutter,
    headerHeight,
    legendColumns,
    legendGap,
    legendItemHeight,
    gridWidth,
    gridHeight,
    contentWidth,
    contentHeight,
  } = getPerlerPatternCanvasMetrics(pattern, options);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const highlightColor = options.highlightColor?.toUpperCase() || null;
  const displayColorSystem = options.displayColorSystem ?? 'MARD';
  const showCellCodes = options.showCellCodes ?? true;
  const selectedCell = options.selectedCell ?? null;
  const hoveredCell = options.hoveredCell ?? null;
  const selectionRect = options.selectionRect ?? null;
  const showHeatmap = options.showHeatmap ?? false;

  canvas.width = Math.floor(contentWidth * dpr);
  canvas.height = Math.floor(contentHeight * dpr);
  canvas.style.width = `${contentWidth}px`;
  canvas.style.height = `${contentHeight}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, contentWidth, contentHeight);
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, contentWidth, contentHeight);

  context.fillStyle = '#111111';
  context.font = '700 24px Inter, system-ui, sans-serif';
  context.fillText(options.title ?? '拼豆图纸', leftGutter, 34);

  context.fillStyle = '#4B5563';
  context.font = '500 12px Inter, system-ui, sans-serif';
  const defaultSummary = `${pattern.columns} × ${pattern.rows} · ${pattern.totalBeads} 颗拼豆 · ${pattern.colorCounts.length} 种颜色 · ${pattern.settings.mode === 'average' ? '平均取色' : '主色取样'}`;
  drawWrappedText(
    context,
    options.summary ?? defaultSummary,
    leftGutter,
    54,
    contentWidth - leftGutter - rightGutter,
    16,
  );

  const coordinateStep = pattern.columns <= 32 ? 1 : 5;
  const top = headerHeight;
  const fontSize = Math.max(7, Math.floor(cellSize * 0.34));

  context.font = '600 10px Inter, system-ui, sans-serif';
  context.fillStyle = '#6B7280';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let column = 0; column < pattern.columns; column += 1) {
    const label = column + 1;
    if (label === 1 || label % coordinateStep === 0) {
      context.fillText(String(label), leftGutter + column * cellSize + cellSize / 2, top - 16);
    }
  }

  for (let row = 0; row < pattern.rows; row += 1) {
    const label = row + 1;
    if (label === 1 || label % coordinateStep === 0) {
      context.fillText(String(label), 18, top + row * cellSize + cellSize / 2);
    }
  }

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 1;

  for (let row = 0; row < pattern.rows; row += 1) {
    for (let column = 0; column < pattern.columns; column += 1) {
      const cell = pattern.cells[row][column];
      const x = leftGutter + column * cellSize;
      const y = top + row * cellSize;

      context.fillStyle = cell.isTransparent ? '#F9FAFB' : cell.color;
      context.fillRect(x, y, cellSize, cellSize);

      const cellError = pattern.analysis?.errorGrid?.[row]?.[column] ?? null;
      if (showHeatmap && cellError && cellError.normalized > 0) {
        const hue = 60 - cellError.normalized * 60;
        const alpha = 0.08 + cellError.normalized * 0.42;
        context.fillStyle = `hsla(${hue}, 100%, 52%, ${alpha})`;
        context.fillRect(x, y, cellSize, cellSize);
      }

      if (highlightColor && !cell.isTransparent && cell.color.toUpperCase() !== highlightColor) {
        context.fillStyle = 'rgba(17, 24, 39, 0.56)';
        context.fillRect(x, y, cellSize, cellSize);
      }

      context.strokeStyle = '#D1D5DB';
      context.strokeRect(x, y, cellSize, cellSize);

      if (selectedCell && selectedCell.row === row && selectedCell.column === column) {
        context.strokeStyle = '#0F172A';
        context.lineWidth = 2.4;
        context.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        context.lineWidth = 1;
      } else if (hoveredCell && hoveredCell.row === row && hoveredCell.column === column) {
        context.strokeStyle = '#F59E0B';
        context.lineWidth = 2;
        context.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        context.lineWidth = 1;
      }

      if (!cell.isTransparent && cellSize >= 12 && showCellCodes) {
        context.fillStyle = getContrastTextColor(cell.color);
        context.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        context.fillText(
          getPerlerDisplayKey(cell.color, displayColorSystem),
          x + cellSize / 2,
          y + cellSize / 2,
        );
      }
    }
  }

  if (selectionRect) {
    const selectionX = leftGutter + selectionRect.startColumn * cellSize;
    const selectionY = top + selectionRect.startRow * cellSize;
    const selectionWidth =
      (selectionRect.endColumn - selectionRect.startColumn + 1) * cellSize;
    const selectionHeight = (selectionRect.endRow - selectionRect.startRow + 1) * cellSize;
    context.fillStyle = 'rgba(34, 211, 238, 0.1)';
    context.fillRect(selectionX, selectionY, selectionWidth, selectionHeight);
    context.save();
    context.setLineDash([6, 4]);
    context.strokeStyle = 'rgba(34, 211, 238, 0.95)';
    context.lineWidth = 2;
    context.strokeRect(selectionX + 1, selectionY + 1, selectionWidth - 2, selectionHeight - 2);
    context.restore();
  }

  const majorGridStep = pattern.columns <= 56 ? 5 : 10;
  context.beginPath();
  context.strokeStyle = '#9CA3AF';
  context.lineWidth = 1.2;

  for (let column = 0; column <= pattern.columns; column += majorGridStep) {
    const x = leftGutter + column * cellSize;
    context.moveTo(x, top);
    context.lineTo(x, top + gridHeight);
  }

  for (let row = 0; row <= pattern.rows; row += majorGridStep) {
    const y = top + row * cellSize;
    context.moveTo(leftGutter, y);
    context.lineTo(leftGutter + gridWidth, y);
  }

  context.stroke();

  const legendTop = top + gridHeight + 24;
  const legendWidth =
    (contentWidth - leftGutter - rightGutter - legendGap * (legendColumns - 1)) / legendColumns;

  context.fillStyle = '#111111';
  context.font = '700 14px Inter, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('颜色图例', leftGutter, legendTop - 8);

  context.font = '500 12px Inter, system-ui, sans-serif';
  getPerlerDisplayColorCounts(pattern, displayColorSystem).forEach((color, index) => {
    const legendColumn = index % legendColumns;
    const legendRow = Math.floor(index / legendColumns);
    const itemX = leftGutter + legendColumn * (legendWidth + legendGap);
    const itemY = legendTop + legendRow * legendItemHeight;

    context.fillStyle = color.color;
    context.fillRect(itemX, itemY, 16, 16);
    context.strokeStyle = '#D1D5DB';
    context.strokeRect(itemX, itemY, 16, 16);

    context.fillStyle = '#111111';
    context.fillText(`${color.displayKey}  ${color.count}`, itemX + 26, itemY + 12);
  });
}
