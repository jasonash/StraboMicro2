/**
 * StraboTools Image Processing
 *
 * Pure functions for the 4 StraboTools analysis algorithms.
 * All functions operate on ImageData from Canvas getImageData().
 * No React dependencies — this module is framework-agnostic.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SobelResult {
  gx: Float32Array;
  gy: Float32Array;
  magnitude: Float32Array;
  width: number;
  height: number;
}

export interface EdgeFabricResult {
  azimuth: number;
  axialRatio: number;
  eigenvalue1: number;
  eigenvalue2: number;
  eigenvector1: [number, number];
  eigenvector2: [number, number];
}

export interface ColorIndexResult {
  resultImage: ImageData;
  percentage: number;
}

export interface ModeToolResult {
  resultImage: ImageData;
  phasePercentages: number[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard CIE luminance weights for RGB → grayscale */
export const LUMINANCE_R = 0.2989;
export const LUMINANCE_G = 0.5870;
export const LUMINANCE_B = 0.1140;

/** K-means initial centroids (normalized 0–1 RGB) */
export const INITIAL_CENTROIDS: [number, number, number][] = [
  [0, 0, 0],           // Black
  [0.9, 0.9, 0.9],     // White
  [0.85, 0.45, 0.6],   // Pink
  [0.2, 0.7, 0.2],     // Green
  [0.6, 0.6, 1.0],     // Lavender
  [0.2, 0.2, 0.8],     // Blue
];

/** Phase display colors (RGB 0–255) */
export const PHASE_COLORS: [number, number, number][] = [
  [0, 0, 0],           // Black
  [230, 230, 230],     // White
  [217, 115, 153],     // Pink
  [50, 178, 50],       // Green
  [153, 153, 255],     // Lavender
  [50, 50, 204],       // Blue
];

/** Phase names */
export const PHASE_NAMES = ['Black', 'White', 'Pink', 'Green', 'Lavender', 'Blue'] as const;

// ─── Shared Infrastructure ───────────────────────────────────────────────────

/**
 * Convert RGBA ImageData to grayscale using standard CIE luminance weights.
 * Matches the Swift app's grayscale conversion via CGColorSpaceCreateDeviceGray().
 */
export function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    gray[i] = data[offset] * LUMINANCE_R + data[offset + 1] * LUMINANCE_G + data[offset + 2] * LUMINANCE_B;
  }

  return gray;
}

/**
 * Apply Sobel edge detection to a grayscale image.
 *
 * Uses 3x3 Sobel kernels:
 *   Gx: [[1, 0, -1], [2, 0, -2], [1, 0, -1]]
 *   Gy: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]  (negated transpose, matching Swift's doNeg:true)
 *
 * Output dimensions are (width-2) x (height-2) — border pixels excluded,
 * matching the Swift app's convolute2d() behavior.
 */
export function applySobel(
  gray: Float32Array,
  width: number,
  height: number,
): SobelResult {
  // Sobel kernels (3x3)
  // Gx: [[1, 0, -1], [2, 0, -2], [1, 0, -1]]
  const kx = [1, 0, -1, 2, 0, -2, 1, 0, -1];
  // Gy: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]  (negated transpose, matching Swift doNeg)
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

      // Apply 3x3 kernel
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

/**
 * Generate edge detection visualization from Sobel magnitude.
 *
 * Matches Swift app behavior:
 * 1. Normalize magnitude via sqrt compression: pixelVal = sqrt(mag / maxMag) * 255
 * 2. Apply threshold: if normalizedMag > (255 - threshold) → show (255 - normalizedMag), else white
 *
 * @param magnitude - Sobel magnitude array from applySobel()
 * @param sobelWidth - Width of the Sobel output (original width - 2)
 * @param sobelHeight - Height of the Sobel output (original height - 2)
 * @param threshold - Slider value 0–255. Higher = more edges shown.
 * @returns ImageData ready for display
 */
export function edgeDetect(
  magnitude: Float32Array,
  sobelWidth: number,
  sobelHeight: number,
  threshold: number,
): ImageData {
  // Find max magnitude for normalization
  let maxMag = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }

  // Avoid division by zero
  if (maxMag === 0) maxMag = 1;

  // Build normalized magnitude array (sqrt compression, matching Swift)
  const normalized = new Uint8Array(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) {
    normalized[i] = Math.round(Math.sqrt(magnitude[i] / maxMag) * 255);
  }

  // Build output ImageData
  const result = new ImageData(sobelWidth, sobelHeight);
  const data = result.data;
  const edgeThreshold = 255 - threshold;

  for (let i = 0; i < magnitude.length; i++) {
    const offset = i * 4;
    if (normalized[i] > edgeThreshold) {
      // Show inverted magnitude (dark edges on white background)
      const val = 255 - normalized[i];
      data[offset] = val;
      data[offset + 1] = val;
      data[offset + 2] = val;
    } else {
      // White background
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
    }
    data[offset + 3] = 255; // Alpha
  }

  return result;
}

