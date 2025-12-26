/**
 * Grain Metrics Calculations
 *
 * This module provides geometry calculations for polygon spots to support
 * grain size analysis. All metrics are calculated on-demand from polygon
 * vertices rather than stored on spots.
 *
 * Design Philosophy: Calculate on-demand for accuracy
 * - Geometry can change via edit, merge, split operations
 * - Works for ALL polygon spots, not just grain-detected ones
 * - Low overhead: ~200 polygons × ~50 vertices = milliseconds
 */

import type { Spot } from '../types/project-types';

/**
 * Normalized coordinate point
 */
interface Point {
  X: number;
  Y: number;
}

/**
 * Complete grain metrics calculated from polygon geometry
 */
export interface GrainMetrics {
  spotId: string;
  spotName: string;
  mineral?: string;

  // Pixel values
  areaPixels: number;
  perimeterPixels: number;
  centroid: Point;
  majorAxisPixels: number;
  minorAxisPixels: number;

  // Derived values (using scale)
  areaMicrons2: number;
  perimeterMicrons: number;
  equivalentDiameterMicrons: number;
  majorAxisMicrons: number;
  minorAxisMicrons: number;

  // Dimensionless
  aspectRatio: number;
  orientationDegrees: number;
  circularity: number;
}

/**
 * Normalize point format to uppercase X, Y
 */
function normalizePoint(p: { X?: number; Y?: number; x?: number; y?: number }): Point {
  return {
    X: p.X ?? p.x ?? 0,
    Y: p.Y ?? p.y ?? 0,
  };
}

/**
 * Calculate polygon area using the Shoelace formula
 * @param points - Array of polygon vertices
 * @returns Area in square pixels (always positive)
 */
export function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].X * points[j].Y;
    area -= points[j].X * points[i].Y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate polygon perimeter
 * @param points - Array of polygon vertices
 * @returns Perimeter in pixels
 */
export function calculatePerimeter(points: Point[]): number {
  if (points.length < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    perimeter += Math.sqrt((p2.X - p1.X) ** 2 + (p2.Y - p1.Y) ** 2);
  }
  return perimeter;
}

/**
 * Calculate polygon centroid using the signed area method
 * Falls back to arithmetic mean for degenerate polygons
 * @param points - Array of polygon vertices
 * @returns Centroid coordinates
 */
export function calculateCentroid(points: Point[]): Point {
  if (points.length === 0) return { X: 0, Y: 0 };
  if (points.length === 1) return { ...points[0] };
  if (points.length === 2) {
    return {
      X: (points[0].X + points[1].X) / 2,
      Y: (points[0].Y + points[1].Y) / 2,
    };
  }

  const n = points.length;
  let cx = 0, cy = 0, signedArea = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i].X * points[j].Y - points[j].X * points[i].Y;
    signedArea += cross;
    cx += (points[i].X + points[j].X) * cross;
    cy += (points[i].Y + points[j].Y) * cross;
  }

  signedArea /= 2;

  // Handle degenerate polygon (zero area)
  if (Math.abs(signedArea) < 1e-10) {
    return {
      X: points.reduce((sum, p) => sum + p.X, 0) / n,
      Y: points.reduce((sum, p) => sum + p.Y, 0) / n,
    };
  }

  return {
    X: cx / (6 * signedArea),
    Y: cy / (6 * signedArea),
  };
}

/**
 * Calculate best-fit ellipse parameters using image moments
 * @param points - Array of polygon vertices
 * @returns Ellipse parameters (axes and orientation)
 */
