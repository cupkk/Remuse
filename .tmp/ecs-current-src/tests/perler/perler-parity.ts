import assert from 'node:assert/strict';
import colorSystemMapping from '../../perler-beads-master/src/app/colorSystemMapping.json';
import {
  generatePerlerPatternFromImageData,
  type PerlerImageDataLike,
  type PerlerPatternCell,
  type PerlerPatternMode,
  type PerlerPatternResult,
} from '../../services/perlerPattern.ts';

const TRANSPARENT_KEY = 'ERASE';
const transparentColorData = {
  key: TRANSPARENT_KEY,
  color: '#FFFFFF',
  isExternal: true,
};

type PaletteColor = {
  key: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
};

type MappedPixel = {
  key: string;
  color: string;
  isExternal?: boolean;
};

function referenceHexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function referenceColorDistance(rgb1: { r: number; g: number; b: number }, rgb2: { r: number; g: number; b: number }) {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function referenceFindClosestPaletteColor(targetRgb: { r: number; g: number; b: number }, palette: PaletteColor[]) {
  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const paletteColor of palette) {
    const distance = referenceColorDistance(targetRgb, paletteColor.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    if (distance === 0) {
      break;
    }
  }

  return closestColor;
}

function referenceCalculateCellRepresentativeColor(
  imageData: PerlerImageDataLike,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PerlerPatternMode,
) {
  const data = imageData.data;
  const imgWidth = imageData.width;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let pixelCount = 0;
  const colorCountsInCell: Record<string, number> = {};
  let dominantColorRgb: { r: number; g: number; b: number } | null = null;
  let maxCount = 0;

  const endX = startX + width;
  const endY = startY + height;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * imgWidth + x) * 4;
      if (data[index + 3] < 128) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      pixelCount += 1;

      if (mode === 'average') {
        rSum += r;
        gSum += g;
        bSum += b;
      } else {
        const colorKey = `${r},${g},${b}`;
        colorCountsInCell[colorKey] = (colorCountsInCell[colorKey] || 0) + 1;
        if (colorCountsInCell[colorKey] > maxCount) {
          maxCount = colorCountsInCell[colorKey];
          dominantColorRgb = { r, g, b };
        }
      }
    }
  }

  if (pixelCount === 0) {
    return null;
  }

  if (mode === 'average') {
    return {
      r: Math.round(rSum / pixelCount),
      g: Math.round(gSum / pixelCount),
      b: Math.round(bSum / pixelCount),
    };
  }

  return dominantColorRgb;
}

function referenceCalculatePixelGrid(
  imageData: PerlerImageDataLike,
  columns: number,
  rows: number,
  palette: PaletteColor[],
  mode: PerlerPatternMode,
) {
  const mappedData: MappedPixel[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ key: palette[0].key, color: palette[0].hex })),
  );
  const cellWidthOriginal = imageData.width / columns;
  const cellHeightOriginal = imageData.height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startXOriginal = Math.floor(column * cellWidthOriginal);
      const startYOriginal = Math.floor(row * cellHeightOriginal);
      const endXOriginal = Math.min(imageData.width, Math.ceil((column + 1) * cellWidthOriginal));
      const endYOriginal = Math.min(imageData.height, Math.ceil((row + 1) * cellHeightOriginal));
      const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
      const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

      const representativeRgb = referenceCalculateCellRepresentativeColor(
        imageData,
        startXOriginal,
        startYOriginal,
        currentCellWidth,
        currentCellHeight,
        mode,
      );

      mappedData[row][column] = representativeRgb
        ? {
            key: referenceFindClosestPaletteColor(representativeRgb, palette).key,
            color: referenceFindClosestPaletteColor(representativeRgb, palette).hex,
          }
        : { ...transparentColorData };
    }
  }

  return mappedData;
}

type TestOptions = {
  columns: number;
  similarityThreshold: number;
  mode: PerlerPatternMode;
};