// ─── Edge Fabric ─────────────────────────────────────────────────────────────

/**
 * Compute edge fabric analysis from Sobel gradient components.
 *
 * Algorithm (matching Swift app):
 * 1. Column-vectorize gx, gy into Nx2 matrix
 * 2. Compute 2x2 sample covariance: [[Σxx, Σxy], [Σxy, Σyy]] / (N-1)
 * 3. Eigenvalue decomposition of covariance matrix
 * 4. Azimuth from eigenvector of smaller eigenvalue
 * 5. Axial ratio from eigenvalue ratio
 */
export function edgeFabric(
  gx: Float32Array,
  gy: Float32Array,
  _sobelWidth: number,
  _sobelHeight: number,
): EdgeFabricResult {
  const n = gx.length;

  // Step 1: Compute means
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < n; i++) {
    xSum += gx[i];
    ySum += gy[i];
  }
  const xMean = xSum / n;
  const yMean = ySum / n;

  // Step 2: Compute 2x2 covariance matrix (sample covariance, N-1 denominator)
  let xxSum = 0;
  let xySum = 0;
  let yySum = 0;
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

  // Step 3: Eigenvalue decomposition of 2x2 matrix
  // Matches eig22() from Swift
  const trace = xxCov + yyCov;
  const det = xxCov * yyCov - xyCov * xyCov;
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));

  const lambda1 = (trace + discriminant) / 2; // Larger eigenvalue
  const lambda2 = (trace - discriminant) / 2; // Smaller eigenvalue

  // Eigenvectors from eig22():
  // v1 = [lambda1 - yyCov, xyCov]
  // v2 = [lambda2 - yyCov, xyCov]
  const v1: [number, number] = [lambda1 - yyCov, xyCov];
  const v2: [number, number] = [lambda2 - yyCov, xyCov];

  // Step 4: Azimuth from v2 (matching Swift: theta = (90 - atan2d(v2[0], v2[1]) + 360) % 180)
  const azimuth = ((90 - Math.atan2(v2[0], v2[1]) * 180 / Math.PI) + 360) % 180;

  // Step 5: Axial ratio = sqrt(lambda1) / sqrt(lambda2)
  const sqrtL1 = Math.sqrt(Math.max(0, lambda1));
  const sqrtL2 = Math.sqrt(Math.max(0, lambda2));
  const axialRatio = sqrtL2 > 0 ? sqrtL1 / sqrtL2 : 1;

  return {
    azimuth,
    axialRatio,
    eigenvalue1: lambda1,
    eigenvalue2: lambda2,
    eigenvector1: v1,
    eigenvector2: v2,
  };
}

/**
 * Compute eigenvector/eigenvalue data for ellipse rendering.
 * Matches eigVecVal() from Swift — normalizes eigenvalues as ratios.
 *
 * Returns: { vec: 2x2 matrix [v2; v1], val: 2x2 diagonal of normalized sqrt eigenvalues }
 */
