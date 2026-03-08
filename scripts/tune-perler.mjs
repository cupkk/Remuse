import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const mapping = JSON.parse(
  fs.readFileSync('perler-beads-master/src/app/colorSystemMapping.json', 'utf8'),
);

const palette = Object.entries(mapping)
  .map(([hex, entry]) => ({ hex, key: entry.MARD }))
  .filter((item) => item.key)
  .map((item) => {
    const rgb = {
      r: parseInt(item.hex.slice(1, 3), 16),
      g: parseInt(item.hex.slice(3, 5), 16),
      b: parseInt(item.hex.slice(5, 7), 16),
    };

    return {
      ...item,
      rgb,
      lab: rgbToLab(rgb),
    };
  });

const sampleFiles = [
  'uploads/stickers/64eca5e7-a755-486c-897c-0199ec21ebb5/9aac616c-dfc6-4c31-b239-38e6f5709ab4.png',
  'uploads/stickers/64eca5e7-a755-486c-897c-0199ec21ebb5/f8e8a55a-94e0-4ed1-9bf3-d7aa3b74797d.png',
  'uploads/stickers/bd36466d-8936-400d-9eb9-709f3e692e4f/00f249aa-89df-4cc1-9f74-ad8d258f8f9a.webp',
];

const CONFIG = {
  columns: 32,
  transparentThreshold: 128,
  analysisScale: 4,
  similarityThreshold: 14,
  mode: 'dominant',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function srgbChannelToLinear(channel) {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(color) {
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

function deltaE76(left, right) {
  const dl = left.l - right.l;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function spatialWeight(x, y, width, height) {
  if (width <= 1 && height <= 1) {
    return 1;
  }

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radius = Math.max(1, Math.hypot(centerX, centerY));
  const normalizedDistance = Math.min(1, Math.hypot(x - centerX, y - centerY) / radius);
  return 1.18 - normalizedDistance * 0.28;
}

function findClosestPaletteColorByLab(target) {
  let closest = palette[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const paletteColor of palette) {
    const distance = deltaE76(target, paletteColor.lab);
    if (distance < minDistance) {
      minDistance = distance;
      closest = paletteColor;
    }
  }

  return closest;
}

function getWeightedAverageColor(samples) {
  if (!samples.length) {
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

function getWeightedAverageDeltaE(samples, target) {
  if (!samples.length) {
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

function rankPaletteVotes(samples) {
  const voteMap = new Map();

  for (const sample of samples) {
    const closest = findClosestPaletteColorByLab(sample.lab);
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
    (left, right) => right.score - left.score || left.distanceTotal - right.distanceTotal,
  );
}

function pickDominantPaletteColor(samples, averageColor, rankedVotes) {
  if (!averageColor || !samples.length) {
    return null;
  }

  if (rankedVotes.length === 0) {
    return findClosestPaletteColorByLab(rgbToLab(averageColor));
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

  return findClosestPaletteColorByLab(rgbToLab(averageColor));
}

function findNearestPaletteCandidates(target, limit) {
  return palette
    .map((color) => ({ color, distance: deltaE76(target, color.lab) }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map((item) => item.color);
}

function buildCandidatePaletteList(averageLab, rankedVotes, initialPalette) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
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

function evaluatePaletteCandidate(analysis, candidate, neighbors, current) {
  const sampleError = getWeightedAverageDeltaE(analysis.samples, candidate.lab);
  const smoothness =
    clamp(1 - analysis.edgeStrength / 28, 0, 1) * clamp(analysis.opaqueRatio + 0.15, 0.35, 1);

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

function cloneAssignments(assignments) {
  return assignments.map((row) => row.slice());
}

function getNeighborAssignments(assignments, row, column) {
  const neighbors = [];

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

function refinePaletteAssignments(analyses, assignments, passes) {
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

function reduceIsolatedArtifacts(analyses, assignments) {
  const nextAssignments = cloneAssignments(assignments);

  for (let row = 0; row < analyses.length; row += 1) {
    for (let column = 0; column < analyses[row].length; column += 1) {
      const analysis = analyses[row][column];
      const current = assignments[row][column];
      if (!analysis.initialPalette || !current || analysis.edgeStrength > 18) {
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

      const majorityMap = new Map();
      neighbors.forEach((neighbor) => {
        const existing = majorityMap.get(neighbor.key);
        if (existing) {
          existing.count += 1;
        } else {
          majorityMap.set(neighbor.key, { color: neighbor, count: 1 });
        }
      });

      const majority = Array.from(majorityMap.values()).sort((left, right) => right.count - left.count)[0];
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

function clampLabColor(color) {
  return {
    l: clamp(color.l, 0, 100),
    a: clamp(color.a, -128, 127),
    b: clamp(color.b, -128, 127),
  };
}

function addLabColors(base, delta, scale = 1) {
  return clampLabColor({
    l: base.l + delta.l * scale,
    a: base.a + delta.a * scale,
    b: base.b + delta.b * scale,
  });
}

function subtractLabColors(left, right) {
  return {
    l: left.l - right.l,
    a: left.a - right.a,
    b: left.b - right.b,
  };
}

function createLabErrorGrid(rows, columns) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ l: 0, a: 0, b: 0 })),
  );
}

function getCellGradientStrength(analysis, mode, edgeLimit) {
  if (!analysis.averageLab) {
    return 0;
  }

  const smoothness =
    clamp(1 - analysis.edgeStrength / edgeLimit, 0, 1) *
    clamp((analysis.opaqueRatio - 0.15) / 0.85, 0, 1);

  if (smoothness <= 0) {
    return 0;
  }

  return smoothness * (mode === 'average' ? 1 : 0.82);
}

function getProcessedDitherNeighbors(assignments, row, column, isReverse) {
  const neighbors = [];
  const offsets = isReverse
    ? [[0, 1], [-1, -1], [-1, 0], [-1, 1]]
    : [[0, -1], [-1, -1], [-1, 0], [-1, 1]];

  for (const [dy, dx] of offsets) {
    const neighbor = assignments[row + dy]?.[column + dx];
    if (neighbor) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

function buildDitherCandidateList(analysis, current, targetLab) {
  const candidates = [];
  const seen = new Set();

  const add = (candidate) => {
    if (!candidate || seen.has(candidate.key)) {
      return;
    }

    seen.add(candidate.key);
    candidates.push(candidate);
  };

  add(current);
  analysis.candidates.forEach(add);
  findNearestPaletteCandidates(targetLab, 3).forEach(add);
  return candidates;
}

function evaluateDitherCandidate(analysis, candidate, targetLab, neighbors, current, ditherStrength) {
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

function diffuseLabError(errorGrid, row, column, error, strength, isReverse) {
  const diffusion = isReverse
    ? [[0, -1, 7 / 16], [1, 1, 3 / 16], [1, 0, 5 / 16], [1, -1, 1 / 16]]
    : [[0, 1, 7 / 16], [1, -1, 3 / 16], [1, 0, 5 / 16], [1, 1, 1 / 16]];

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

function applyControlledDithering(analyses, assignments, mode, ditherStrength, edgeLimit) {
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

      const gradientStrength = getCellGradientStrength(analysis, mode, edgeLimit);
      if (gradientStrength <= 0.12) {
        continue;
      }

      const adjustedTarget = addLabColors(
        analysis.averageLab,
        errorGrid[row][column],
        gradientStrength * ditherStrength,
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
      diffuseLabError(
        errorGrid,
        row,
        column,
        subtractLabColors(adjustedTarget, finalCandidate.lab),
        gradientStrength * 0.9,
        isReverse,
      );
    }
  }

  return nextAssignments;
}

function mergeSimilarColors(assignments, threshold) {
  const effectiveThreshold = threshold * 0.45;
  if (effectiveThreshold <= 0) {
    return assignments;
  }

  const counts = new Map();
  for (const row of assignments) {
    for (const cell of row) {
      if (!cell) {
        continue;
      }

      counts.set(cell.key, (counts.get(cell.key) ?? 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const replacements = new Map();
  const replacedKeys = new Set();

  for (let i = 0; i < sorted.length; i += 1) {
    const [currentKey, currentCount] = sorted[i];
    if (replacedKeys.has(currentKey)) {
      continue;
    }

    const current = palette.find((item) => item.key === currentKey);
    if (!current) {
      continue;
    }

    for (let j = i + 1; j < sorted.length; j += 1) {
      const [candidateKey, candidateCount] = sorted[j];
      if (replacedKeys.has(candidateKey) || candidateCount >= currentCount * 0.9) {
        continue;
      }

      const candidate = palette.find((item) => item.key === candidateKey);
      if (!candidate) {
        continue;
      }

      if (deltaE76(current.lab, candidate.lab) <= effectiveThreshold) {
        replacements.set(candidateKey, current);
        replacedKeys.add(candidateKey);
      }
    }
  }

  return assignments.map((row) =>
    row.map((cell) => (cell ? replacements.get(cell.key) ?? cell : null)),
  );
}

async function loadAnalyses(file) {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const cropAlphaThreshold = Math.max(12, Math.round(CONFIG.transparentThreshold * 0.25));
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha < cropAlphaThreshold) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const padding = Math.max(1, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.02));
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(info.width - cropX, maxX - minX + 1 + padding * 2);
  const cropHeight = Math.min(info.height - cropY, maxY - minY + 1 + padding * 2);
  const rows = clamp(Math.round(CONFIG.columns * (cropHeight / cropWidth)), 12, 96);
  const targetWidth = Math.max(CONFIG.columns * CONFIG.analysisScale, CONFIG.columns);
  const targetHeight = Math.max(rows * CONFIG.analysisScale, rows);
  const { data: analysisData, info: analysisInfo } = await sharp(file)
    .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    .ensureAlpha()
    .resize(targetWidth, targetHeight, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cellWidth = analysisInfo.width / CONFIG.columns;
  const cellHeight = analysisInfo.height / rows;
  const samplingThreshold = Math.max(10, Math.min(96, Math.round(CONFIG.transparentThreshold * 0.45)));
  const analyses = Array.from({ length: rows }, () => Array.from({ length: CONFIG.columns }, () => null));

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < CONFIG.columns; column += 1) {
      const startX = Math.floor(column * cellWidth);
      const startY = Math.floor(row * cellHeight);
      const endX = Math.min(analysisInfo.width, Math.ceil((column + 1) * cellWidth));
      const endY = Math.min(analysisInfo.height, Math.ceil((row + 1) * cellHeight));
      const width = Math.max(1, endX - startX);
      const height = Math.max(1, endY - startY);
      const samples = [];

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = ((startY + y) * analysisInfo.width + (startX + x)) * 4;
          const alpha = analysisData[index + 3];
          if (alpha < samplingThreshold) {
            continue;
          }

          const r = analysisData[index];
          const g = analysisData[index + 1];
          const b = analysisData[index + 2];
          const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
          const weight =
            (alpha / 255) *
            spatialWeight(x, y, width, height) *
            (0.92 + saturation * 0.18);
          const rgb = { r, g, b };
          samples.push({
            rgb,
            lab: rgbToLab(rgb),
            weight,
          });
        }
      }

      const averageColor = getWeightedAverageColor(samples);
      const averageLab = averageColor ? rgbToLab(averageColor) : null;
      const rankedVotes = rankPaletteVotes(samples);
      const initialPalette =
        CONFIG.mode === 'dominant'
          ? pickDominantPaletteColor(samples, averageColor, rankedVotes)
          : averageLab
            ? findClosestPaletteColorByLab(averageLab)
            : null;

      analyses[row][column] = {
        samples,
        averageColor,
        averageLab,
        candidates: buildCandidatePaletteList(averageLab, rankedVotes, initialPalette),
        initialPalette,
        edgeStrength: 0,
        opaqueRatio: width * height > 0 ? samples.length / (width * height) : 0,
      };
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < CONFIG.columns; column += 1) {
      const current = analyses[row][column];
      if (!current.averageLab) {
        continue;
      }

      const neighbors = [];
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const neighbor = analyses[row + dy]?.[column + dx];
        if (neighbor?.averageLab) {
          neighbors.push(neighbor.averageLab);
        }
      }

      const neighborDistance =
        neighbors.length > 0
          ? neighbors.reduce((sum, lab) => sum + deltaE76(current.averageLab, lab), 0) /
            neighbors.length
          : 0;
      const localVariance = getWeightedAverageDeltaE(current.samples, current.averageLab);
      current.edgeStrength = neighborDistance * 0.7 + localVariance * 0.5;
    }
  }

  return analyses;
}

function scoreAssignments(analyses, beforeDither, afterDither, edgeLimit) {
  let totalError = 0;
  let totalCells = 0;
  let smoothError = 0;
  let smoothCells = 0;
  let edgeChanged = 0;
  let edgeCells = 0;
  let smoothIslands = 0;
  let smoothIslandCells = 0;

  for (let row = 0; row < analyses.length; row += 1) {
    for (let column = 0; column < analyses[row].length; column += 1) {
      const analysis = analyses[row][column];
      const after = afterDither[row][column];
      const before = beforeDither[row][column];
      if (!analysis.averageLab || !after) {
        continue;
      }

      const reconstructionError = deltaE76(analysis.averageLab, after.lab);
      totalError += reconstructionError;
      totalCells += 1;

      const isSmoothGradient =
        analysis.edgeStrength < edgeLimit &&
        analysis.opaqueRatio > 0.35 &&
        deltaE76(analysis.averageLab, before?.lab ?? after.lab) > 4;

      if (isSmoothGradient) {
        smoothError += reconstructionError;
        smoothCells += 1;
      }

      if (analysis.edgeStrength >= edgeLimit + 1.5) {
        edgeCells += 1;
        if (before && after.key !== before.key) {
          edgeChanged += 1;
        }
      }

      if (analysis.edgeStrength < edgeLimit && analysis.opaqueRatio > 0.35) {
        smoothIslandCells += 1;
        const neighbors = getNeighborAssignments(afterDither, row, column);
        const sameNeighborCount = neighbors.filter((neighbor) => neighbor.key === after.key).length;
        if (sameNeighborCount <= 1) {
          smoothIslands += 1;
        }
      }
    }
  }

  const avgTotalError = totalCells > 0 ? totalError / totalCells : 0;
  const avgSmoothError = smoothCells > 0 ? smoothError / smoothCells : 0;
  const edgeChangeRate = edgeCells > 0 ? edgeChanged / edgeCells : 0;
  const smoothIslandRate = smoothIslandCells > 0 ? smoothIslands / smoothIslandCells : 0;
  const score =
    avgTotalError +
    avgSmoothError * 0.72 +
    edgeChangeRate * 16 +
    smoothIslandRate * 10;

  return {
    score,
    avgTotalError,
    avgSmoothError,
    edgeChangeRate,
    smoothIslandRate,
    smoothCells,
  };
}

async function evaluateCombination(ditherStrength, edgeLimit) {
  let totalScore = 0;
  let totalAvgError = 0;
  let totalSmoothError = 0;
  let totalEdgeChange = 0;
  let totalIslandRate = 0;
  let sampleCount = 0;

  for (const file of sampleFiles) {
    const analyses = await loadAnalyses(file);
    let assignments = analyses.map((row) => row.map((analysis) => analysis.initialPalette));
    assignments = refinePaletteAssignments(analyses, assignments, 2);
    assignments = reduceIsolatedArtifacts(analyses, assignments);
    const beforeDither = cloneAssignments(assignments);
    assignments = applyControlledDithering(analyses, assignments, CONFIG.mode, ditherStrength, edgeLimit);
    assignments = mergeSimilarColors(assignments, CONFIG.similarityThreshold);
    const metrics = scoreAssignments(analyses, beforeDither, assignments, edgeLimit);

    totalScore += metrics.score;
    totalAvgError += metrics.avgTotalError;
    totalSmoothError += metrics.avgSmoothError;
    totalEdgeChange += metrics.edgeChangeRate;
    totalIslandRate += metrics.smoothIslandRate;
    sampleCount += 1;
  }

  return {
    ditherStrength,
    edgeLimit,
    score: Number((totalScore / sampleCount).toFixed(4)),
    avgError: Number((totalAvgError / sampleCount).toFixed(4)),
    smoothError: Number((totalSmoothError / sampleCount).toFixed(4)),
    edgeChangeRate: Number((totalEdgeChange / sampleCount).toFixed(4)),
    smoothIslandRate: Number((totalIslandRate / sampleCount).toFixed(4)),
  };
}

const results = [];
for (const edgeLimit of [16, 17, 18, 19]) {
  for (const ditherStrength of [0.56, 0.62, 0.68, 0.72, 0.78]) {
    results.push(await evaluateCombination(ditherStrength, edgeLimit));
  }
}

results.sort((left, right) => left.score - right.score);
console.log(JSON.stringify(results.slice(0, 8), null, 2));