function buildPalette(): PaletteColor[] {
  return Object.entries(colorSystemMapping)
    .map(([hex, entry]) => {
      const rgb = referenceHexToRgb(hex);
      const key = (entry as Record<string, string>).MARD;
      if (!rgb || !key) {
        return null;
      }

      return {
        key,
        hex: hex.toUpperCase(),
        rgb,
      };
    })
    .filter((color): color is PaletteColor => color !== null);
}

function fillRect(
  imageData: PerlerImageDataLike,
  x: number,
  y: number,
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a?: number },
) {
  const alpha = color.a ?? 255;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const index = (row * imageData.width + column) * 4;
      imageData.data[index] = color.r;
      imageData.data[index + 1] = color.g;
      imageData.data[index + 2] = color.b;
      imageData.data[index + 3] = alpha;
    }
  }
}

function buildSyntheticImageData(): PerlerImageDataLike {
  const width = 24;
  const height = 18;
  const imageData: PerlerImageDataLike = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };

  fillRect(imageData, 0, 0, width, height, { r: 0, g: 0, b: 0, a: 0 });
  fillRect(imageData, 0, 0, 8, 9, { r: 249, g: 238, b: 90 });
  fillRect(imageData, 8, 0, 8, 9, { r: 246, g: 216, b: 54 });
  fillRect(imageData, 16, 0, 8, 9, { r: 97, g: 242, b: 73 });
  fillRect(imageData, 0, 9, 8, 9, { r: 39, g: 82, b: 58 });
  fillRect(imageData, 8, 9, 8, 9, { r: 254, g: 157, b: 114 });
  fillRect(imageData, 16, 9, 8, 9, { r: 29, g: 157, b: 79 });

  // Add a few stray pixels and semi-transparent pixels to exercise dominant/average and alpha handling.
  fillRect(imageData, 7, 8, 2, 2, { r: 255, g: 255, b: 255, a: 40 });
  fillRect(imageData, 15, 8, 2, 2, { r: 255, g: 140, b: 90, a: 255 });
  fillRect(imageData, 4, 13, 1, 1, { r: 255, g: 255, b: 255, a: 255 });
  fillRect(imageData, 17, 12, 1, 1, { r: 240, g: 240, b: 30, a: 255 });
  return imageData;
}

function mergeReferenceColors(
  cells: MappedPixel[][],
  palette: PaletteColor[],
  similarityThreshold: number,
): MappedPixel[][] {
  if (similarityThreshold <= 0) {
    return cells.map((row) => row.map((cell) => ({ ...cell })));
  }

  const keyToRgbMap = new Map<string, PaletteColor['rgb']>();
  const keyToColorDataMap = new Map<string, PaletteColor>();
  palette.forEach((color) => {
    keyToRgbMap.set(color.key, color.rgb);
    keyToColorDataMap.set(color.key, color);
  });

  const initialColorCounts: Record<string, number> = {};
  cells.flat().forEach((cell) => {
    if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
    }
  });

  const colorsByFrequency = Object.entries(initialColorCounts)
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);

  const mergedData = cells.map((row) => row.map((cell) => ({ ...cell, isExternal: cell.isExternal ?? false })));
  const replacedColors = new Set<string>();

  for (let index = 0; index < colorsByFrequency.length; index += 1) {
    const currentKey = colorsByFrequency[index];
    if (replacedColors.has(currentKey)) {
      continue;
    }

    const currentRgb = keyToRgbMap.get(currentKey);
    if (!currentRgb) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < colorsByFrequency.length; nextIndex += 1) {
      const lowerFrequencyKey = colorsByFrequency[nextIndex];
      if (replacedColors.has(lowerFrequencyKey)) {
        continue;
      }

      const lowerFrequencyRgb = keyToRgbMap.get(lowerFrequencyKey);
      if (!lowerFrequencyRgb) {
        continue;
      }

      const distance = referenceColorDistance(currentRgb, lowerFrequencyRgb);
      if (distance >= similarityThreshold) {
        continue;
      }

      replacedColors.add(lowerFrequencyKey);
      const replacement = keyToColorDataMap.get(currentKey);
      if (!replacement) {
        continue;
      }

      for (let row = 0; row < mergedData.length; row += 1) {
        for (let column = 0; column < mergedData[row].length; column += 1) {
          if (mergedData[row][column].key === lowerFrequencyKey) {
            mergedData[row][column] = {
              key: currentKey,
              color: replacement.hex,
              isExternal: false,
            };
          }
        }
      }
    }
  }

  return mergedData;
}

