import colorSystemMapping from '../perler-beads-master/src/app/colorSystemMapping.json';
import { fetchImageAsset } from './imageUtils';

export type PerlerPatternMode = 'dominant' | 'average';
export type PerlerColorSystem = string;

interface ColorSystemEntry {
  [system: string]: string | undefined;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface PerlerImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface InternalPaletteColor extends PerlerPaletteColor {
  key: string;
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
};

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
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
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
  if (palette === perlerPalette) {
    const cacheKey = getPaletteCacheKey(targetRgb);
    const cached = closestPaletteCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let closest = palette[0];
    let minDistance = Number.POSITIVE_INFINITY;
    for (const paletteColor of palette) {
      const distance = colorDistance(targetRgb, paletteColor.rgb);
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
    const distance = colorDistance(targetRgb, paletteColor.rgb);
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
  const response = await fetchImageAsset(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode perler source image'));
      element.src = objectUrl;
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
    URL.revokeObjectURL(objectUrl);
  }
}

function calculateCellRepresentativeColor(
  imageData: PerlerImageDataLike,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PerlerPatternMode,
  alphaThreshold: number,
): RgbColor | null {
  const { data } = imageData;
  const imageWidth = imageData.width;
  const endX = startX + width;
  const endY = startY + height;

  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let opaquePixelCount = 0;
  const colorCounts: Record<string, number> = {};
  let dominantColor: RgbColor | null = null;
  let maxCount = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pixelIndex = (y * imageWidth + x) * 4;
      if (data[pixelIndex + 3] < alphaThreshold) {
        continue;
      }

      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      opaquePixelCount += 1;

      if (mode === 'average') {
        redSum += r;
        greenSum += g;
        blueSum += b;
      } else {
        const colorKey = `${r},${g},${b}`;
        colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
        if (colorCounts[colorKey] > maxCount) {
          maxCount = colorCounts[colorKey];
          dominantColor = { r, g, b };
        }
      }
    }
  }

  if (opaquePixelCount === 0) {
    return null;
  }

  if (mode === 'average') {
    return {
      r: Math.round(redSum / opaquePixelCount),
      g: Math.round(greenSum / opaquePixelCount),
      b: Math.round(blueSum / opaquePixelCount),
    };
  }

  return dominantColor;
}

function calculatePixelGrid(
  imageData: PerlerImageDataLike,
  columns: number,
  rows: number,
  palette: InternalPaletteColor[],
  mode: PerlerPatternMode,
  alphaThreshold: number,
): PerlerPatternCell[][] {
  const mappedData: PerlerPatternCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ ...TRANSPARENT_CELL })),
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
      );

      if (!representativeRgb) {
        mappedData[row][column] = { ...TRANSPARENT_CELL };
        continue;
      }

      const closestBead = findClosestPaletteColor(representativeRgb, palette);
      mappedData[row][column] = {
        key: closestBead.key,
        color: closestBead.hex,
      };
    }
  }

  return mappedData;
}

function mergeSimilarColors(
  cells: PerlerPatternCell[][],
  similarityThreshold: number,
): PerlerPatternCell[][] {
  if (similarityThreshold <= 0) {
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

      const distance = colorDistance(currentColor.rgb, lowerFrequencyColor.rgb);
      if (distance >= similarityThreshold) {
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
    mode: options.mode === 'average' ? 'average' : 'dominant',
  };

  const aspectRatio = imageData.height / imageData.width;
  const rows = Math.max(1, Math.round(settings.columns * aspectRatio));
  const initialCells = calculatePixelGrid(
    imageData,
    settings.columns,
    rows,
    perlerPalette,
    settings.mode,
    settings.transparentThreshold,
  );
  const cells = mergeSimilarColors(initialCells, settings.similarityThreshold);
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
