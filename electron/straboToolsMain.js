/**
 * StraboTools Main Process — Full-Resolution Image Processing
 *
 * Port of the 4 StraboTools algorithms for use in the Electron main process.
 * Operates on Sharp raw pixel buffers instead of Canvas ImageData.
 * The math is identical to src/services/straboToolsProcessing.ts.
 */

const sharp = require('sharp');
const crypto = require('crypto');
const scratchSpace = require('./scratchSpace');

// ─── Constants ───────────────────────────────────────────────────────────────

const LUMINANCE_R = 0.2989;
const LUMINANCE_G = 0.5870;
const LUMINANCE_B = 0.1140;

const INITIAL_CENTROIDS = [
  [0, 0, 0],
  [0.9, 0.9, 0.9],
  [0.85, 0.45, 0.6],
  [0.2, 0.7, 0.2],
  [0.6, 0.6, 1.0],
  [0.2, 0.2, 0.8],
];

const PHASE_COLORS = [
  [0, 0, 0],
  [230, 230, 230],
  [217, 115, 153],
  [50, 178, 50],
  [153, 153, 255],
  [50, 50, 204],
];

const KMEANS_ITERATIONS = 5;

// ─── Shared Infrastructure ───────────────────────────────────────────────────

function toGrayscale(data, width, height, channels) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    gray[i] = data[offset] * LUMINANCE_R + data[offset + 1] * LUMINANCE_G + data[offset + 2] * LUMINANCE_B;
  }
  return gray;
}

function applySobel(gray, width, height) {
  const kx = [1, 0, -1, 2, 0, -2, 1, 0, -1];
  const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const outW = width - 2;
  const outH = height - 2;
  const size = outW * outH;

  const gx = new Float32Array(size);
  const gy = new Float32Array(size);
  const magnitude = new Float32Array(size);

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      let sumX = 0;
      let sumY = 0;
      for (let kr = -1; kr <= 1; kr++) {
        for (let kc = -1; kc <= 1; kc++) {
          const pixel = gray[(row + kr) * width + (col + kc)];
          const ki = (kr + 1) * 3 + (kc + 1);
          sumX += pixel * kx[ki];
          sumY += pixel * ky[ki];
        }
      }
      const outIdx = (row - 1) * outW + (col - 1);
      gx[outIdx] = sumX;
      gy[outIdx] = sumY;
      magnitude[outIdx] = Math.sqrt(sumX * sumX + sumY * sumY);
    }
  }

  return { gx, gy, magnitude, width: outW, height: outH };
}

// ─── Edge Detect ─────────────────────────────────────────────────────────────

function edgeDetectToRGBA(magnitude, sobelW, sobelH, threshold) {
  let maxMag = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }
  if (maxMag === 0) maxMag = 1;

  const normalized = new Uint8Array(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) {
    normalized[i] = Math.round(Math.sqrt(magnitude[i] / maxMag) * 255);
  }

  const result = Buffer.alloc(sobelW * sobelH * 4);
  const edgeThreshold = 255 - threshold;

  for (let i = 0; i < magnitude.length; i++) {
    const offset = i * 4;
    if (normalized[i] > edgeThreshold) {
      const val = 255 - normalized[i];
      result[offset] = val;
      result[offset + 1] = val;
      result[offset + 2] = val;
    } else {
      result[offset] = 255;
      result[offset + 1] = 255;
      result[offset + 2] = 255;
    }
    result[offset + 3] = 255;
  }

  return { buffer: result, width: sobelW, height: sobelH };
}

// ─── Edge Fabric ─────────────────────────────────────────────────────────────

function computeEdgeFabric(gx, gy) {
  const n = gx.length;
  let xSum = 0, ySum = 0;
  for (let i = 0; i < n; i++) { xSum += gx[i]; ySum += gy[i]; }
  const xMean = xSum / n;
  const yMean = ySum / n;

  let xxSum = 0, xySum = 0, yySum = 0;
  for (let i = 0; i < n; i++) {
    const dx = gx[i] - xMean;
    const dy = gy[i] - yMean;
    xxSum += dx * dx;
    xySum += dx * dy;
    yySum += dy * dy;
  }
  const xxCov = xxSum / (n - 1);
  const xyCov = xySum / (n - 1);
  const yyCov = yySum / (n - 1);

  const trace = xxCov + yyCov;
  const det = xxCov * yyCov - xyCov * xyCov;
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));

  const lambda1 = (trace + discriminant) / 2;
  const lambda2 = (trace - discriminant) / 2;

  const v2 = [lambda2 - yyCov, xyCov];
  const azimuth = ((90 - Math.atan2(v2[0], v2[1]) * 180 / Math.PI) + 360) % 180;
  const sqrtL1 = Math.sqrt(Math.max(0, lambda1));
  const sqrtL2 = Math.sqrt(Math.max(0, lambda2));
  const axialRatio = sqrtL2 > 0 ? sqrtL1 / sqrtL2 : 1;

  return { azimuth, axialRatio, xxCov, xyCov, yyCov };
}

