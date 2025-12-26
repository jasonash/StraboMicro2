/**
 * Statistics Engine for Grain Size Analysis
 *
 * Provides population statistics, sorting calculations, and classification
 * for grain size distributions.
 */

import type { GrainMetrics } from '../../utils/grainMetrics';
import type {
  DescriptiveStats,
  MineralGroupStats,
  GrainAnalysisResults,
  RockType,
  WentworthClass,
  IgneousClass,
  MetamorphicClass,
  SortingClass,
  HistogramBin,
  RoseSector,
} from './types';

// =============================================================================
// Classification Schemes
// =============================================================================

/**
 * Wentworth scale for sedimentary rocks
 * phi = -log2(diameter in mm)
 */
export const WENTWORTH_CLASSES: WentworthClass[] = [
  { name: 'Clay', phiMin: 8, phiMax: Infinity, sizeMinMicrons: 0, sizeMaxMicrons: 4, color: '#8B4513' },
  { name: 'Silt', phiMin: 4, phiMax: 8, sizeMinMicrons: 4, sizeMaxMicrons: 62, color: '#D2691E' },
  { name: 'Very Fine Sand', phiMin: 3, phiMax: 4, sizeMinMicrons: 62, sizeMaxMicrons: 125, color: '#F4A460' },
  { name: 'Fine Sand', phiMin: 2, phiMax: 3, sizeMinMicrons: 125, sizeMaxMicrons: 250, color: '#DEB887' },
  { name: 'Medium Sand', phiMin: 1, phiMax: 2, sizeMinMicrons: 250, sizeMaxMicrons: 500, color: '#FFE4C4' },
  { name: 'Coarse Sand', phiMin: 0, phiMax: 1, sizeMinMicrons: 500, sizeMaxMicrons: 1000, color: '#FFDAB9' },
  { name: 'Very Coarse Sand', phiMin: -1, phiMax: 0, sizeMinMicrons: 1000, sizeMaxMicrons: 2000, color: '#FFE4B5' },
  { name: 'Granule', phiMin: -2, phiMax: -1, sizeMinMicrons: 2000, sizeMaxMicrons: 4000, color: '#FFEFD5' },
  { name: 'Pebble', phiMin: -Infinity, phiMax: -2, sizeMinMicrons: 4000, sizeMaxMicrons: Infinity, color: '#FFF8DC' },
];

/**
 * Igneous grain size classification
 */
export const IGNEOUS_CLASSES: IgneousClass[] = [
  { name: 'Aphanitic', sizeMinMicrons: 0, sizeMaxMicrons: 1000, interpretation: 'Rapid cooling', color: '#4169E1' },
  { name: 'Fine Phaneritic', sizeMinMicrons: 1000, sizeMaxMicrons: 5000, interpretation: 'Moderate cooling', color: '#6495ED' },
  { name: 'Medium Phaneritic', sizeMinMicrons: 5000, sizeMaxMicrons: 30000, interpretation: 'Slow cooling', color: '#87CEEB' },
  { name: 'Coarse Phaneritic', sizeMinMicrons: 30000, sizeMaxMicrons: Infinity, interpretation: 'Very slow cooling', color: '#B0E0E6' },
];

/**
 * Metamorphic grain size classification
 */
export const METAMORPHIC_CLASSES: MetamorphicClass[] = [
  { name: 'Very Fine', sizeMinMicrons: 0, sizeMaxMicrons: 100, notes: 'Low-grade or rapid recrystallization', color: '#228B22' },
  { name: 'Fine', sizeMinMicrons: 100, sizeMaxMicrons: 1000, notes: '', color: '#32CD32' },
  { name: 'Medium', sizeMinMicrons: 1000, sizeMaxMicrons: 5000, notes: '', color: '#90EE90' },
  { name: 'Coarse', sizeMinMicrons: 5000, sizeMaxMicrons: Infinity, notes: 'High-grade or slow recrystallization', color: '#98FB98' },
];

/**
 * Sorting classification (Folk & Ward, 1957)
 */
export const SORTING_CLASSES: SortingClass[] = [
  { name: 'Very Well Sorted', minCoefficient: 0, maxCoefficient: 0.35 },
  { name: 'Well Sorted', minCoefficient: 0.35, maxCoefficient: 0.50 },
  { name: 'Moderately Well Sorted', minCoefficient: 0.50, maxCoefficient: 0.71 },
  { name: 'Moderately Sorted', minCoefficient: 0.71, maxCoefficient: 1.00 },
  { name: 'Poorly Sorted', minCoefficient: 1.00, maxCoefficient: 2.00 },
  { name: 'Very Poorly Sorted', minCoefficient: 2.00, maxCoefficient: Infinity },
];

