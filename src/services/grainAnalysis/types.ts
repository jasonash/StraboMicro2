/**
 * Type definitions for Grain Size Analysis
 */

import type { GrainMetrics } from '../../utils/grainMetrics';

/**
 * Rock type classification scheme
 */
export type RockType = 'sedimentary' | 'igneous' | 'metamorphic';

/**
 * Wentworth grain size classification for sedimentary rocks
 */
export interface WentworthClass {
  name: string;
  phiMin: number;
  phiMax: number;
  sizeMinMicrons: number;
  sizeMaxMicrons: number;
  color: string;
}

/**
 * Igneous grain size classification
 */
export interface IgneousClass {
  name: string;
  sizeMinMicrons: number;
  sizeMaxMicrons: number;
  interpretation: string;
  color: string;
}

/**
 * Metamorphic grain size classification
 */
export interface MetamorphicClass {
  name: string;
  sizeMinMicrons: number;
  sizeMaxMicrons: number;
  notes: string;
  color: string;
}

/**
 * Sorting classification for sedimentary rocks
 */
export interface SortingClass {
  name: string;
  minCoefficient: number;
  maxCoefficient: number;
}

/**
 * Basic descriptive statistics for a numeric dataset
 */
export interface DescriptiveStats {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number | null;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  skewness: number;
  kurtosis: number;
  percentile25: number;
  percentile75: number;
  iqr: number;
}

/**
 * Statistics grouped by mineral
 */
export interface MineralGroupStats {
  mineral: string;
  count: number;
  metrics: GrainMetrics[];
  sizeStats: DescriptiveStats;
  meanAspectRatio: number;
  meanCircularity: number;
  meanOrientation: number;
  orientationStdDev: number;
}

/**
 * Complete grain analysis results
 */
export interface GrainAnalysisResults {
  // Metadata
  micrographId: string;
  micrographName: string;
  sampleName: string;
  scalePixelsPerCentimeter: number;
  analysisDate: string;
  rockType: RockType;

  // Raw metrics
  grains: GrainMetrics[];

  // Size statistics (equivalent diameter)
  sizeStats: DescriptiveStats;

  // Shape statistics
  aspectRatioStats: DescriptiveStats;
  circularityStats: DescriptiveStats;

  // Orientation statistics
  orientationStats: DescriptiveStats;
  preferredOrientation: number | null; // Mean direction if fabric is significant
  orientationStrength: number; // 0-1, based on resultant vector length

  // Coverage
  totalAreaMicrons2: number;
  totalAreaPercent: number;

  // Sorting (sedimentary only)
  sortingCoefficient: number | null;
  sortingClass: string | null;

  // By mineral
  mineralGroups: MineralGroupStats[];
}

/**
 * Histogram bin
 */
export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  percentage: number;
  label: string;
}

/**
 * Rose diagram sector
 */
export interface RoseSector {
  angleMin: number; // degrees
  angleMax: number; // degrees
  count: number;
  percentage: number;
}