function eigVecValForEllipse(xxCov, xyCov, yyCov) {
  const trace = xxCov + yyCov;
  const det = xxCov * yyCov - xyCov * xyCov;
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));

  let l1 = (trace + discriminant) / 2;
  let l2 = (trace - discriminant) / 2;

  const vec = [
    [l2 - yyCov, xyCov],
    [xyCov, l1 - xxCov],
  ];

  if (l2 > l1) { l2 = l2 / l1; l1 = 1; }
  else { l1 = l1 / l2; l2 = 1; }

  return { vec, val: [Math.sqrt(l2), Math.sqrt(l1)] };
}

function renderEdgeFabricToRGBA(data, width, height, channels, gx, gy, fabricResult) {
  const result = Buffer.alloc(width * height * 4);

  // Copy original color image as background
  for (let i = 0; i < width * height; i++) {
    const srcOff = i * channels;
    const dstOff = i * 4;
    result[dstOff] = data[srcOff];
    result[dstOff + 1] = data[srcOff + 1];
    result[dstOff + 2] = data[srcOff + 2];
    result[dstOff + 3] = 255;
  }

  const { xxCov, xyCov, yyCov } = fabricResult;
  const { vec, val } = eigVecValForEllipse(xxCov, xyCov, yyCov);

  const xCenter = Math.round(width / 2);
  const yCenter = Math.round(height / 2);
  const ellipseMultiplier = xCenter / 2;
  const numPoints = 1000;

  const ax = vec[0][0] * val[0];
  const ay = vec[1][0] * val[0];

  // Find max extent for normalization
  let maxVal = 0;
  const bxOuter = vec[0][1] * val[1];
  const byOuter = vec[1][1] * val[1];
  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    const ex = ax * Math.sin(t) + bxOuter * Math.cos(t);
    const ey = ay * Math.sin(t) + byOuter * Math.cos(t);
    if (Math.abs(ex) > maxVal) maxVal = Math.abs(ex);
    if (Math.abs(ey) > maxVal) maxVal = Math.abs(ey);
  }
  if (maxVal === 0) maxVal = 1;

  // Yellow ellipse
  const bxYellow = vec[0][1] * val[0];
  const byYellow = vec[1][1] * val[0];
  drawEllipse(result, width, height, xCenter, yCenter, ax, ay, bxYellow, byYellow, maxVal, ellipseMultiplier, numPoints, 255, 255, 0);

  // Red ellipse
  const bxRed = vec[0][1] * val[1];
  const byRed = vec[1][1] * val[1];
  drawEllipse(result, width, height, xCenter, yCenter, ax, ay, bxRed, byRed, maxVal, ellipseMultiplier, numPoints, 255, 0, 0);

  return { buffer: result, width, height };
}

function drawEllipse(data, width, height, xCenter, yCenter, ax, ay, bx, by, maxVal, multiplier, numPoints, r, g, b) {
  // Scale dot radius proportionally to image size
  const dotRadius = Math.max(3, Math.round(Math.min(width, height) / 500));

  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    const ex = (ax * Math.sin(t) + bx * Math.cos(t)) / maxVal * multiplier;
    const ey = (ay * Math.sin(t) + by * Math.cos(t)) / maxVal * multiplier;

    const px = Math.round(xCenter + ex);
    const py = Math.round(yCenter + ey);

    for (let dy = -dotRadius; dy <= dotRadius; dy++) {
      for (let dx = -dotRadius; dx <= dotRadius; dx++) {
        if (dx * dx + dy * dy > dotRadius * dotRadius) continue;
        const col = px + dx;
        const row = py + dy;
        if (col < 0 || col >= width || row < 0 || row >= height) continue;
        const offset = (row * width + col) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
  }
}

// ─── Color Index ─────────────────────────────────────────────────────────────

function buildIntegralImage(gray, width, height) {
  const ii = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let val = gray[idx];
      if (x > 0) val += ii[idx - 1];
      if (y > 0) val += ii[idx - width];
      if (x > 0 && y > 0) val -= ii[idx - width - 1];
      ii[idx] = val;
    }
  }
  return ii;
}

