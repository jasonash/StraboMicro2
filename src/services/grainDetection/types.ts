/**
 * Grain Detection Types
 *
 * TypeScript interfaces for the grain boundary detection system.
 */

/**
 * Settings that control the grain detection algorithm.
 * All values are normalized 0-100 for UI sliders.
 */
export interface DetectionSettings {
  /**
   * Sensitivity of boundary detection (0-100).
   * Higher = more boundaries detected (more grains, potentially over-segmented)
   * Lower = fewer boundaries (larger grains, potentially under-segmented)
   */
  sensitivity: number;

  /**
   * Minimum grain area in pixels to include in results.
   * Grains smaller than this are filtered out.
   */
  minGrainSize: number;

  /**
   * Edge contrast threshold (0-100).
   * Higher = only detect sharp, clear boundaries
   * Lower = detect softer, less distinct boundaries
   */
  edgeContrast: number;

  /**
   * Douglas-Peucker epsilon for polygon simplification.
   * Higher = simpler polygons with fewer vertices
   * Lower = more detailed polygons following exact contours
   */
  simplifyTolerance: number;

  /**
   * Whether to simplify polygon outlines.
   * If false, polygons will have many vertices following exact pixel boundaries.
   */
  simplifyOutlines: boolean;

  /**
   * Name of the preset used (if any).
   * Undefined or 'custom' if settings were manually adjusted.
   */
  presetName?: string;
}

/**
 * Default detection settings.
 */
export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  sensitivity: 50,
  minGrainSize: 50,
  edgeContrast: 50,
  simplifyTolerance: 2.0,
  simplifyOutlines: true,
  presetName: 'custom',
};

/**
 * A single detected grain before conversion to a Spot.
 */
export interface DetectedGrain {
  /**
   * Temporary ID for tracking during preview.
   * Will be replaced with UUID when converted to Spot.
   */
  tempId: string;

  /**
   * Polygon vertices in image coordinates (pixels).
   * Forms a closed polygon (first point != last point, closure is implied).
   */
  contour: Array<{ x: number; y: number }>;

  /**
   * Area of the grain in pixels.
   */
  area: number;

  /**
   * Centroid (center of mass) of the grain in image coordinates.
   */
  centroid: { x: number; y: number };

  /**
   * Axis-aligned bounding box of the grain.
   */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /**
   * Perimeter length in pixels.
   */
  perimeter?: number;

  /**
   * Circularity measure (4 * pi * area / perimeter^2).
   * 1.0 = perfect circle, lower = more irregular.
   */
  circularity?: number;
}

/**
 * Result of a grain detection operation.
 */
export interface DetectionResult {
  /**
   * Array of detected grains.
   */
  grains: DetectedGrain[];

  /**
   * Processing time in milliseconds.
   */
  processingTimeMs: number;

  /**
   * Settings used for this detection run.
   */
  settings: DetectionSettings;

  /**
   * Dimensions of the image that was processed.
   */
  imageDimensions: {
    width: number;
    height: number;
  };

  /**
   * Scale factor if image was downscaled for processing.
   * 1.0 = no scaling, 0.5 = half size, etc.
   * Coordinates in grains are already scaled back to original size.
   */
  scaleFactor: number;
}

/**
 * Optional region mask to limit detection to a specific area.
 */
export interface RegionMask {
  /**
   * Polygon vertices defining the region in image coordinates.
   */
  vertices: Array<{ x: number; y: number }>;

  /**
   * Percentage of image area covered by the region (0-100).
   */
  coveragePercent: number;
}

/**
 * A saved detection preset.
 */
export interface DetectionPreset {
  /**
   * Unique identifier for the preset.
   */
  id: string;

  /**
   * Display name for the preset.
   */
  name: string;

  /**
   * Whether this is a built-in preset (cannot be deleted).
   */
  isBuiltIn: boolean;

  /**
   * The detection settings for this preset.
   */
  settings: Omit<DetectionSettings, 'presetName'>;
}

/**
 * Built-in detection presets for common rock types and imaging conditions.
 */
export const BUILT_IN_PRESETS: DetectionPreset[] = [
  {
    id: 'granite-xpl',
    name: 'Granite XPL',
    isBuiltIn: true,
    settings: {
      sensitivity: 65,
      minGrainSize: 50,
      edgeContrast: 55,
      simplifyTolerance: 2.0,
      simplifyOutlines: true,
    },
  },
  {
    id: 'granite-ppl',
    name: 'Granite PPL',
    isBuiltIn: true,
    settings: {
      sensitivity: 50,
      minGrainSize: 50,
      edgeContrast: 45,
      simplifyTolerance: 2.0,
      simplifyOutlines: true,
    },
  },
  {
    id: 'basalt',
    name: 'Basalt',
    isBuiltIn: true,
    settings: {
      sensitivity: 75,
      minGrainSize: 25,
      edgeContrast: 60,
      simplifyTolerance: 1.5,
      simplifyOutlines: true,
    },
  },
  {
    id: 'marble',
    name: 'Marble',
    isBuiltIn: true,
    settings: {
      sensitivity: 55,
      minGrainSize: 100,
      edgeContrast: 50,
      simplifyTolerance: 2.5,
      simplifyOutlines: true,
    },
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    isBuiltIn: true,
    settings: {
      sensitivity: 70,
      minGrainSize: 30,
      edgeContrast: 55,
      simplifyTolerance: 2.0,
      simplifyOutlines: true,
    },
  },
];

/**
 * OpenCV.js loading state.
 */
export type OpenCVLoadState = 'not-started' | 'loading' | 'ready' | 'error';

/**
 * Options for spot generation from detected grains.
 */
export interface SpotGenerationOptions {
  /**
   * Output type: polygons (grain outlines) or points (centroids only).
   */
  outputType: 'polygon' | 'point';

  /**
   * Naming pattern for generated spots.
   * Use {n} for sequential number.
   * Example: "Grain {n}" produces "Grain 1", "Grain 2", etc.
   */
  namingPattern: string;

  /**
   * Default color for generated spots (hex string).
   */
  color: string;

  /**
   * Default opacity for generated spots (0-1).
   */
  opacity: number;

  /**
   * Optional tag to add to all generated spots.
   */
  tag?: string;
}

/**
 * Default spot generation options.
 */
export const DEFAULT_SPOT_GENERATION_OPTIONS: SpotGenerationOptions = {
  outputType: 'polygon',
  namingPattern: 'Grain {n}',
  color: '#FFA500', // Orange
  opacity: 0.5,
};