// =============================================================================
// Basic Statistics Functions
// =============================================================================

/**
 * Calculate percentile value from sorted array
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
  if (lower === upper) return sortedValues[lower];

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Calculate mode (most frequent value) using binning
 */
export function calculateMode(values: number[], binCount = 20): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return min;

  const binWidth = (max - min) / binCount;
  const bins = new Array(binCount).fill(0);

  for (const v of values) {
    const binIndex = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    bins[binIndex]++;
  }

  const maxBinIndex = bins.indexOf(Math.max(...bins));
  return min + (maxBinIndex + 0.5) * binWidth;
}

/**
 * Calculate complete descriptive statistics for a numeric array
 */
export function calculateDescriptiveStats(values: number[]): DescriptiveStats {
  if (values.length === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      mode: null,
      stdDev: 0,
      variance: 0,
      min: 0,
      max: 0,
      range: 0,
      skewness: 0,
      kurtosis: 0,
      percentile25: 0,
      percentile75: 0,
      iqr: 0,
    };
  }

  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);

  // Basic stats
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];

  // Variance and standard deviation
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const median = percentile(sorted, 50);
  const percentile25 = percentile(sorted, 25);
  const percentile75 = percentile(sorted, 75);

  // Skewness (Fisher-Pearson)
  let skewness = 0;
  if (stdDev > 0 && n > 2) {
    const cubedDiffs = values.map(v => ((v - mean) / stdDev) ** 3);
    skewness = (n / ((n - 1) * (n - 2))) * cubedDiffs.reduce((acc, v) => acc + v, 0);
  }

  // Kurtosis (excess kurtosis)
  let kurtosis = 0;
  if (stdDev > 0 && n > 3) {
    const fourthDiffs = values.map(v => ((v - mean) / stdDev) ** 4);
    const m4 = fourthDiffs.reduce((acc, v) => acc + v, 0) / n;
    kurtosis = m4 - 3; // Subtract 3 for excess kurtosis (normal = 0)
  }

  return {
    count: n,
    sum,
    mean,
    median,
    mode: calculateMode(values),
    stdDev,
    variance,
    min,
    max,
    range: max - min,
    skewness,
    kurtosis,
    percentile25,
    percentile75,
    iqr: percentile75 - percentile25,
  };
}

// =============================================================================
// Sorting Coefficient (Sedimentary)
// =============================================================================

/**
 * Convert diameter in microns to phi scale
 * phi = -log2(diameter in mm) = -log2(diameter in µm / 1000)
 */
export function micronsToPhi(microns: number): number {
  if (microns <= 0) return Infinity;
  return -Math.log2(microns / 1000);
}

/**
 * Convert phi scale to diameter in microns
 */
export function phiToMicrons(phi: number): number {
  return Math.pow(2, -phi) * 1000;
}

/**
 * Calculate sorting coefficient (Trask, 1932 / Folk & Ward modified)
 * Uses (phi84 - phi16) / 2
 */
export function calculateSortingCoefficient(diametersInMicrons: number[]): number | null {
  if (diametersInMicrons.length < 2) return null;

  // Convert to phi and sort
  const phis = diametersInMicrons.map(d => micronsToPhi(d));
  phis.sort((a, b) => a - b);

  const phi16 = percentile(phis, 16);
  const phi84 = percentile(phis, 84);

  return (phi84 - phi16) / 2;
}

/**
 * Get sorting classification from coefficient
 */
export function getSortingClass(coefficient: number): string {
  for (const sc of SORTING_CLASSES) {
    if (coefficient >= sc.minCoefficient && coefficient < sc.maxCoefficient) {
      return sc.name;
    }
  }
  return 'Unknown';
}

// =============================================================================
// Orientation Statistics
// =============================================================================

/**
 * Calculate circular mean of orientations
 * Orientations are in degrees, 0-180 range (axial data)
 * Returns mean direction and resultant length (0-1)
 */