function buildAvgMatrix(ii, width, height) {
  const avg = new Float64Array(width * height);
  const s = Math.floor(2 * Math.floor(Math.min(width, height / 16)));
  const halfS = Math.floor(s / 2);

  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      const x1 = Math.max(0, i - halfS);
      const x2 = Math.min(width - 1, i + halfS);
      const y1 = Math.max(0, j - halfS);
      const y2 = Math.min(height - 1, j + halfS);
      const count = (x2 - x1) * (y2 - y1);
      const safeY1 = Math.max(1, y1) - 1;
      const safeX1 = Math.max(1, x1) - 1;
      const sum = ii[y2 * width + x2] - ii[safeY1 * width + x2] - ii[y2 * width + safeX1] + ii[safeY1 * width + safeX1];
      avg[j * width + i] = count > 0 ? sum / count : 0;
    }
  }
  return avg;
}

function colorIndexToRGBA(data, width, height, channels, threshold, adaptive, highlightColor) {
  const gray = toGrayscale(data, width, height, channels);
  const result = Buffer.alloc(width * height * 4);
  const hr = highlightColor === 'red' ? 255 : 0;
  const hb = highlightColor === 'blue' ? 255 : 0;
  let foregroundCount = 0;
  const totalPixels = width * height;

  // Copy original pixels to RGBA result
  for (let i = 0; i < totalPixels; i++) {
    const srcOff = i * channels;
    const dstOff = i * 4;
    result[dstOff] = data[srcOff];
    result[dstOff + 1] = data[srcOff + 1];
    result[dstOff + 2] = data[srcOff + 2];
    result[dstOff + 3] = 255;
  }

  if (adaptive) {
    const ii = buildIntegralImage(gray, width, height);
    const avgMatrix = buildAvgMatrix(ii, width, height);
    const testValue = threshold / 255;

    for (let i = 0; i < totalPixels; i++) {
      if (gray[i] < testValue * avgMatrix[i]) {
        const offset = i * 4;
        result[offset] = hr;
        result[offset + 1] = 0;
        result[offset + 2] = hb;
        result[offset + 3] = 255;
        foregroundCount++;
      }
    }
  } else {
    for (let i = 0; i < totalPixels; i++) {
      if (gray[i] < threshold) {
        const offset = i * 4;
        result[offset] = hr;
        result[offset + 1] = 0;
        result[offset + 2] = hb;
        result[offset + 3] = 255;
        foregroundCount++;
      }
    }
  }

  const percentage = totalPixels > 0 ? (foregroundCount / totalPixels) * 100 : 0;
  return { buffer: result, width, height, percentage };
}

// ─── Mode Tool (K-Means) ────────────────────────────────────────────────────

function kMeansToRGBA(data, width, height, channels, numPhases) {
  const totalPixels = width * height;

  const centroids = [];
  for (let k = 0; k < numPhases; k++) {
    centroids.push([
      INITIAL_CENTROIDS[k][0] * 255,
      INITIAL_CENTROIDS[k][1] * 255,
      INITIAL_CENTROIDS[k][2] * 255,
    ]);
  }

  const assignments = new Uint8Array(totalPixels);

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      let minDist = Infinity;
      let bestK = 0;
      for (let k = 0; k < numPhases; k++) {
        const dr = r - centroids[k][0];
        const dg = g - centroids[k][1];
        const db = b - centroids[k][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) { minDist = dist; bestK = k; }
      }
      assignments[i] = bestK;
    }

    const sumR = new Float64Array(numPhases);
    const sumG = new Float64Array(numPhases);
    const sumB = new Float64Array(numPhases);
    const counts = new Uint32Array(numPhases);

    for (let i = 0; i < totalPixels; i++) {
      const k = assignments[i];
      const offset = i * channels;
      sumR[k] += data[offset];
      sumG[k] += data[offset + 1];
      sumB[k] += data[offset + 2];
      counts[k]++;
    }

    for (let k = 0; k < numPhases; k++) {
      if (counts[k] > 0) {
        centroids[k][0] = sumR[k] / counts[k];
        centroids[k][1] = sumG[k] / counts[k];
        centroids[k][2] = sumB[k] / counts[k];
      }
    }
  }

  const result = Buffer.alloc(width * height * 4);
  const finalCounts = new Uint32Array(numPhases);

  for (let i = 0; i < totalPixels; i++) {
    const k = assignments[i];
    finalCounts[k]++;
    const offset = i * 4;
    result[offset] = PHASE_COLORS[k][0];
    result[offset + 1] = PHASE_COLORS[k][1];
    result[offset + 2] = PHASE_COLORS[k][2];
    result[offset + 3] = 255;
  }

  const phasePercentages = [];
  for (let k = 0; k < numPhases; k++) {
    phasePercentages.push((finalCounts[k] / totalPixels) * 100);
  }

  return { buffer: result, width, height, phasePercentages };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Process a micrograph image at full resolution using a StraboTools algorithm.
 *
 * @param {Object} params
 * @param {string} params.imagePath - Full path to the original image file
 * @param {string} params.tool - 'edge-fabric' | 'color-index' | 'edge-detect' | 'mode'
 * @param {Object} params.toolParams - Tool-specific parameters
 * @param {Function} params.progressCallback - (stage, percent) => void
 * @returns {{ identifier: string, width: number, height: number, analyticalResults: Object }}
 */
