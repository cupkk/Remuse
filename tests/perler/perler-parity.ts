import assert from 'node:assert/strict';
import {
  generatePerlerPatternFromImageData,
  type PerlerImageDataLike,
  type PerlerPatternMode,
} from '../../services/perlerPattern.ts';

type TestCase = {
  columns: number;
  similarityThreshold: number;
  mode: PerlerPatternMode;
  expected: {
    rows: number;
    totalBeads: number;
    rowKeys: string[];
    counts: string[];
  };
};

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

  // Stray and semi-transparent pixels exercise alpha handling, dominant voting, and merge behavior.
  fillRect(imageData, 7, 8, 2, 2, { r: 255, g: 255, b: 255, a: 40 });
  fillRect(imageData, 15, 8, 2, 2, { r: 255, g: 140, b: 90, a: 255 });
  fillRect(imageData, 4, 13, 1, 1, { r: 255, g: 255, b: 255, a: 255 });
  fillRect(imageData, 17, 12, 1, 1, { r: 240, g: 240, b: 30, a: 255 });

  return imageData;
}

function getRowKeySignatures(imageData: ReturnType<typeof generatePerlerPatternFromImageData>) {
  return imageData.cells.map((row) => row.map((cell) => (cell.isTransparent ? 'ERASE' : cell.key)).join(' '));
}

function getCountSignatures(imageData: ReturnType<typeof generatePerlerPatternFromImageData>) {
  return imageData.colorCounts.map((item) => `${item.key}|${item.color.toUpperCase()}|${item.count}`);
}

const testCases: TestCase[] = [
  {
    columns: 12,
    similarityThreshold: 0,
    mode: 'dominant',
    expected: {
      rows: 9,
      totalBeads: 108,
      rowKeys: [
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'B17 B17 B17 B17 A13 A13 A13 A07 A07 R05 R05 R05',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
      ],
      counts: [
        'A04|#FBED56|16',
        'A05|#F4D738|16',
        'B02|#63F347|16',
        'B09|#27523A|16',
        'A12|#FE9F72|16',
        'B08|#1C9C4F|16',
        'B17|#9BB13A|4',
        'A13|#FFC365|3',
        'R05|#35C75B|3',
        'A07|#FE8B4C|2',
      ],
    },
  },
  {
    columns: 12,
    similarityThreshold: 30,
    mode: 'dominant',
    expected: {
      rows: 9,
      totalBeads: 108,
      rowKeys: [
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'A04 A04 A04 A04 A05 A05 A05 A05 B02 B02 B02 B02',
        'B17 B17 B17 B17 A05 A05 A05 A12 A12 B02 B02 B02',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
      ],
      counts: [
        'A05|#F4D738|19',
        'B02|#63F347|19',
        'A12|#FE9F72|18',
        'A04|#FBED56|16',
        'B09|#27523A|16',
        'B08|#1C9C4F|16',
        'B17|#9BB13A|4',
      ],
    },
  },
  {
    columns: 12,
    similarityThreshold: 30,
    mode: 'average',
    expected: {
      rows: 9,
      totalBeads: 108,
      rowKeys: [
        'A05 A05 A05 A05 A05 A05 A05 A05 B02 B02 B02 B02',
        'A05 A05 A05 A05 A05 A05 A05 A05 B02 B02 B02 B02',
        'A05 A05 A05 A05 A05 A05 A05 A05 B02 B02 B02 B02',
        'A05 A05 A05 A05 A05 A05 A05 A05 B02 B02 B02 B02',
        'B17 B17 A05 B17 A05 A05 A05 A12 B17 B02 B02 B02',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B17 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
        'B09 B09 B09 B09 A12 A12 A12 A12 B08 B08 B08 B08',
      ],
      counts: [
        'A05|#F4D738|36',
        'B02|#63F347|19',
        'A12|#FE9F72|17',
        'B09|#27523A|16',
        'B08|#1C9C4F|15',
        'B17|#9BB13A|5',
      ],
    },
  },
];

const imageData = buildSyntheticImageData();

for (const testCase of testCases) {
  const pattern = generatePerlerPatternFromImageData(imageData, testCase);

  assert.equal(pattern.columns, testCase.columns);
  assert.equal(pattern.rows, testCase.expected.rows, `Perler row count diverged for ${JSON.stringify(testCase)}`);
  assert.equal(
    pattern.totalBeads,
    testCase.expected.totalBeads,
    `Perler bead total diverged for ${JSON.stringify(testCase)}`,
  );
  assert.deepEqual(
    getRowKeySignatures(pattern),
    testCase.expected.rowKeys,
    `Perler row grid diverged for ${JSON.stringify(testCase)}`,
  );
  assert.deepEqual(
    getCountSignatures(pattern),
    testCase.expected.counts,
    `Perler color counts diverged for ${JSON.stringify(testCase)}`,
  );
}

console.log('Perler parity checks passed.');
