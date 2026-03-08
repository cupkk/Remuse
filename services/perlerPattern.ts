import colorSystemMapping from '../perler-beads-master/src/app/colorSystemMapping.json';
import { fetchImageAsset } from './imageUtils';

export type PerlerPatternMode = 'dominant' | 'average';
export type PerlerColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

interface ColorSystemEntry {
  MARD?: string;
  COCO?: string;
  漫漫?: string;
  盼盼?: string;
  咪小窝?: string;
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

interface InternalPaletteColor extends PerlerPaletteColor {
  lab: LabColor;
}

interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PaletteVote {
  color: InternalPaletteColor;
  score: number;
  distanceTotal: number;
}

interface CellAnalysis {
  samples: WeightedSample[];
  averageColor: RgbColor | null;
  averageLab: LabColor | null;
  candidates: InternalPaletteColor[];
  initialPalette: InternalPaletteColor | null;
  edgeStrength: number;
  opaqueRatio: number;
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

export interface PerlerPatternOptions {
  columns: number;
  similarityThreshold: number;
  mode: PerlerPatternMode;
  transparentThreshold?: number;
}

export interface PerlerPatternResult {
  columns: number;
  rows: number;
  totalBeads: number;
  colorCounts: PerlerPatternColorCount[];
  cells: PerlerPatternCell[][];
  settings: Required<PerlerPatternOptions>;
}

export interface DrawPerlerPatternOptions {
  cellSize?: number;
  title?: string;
  summary?: string;
  highlightColor?: string | null;
  displayColorSystem?: PerlerColorSystem;
  showCellCodes?: boolean;
}

export const perlerColorSystemOptions: Array<{ key: PerlerColorSystem; name: string }> = [
  { key: 'MARD', name: 'MARD' },
  { key: 'COCO', name: 'COCO' },
  { key: '漫漫', name: '漫漫' },
  { key: '盼盼', name: '盼盼' },
  { key: '咪小窝', name: '咪小窝' },
];

const DEFAULT_SETTINGS: Required<PerlerPatternOptions> = {
  columns: 32,
  similarityThreshold: 14,
  mode: 'dominant',
  transparentThreshold: 128,
};

const ANALYSIS_SCALE = 4;
const MIN_CROP_ALPHA = 12;
const MERGE_DISTANCE_SCALE = 0.45;
const DITHER_BASE_STRENGTH = 0.56;
const DITHER_EDGE_LIMIT = 16;

const TRANSPARENT_CELL: PerlerPatternCell = {
  key: '',
  color: '#FFFFFF',
  isTransparent: true,
};

const perlerColorSystemMapping = colorSystemMapping as Record<string, ColorSystemEntry>;

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

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(color: RgbColor): LabColor {
  const r = srgbChannelToLinear(color.r);
  const g = srgbChannelToLinear(color.g);
  const b = srgbChannelToLinear(color.b);

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  const xr = x / 0.95047;
  const yr = y / 1;
  const zr = z / 1.08883;

  const fx = xr > 0.008856 ? Math.cbrt(xr) : 7.787 * xr + 16 / 116;
  const fy = yr > 0.008856 ? Math.cbrt(yr) : 7.787 * yr + 16 / 116;
  const fz = zr > 0.008856 ? Math.cbrt(zr) : 7.787 * zr + 16 / 116;

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function deltaE76(left: LabColor, right: LabColor): number {
  const dl = left.l - right.l;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function colorDistance(left: RgbColor, right: RgbColor): number {
  return deltaE76(rgbToLab(left), rgbToLab(right));
}

const perlerPalette: InternalPaletteColor[] = Object.entries(perlerColorSystemMapping)
  .map(([hex, entry]) => {
    const rgb = hexToRgb(hex);
    if (!rgb || !entry?.MARD) {
      return null;
    }

    return {
      key: entry.MARD,
      hex: hex.toUpperCase(),
      rgb,
      lab: rgbToLab(rgb),
    };
  })
  .filter((item): item is InternalPaletteColor => item !== null);

const closestPaletteCache = new Map<string, InternalPaletteColor>();

function getCacheKey(color: RgbColor): string {
  return `${color.r >> 2},${color.g >> 2},${color.b >> 2}`;
}

function findClosestPaletteColorByLab(target: LabColor, cacheKey?: string): InternalPaletteColor {
  if (cacheKey) {
    const cached = closestPaletteCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let closest = perlerPalette[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const paletteColor of perlerPalette) {
    const distance = deltaE76(target, paletteColor.lab);
    if (distance < minDistance) {
      minDistance = distance;
      closest = paletteColor;
    }

    if (distance === 0) {
      break;
    }
  }

  if (cacheKey) {
    closestPaletteCache.set(cacheKey, closest);
  }

  return closest;
}

function findClosestPaletteColor(target: RgbColor): InternalPaletteColor {
  return findClosestPaletteColorByLab(rgbToLab(target), getCacheKey(target));
}

export function getPerlerDisplayKey(
  hex: string,
  colorSystem: PerlerColorSystem = 'MARD',
): string {
  const normalizedHex = hex.toUpperCase();
  const mapping = perlerColorSystemMapping[normalizedHex];
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

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create canvas context');
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function findVisibleBounds(imageData: ImageData, alphaThreshold: number): ImageBounds | null {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < alphaThreshold) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cropImageData(imageData: ImageData, transparentThreshold: number): ImageData {
  const alphaThreshold = Math.max(MIN_CROP_ALPHA, Math.round(transparentThreshold * 0.25));
  const bounds = findVisibleBounds(imageData, alphaThreshold);
  if (!bounds) {
    return imageData;
  }

  const padding = Math.max(
    1,
    Math.round(Math.max(bounds.width, bounds.height) * 0.02),
  );

  const cropX = Math.max(0, bounds.x - padding);
  const cropY = Math.max(0, bounds.y - padding);
  const cropWidth = Math.min(imageData.width - cropX, bounds.width + padding * 2);
  const cropHeight = Math.min(imageData.height - cropY, bounds.height + padding * 2);

  if (
    cropX === 0 &&
    cropY === 0 &&
    cropWidth === imageData.width &&
    cropHeight === imageData.height
  ) {
    return imageData;
  }

  const sourceCanvas = createCanvasFromImageData(imageData);
  const targetCanvas = createCanvas(cropWidth, cropHeight);
  const targetContext = targetCanvas.getContext('2d');
  if (!targetContext) {
    throw new Error('Failed to create crop canvas context');
  }

  targetContext.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return targetContext.getImageData(0, 0, cropWidth, cropHeight);
}

function resampleImageData(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
  if (imageData.width === targetWidth && imageData.height === targetHeight) {
    return imageData;
  }

  const sourceCanvas = createCanvasFromImageData(imageData);
  const targetCanvas = createCanvas(targetWidth, targetHeight);
  const targetContext = targetCanvas.getContext('2d');
  if (!targetContext) {
    throw new Error('Failed to create resample canvas context');
  }

  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.clearRect(0, 0, targetWidth, targetHeight);
  targetContext.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return targetContext.getImageData(0, 0, targetWidth, targetHeight);
}

function getCellSamplingThreshold(transparentThreshold: number): number {
  return Math.max(10, Math.min(96, Math.round(transparentThreshold * 0.45)));
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

function collectCellSamples(
  imageData: ImageData,
  startX: number,
  startY: number,
  width: number,
  height: number,
  transparentThreshold: number,
): WeightedSample[] {
  const samples: WeightedSample[] = [];
  const data = imageData.data;
  const imageWidth = imageData.width;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const absoluteX = startX + x;
      const absoluteY = startY + y;
      const index = (absoluteY * imageWidth + absoluteX) * 4;
      const alpha = data[index + 3];
      if (alpha < transparentThreshold) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const weight =
        (alpha / 255) *
        getSpatialWeight(x, y, width, height) *
        (0.92 + saturation * 0.18);

      samples.push({
        rgb: { r, g, b },
        lab: rgbToLab({ r, g, b }),
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
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  for (const sample of samples) {
    totalWeight += sample.weight;
    redTotal += sample.rgb.r * sample.weight;
    greenTotal += sample.rgb.g * sample.weight;
    blueTotal += sample.rgb.b * sample.weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return {
    r: Math.round(redTotal / totalWeight),
    g: Math.round(greenTotal / totalWeight),
    b: Math.round(blueTotal / totalWeight),
  };
}

function getWeightedAverageDeltaE(samples: WeightedSample[], target: LabColor): number {
  if (samples.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let totalWeight = 0;
  let totalDistance = 0;

  for (const sample of samples) {
    totalWeight += sample.weight;
    totalDistance += deltaE76(sample.lab, target) * sample.weight;
  }

  if (totalWeight <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return totalDistance / totalWeight;
}

function clampLabColor(color: LabColor): LabColor {
  return {
    l: clamp(color.l, 0, 100),
    a: clamp(color.a, -128, 127),
    b: clamp(color.b, -128, 127),
  };
}

function addLabColors(base: LabColor, delta: LabColor, scale = 1): LabColor {
  return clampLabColor({
    l: base.l + delta.l * scale,
    a: base.a + delta.a * scale,
    b: base.b + delta.b * scale,
  });
}

function subtractLabColors(left: LabColor, right: LabColor): LabColor {
  return {
    l: left.l - right.l,
    a: left.a - right.a,
    b: left.b - right.b,
  };
}

function rankPaletteVotes(samples: WeightedSample[]): PaletteVote[] {
  if (samples.length === 0) {
    return [];
  }

  const voteMap = new Map<string, PaletteVote>();

  for (const sample of samples) {
    const closest = findClosestPaletteColor(sample.rgb);
    const distance = deltaE76(sample.lab, closest.lab);
    const confidence = 1 / (1 + distance / 12);
    const voteScore = sample.weight * confidence;

    const existing = voteMap.get(closest.key);
    if (existing) {
      existing.score += voteScore;
      existing.distanceTotal += distance * sample.weight;
    } else {
      voteMap.set(closest.key, {
        color: closest,
        score: voteScore,
        distanceTotal: distance * sample.weight,
      });
    }
  }

  return Array.from(voteMap.values()).sort(
    (left, right) =>
      right.score - left.score || left.distanceTotal - right.distanceTotal,
  );
}

function pickDominantPaletteColor(
  samples: WeightedSample[],
  averageColor: RgbColor | null,
  rankedVotes: PaletteVote[],
): InternalPaletteColor | null {
  if (samples.length === 0 || !averageColor) {
    return null;
  }

  if (rankedVotes.length === 0) {
    return findClosestPaletteColor(averageColor);
  }

  const totalVoteScore = rankedVotes.reduce((sum, item) => sum + item.score, 0);
  if (rankedVotes.length === 1 || totalVoteScore <= 0) {
    return rankedVotes[0].color;
  }

  const best = rankedVotes[0];
  const second = rankedVotes[1];
  const dominanceRatio = best.score / totalVoteScore;
  const separationRatio = second.score > 0 ? best.score / second.score : Number.POSITIVE_INFINITY;

  if (dominanceRatio >= 0.52 || separationRatio >= 1.28) {
    return best.color;
  }

  return findClosestPaletteColor(averageColor);
}

function findNearestPaletteCandidates(target: LabColor, limit: number): InternalPaletteColor[] {
  const nearest: Array<{ color: InternalPaletteColor; distance: number }> = [];

  for (const paletteColor of perlerPalette) {
    const distance = deltaE76(target, paletteColor.lab);
    let insertIndex = nearest.findIndex((item) => distance < item.distance);
    if (insertIndex === -1) {
      insertIndex = nearest.length;
    }

    if (insertIndex < limit) {
      nearest.splice(insertIndex, 0, { color: paletteColor, distance });
      if (nearest.length > limit) {
        nearest.pop();
      }
    } else if (nearest.length < limit) {
      nearest.push({ color: paletteColor, distance });
    }
  }

  return nearest.map((item) => item.color);
}

function buildCandidatePaletteList(
  averageLab: LabColor | null,
  rankedVotes: PaletteVote[],
  initialPalette: InternalPaletteColor | null,
): InternalPaletteColor[] {
  const candidates: InternalPaletteColor[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: InternalPaletteColor | null) => {
    if (!candidate || seen.has(candidate.key)) {
      return;
    }

    seen.add(candidate.key);
    candidates.push(candidate);
  };

  addCandidate(initialPalette);
  rankedVotes.slice(0, 3).forEach((vote) => addCandidate(vote.color));

  if (averageLab) {
    findNearestPaletteCandidates(averageLab, 4).forEach((candidate) => addCandidate(candidate));
  }

  return candidates;
}

function buildCellAnalysis(
  imageData: ImageData,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PerlerPatternMode,
  samplingThreshold: number,
): CellAnalysis {
  const samples = collectCellSamples(
    imageData,
    startX,
    startY,
    width,
    height,
    samplingThreshold,
  );
  const averageColor = getWeightedAverageColor(samples);
  const averageLab = averageColor ? rgbToLab(averageColor) : null;
  const rankedVotes = rankPaletteVotes(samples);
  const initialPalette =
    mode === 'dominant'
      ? pickDominantPaletteColor(samples, averageColor, rankedVotes)
      : averageColor
        ? findClosestPaletteColor(averageColor)
        : null;

  return {
    samples,
    averageColor,
    averageLab,
    candidates: buildCandidatePaletteList(averageLab, rankedVotes, initialPalette),
    initialPalette,
    edgeStrength: 0,
    opaqueRatio: width * height > 0 ? samples.length / (width * height) : 0,
  };
}

function measureCellEdgeStrength(
  analyses: CellAnalysis[][],
  row: number,
  column: number,
): number {
  const current = analyses[row][column];
  if (!current.averageLab) {
    return 0;
  }

  const neighborLabs: LabColor[] = [];
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dy, dx] of offsets) {
    const neighbor = analyses[row + dy]?.[column + dx];
    if (neighbor?.averageLab) {
      neighborLabs.push(neighbor.averageLab);
    }
  }

  const neighborDistance =
    neighborLabs.length > 0
      ? neighborLabs.reduce((sum, lab) => sum + deltaE76(current.averageLab!, lab), 0) /
        neighborLabs.length
      : 0;
  const localVariance = getWeightedAverageDeltaE(current.samples, current.averageLab);
  return neighborDistance * 0.7 + localVariance * 0.5;
}

function annotateEdgeStrength(analyses: CellAnalysis[][]): void {
  for (let row = 0; row < analyses.length; row += 1) {
    for (let column = 0; column < analyses[row].length; column += 1) {
      analyses[row][column].edgeStrength = measureCellEdgeStrength(analyses, row, column);
    }
  }
}

function getCellGradientStrength(analysis: CellAnalysis, mode: PerlerPatternMode): number {
  if (!analysis.averageLab) {
    return 0;
  }

  const smoothness =
    clamp(1 - analysis.edgeStrength / DITHER_EDGE_LIMIT, 0, 1) *
    clamp((analysis.opaqueRatio - 0.15) / 0.85, 0, 1);

  if (smoothness <= 0) {
    return 0;
  }

  return smoothness * (mode === 'average' ? 1 : 0.82);
}

function createLabErrorGrid(rows: number, columns: number): LabColor[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ l: 0, a: 0, b: 0 })),
  );
}

function countColors(cells: PerlerPatternCell[][]): {
  counts: PerlerPatternColorCount[];
  totalBeads: number;
} {
  const countsMap = new Map<string, PerlerPatternColorCount>();
  let totalBeads = 0;

  for (const row of cells) {
    for (const cell of row) {
      if (cell.isTransparent) {
        continue;
      }

      totalBeads += 1;
      const existing = countsMap.get(cell.key);
      if (existing) {
        existing.count += 1;
      } else {
        countsMap.set(cell.key, {
          key: cell.key,
          color: cell.color,
          count: 1,
        });
      }
    }
  }

  const counts = Array.from(countsMap.values()).sort(
    (left, right) => right.count - left.count || left.key.localeCompare(right.key),
  );

  return { counts, totalBeads };
}

function cloneAssignments(
  assignments: Array<Array<InternalPaletteColor | null>>,
): Array<Array<InternalPaletteColor | null>> {
  return assignments.map((row) => row.slice());
}

function getNeighborAssignments(
  assignments: Array<Array<InternalPaletteColor | null>>,
  row: number,
  column: number,
): InternalPaletteColor[] {
  const neighbors: InternalPaletteColor[] = [];

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dy === 0 && dx === 0) {
        continue;
      }

      const neighbor = assignments[row + dy]?.[column + dx];
      if (neighbor) {
        neighbors.push(neighbor);
      }
    }
  }

  return neighbors;
}

function getProcessedDitherNeighbors(
  assignments: Array<Array<InternalPaletteColor | null>>,
  row: number,
  column: number,
  isReverse: boolean,
): InternalPaletteColor[] {
  const neighbors: InternalPaletteColor[] = [];
  const candidateOffsets = isReverse
    ? [
        [0, 1],
        [-1, -1],
        [-1, 0],
        [-1, 1],
      ]
    : [
        [0, -1],
        [-1, -1],
        [-1, 0],
        [-1, 1],
      ];

  for (const [dy, dx] of candidateOffsets) {
    const neighbor = assignments[row + dy]?.[column + dx];
    if (neighbor) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

function evaluatePaletteCandidate(
  analysis: CellAnalysis,
  candidate: InternalPaletteColor,
  neighbors: InternalPaletteColor[],
  current: InternalPaletteColor | null,
): number {
  const sampleError = getWeightedAverageDeltaE(analysis.samples, candidate.lab);
  const smoothness = clamp(1 - analysis.edgeStrength / 28, 0, 1) * clamp(analysis.opaqueRatio + 0.15, 0.35, 1);

  if (neighbors.length === 0 || smoothness <= 0) {
    return sampleError - (current?.key === candidate.key ? 0.35 : 0);
  }

  const averageNeighborDistance =
    neighbors.reduce((sum, neighbor) => sum + deltaE76(candidate.lab, neighbor.lab), 0) /
    neighbors.length;
  const sameNeighborCount = neighbors.filter((neighbor) => neighbor.key === candidate.key).length;
  const neighborPenalty = averageNeighborDistance * smoothness * 0.18;
  const coherenceBonus = sameNeighborCount * smoothness * 0.32;
  const stabilityBonus = current?.key === candidate.key ? 0.45 : 0;

  return sampleError + neighborPenalty - coherenceBonus - stabilityBonus;
}

function refinePaletteAssignments(
  analyses: CellAnalysis[][],
  assignments: Array<Array<InternalPaletteColor | null>>,
  passes: number,
): Array<Array<InternalPaletteColor | null>> {
  let currentAssignments = cloneAssignments(assignments);

  for (let pass = 0; pass < passes; pass += 1) {
    const nextAssignments = cloneAssignments(currentAssignments);
    const rowIndices =
      pass % 2 === 0
        ? Array.from({ length: analyses.length }, (_, index) => index)
        : Array.from({ length: analyses.length }, (_, index) => analyses.length - 1 - index);

    for (const row of rowIndices) {
      const isReverse = pass % 2 === 1 && row % 2 === 0;
      const columns = Array.from({ length: analyses[row].length }, (_, index) =>
        isReverse ? analyses[row].length - 1 - index : index,
      );

      for (const column of columns) {
        const analysis = analyses[row][column];
        if (!analysis.initialPalette || !analysis.candidates.length) {
          nextAssignments[row][column] = null;
          continue;
        }

        const neighbors = getNeighborAssignments(nextAssignments, row, column);
        let bestCandidate = currentAssignments[row][column] ?? analysis.initialPalette;
        let bestScore = evaluatePaletteCandidate(
          analysis,
          bestCandidate,
          neighbors,
          currentAssignments[row][column],
        );

        for (const candidate of analysis.candidates) {
          const score = evaluatePaletteCandidate(
            analysis,
            candidate,
            neighbors,
            currentAssignments[row][column],
          );
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }

        nextAssignments[row][column] = bestCandidate;
      }
    }

    currentAssignments = nextAssignments;
  }

  return currentAssignments;
}

function reduceIsolatedArtifacts(
  analyses: CellAnalysis[][],
  assignments: Array<Array<InternalPaletteColor | null>>,
): Array<Array<InternalPaletteColor | null>> {
  const nextAssignments = cloneAssignments(assignments);

  for (let row = 0; row < analyses.length; row += 1) {
    for (let column = 0; column < analyses[row].length; column += 1) {
      const analysis = analyses[row][column];
      const current = assignments[row][column];
      if (!analysis.initialPalette || !current) {
        continue;
      }

      if (analysis.edgeStrength > 18) {
        continue;
      }

      const neighbors = getNeighborAssignments(assignments, row, column);
      if (neighbors.length < 5) {
        continue;
      }

      const sameNeighborCount = neighbors.filter((neighbor) => neighbor.key === current.key).length;
      if (sameNeighborCount >= 2) {
        continue;
      }

      const majorityMap = new Map<string, { color: InternalPaletteColor; count: number }>();
      neighbors.forEach((neighbor) => {
        const existing = majorityMap.get(neighbor.key);
        if (existing) {
          existing.count += 1;
        } else {
          majorityMap.set(neighbor.key, { color: neighbor, count: 1 });
        }
      });

      const majority = Array.from(majorityMap.values()).sort(
        (left, right) => right.count - left.count,
      )[0];

      if (!majority || majority.count < 4) {
        continue;
      }

      const currentScore = evaluatePaletteCandidate(analysis, current, neighbors, current);
      const candidateScore = evaluatePaletteCandidate(analysis, majority.color, neighbors, current);

      if (candidateScore <= currentScore + 1.4) {
        nextAssignments[row][column] = majority.color;
      }
    }
  }

  return nextAssignments;
}

function buildDitherCandidateList(
  analysis: CellAnalysis,
  current: InternalPaletteColor | null,
  targetLab: LabColor,
): InternalPaletteColor[] {
  const candidates: InternalPaletteColor[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: InternalPaletteColor | null) => {
    if (!candidate || seen.has(candidate.key)) {
      return;
    }

    seen.add(candidate.key);
    candidates.push(candidate);
  };

  addCandidate(current);
  analysis.candidates.forEach((candidate) => addCandidate(candidate));
  findNearestPaletteCandidates(targetLab, 3).forEach((candidate) => addCandidate(candidate));
  return candidates;
}

function evaluateDitherCandidate(
  analysis: CellAnalysis,
  candidate: InternalPaletteColor,
  targetLab: LabColor,
  neighbors: InternalPaletteColor[],
  current: InternalPaletteColor | null,
  ditherStrength: number,
): number {
  const targetError = deltaE76(targetLab, candidate.lab);
  const sampleError = getWeightedAverageDeltaE(analysis.samples, candidate.lab) * 0.22;
  const sameNeighborCount = neighbors.filter((neighbor) => neighbor.key === candidate.key).length;
  const neighborPenalty =
    neighbors.length > 0
      ? (neighbors.reduce((sum, neighbor) => sum + deltaE76(candidate.lab, neighbor.lab), 0) /
          neighbors.length) *
        (1 - ditherStrength) *
        0.1
      : 0;
  const stabilityBonus = current?.key === candidate.key ? 0.28 : 0;
  const coherenceBonus = sameNeighborCount * 0.12;

  return targetError + sampleError + neighborPenalty - stabilityBonus - coherenceBonus;
}

function diffuseLabError(
  errorGrid: LabColor[][],
  row: number,
  column: number,
  error: LabColor,
  strength: number,
  isReverse: boolean,
): void {
  if (strength <= 0) {
    return;
  }

  const diffusion = isReverse
    ? [
        [0, -1, 7 / 16],
        [1, 1, 3 / 16],
        [1, 0, 5 / 16],
        [1, -1, 1 / 16],
      ]
    : [
        [0, 1, 7 / 16],
        [1, -1, 3 / 16],
        [1, 0, 5 / 16],
        [1, 1, 1 / 16],
      ];

  for (const [dy, dx, weight] of diffusion) {
    const target = errorGrid[row + dy]?.[column + dx];
    if (!target) {
      continue;
    }

    target.l += error.l * weight * strength;
    target.a += error.a * weight * strength;
    target.b += error.b * weight * strength;
  }
}

function applyControlledDithering(
  analyses: CellAnalysis[][],
  assignments: Array<Array<InternalPaletteColor | null>>,
  mode: PerlerPatternMode,
): Array<Array<InternalPaletteColor | null>> {
  const nextAssignments = cloneAssignments(assignments);
  const errorGrid = createLabErrorGrid(analyses.length, analyses[0]?.length ?? 0);

  for (let row = 0; row < analyses.length; row += 1) {
    const isReverse = row % 2 === 1;
    const columns = Array.from({ length: analyses[row].length }, (_, index) =>
      isReverse ? analyses[row].length - 1 - index : index,
    );

    for (const column of columns) {
      const analysis = analyses[row][column];
      const current = nextAssignments[row][column];
      if (!analysis.averageLab || !current) {
        continue;
      }

      const gradientStrength = getCellGradientStrength(analysis, mode);
      if (gradientStrength <= 0.12) {
        continue;
      }

      const adjustedTarget = addLabColors(
        analysis.averageLab,
        errorGrid[row][column],
        gradientStrength * DITHER_BASE_STRENGTH,
      );
      const neighbors = getProcessedDitherNeighbors(nextAssignments, row, column, isReverse);
      const candidates = buildDitherCandidateList(analysis, current, adjustedTarget);

      let bestCandidate = current;
      let bestScore = evaluateDitherCandidate(
        analysis,
        current,
        adjustedTarget,
        neighbors,
        current,
        gradientStrength,
      );

      for (const candidate of candidates) {
        const score = evaluateDitherCandidate(
          analysis,
          candidate,
          adjustedTarget,
          neighbors,
          current,
          gradientStrength,
        );
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      const currentScore = evaluateDitherCandidate(
        analysis,
        current,
        adjustedTarget,
        neighbors,
        current,
        gradientStrength,
      );
      const shouldSwap =
        bestCandidate.key !== current.key &&
        bestScore < currentScore - (0.35 - gradientStrength * 0.12);

      const finalCandidate = shouldSwap ? bestCandidate : current;
      nextAssignments[row][column] = finalCandidate;

      const quantizationError = subtractLabColors(adjustedTarget, finalCandidate.lab);
      diffuseLabError(
        errorGrid,
        row,
        column,
        quantizationError,
        gradientStrength * 0.9,
        isReverse,
      );
    }
  }

  return nextAssignments;
}

function assignmentsToCells(
  assignments: Array<Array<InternalPaletteColor | null>>,
): PerlerPatternCell[][] {
  return assignments.map((row) =>
    row.map((item) =>
      item
        ? {
            key: item.key,
            color: item.hex,
          }
        : { ...TRANSPARENT_CELL },
    ),
  );
}

function mergeSimilarColors(
  cells: PerlerPatternCell[][],
  similarityThreshold: number,
): PerlerPatternCell[][] {
  const effectiveThreshold = similarityThreshold * MERGE_DISTANCE_SCALE;
  if (effectiveThreshold <= 0) {
    return cells;
  }

  const { counts } = countColors(cells);
  if (counts.length < 2) {
    return cells;
  }

  const colorByKey = new Map(perlerPalette.map((color) => [color.key, color]));
  const countByKey = new Map(counts.map((item) => [item.key, item.count]));
  const replacements = new Map<string, InternalPaletteColor>();
  const replacedKeys = new Set<string>();

  for (let index = 0; index < counts.length; index += 1) {
    const current = counts[index];
    if (replacedKeys.has(current.key)) {
      continue;
    }

    const currentColor = colorByKey.get(current.key);
    if (!currentColor) {
      continue;
    }

    for (let candidateIndex = index + 1; candidateIndex < counts.length; candidateIndex += 1) {
      const candidate = counts[candidateIndex];
      if (replacedKeys.has(candidate.key)) {
        continue;
      }

      const candidateColor = colorByKey.get(candidate.key);
      if (!candidateColor) {
        continue;
      }

      const currentCount = countByKey.get(current.key) ?? 0;
      const candidateCount = countByKey.get(candidate.key) ?? 0;
      if (candidateCount >= currentCount * 0.9) {
        continue;
      }

      if (deltaE76(currentColor.lab, candidateColor.lab) <= effectiveThreshold) {
        replacements.set(candidate.key, currentColor);
        replacedKeys.add(candidate.key);
      }
    }
  }

  if (replacements.size === 0) {
    return cells;
  }

  return cells.map((row) =>
    row.map((cell) => {
      if (cell.isTransparent) {
        return cell;
      }

      const replacement = replacements.get(cell.key);
      if (!replacement) {
        return cell;
      }

      return {
        key: replacement.key,
        color: replacement.hex,
      };
    }),
  );
}

async function loadImageData(imageUrl: string): Promise<ImageData> {
  let objectUrl: string | null = null;

  try {
    const resolvedUrl = imageUrl.startsWith('data:')
      ? imageUrl
      : await (async () => {
          const response = await fetchImageAsset(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch source image: ${response.status}`);
          }

          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          return objectUrl;
        })();

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode source image'));
      element.src = resolvedUrl;
    });

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create canvas context');
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function buildPatternGrid(
  imageData: ImageData,
  columns: number,
  rows: number,
  settings: Required<PerlerPatternOptions>,
): PerlerPatternCell[][] {
  const analyses: CellAnalysis[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({
      samples: [],
      averageColor: null,
      averageLab: null,
      candidates: [],
      initialPalette: null,
      edgeStrength: 0,
      opaqueRatio: 0,
    })),
  );
  const cellWidth = imageData.width / columns;
  const cellHeight = imageData.height / rows;
  const samplingThreshold = getCellSamplingThreshold(settings.transparentThreshold);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startX = Math.floor(column * cellWidth);
      const startY = Math.floor(row * cellHeight);
      const endX = Math.min(imageData.width, Math.ceil((column + 1) * cellWidth));
      const endY = Math.min(imageData.height, Math.ceil((row + 1) * cellHeight));
      const width = Math.max(1, endX - startX);
      const height = Math.max(1, endY - startY);
      analyses[row][column] = buildCellAnalysis(
        imageData,
        startX,
        startY,
        width,
        height,
        settings.mode,
        samplingThreshold,
      );
    }
  }

  annotateEdgeStrength(analyses);

  let assignments = analyses.map((row) =>
    row.map((analysis) => analysis.initialPalette),
  );

  assignments = refinePaletteAssignments(
    analyses,
    assignments,
    settings.mode === 'average' ? 3 : 2,
  );
  assignments = reduceIsolatedArtifacts(analyses, assignments);
  assignments = applyControlledDithering(analyses, assignments, settings.mode);

  return mergeSimilarColors(assignmentsToCells(assignments), settings.similarityThreshold);
}

export async function generatePerlerPattern(
  imageUrl: string,
  options: PerlerPatternOptions,
): Promise<PerlerPatternResult> {
  const settings: Required<PerlerPatternOptions> = {
    ...DEFAULT_SETTINGS,
    ...options,
    columns: clamp(Math.round(options.columns), 12, 96),
    similarityThreshold: clamp(Math.round(options.similarityThreshold), 0, 120),
    transparentThreshold: clamp(
      Math.round(options.transparentThreshold ?? DEFAULT_SETTINGS.transparentThreshold),
      0,
      255,
    ),
  };

  const rawImageData = await loadImageData(imageUrl);
  const croppedImageData = cropImageData(rawImageData, settings.transparentThreshold);
  const aspectRatio = croppedImageData.height / croppedImageData.width;
  const rows = clamp(Math.round(settings.columns * aspectRatio), 12, 96);
  const analysisImageData = resampleImageData(
    croppedImageData,
    Math.max(settings.columns * ANALYSIS_SCALE, settings.columns),
    Math.max(rows * ANALYSIS_SCALE, rows),
  );
  const cells = buildPatternGrid(analysisImageData, settings.columns, rows, settings);
  const { counts, totalBeads } = countColors(cells);

  return {
    columns: settings.columns,
    rows,
    totalBeads,
    colorCounts: counts,
    cells,
    settings,
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
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const highlightColor = options.highlightColor?.toUpperCase() || null;
  const displayColorSystem = options.displayColorSystem ?? 'MARD';
  const showCellCodes = options.showCellCodes ?? true;

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
  context.fillText(options.title ?? 'Perler Pattern', leftGutter, 34);

  context.fillStyle = '#4B5563';
  context.font = '500 12px Inter, system-ui, sans-serif';
  const defaultSummary = `${pattern.columns} x ${pattern.rows} · ${pattern.totalBeads} beads · ${pattern.colorCounts.length} colors · ${pattern.settings.mode}`;
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

      if (highlightColor && !cell.isTransparent && cell.color.toUpperCase() !== highlightColor) {
        context.fillStyle = 'rgba(17, 24, 39, 0.56)';
        context.fillRect(x, y, cellSize, cellSize);
      }

      context.strokeStyle = '#D1D5DB';
      context.strokeRect(x, y, cellSize, cellSize);

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

  const legendTop = top + gridHeight + 24;
  const legendWidth =
    (contentWidth - leftGutter - rightGutter - legendGap * (legendColumns - 1)) / legendColumns;

  context.fillStyle = '#111111';
  context.font = '700 14px Inter, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('Color Legend', leftGutter, legendTop - 8);

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
