/**
 * Point Counting Statistics Service
 *
 * Statistical calculations for modal analysis using the Chayes method.
 * Provides confidence intervals and percentage calculations for point counting.
 */

import type {
  MineralStats,
  PointCountStatistics,
  ConfidenceLevel,
} from './types';
import { Z_SCORES } from './types';
import type { Spot } from '@/types/project-types';
import type { PointCountSession } from '@/types/point-count-types';

// Re-export Z_SCORES for convenience
export { Z_SCORES };

// ============================================================================
// CONFIDENCE INTERVAL CALCULATIONS
// ============================================================================

/**
 * Calculate the 95% confidence interval for a proportion using the Chayes method.
 *
 * Based on Felix Chayes' method (1956) for modal analysis:
 * - Uses normal approximation to binomial distribution
 * - Returns the margin of error as ± percentage points
 *
 * For example, if 25% of 400 points are quartz, the CI is ±4.2%,
 * meaning the true proportion is likely between 20.8% and 29.2%.
 *
 * @param count - Number of points hitting this mineral
 * @param total - Total number of classified points
 * @param confidenceLevel - Confidence level (default 0.95 for 95%)
 * @returns Confidence interval as ± percentage points
 */
export function calculateConfidenceInterval(
  count: number,
  total: number,
  confidenceLevel: ConfidenceLevel = 0.95
): number {
  if (total === 0) return 0;

  const p = count / total;
  const z = Z_SCORES[confidenceLevel];
  const standardError = Math.sqrt((p * (1 - p)) / total);

  return z * standardError * 100;
}

/**
 * Calculate the recommended point count to achieve a target confidence interval.
 *
 * Uses the formula: n = z² × p × (1-p) / E²
 * Where:
 * - n = sample size
 * - z = z-score for confidence level
 * - p = expected proportion (use 0.25 for worst case at 25%)
 * - E = desired margin of error
 *
 * @param targetCI - Target confidence interval (e.g., 0.05 for ±5%)
 * @param expectedProportion - Expected proportion (default 0.25 for worst case)
 * @param confidenceLevel - Confidence level (default 0.95)
 * @returns Recommended number of points
 */
export function calculateRecommendedPointCount(
  targetCI: number,
  expectedProportion: number = 0.25,
  confidenceLevel: ConfidenceLevel = 0.95
): number {
  const z = Z_SCORES[confidenceLevel];
  const p = expectedProportion;
  const E = targetCI;

  const n = (z * z * p * (1 - p)) / (E * E);
  return Math.ceil(n);
}

/**
 * Get a human-readable description of statistical precision.
 *
 * @param pointCount - Number of points
 * @returns Description of precision at common percentages
 */
export function getPrecisionDescription(pointCount: number): string {
  const ci25 = calculateConfidenceInterval(Math.round(pointCount * 0.25), pointCount);
  const ci10 = calculateConfidenceInterval(Math.round(pointCount * 0.10), pointCount);

  return `At 25%: ±${ci25.toFixed(1)}%, At 10%: ±${ci10.toFixed(1)}%`;
}

// ============================================================================
// SPOT CLASSIFICATION HELPERS
// ============================================================================

/**
 * Get the primary mineral classification for a spot.
 *
 * Looks at the spot's mineralogy.minerals array and returns the first mineral name.
 * Returns null if the spot has not been classified.
 *
 * @param spot - The spot to get classification for
 * @returns Mineral name or null if not classified
 */
export function getSpotMineral(spot: Spot): string | null {
  const minerals = spot.mineralogy?.minerals;
  if (!minerals || minerals.length === 0) return null;

  const firstMineral = minerals[0];
  return firstMineral?.name || null;
}

/**
 * Check if a spot has been classified (has at least one mineral assigned).
 *
 * @param spot - The spot to check
 * @returns True if classified, false otherwise
 */
export function isSpotClassified(spot: Spot): boolean {
  return getSpotMineral(spot) !== null;
}

/**
 * Get all unique mineral names from an array of spots.
 *
 * @param spots - Array of spots to analyze
 * @returns Array of unique mineral names (sorted alphabetically)
 */
export function getUniqueMinerals(spots: Spot[]): string[] {
  const minerals = new Set<string>();

  for (const spot of spots) {
    const mineral = getSpotMineral(spot);
    if (mineral) {
      minerals.add(mineral);
    }
  }

  return Array.from(minerals).sort();
}

// ============================================================================
// STATISTICS CALCULATION
// ============================================================================

/**
 * Calculate complete point counting statistics for a set of spots.
 *
 * @param spots - Array of spots (typically point-count generated spots)
 * @param confidenceLevel - Confidence level for intervals (default 0.95)
 * @returns Complete statistics including per-mineral breakdown
 */
