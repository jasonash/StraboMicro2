/**
 * useLasso Hook - Reusable lasso selection tool
 *
 * Provides core lasso drawing functionality that can be used in different contexts:
 * - Point Count: Select multiple points for batch classification
 * - CV Spots: Select generated spot candidates
 * - Any future feature needing freeform selection
 *
 * Usage:
 * const { isDrawing, lassoPoints, startLasso, updateLasso, completeLasso, cancelLasso } = useLasso();
 *
 * On mousedown: startLasso(x, y)
 * On mousemove: updateLasso(x, y)
 * On mouseup: const polygon = completeLasso() -> then use pointsInPolygon(items, polygon)
 */

import { useState, useCallback, useRef } from 'react';

export interface Point2D {
  x: number;
  y: number;
}

export interface UseLassoReturn {
  /** Whether the user is currently drawing a lasso */
  isDrawing: boolean;
  /** Current lasso polygon points */
  lassoPoints: Point2D[];
  /** Start drawing a new lasso at the given point */
  startLasso: (x: number, y: number) => void;
  /** Add a point to the current lasso (call on mousemove) */
  updateLasso: (x: number, y: number) => void;
  /** Complete the lasso and return the final polygon */
  completeLasso: () => Point2D[];
  /** Cancel the current lasso without selecting */
  cancelLasso: () => void;
}

/**
 * Point-in-polygon test using ray casting algorithm
 * Returns true if the point is inside the polygon
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Filter items that are inside a polygon
 * Generic function that works with any item type that has x/y coordinates
 */
export function filterItemsInPolygon<T extends Point2D>(
  items: T[],
  polygon: Point2D[]
): T[] {
  if (polygon.length < 3) return [];
  return items.filter((item) => isPointInPolygon(item, polygon));
}

/**
 * Get indices of items that are inside a polygon
 */
export function getIndicesInPolygon<T extends Point2D>(
  items: T[],
  polygon: Point2D[]
): number[] {
  if (polygon.length < 3) return [];
  const indices: number[] = [];
  items.forEach((item, index) => {
    if (isPointInPolygon(item, polygon)) {
      indices.push(index);
    }
  });
  return indices;
}

/**
 * Minimum distance between points to add a new lasso point
 * Prevents creating too many points for smooth performance
 */
const MIN_POINT_DISTANCE = 5;

/**
 * Minimum number of points needed for a valid lasso selection
 */
const MIN_LASSO_POINTS = 3;

/**
 * useLasso hook - provides lasso drawing functionality
 *
 * Uses refs for critical values to avoid stale closure issues.
 * State is still used for rendering the lasso polygon.
 */
export function useLasso(): UseLassoReturn {
  // State for rendering (triggers re-renders for visual updates)
  const [isDrawing, setIsDrawing] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point2D[]>([]);

  // Refs for values that need to be current at read time (avoids stale closures)
  const isDrawingRef = useRef(false);
  const lassoPointsRef = useRef<Point2D[]>([]);
  const lastPointRef = useRef<Point2D | null>(null);

  const startLasso = useCallback((x: number, y: number) => {
    const point = { x, y };
    // Update both ref and state
    isDrawingRef.current = true;
    lassoPointsRef.current = [point];
    lastPointRef.current = point;
    setIsDrawing(true);
    setLassoPoints([point]);
  }, []);

  const updateLasso = useCallback((x: number, y: number) => {
    if (!lastPointRef.current || !isDrawingRef.current) return;

    // Only add point if it's far enough from the last point
    const dx = x - lastPointRef.current.x;
    const dy = y - lastPointRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= MIN_POINT_DISTANCE) {
      const point = { x, y };
      // Update ref immediately (always current)
      lassoPointsRef.current = [...lassoPointsRef.current, point];
      lastPointRef.current = point;
      // Update state for rendering
      setLassoPoints(lassoPointsRef.current);
    }
  }, []);

  const completeLasso = useCallback((): Point2D[] => {
    // Read from ref to get the most current points (avoids stale closure)
    const finalPoints = [...lassoPointsRef.current];

    // Clear refs
    isDrawingRef.current = false;
    lassoPointsRef.current = [];
    lastPointRef.current = null;

    // Clear state
    setIsDrawing(false);
    setLassoPoints([]);

    // Return the polygon (only if it has enough points)
    if (finalPoints.length >= MIN_LASSO_POINTS) {
      return finalPoints;
    }
    return [];
  }, []); // No dependencies - reads from refs

  const cancelLasso = useCallback(() => {
    isDrawingRef.current = false;
    lassoPointsRef.current = [];
    lastPointRef.current = null;
    setIsDrawing(false);
    setLassoPoints([]);
  }, []);

  return {
    isDrawing,
    lassoPoints,
    startLasso,
    updateLasso,
    completeLasso,
    cancelLasso,
  };
}

export default useLasso;