function normalizeReferenceCells(cells: MappedPixel[][]): PerlerPatternCell[][] {
  return cells.map((row) =>
    row.map((cell) => {
      if (cell.isExternal || cell.key === TRANSPARENT_KEY) {
        return {
          key: TRANSPARENT_KEY,
          color: transparentColorData.color,
          isTransparent: true,
        };
      }

      return {
        key: cell.key,
        color: cell.color.toUpperCase(),
      };
    }),
  );
}

function countNormalizedCells(cells: PerlerPatternCell[]) {
  const counts = new Map<string, number>();
  let total = 0;
  cells.forEach((cell) => {
    if (cell.isTransparent) {
      return;
    }

    total += 1;
    const key = `${cell.key}|${cell.color.toUpperCase()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return {
    total,
    counts: Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)),
  };
}

function flattenCellSignature(cells: PerlerPatternCell[][]): string[] {
  return cells.flat().map((cell) =>
    cell.isTransparent ? `ERASE|${cell.color.toUpperCase()}` : `${cell.key}|${cell.color.toUpperCase()}`,
  );
}

function buildReferencePattern(imageData: PerlerImageDataLike, options: TestOptions) {
  const palette = buildPalette();
  const rows = Math.max(1, Math.round(options.columns * (imageData.height / imageData.width)));
  const stubContext = {
    getImageData: () => imageData,
  } as unknown as CanvasRenderingContext2D;

  void stubContext;
  const initialCells = referenceCalculatePixelGrid(imageData, options.columns, rows, palette, options.mode);
  const mergedCells = mergeReferenceColors(initialCells, palette, options.similarityThreshold);
  return normalizeReferenceCells(mergedCells);
}

function normalizePatternCounts(pattern: PerlerPatternResult) {
  return pattern.colorCounts
    .map((color) => [`${color.key}|${color.color.toUpperCase()}`, color.count] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

const imageData = buildSyntheticImageData();
const testCases: TestOptions[] = [
  { columns: 12, similarityThreshold: 0, mode: 'dominant' },
  { columns: 12, similarityThreshold: 30, mode: 'dominant' },
  { columns: 12, similarityThreshold: 30, mode: 'average' },
];

for (const testCase of testCases) {
  const referenceCells = buildReferencePattern(imageData, testCase);
  const mainPattern = generatePerlerPatternFromImageData(imageData, testCase);

  assert.equal(mainPattern.columns, testCase.columns);
  assert.equal(mainPattern.rows, Math.max(1, Math.round(testCase.columns * (imageData.height / imageData.width))));
  assert.deepEqual(
    flattenCellSignature(mainPattern.cells),
    flattenCellSignature(referenceCells),
    `Perler cell grid diverged for ${JSON.stringify(testCase)}`,
  );

  const referenceCounts = countNormalizedCells(referenceCells.flat());
  assert.equal(
    mainPattern.totalBeads,
    referenceCounts.total,
    `Total bead count diverged for ${JSON.stringify(testCase)}`,
  );
  assert.deepEqual(
    normalizePatternCounts(mainPattern),
    referenceCounts.counts,
    `Color counts diverged for ${JSON.stringify(testCase)}`,
  );
}

console.log('Perler parity checks passed.');