async function processFullResolution({ imagePath, tool, toolParams, progressCallback }) {
  const progress = (stage, percent) => {
    if (progressCallback) progressCallback({ stage, percent });
  };

  // Step 1: Load full-resolution image
  progress('Loading full-resolution image...', 0);
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  progress('Loading full-resolution image...', 100);

  // Step 2: Run the appropriate algorithm
  let resultBuffer;
  let resultWidth;
  let resultHeight;
  let analyticalResults = {};

  const toolNames = {
    'edge-fabric': 'Edge Fabric',
    'color-index': 'Color Index',
    'edge-detect': 'Edge Detect',
    'mode': 'Mode',
  };

  progress(`Running ${toolNames[tool]} analysis...`, 0);

  switch (tool) {
    case 'edge-detect': {
      const gray = toGrayscale(data, width, height, channels);
      const sobel = applySobel(gray, width, height);
      const result = edgeDetectToRGBA(sobel.magnitude, sobel.width, sobel.height, toolParams.threshold || 128);
      resultBuffer = result.buffer;
      resultWidth = result.width;
      resultHeight = result.height;
      analyticalResults = {
        tool: 'edge-detect',
        edgeDetectThreshold: toolParams.threshold || 128,
      };
      break;
    }
    case 'edge-fabric': {
      const gray = toGrayscale(data, width, height, channels);
      const sobel = applySobel(gray, width, height);
      const fabric = computeEdgeFabric(sobel.gx, sobel.gy);
      const result = renderEdgeFabricToRGBA(data, width, height, channels, sobel.gx, sobel.gy, fabric);
      resultBuffer = result.buffer;
      resultWidth = result.width;
      resultHeight = result.height;
      analyticalResults = {
        tool: 'edge-fabric',
        azimuth: fabric.azimuth,
        axialRatio: fabric.axialRatio,
      };
      break;
    }
    case 'color-index': {
      const result = colorIndexToRGBA(
        data, width, height, channels,
        toolParams.threshold || 128,
        toolParams.adaptive || false,
        toolParams.highlightColor || 'red',
      );
      resultBuffer = result.buffer;
      resultWidth = result.width;
      resultHeight = result.height;
      analyticalResults = {
        tool: 'color-index',
        colorIndexPercentage: result.percentage,
        colorIndexThreshold: toolParams.threshold || 128,
        colorIndexMode: toolParams.adaptive ? 'adaptive' : 'global',
      };
      break;
    }
    case 'mode': {
      const result = kMeansToRGBA(data, width, height, channels, toolParams.numPhases || 4);
      resultBuffer = result.buffer;
      resultWidth = result.width;
      resultHeight = result.height;
      analyticalResults = {
        tool: 'mode',
        modeNumPhases: toolParams.numPhases || 4,
        modePhasePercentages: result.phasePercentages,
      };
      break;
    }
    default:
      throw new Error(`Unknown StraboTools tool: ${tool}`);
  }

  progress(`Running ${toolNames[tool]} analysis...`, 100);

  // Step 3: Save result as JPEG to scratch space
  progress('Saving result...', 0);
  const identifier = crypto.randomUUID();
  const scratchPath = scratchSpace.getScratchPath(identifier);

  await sharp(resultBuffer, {
    raw: { width: resultWidth, height: resultHeight, channels: 4 },
  })
    .jpeg({ quality: 95 })
    .toFile(scratchPath);

  progress('Saving result...', 100);

  return {
    identifier,
    width: resultWidth,
    height: resultHeight,
    analyticalResults,
  };
}

module.exports = { processFullResolution };