function eigVecValForEllipse(
  xxCov: number, xyCov: number, yyCov: number,
): { vec: [[number, number], [number, number]]; val: [number, number] } {
  const trace = xxCov + yyCov;
  const det = xxCov * yyCov - xyCov * xyCov;
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));

  let l1 = (trace + discriminant) / 2;
  let l2 = (trace - discriminant) / 2;

  // Eigenvectors matching eigVecVal() from Swift
  // v1 = [xyCov, l1 - xxCov]
  // v2 = [l2 - yyCov, xyCov]
  const vec: [[number, number], [number, number]] = [
    [l2 - yyCov, xyCov],   // v2 (row 0)
    [xyCov, l1 - xxCov],   // v1 (row 1)
  ];

  // Normalize eigenvalues as ratio then sqrt (matching Swift)
  if (l2 > l1) {
    l2 = l2 / l1;
    l1 = 1;
  } else {
    l1 = l1 / l2;
    l2 = 1;
  }

  return { vec, val: [Math.sqrt(l2), Math.sqrt(l1)] };
}

/**
 * Render edge fabric ellipses and magnitude image onto a canvas context.
 *
 * Draws:
 * 1. Sobel magnitude as background (grayscale, sqrt-compressed)
 * 2. Yellow ellipse (outer, using both eigenvalues)
 * 3. Red ellipse (inner, using smaller eigenvalue only)
 *
 * Matches the Swift app's ellipse rendering with dot-pattern parametric curves.
 */
export function renderEdgeFabricImage(
  sobelResult: SobelResult,
  _fabricResult: EdgeFabricResult,
): ImageData {
  const { magnitude, width: sobelWidth, height: sobelHeight, gx, gy } = sobelResult;

  // First, build the magnitude background image
  let maxMag = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }
  if (maxMag === 0) maxMag = 1;

  const result = new ImageData(sobelWidth, sobelHeight);
  const data = result.data;

  // Draw magnitude as background (sqrt-compressed grayscale)
  for (let i = 0; i < magnitude.length; i++) {
    const val = Math.round(Math.sqrt(magnitude[i] / maxMag) * 255);
    const invVal = 255 - val; // Invert so edges are dark
    const offset = i * 4;
    data[offset] = invVal;
    data[offset + 1] = invVal;
    data[offset + 2] = invVal;
    data[offset + 3] = 255;
  }

  // Compute eigenvectors/eigenvalues for ellipse rendering
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

  const { vec, val } = eigVecValForEllipse(xxCov, xyCov, yyCov);

  const xCenter = Math.round(sobelWidth / 2);
  const yCenter = Math.round(sobelHeight / 2);
  const ellipseMultiplier = xCenter / 2;

  // Parametric ellipse: [ax*sin(t) + bx*cos(t), ay*sin(t) + by*cos(t)]
  const ax = vec[0][0] * val[0];
  const ay = vec[1][0] * val[0];

  const numPoints = 1000;

  // First pass: find max extent for normalization
  let maxVal = 0;
  // Use the larger ellipse (bx/by with val[1]) for max extent calculation
  let bxOuter = vec[0][1] * val[1];
  let byOuter = vec[1][1] * val[1];
  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    const ex = ax * Math.sin(t) + bxOuter * Math.cos(t);
    const ey = ay * Math.sin(t) + byOuter * Math.cos(t);
    if (Math.abs(ex) > maxVal) maxVal = Math.abs(ex);
    if (Math.abs(ey) > maxVal) maxVal = Math.abs(ey);
  }
  if (maxVal === 0) maxVal = 1;

  // Draw yellow (outer) ellipse — uses val[0] for bx,by (matching Swift first draw)
  const bxYellow = vec[0][1] * val[0];
  const byYellow = vec[1][1] * val[0];
  drawEllipseOnImageData(data, sobelWidth, sobelHeight, xCenter, yCenter,
    ax, ay, bxYellow, byYellow, maxVal, ellipseMultiplier, numPoints,
    255, 255, 0); // Yellow

  // Draw red (inner) ellipse — uses val[1] for bx,by (matching Swift second draw)
  const bxRed = vec[0][1] * val[1];
  const byRed = vec[1][1] * val[1];
  drawEllipseOnImageData(data, sobelWidth, sobelHeight, xCenter, yCenter,
    ax, ay, bxRed, byRed, maxVal, ellipseMultiplier, numPoints,
    255, 0, 0); // Red

  return result;
}