export function calculateEllipseMetrics(points: Point[]): {
  majorAxis: number;
  minorAxis: number;
  orientation: number; // degrees 0-180
} {
  if (points.length < 3) {
    return { majorAxis: 0, minorAxis: 0, orientation: 0 };
  }

  // 1. Calculate centroid
  const centroid = calculateCentroid(points);
  const cx = centroid.X;
  const cy = centroid.Y;

  // 2. Calculate central moments (second-order)
  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (const p of points) {
    const dx = p.X - cx;
    const dy = p.Y - cy;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
  }
  mu20 /= points.length;
  mu02 /= points.length;
  mu11 /= points.length;

  // 3. Calculate eigenvalues of covariance matrix
  // Covariance matrix: [[mu20, mu11], [mu11, mu02]]
  // Eigenvalues: (trace ± sqrt(trace² - 4*det)) / 2
  const diff = mu20 - mu02;
  const discriminant = Math.sqrt(diff * diff + 4 * mu11 * mu11);
  const lambda1 = (mu20 + mu02 + discriminant) / 2;
  const lambda2 = (mu20 + mu02 - discriminant) / 2;

  // 4. Major/minor axes (2× standard deviation along each axis = 4×sqrt(eigenvalue))
  const majorAxis = 4 * Math.sqrt(Math.max(lambda1, 0));
  const minorAxis = 4 * Math.sqrt(Math.max(lambda2, 0));

  // 5. Orientation (angle of major axis from horizontal)
  // atan2(2*mu11, mu20-mu02) / 2 gives angle of principal axis
  let orientation = 0.5 * Math.atan2(2 * mu11, diff);
  // Convert to degrees and normalize to 0-180°
  orientation = ((orientation * 180 / Math.PI) % 180 + 180) % 180;

  return { majorAxis, minorAxis, orientation };
}

/**
 * Calculate circularity (isoperimetric quotient)
 * A circle has circularity = 1, more irregular shapes approach 0
 * @param area - Polygon area
 * @param perimeter - Polygon perimeter
 * @returns Circularity value between 0 and 1
 */
export function calculateCircularity(area: number, perimeter: number): number {
  if (perimeter === 0) return 0;
  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
  // Clamp to [0, 1] to handle numerical precision issues
  return Math.min(1, Math.max(0, circularity));
}

/**
 * Calculate all grain metrics for a polygon spot
 * @param spot - The spot to analyze (must have polygon geometry)
 * @param scalePixelsPerCentimeter - Scale factor from micrograph
 * @returns Complete grain metrics, or null if not a valid polygon
 */
export function calculateGrainMetrics(
  spot: Spot,
  scalePixelsPerCentimeter: number
): GrainMetrics | null {
  // Validate input
  if (!spot.points || spot.points.length < 3) {
    return null;
  }
  if (spot.geometryType !== 'polygon') {
    return null;
  }

  // Normalize point format
  const points = spot.points.map(p => normalizePoint(p as { X?: number; Y?: number; x?: number; y?: number }));

  // Calculate pixel metrics
  const areaPixels = calculateArea(points);
  const perimeterPixels = calculatePerimeter(points);
  const centroid = calculateCentroid(points);
  const ellipse = calculateEllipseMetrics(points);
  const circularity = calculateCircularity(areaPixels, perimeterPixels);

  // Convert to microns
  // 1 cm = 10,000 µm
  const µmPerPixel = 10000 / scalePixelsPerCentimeter;
  const µmPerPixel2 = µmPerPixel * µmPerPixel;

  // Extract mineral name from mineralogy if present
  const mineral = spot.mineralogy?.minerals?.[0]?.name ?? undefined;

  return {
    spotId: spot.id,
    spotName: spot.name || '',
    mineral,

    // Pixel values
    areaPixels,
    perimeterPixels,
    centroid,
    majorAxisPixels: ellipse.majorAxis,
    minorAxisPixels: ellipse.minorAxis,

    // Real-world values (microns)
    areaMicrons2: areaPixels * µmPerPixel2,
    perimeterMicrons: perimeterPixels * µmPerPixel,
    equivalentDiameterMicrons: 2 * Math.sqrt(areaPixels / Math.PI) * µmPerPixel,
    majorAxisMicrons: ellipse.majorAxis * µmPerPixel,
    minorAxisMicrons: ellipse.minorAxis * µmPerPixel,

    // Dimensionless metrics
    aspectRatio: ellipse.minorAxis > 0 ? ellipse.majorAxis / ellipse.minorAxis : 1,
    orientationDegrees: ellipse.orientation,
    circularity,
  };
}

/**
 * Calculate grain metrics for multiple spots
 * @param spots - Array of spots to analyze
 * @param scalePixelsPerCentimeter - Scale factor from micrograph
 * @returns Array of grain metrics (only valid polygons included)
 */
export function calculateAllGrainMetrics(
  spots: Spot[],
  scalePixelsPerCentimeter: number
): GrainMetrics[] {
  const metrics: GrainMetrics[] = [];

  for (const spot of spots) {
    const m = calculateGrainMetrics(spot, scalePixelsPerCentimeter);
    if (m) {
      metrics.push(m);
    }
  }

  return metrics;
}
