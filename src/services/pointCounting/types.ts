/**
 * Point Counting Types
 *
 * Type definitions for the point counting modal analysis system.
 */

// ============================================================================
// GRID GENERATION TYPES
// ============================================================================

/** Type of grid pattern for point placement */
export type GridType = 'regular' | 'random' | 'stratified';

/** A point on the grid with its position and grid coordinates */
export interface GridPoint {
  /** X coordinate in image pixels */
  x: number;
  /** Y coordinate in image pixels */
  y: number;
  /** Row index in grid (for regular/stratified) or sequential index (for random) */
  row: number;
  /** Column index in grid (for regular/stratified) or 0 (for random) */
  col: number;
}

/** Dimensions and spacing of a generated grid */
export interface GridDimensions {
  /** Number of rows in the grid */
  rows: number;
  /** Number of columns in the grid */
  cols: number;
  /** Horizontal spacing between points in pixels */
  spacingX: number;
  /** Vertical spacing between points in pixels */
  spacingY: number;
}

/** Options for generating a point counting grid */
export interface GridGenerationOptions {
  /** Type of grid pattern */
  gridType: GridType;
  /** Target number of points to generate */
  pointCount: number;
  /** Whether to offset grid by half-spacing to avoid image edges */
  offsetByHalfSpacing: boolean;
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

/** Statistics for a single mineral/category */
export interface MineralStats {
  /** Name of the mineral or category */
  name: string;
  /** Number of points classified as this mineral */
  count: number;
  /** Percentage of total classified points */
  percentage: number;
  /** 95% confidence interval as ± percentage points */
  confidenceInterval: number;
  /** Lower bound of the confidence interval */
  percentageLow: number;
  /** Upper bound of the confidence interval */
  percentageHigh: number;
}

/** Overall statistics for a point count session */
export interface PointCountStatistics {
  /** Total number of points generated */
  totalPoints: number;
  /** Number of points that have been classified */
  classifiedPoints: number;
  /** Number of points not yet classified */
  unclassifiedPoints: number;
  /** Percentage of points classified */
  classificationProgress: number;
  /** Per-mineral statistics sorted by count descending */
  mineralStats: MineralStats[];
  /** Timestamp when statistics were calculated */
  calculatedAt: string;
}

/** A classified spot for statistics calculation */
export interface ClassifiedSpot {
  /** Spot ID */
  id: string;
  /** Mineral name if classified, null if not */
  mineral: string | null;
}

// ============================================================================
// CONFIDENCE INTERVAL TYPES
// ============================================================================

/** Confidence levels for statistical calculations */
export type ConfidenceLevel = 0.90 | 0.95 | 0.99;

/** Z-scores for common confidence levels */
export const Z_SCORES: Record<ConfidenceLevel, number> = {
  0.90: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

// ============================================================================
// SPOT GENERATION TYPES
// ============================================================================

/** Settings stored with generated spots for traceability */
export interface GenerationSettings {
  /** Grid type used */
  gridType: GridType;
  /** Target point count requested */
  pointCount: number;
  /** Region bounds if a region was selected */
  regionBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Appearance options for generated spots */
export interface SpotAppearanceOptions {
  /** Point size in pixels */
  pointSize: number;
  /** Spot color as hex string */
  color: string;
  /** Opacity as percentage (0-100) */
  opacity: number;
  /** Naming pattern with {n} placeholder */
  namingPattern: string;
}