export function calculateCircularMean(orientations: number[]): {
  mean: number;
  resultantLength: number;
} {
  if (orientations.length === 0) {
    return { mean: 0, resultantLength: 0 };
  }

  // Double angles for axial data (0-180 → 0-360)
  let sumSin = 0;
  let sumCos = 0;

  for (const theta of orientations) {
    const rad = (theta * 2 * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }

  sumSin /= orientations.length;
  sumCos /= orientations.length;

  // Resultant length (0-1, higher = more concentrated)
  const R = Math.sqrt(sumSin ** 2 + sumCos ** 2);

  // Mean direction (halve back to 0-180)
  let meanDir = Math.atan2(sumSin, sumCos) * 180 / Math.PI / 2;
  if (meanDir < 0) meanDir += 180;

  return { mean: meanDir, resultantLength: R };
}

/**
 * Calculate circular standard deviation
 */
export function calculateCircularStdDev(resultantLength: number): number {
  if (resultantLength >= 1) return 0;
  if (resultantLength <= 0) return 90; // Maximum for uniform distribution
  return Math.sqrt(-2 * Math.log(resultantLength)) * 180 / Math.PI / 2;
}

// =============================================================================
// Histogram Generation
// =============================================================================

/**
 * Generate histogram bins for a dataset
 */
export function generateHistogramBins(
  values: number[],
  binCount: number = 15,
  useLogScale: boolean = false
): HistogramBin[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  let min = sorted[0];
  let max = sorted[sorted.length - 1];

  // Ensure we have a valid range
  if (min === max) {
    min = min * 0.9;
    max = max * 1.1;
  }

  const bins: HistogramBin[] = [];

  if (useLogScale && min > 0) {
    // Logarithmic bins
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const logWidth = (logMax - logMin) / binCount;

    for (let i = 0; i < binCount; i++) {
      const binMin = Math.pow(10, logMin + i * logWidth);
      const binMax = Math.pow(10, logMin + (i + 1) * logWidth);
      const count = values.filter(v => v >= binMin && (i === binCount - 1 ? v <= binMax : v < binMax)).length;

      bins.push({
        min: binMin,
        max: binMax,
        count,
        percentage: (count / values.length) * 100,
        label: `${binMin.toFixed(0)}-${binMax.toFixed(0)}`,
      });
    }
  } else {
    // Linear bins
    const binWidth = (max - min) / binCount;

    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      const binMax = min + (i + 1) * binWidth;
      const count = values.filter(v => v >= binMin && (i === binCount - 1 ? v <= binMax : v < binMax)).length;

      bins.push({
        min: binMin,
        max: binMax,
        count,
        percentage: (count / values.length) * 100,
        label: `${binMin.toFixed(0)}-${binMax.toFixed(0)}`,
      });
    }
  }

  return bins;
}

// =============================================================================
// Rose Diagram Generation
// =============================================================================

/**
 * Generate rose diagram sectors for orientation data
 */
export function generateRoseSectors(
  orientations: number[],
  sectorCount: number = 18 // 10° sectors
): RoseSector[] {
  if (orientations.length === 0) return [];

  const sectorWidth = 180 / sectorCount;
  const sectors: RoseSector[] = [];

  for (let i = 0; i < sectorCount; i++) {
    const angleMin = i * sectorWidth;
    const angleMax = (i + 1) * sectorWidth;
    const count = orientations.filter(o => o >= angleMin && o < angleMax).length;

    sectors.push({
      angleMin,
      angleMax,
      count,
      percentage: (count / orientations.length) * 100,
    });
  }

  return sectors;
}

// =============================================================================
// Mineral Grouping
// =============================================================================

/**
 * Group grain metrics by mineral
 */
export function groupByMineral(grains: GrainMetrics[]): MineralGroupStats[] {
  // Group grains by mineral name
  const groups = new Map<string, GrainMetrics[]>();

  for (const grain of grains) {
    const mineral = grain.mineral || 'Unclassified';
    if (!groups.has(mineral)) {
      groups.set(mineral, []);
    }
    groups.get(mineral)!.push(grain);
  }

  // Calculate stats for each group
  const results: MineralGroupStats[] = [];

  for (const [mineral, metrics] of groups) {
    const diameters = metrics.map(m => m.equivalentDiameterMicrons);
    const aspectRatios = metrics.map(m => m.aspectRatio);
    const circularities = metrics.map(m => m.circularity);
    const orientations = metrics.map(m => m.orientationDegrees);

    const sizeStats = calculateDescriptiveStats(diameters);
    const orientationCircular = calculateCircularMean(orientations);

    results.push({
      mineral,
      count: metrics.length,
      metrics,
      sizeStats,
      meanAspectRatio: aspectRatios.reduce((a, b) => a + b, 0) / aspectRatios.length,
      meanCircularity: circularities.reduce((a, b) => a + b, 0) / circularities.length,
      meanOrientation: orientationCircular.mean,
      orientationStdDev: calculateCircularStdDev(orientationCircular.resultantLength),
    });
  }

  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  return results;
}

