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

// TODO Phase 2: toGrayscale, applySobel
// TODO Phase 3: edgeFabric, renderEdgeFabricOverlay
// TODO Phase 4: buildIntegralImage, colorIndexGlobal, colorIndexAdaptive
// TODO Phase 5: kMeansClustering