export function calculatePointCountStatistics(
  spots: Spot[],
  confidenceLevel: ConfidenceLevel = 0.95
): PointCountStatistics {
  const totalPoints = spots.length;
  const classifiedSpots = spots.filter(isSpotClassified);
  const classifiedPoints = classifiedSpots.length;
  const unclassifiedPoints = totalPoints - classifiedPoints;

  // Count minerals
  const mineralCounts = new Map<string, number>();
  for (const spot of classifiedSpots) {
    const mineral = getSpotMineral(spot);
    if (mineral) {
      mineralCounts.set(mineral, (mineralCounts.get(mineral) || 0) + 1);
    }
  }

  // Calculate per-mineral statistics
  const mineralStats: MineralStats[] = [];
  for (const [name, count] of mineralCounts.entries()) {
    const percentage = classifiedPoints > 0 ? (count / classifiedPoints) * 100 : 0;
    const ci = calculateConfidenceInterval(count, classifiedPoints, confidenceLevel);

    mineralStats.push({
      name,
      count,
      percentage,
      confidenceInterval: ci,
      percentageLow: Math.max(0, percentage - ci),
      percentageHigh: Math.min(100, percentage + ci),
    });
  }

  // Sort by count descending
  mineralStats.sort((a, b) => b.count - a.count);

  return {
    totalPoints,
    classifiedPoints,
    unclassifiedPoints,
    classificationProgress: totalPoints > 0 ? (classifiedPoints / totalPoints) * 100 : 0,
    mineralStats,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate statistics for only point-count generated spots on a micrograph.
 *
 * Filters spots to only include those with generationMethod === 'point-count'.
 *
 * @param allSpots - All spots on the micrograph
 * @param confidenceLevel - Confidence level for intervals (default 0.95)
 * @returns Statistics for point-count spots only
 */
export function calculatePointCountStatisticsForMicrograph(
  allSpots: Spot[],
  confidenceLevel: ConfidenceLevel = 0.95
): PointCountStatistics {
  const pointCountSpots = allSpots.filter(
    (spot) => spot.generationMethod === 'point-count'
  );
  return calculatePointCountStatistics(pointCountSpots, confidenceLevel);
}

/**
 * Calculate statistics from a Point Count Session.
 *
 * Converts session data (using new PointCountSession format) to the
 * PointCountStatistics format used by the statistics display components.
 *
 * @param session - Point count session with points and modal composition
 * @param confidenceLevel - Confidence level for intervals (default 0.95)
 * @returns Complete statistics including per-mineral breakdown
 */
export function calculateStatisticsFromSession(
  session: PointCountSession,
  confidenceLevel: ConfidenceLevel = 0.95
): PointCountStatistics {
  const { summary } = session;
  const totalPoints = summary.totalPoints;
  const classifiedPoints = summary.classifiedCount;
  const unclassifiedPoints = totalPoints - classifiedPoints;

  // Calculate per-mineral statistics from modalComposition
  const mineralStats: MineralStats[] = [];

  for (const [name, count] of Object.entries(summary.modalComposition)) {
    const percentage = classifiedPoints > 0 ? (count / classifiedPoints) * 100 : 0;
    const ci = calculateConfidenceInterval(count, classifiedPoints, confidenceLevel);

    mineralStats.push({
      name,
      count,
      percentage,
      confidenceInterval: ci,
      percentageLow: Math.max(0, percentage - ci),
      percentageHigh: Math.min(100, percentage + ci),
    });
  }

  // Sort by count descending
  mineralStats.sort((a, b) => b.count - a.count);

  return {
    totalPoints,
    classifiedPoints,
    unclassifiedPoints,
    classificationProgress: totalPoints > 0 ? (classifiedPoints / totalPoints) * 100 : 0,
    mineralStats,
    calculatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Format statistics as a CSV string for export.
 *
 * @param stats - Statistics to export
 * @returns CSV string with headers
 */
export function exportStatisticsToCSV(stats: PointCountStatistics): string {
  const lines: string[] = [];

  // Header info
  lines.push('Point Counting Statistics Export');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total Points: ${stats.totalPoints}`);
  lines.push(`Classified: ${stats.classifiedPoints}`);
  lines.push(`Progress: ${stats.classificationProgress.toFixed(1)}%`);
  lines.push('');

  // Column headers
  lines.push('Mineral,Count,Percentage,95% CI,Low,High');

  // Data rows
  for (const mineral of stats.mineralStats) {
    lines.push(
      `${mineral.name},${mineral.count},${mineral.percentage.toFixed(1)}%,±${mineral.confidenceInterval.toFixed(1)}%,${mineral.percentageLow.toFixed(1)}%,${mineral.percentageHigh.toFixed(1)}%`
    );
  }

  return lines.join('\n');
}

/**
 * Format a single mineral's statistics as a human-readable string.
 *
 * @param stats - Mineral statistics
 * @returns Formatted string like "Quartz: 25.0% ±4.2% (100 points)"
 */
export function formatMineralStats(stats: MineralStats): string {
  return `${stats.name}: ${stats.percentage.toFixed(1)}% ±${stats.confidenceInterval.toFixed(1)}% (${stats.count} points)`;
}