// =============================================================================
// Complete Analysis
// =============================================================================

/**
 * Perform complete grain size analysis
 */
export function analyzeGrains(
  grains: GrainMetrics[],
  micrographId: string,
  micrographName: string,
  sampleName: string,
  scalePixelsPerCentimeter: number,
  micrographAreaMicrons2: number,
  rockType: RockType = 'sedimentary'
): GrainAnalysisResults {
  // Extract arrays for statistics
  const diameters = grains.map(g => g.equivalentDiameterMicrons);
  const aspectRatios = grains.map(g => g.aspectRatio);
  const circularities = grains.map(g => g.circularity);
  const orientations = grains.map(g => g.orientationDegrees);
  const areas = grains.map(g => g.areaMicrons2);

  // Calculate statistics
  const sizeStats = calculateDescriptiveStats(diameters);
  const aspectRatioStats = calculateDescriptiveStats(aspectRatios);
  const circularityStats = calculateDescriptiveStats(circularities);
  const orientationStats = calculateDescriptiveStats(orientations);

  // Orientation analysis
  const circularOrientation = calculateCircularMean(orientations);
  const hasPreferredOrientation = circularOrientation.resultantLength > 0.3;

  // Total coverage
  const totalAreaMicrons2 = areas.reduce((a, b) => a + b, 0);
  const totalAreaPercent = micrographAreaMicrons2 > 0
    ? (totalAreaMicrons2 / micrographAreaMicrons2) * 100
    : 0;

  // Sorting (sedimentary only)
  let sortingCoefficient: number | null = null;
  let sortingClass: string | null = null;
  if (rockType === 'sedimentary' && diameters.length >= 2) {
    sortingCoefficient = calculateSortingCoefficient(diameters);
    if (sortingCoefficient !== null) {
      sortingClass = getSortingClass(sortingCoefficient);
    }
  }

  // Group by mineral
  const mineralGroups = groupByMineral(grains);

  return {
    micrographId,
    micrographName,
    sampleName,
    scalePixelsPerCentimeter,
    analysisDate: new Date().toISOString(),
    rockType,

    grains,
    sizeStats,
    aspectRatioStats,
    circularityStats,
    orientationStats,

    preferredOrientation: hasPreferredOrientation ? circularOrientation.mean : null,
    orientationStrength: circularOrientation.resultantLength,

    totalAreaMicrons2,
    totalAreaPercent,

    sortingCoefficient,
    sortingClass,

    mineralGroups,
  };
}

/**
 * Get classification scheme for rock type
 */
export function getClassificationScheme(rockType: RockType): {
  classes: Array<{ name: string; sizeMinMicrons: number; sizeMaxMicrons: number; color: string }>;
  label: string;
} {
  switch (rockType) {
    case 'sedimentary':
      return {
        classes: WENTWORTH_CLASSES.map(c => ({
          name: c.name,
          sizeMinMicrons: c.sizeMinMicrons,
          sizeMaxMicrons: c.sizeMaxMicrons,
          color: c.color,
        })),
        label: 'Wentworth Scale',
      };
    case 'igneous':
      return {
        classes: IGNEOUS_CLASSES.map(c => ({
          name: c.name,
          sizeMinMicrons: c.sizeMinMicrons,
          sizeMaxMicrons: c.sizeMaxMicrons,
          color: c.color,
        })),
        label: 'Igneous Classification',
      };
    case 'metamorphic':
      return {
        classes: METAMORPHIC_CLASSES.map(c => ({
          name: c.name,
          sizeMinMicrons: c.sizeMinMicrons,
          sizeMaxMicrons: c.sizeMaxMicrons,
          color: c.color,
        })),
        label: 'Metamorphic Classification',
      };
  }
}

/**
 * Classify a grain size using the appropriate scheme
 */
export function classifyGrainSize(
  diameterMicrons: number,
  rockType: RockType
): string {
  const scheme = getClassificationScheme(rockType);
  for (const cls of scheme.classes) {
    if (diameterMicrons >= cls.sizeMinMicrons && diameterMicrons < cls.sizeMaxMicrons) {
      return cls.name;
    }
  }
  return 'Unknown';
}