/** Draw a parametric ellipse onto an ImageData buffer using dot patterns. */
function drawEllipseOnImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  xCenter: number,
  yCenter: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  maxVal: number,
  multiplier: number,
  numPoints: number,
  r: number,
  g: number,
  b: number,
): void {
  // Draw 3px radius dots at each parametric point (simplified from Swift's 12x12 dot matrix)
  const dotRadius = 3;

  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    const ex = (ax * Math.sin(t) + bx * Math.cos(t)) / maxVal * multiplier;
    const ey = (ay * Math.sin(t) + by * Math.cos(t)) / maxVal * multiplier;

    const px = Math.round(xCenter + ex);
    const py = Math.round(yCenter + ey);

    // Draw dot at (px, py)
    for (let dy = -dotRadius; dy <= dotRadius; dy++) {
      for (let dx = -dotRadius; dx <= dotRadius; dx++) {
        if (dx * dx + dy * dy > dotRadius * dotRadius) continue; // Circle shape
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

/**
 * Build integral image (summed-area table) from grayscale array.
 * ii[y][x] = gray[y][x] + ii[y-1][x] + ii[y][x-1] - ii[y-1][x-1]
 *
 * Matches Swift's cumsum(dimension:1) then cumsum(dimension:2) approach.
 */
export function buildIntegralImage(
  gray: Float32Array,
  width: number,
  height: number,
): Float64Array {
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

/**
 * Build average matrix from integral image for adaptive thresholding.
 * Uses a local window of size s = 2 * floor(min(width, height/16)).
 *
 * Matches Swift's prepareCIData() avgMatrix computation.
 */
export function buildAvgMatrix(
  integralImage: Float64Array,
  width: number,
  height: number,
): Float64Array {
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

      // Summed-area table lookup (matching Swift's intImg indexing with max(1, ...) clamping)
      const safeY1 = Math.max(1, y1) - 1;
      const safeX1 = Math.max(1, x1) - 1;

      const sum =
        integralImage[y2 * width + x2]
        - integralImage[safeY1 * width + x2]
        - integralImage[y2 * width + safeX1]
        + integralImage[safeY1 * width + safeX1];

      avg[j * width + i] = count > 0 ? sum / count : 0;
    }
  }

  return avg;
}

export type HighlightColor = 'red' | 'blue';

/**
 * Global color index thresholding.
 *
 * Matches Swift's non-adaptive processColorIndexImage():
 * For each pixel, compute gray = R*0.2989 + G*0.5870 + B*0.1140.
 * If gray < threshold → foreground (colored red or blue).
 * Returns the colored image and the percentage of foreground pixels.
 */
export function colorIndexGlobal(
  imageData: ImageData,
  threshold: number,
  highlightColor: HighlightColor,
): ColorIndexResult {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const out = result.data;

  const hr = highlightColor === 'red' ? 255 : 0;
  const hg = 0;
  const hb = highlightColor === 'blue' ? 255 : 0;

  let foregroundCount = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const gray = out[offset] * LUMINANCE_R + out[offset + 1] * LUMINANCE_G + out[offset + 2] * LUMINANCE_B;

    if (gray < threshold) {
      out[offset] = hr;
      out[offset + 1] = hg;
      out[offset + 2] = hb;
      out[offset + 3] = 255;
      foregroundCount++;
    }
  }

  const percentage = totalPixels > 0 ? (foregroundCount / totalPixels) * 100 : 0;
  return { resultImage: result, percentage };
}

/**
 * Adaptive color index thresholding using integral image.
 *
 * Matches Swift's adaptiveThreshold() + processColorIndexImage():
 * For each pixel, foreground if gray < (threshold/255) * localAvg.
 * Pixels below adaptive threshold are colored red or blue.
 */
export function colorIndexAdaptive(
  imageData: ImageData,
  gray: Float32Array,
  avgMatrix: Float64Array,
  threshold: number,
  highlightColor: HighlightColor,
): ColorIndexResult {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const out = result.data;

  const hr = highlightColor === 'red' ? 255 : 0;
  const hg = 0;
  const hb = highlightColor === 'blue' ? 255 : 0;

  const testValue = threshold / 255;
  let foregroundCount = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    if (gray[i] < testValue * avgMatrix[i]) {
      const offset = i * 4;
      out[offset] = hr;
      out[offset + 1] = hg;
      out[offset + 2] = hb;
      out[offset + 3] = 255;
      foregroundCount++;
    }
  }

  const percentage = totalPixels > 0 ? (foregroundCount / totalPixels) * 100 : 0;
  return { resultImage: result, percentage };
}
// ─── Mode Tool (K-Means) ─────────────────────────────────────────────────────

