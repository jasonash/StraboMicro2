/**
 * Geometry Measurement Utilities
 *
 * Calculates real-world measurements (length, area, perimeter) for spot geometries
 * using the micrograph's scale calibration (scalePixelsPerCentimeter).
 */

import type { Geometry, SimpleCoord } from '@/types/project-types';

// Unit thresholds for auto-selection (in centimeters)
const CM_TO_UM = 10000;  // 10,000 micrometers per cm
const CM_TO_MM = 10;     // 10 millimeters per cm

/**
 * Measurement result with value and formatted string
 */
export interface Measurement {
  value: number;      // Value in the selected unit
  unit: string;       // Unit label (μm, mm, cm, etc.)
  formatted: string;  // Formatted string with value and unit
}

/**
 * Calculate the Euclidean distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Extract coordinates from either GeoJSON geometry or legacy points array
 * Returns array of [x, y] coordinate pairs
 */
function extractCoordinates(
  geometry?: Geometry | null,
  points?: SimpleCoord[] | null
): number[][] | null {
  // Try GeoJSON geometry first
  if (geometry?.coordinates) {
    if (geometry.type === 'LineString') {
      // LineString: coordinates is number[][]
      return geometry.coordinates as number[][];
    }
    if (geometry.type === 'Polygon') {
      // Polygon: coordinates is number[][][] (outer ring is first element)
      const rings = geometry.coordinates as number[][][];
      return rings[0] || null;
    }
  }

  // Fall back to legacy points array
  if (points && points.length > 0) {
    return points.map(p => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0]);
  }

  return null;
}

/**
 * Calculate the total length of a line (sum of all segments) in pixels
 */
function calculateLineLengthPixels(coords: number[][]): number {
  if (coords.length < 2) return 0;

  let totalLength = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalLength += distance(
      coords[i][0], coords[i][1],
      coords[i + 1][0], coords[i + 1][1]
    );
  }
  return totalLength;
}

/**
 * Calculate the perimeter of a polygon in pixels
 */
function calculatePerimeterPixels(coords: number[][]): number {
  if (coords.length < 3) return 0;

  let perimeter = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    perimeter += distance(
      coords[i][0], coords[i][1],
      coords[i + 1][0], coords[i + 1][1]
    );
  }
  // Close the polygon (last point to first point)
  // Note: GeoJSON polygons should already be closed, but legacy format may not be
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    perimeter += distance(last[0], last[1], first[0], first[1]);
  }
  return perimeter;
}

/**
 * Calculate the area of a polygon in square pixels using the Shoelace formula
 * Works for any simple (non-self-intersecting) polygon
 */
function calculateAreaPixels(coords: number[][]): number {
  if (coords.length < 3) return 0;

  let area = 0;
  const n = coords.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }

  return Math.abs(area) / 2;
}

/**
 * Convert a length from centimeters to the most appropriate unit
 * and format with 3 decimal places
 */
function formatLength(lengthCm: number): Measurement {
  const lengthMm = lengthCm * CM_TO_MM;
  const lengthUm = lengthCm * CM_TO_UM;

  // Auto-select unit based on magnitude
  if (lengthCm >= 1) {
    return {
      value: lengthCm,
      unit: 'cm',
      formatted: `${lengthCm.toFixed(3)} cm`
    };
  } else if (lengthMm >= 1) {
    return {
      value: lengthMm,
      unit: 'mm',
      formatted: `${lengthMm.toFixed(3)} mm`
    };
  } else {
    return {
      value: lengthUm,
      unit: 'μm',
      formatted: `${lengthUm.toFixed(3)} μm`
    };
  }
}

/**
 * Convert an area from square centimeters to the most appropriate unit
 * and format with 3 decimal places
 */
function formatArea(areaCm2: number): Measurement {
  const areaMm2 = areaCm2 * (CM_TO_MM * CM_TO_MM);      // 100 mm² per cm²
  const areaUm2 = areaCm2 * (CM_TO_UM * CM_TO_UM);      // 100,000,000 μm² per cm²

  // Auto-select unit based on magnitude
  if (areaCm2 >= 1) {
    return {
      value: areaCm2,
      unit: 'cm²',
      formatted: `${areaCm2.toFixed(3)} cm²`
    };
  } else if (areaMm2 >= 1) {
    return {
      value: areaMm2,
      unit: 'mm²',
      formatted: `${areaMm2.toFixed(3)} mm²`
    };
  } else {
    return {
      value: areaUm2,
      unit: 'μm²',
      formatted: `${areaUm2.toFixed(3)} μm²`
    };
  }
}

/**
 * Calculate line length measurement
 * Returns null if scale is not set or geometry is invalid
 */
export function calculateLineLength(
  geometry: Geometry | null | undefined,
  points: SimpleCoord[] | null | undefined,
  scalePixelsPerCentimeter: number | null | undefined
): Measurement | null {
  if (!scalePixelsPerCentimeter) return null;

  const coords = extractCoordinates(geometry, points);
  if (!coords || coords.length < 2) return null;

  const lengthPixels = calculateLineLengthPixels(coords);
  const lengthCm = lengthPixels / scalePixelsPerCentimeter;

  return formatLength(lengthCm);
}

/**
 * Calculate polygon area measurement
 * Returns null if scale is not set or geometry is invalid
 */
export function calculatePolygonArea(
  geometry: Geometry | null | undefined,
  points: SimpleCoord[] | null | undefined,
  scalePixelsPerCentimeter: number | null | undefined
): Measurement | null {
  if (!scalePixelsPerCentimeter) return null;

  const coords = extractCoordinates(geometry, points);
  if (!coords || coords.length < 3) return null;

  const areaPixels = calculateAreaPixels(coords);
  // Convert: (pixels²) / (pixels/cm)² = cm²
  const areaCm2 = areaPixels / (scalePixelsPerCentimeter * scalePixelsPerCentimeter);

  return formatArea(areaCm2);
}

/**
 * Calculate polygon perimeter measurement
 * Returns null if scale is not set or geometry is invalid
 */
export function calculatePolygonPerimeter(
  geometry: Geometry | null | undefined,
  points: SimpleCoord[] | null | undefined,
  scalePixelsPerCentimeter: number | null | undefined
): Measurement | null {
  if (!scalePixelsPerCentimeter) return null;

  const coords = extractCoordinates(geometry, points);
  if (!coords || coords.length < 3) return null;

  const perimeterPixels = calculatePerimeterPixels(coords);
  const perimeterCm = perimeterPixels / scalePixelsPerCentimeter;

  return formatLength(perimeterCm);
}

/**
 * Determine if a spot has line geometry
 */
export function isLineSpot(
  geometry: Geometry | null | undefined,
  geometryType: string | null | undefined
): boolean {
  if (geometry?.type === 'LineString') return true;
  if (geometryType?.toLowerCase() === 'line') return true;
  return false;
}

/**
 * Determine if a spot has polygon geometry
 */
export function isPolygonSpot(
  geometry: Geometry | null | undefined,
  geometryType: string | null | undefined
): boolean {
  if (geometry?.type === 'Polygon') return true;
  if (geometryType?.toLowerCase() === 'polygon') return true;
  return false;
}
