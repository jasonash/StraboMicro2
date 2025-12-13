/**
 * Point Counting Service
 *
 * Provides grid generation algorithms and statistical calculations
 * for modal analysis using the point counting method.
 *
 * @example
 * ```typescript
 * import {
 *   generatePoints,
 *   calculatePointCountStatistics,
 *   calculateConfidenceInterval,
 * } from '@/services/pointCounting';
 *
 * // Generate a grid of points
 * const points = generatePoints('regular', 1000, 800, 400, true);
 *
 * // Calculate statistics for classified spots
 * const stats = calculatePointCountStatistics(spots);
 * console.log(`Quartz: ${stats.mineralStats[0].percentage}%`);
 * ```
 */

// Types
export type {
  GridType,
  GridPoint,
  GridDimensions,
  GridGenerationOptions,
  MineralStats,
  PointCountStatistics,
  ClassifiedSpot,
  ConfidenceLevel,
  GenerationSettings,
  SpotAppearanceOptions,
} from './types';

export { Z_SCORES } from './types';

// Grid Generation
export {
  calculateGridDimensions,
  calculateActualPointCount,
  generateRegularGrid,
  generateRandomPoints,
  generateStratifiedRandomPoints,
  generatePoints,
  filterPointsByRegion,
  type RegionBounds,
} from './gridGeneration';

// Statistics
export {
  calculateConfidenceInterval,
  calculateRecommendedPointCount,
  getPrecisionDescription,
  getSpotMineral,
  isSpotClassified,
  getUniqueMinerals,
  calculatePointCountStatistics,
  calculatePointCountStatisticsForMicrograph,
  calculateStatisticsFromSession,
  exportStatisticsToCSV,
  formatMineralStats,
} from './statistics';
