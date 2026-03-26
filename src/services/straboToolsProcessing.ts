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

// TODO Phase 3: edgeFabric, renderEdgeFabricOverlay
// TODO Phase 4: buildIntegralImage, colorIndexGlobal, colorIndexAdaptive
// TODO Phase 5: kMeansClustering
