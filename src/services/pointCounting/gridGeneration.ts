/**
 * Grid Generation Service
 *
 * Algorithms for generating point grids for modal analysis.
 * Supports regular grids, random points, and stratified random sampling.
 */

import type { GridPoint, GridDimensions, GridType } from './types';

// ============================================================================
// GRID DIMENSION CALCULATIONS
// ============================================================================

/**
 * Calculate grid dimensions for a given image size and point count.
 * Maintains aspect ratio to produce roughly square cells.
 *
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param pointCount - Target number of points
 * @returns Grid dimensions with rows, columns, and spacing
 */
export function calculateGridDimensions(
  imageWidth: number,
  imageHeight: number,
  pointCount: number
): GridDimensions {
  const aspectRatio = imageWidth / imageHeight;
  const cols = Math.round(Math.sqrt(pointCount * aspectRatio));
  const rows = Math.round(pointCount / cols);
  const spacingX = imageWidth / cols;
  const spacingY = imageHeight / rows;
  return { rows, cols, spacingX, spacingY };
}

/**
 * Calculate the actual number of points that will be generated for a grid.
 * May differ from target due to rounding.
 *
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param targetPointCount - Target number of points
 * @returns Actual number of points that will be generated
 */
export function calculateActualPointCount(
  imageWidth: number,
  imageHeight: number,
  targetPointCount: number
): number {
  const { rows, cols } = calculateGridDimensions(imageWidth, imageHeight, targetPointCount);
  return rows * cols;
}

// ============================================================================
// GRID GENERATION ALGORITHMS
// ============================================================================

/**
 * Generate a regular grid of points with uniform spacing.
 *
 * Points are arranged in a rectangular grid pattern with consistent
 * spacing in both X and Y directions.
 *
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param pointCount - Target number of points
 * @param offsetByHalfSpacing - If true, offset grid by half-spacing to avoid edges
 * @returns Array of grid points with positions and indices
 */
export function generateRegularGrid(
  imageWidth: number,
  imageHeight: number,
  pointCount: number,
  offsetByHalfSpacing: boolean
): GridPoint[] {
  const { rows, cols, spacingX, spacingY } = calculateGridDimensions(
    imageWidth,
    imageHeight,
    pointCount
  );

  const offsetX = offsetByHalfSpacing ? spacingX / 2 : 0;
  const offsetY = offsetByHalfSpacing ? spacingY / 2 : 0;

  const points: GridPoint[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      points.push({
        x: offsetX + col * spacingX,
        y: offsetY + row * spacingY,
        row,
        col,
      });
    }
  }

  return points;
}

/**
 * Generate purely random points distributed across the image.
 *
 * Points are placed randomly with no spatial structure.
 * May result in uneven coverage with clusters and gaps.
 *
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param pointCount - Number of points to generate
 * @returns Array of random points with positions
 */
export function generateRandomPoints(
  imageWidth: number,
  imageHeight: number,
  pointCount: number
): GridPoint[] {
  const points: GridPoint[] = [];

  for (let i = 0; i < pointCount; i++) {
    points.push({
      x: Math.random() * imageWidth,
      y: Math.random() * imageHeight,
      row: i, // No grid structure, use sequential index
      col: 0,
    });
  }

  return points;
}

/**
 * Generate stratified random points using systematic random sampling.
 *
 * The image is divided into a regular grid, and one random point
 * is placed within each cell. This ensures even spatial coverage
 * while maintaining randomness within each cell.
 *
 * This is often preferred over pure random sampling as it:
 * - Guarantees coverage of all image regions
 * - Reduces clustering effects
 * - Maintains statistical validity
 *
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param pointCount - Target number of points (determines cell count)
 * @returns Array of stratified random points with positions and cell indices
 */
export function generateStratifiedRandomPoints(
  imageWidth: number,
  imageHeight: number,
  pointCount: number
): GridPoint[] {
  const { rows, cols } = calculateGridDimensions(imageWidth, imageHeight, pointCount);
  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  const points: GridPoint[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Cell boundaries
      const cellX = col * cellWidth;
      const cellY = row * cellHeight;

      // Random point within cell
      points.push({
        x: cellX + Math.random() * cellWidth,
        y: cellY + Math.random() * cellHeight,
        row,
        col,
      });
    }
  }

  return points;
}

/**
 * Generate points using the specified grid type.
 *
 * @param gridType - Type of grid pattern to generate
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param pointCount - Target number of points
 * @param offsetByHalfSpacing - For regular grids, whether to offset by half-spacing
 * @returns Array of generated points
 */
export function generatePoints(
  gridType: GridType,
  imageWidth: number,
  imageHeight: number,
  pointCount: number,
  offsetByHalfSpacing: boolean = true
): GridPoint[] {
  switch (gridType) {
    case 'random':
      return generateRandomPoints(imageWidth, imageHeight, pointCount);
    case 'stratified':
      return generateStratifiedRandomPoints(imageWidth, imageHeight, pointCount);
    case 'regular':
    default:
      return generateRegularGrid(imageWidth, imageHeight, pointCount, offsetByHalfSpacing);
  }
}

// ============================================================================
// REGION FILTERING
// ============================================================================

/** Region bounds for filtering points */
export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Filter points to only include those within a specified region.
 *
 * @param points - Array of points to filter
 * @param region - Region bounds to filter by
 * @returns Array of points within the region
 */
export function filterPointsByRegion(
  points: GridPoint[],
  region: RegionBounds
): GridPoint[] {
  return points.filter(
    (p) =>
      p.x >= region.x &&
      p.x <= region.x + region.width &&
      p.y >= region.y &&
      p.y <= region.y + region.height
  );
}