/** Number of K-means iterations (matches Swift: colorModeIterations = 5) */
const KMEANS_ITERATIONS = 5;

/**
 * K-means color clustering for mineral phase segmentation.
 *
 * Matches Swift app behavior:
 * 1. Use first numPhases of 6 fixed initial centroids
 * 2. Run 5 iterations: assign pixels by Euclidean RGB distance, update centroids
 * 3. Colorize output using predefined phase colors
 * 4. Report percentage per phase
 *
 * @param imageData - Original RGBA ImageData
 * @param numPhases - Number of phases (2–6)
 * @returns Colorized ImageData and per-phase percentages
 */
export function kMeansClustering(
  imageData: ImageData,
  numPhases: number,
): ModeToolResult {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  // Initialize centroids (normalized 0–255)
  const centroids: [number, number, number][] = [];
  for (let k = 0; k < numPhases; k++) {
    centroids.push([
      INITIAL_CENTROIDS[k][0] * 255,
      INITIAL_CENTROIDS[k][1] * 255,
      INITIAL_CENTROIDS[k][2] * 255,
    ]);
  }

  // Pixel assignment array
  const assignments = new Uint8Array(totalPixels);

  // K-means iterations
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    // Assignment step: assign each pixel to nearest centroid
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
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

        if (dist < minDist) {
          minDist = dist;
          bestK = k;
        }
      }

      assignments[i] = bestK;
    }

    // Update step: recompute centroids as mean of assigned pixels
    const sumR = new Float64Array(numPhases);
    const sumG = new Float64Array(numPhases);
    const sumB = new Float64Array(numPhases);
    const counts = new Uint32Array(numPhases);

    for (let i = 0; i < totalPixels; i++) {
      const k = assignments[i];
      const offset = i * 4;
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

  // Build colorized output image
  const result = new ImageData(width, height);
  const out = result.data;

  // Count final assignments for percentages
  const finalCounts = new Uint32Array(numPhases);

  for (let i = 0; i < totalPixels; i++) {
    const k = assignments[i];
    finalCounts[k]++;
    const offset = i * 4;
    out[offset] = PHASE_COLORS[k][0];
    out[offset + 1] = PHASE_COLORS[k][1];
    out[offset + 2] = PHASE_COLORS[k][2];
    out[offset + 3] = 255;
  }

  // Calculate percentages
  const phasePercentages: number[] = [];
  for (let k = 0; k < numPhases; k++) {
    phasePercentages.push((finalCounts[k] / totalPixels) * 100);
  }

  return { resultImage: result, phasePercentages };
}
