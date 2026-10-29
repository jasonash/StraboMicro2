/**
 * Overlapping spots (Peter, 2026-10-29: a spot under a larger polygon could
 * not be clicked). Spots are DRAWN larger polygons first, then lines, then
 * points, so a smaller spot inside a larger one is on top and gets the click
 * (the usual GIS rule: render order by area). The saved spot order is not
 * changed. For overlaps the order cannot solve, the right-click menu lists
 * every spot under the cursor (spotsAt), top first. Pure functions (npm run
 * test:spot-stacking).
 */

import type { Spot } from '@/types/project-types';

type SpotShape = Pick<Spot, 'geometry' | 'geometryType' | 'points'>;
type Kind = 'point' | 'line' | 'polygon' | null;

function kindOf(spot: SpotShape): Kind {
  const t = (spot.geometryType || spot.geometry?.type || '').toLowerCase();
  if (t === 'point') return 'point';
  if (t === 'line' || t === 'linestring') return 'line';
  if (t === 'polygon') return 'polygon';
  return null;
}

/** The spot's vertices in image pixels (geometry first, else legacy points, as SpotRenderer); a polygon's outer ring */
function verticesOf(spot: SpotShape, kind: Kind): Array<[number, number]> {
  const coords = spot.geometry?.coordinates;
  let pairs: Array<[number, number]> = [];
  if (Array.isArray(coords)) {
    const list: unknown =
      kind === 'point' ? [coords] : kind === 'polygon' ? coords[0] : coords;
    if (Array.isArray(list)) {
      for (const c of list) {
        if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') pairs.push([c[0], c[1]]);
      }
    }
  } else {
    for (const p of spot.points ?? []) {
      const x = p.X ?? p.x;
      const y = p.Y ?? p.y;
      if (typeof x === 'number' && typeof y === 'number') pairs.push([x, y]);
    }
  }
  pairs = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  return pairs;
}

/** Area of a polygon spot in image pixels (0 for points, lines and broken shapes) */
export function spotArea(spot: SpotShape): number {
  const kind = kindOf(spot);
  if (kind !== 'polygon') return 0;
  const v = verticesOf(spot, kind);
  let twice = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

const KIND_RANK: Record<string, number> = { polygon: 0, line: 1, point: 2 };

/**
 * The order to draw spots in: polygons from largest to smallest area, then
 * lines, then points; spots that tie keep their saved order. A new array.
 */
export function spotDrawOrder<T extends SpotShape>(spots: readonly T[]): T[] {
  return spots
    .map((spot, index) => ({ spot, index, rank: KIND_RANK[kindOf(spot) ?? 'polygon'], area: spotArea(spot) }))
    .sort((a, b) => a.rank - b.rank || b.area - a.area || a.index - b.index)
    .map((x) => x.spot);
}

function insidePolygon(x: number, y: number, v: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i];
    const [xj, yj] = v[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x: number, y: number, [x1, y1]: [number, number], [x2, y2]: [number, number]): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Whether (x, y) in image pixels is on the spot: inside a polygon (or on its edge), within tolerance of a line or point */
export function spotContains(spot: SpotShape, x: number, y: number, tolerance: number): boolean {
  const kind = kindOf(spot);
  const v = verticesOf(spot, kind);
  if (v.length === 0) return false;
  if (kind === 'point') return Math.hypot(x - v[0][0], y - v[0][1]) <= tolerance;
  const nearEdge = (closed: boolean) => {
    const last = closed ? v.length : v.length - 1;
    for (let i = 0; i < last; i++) {
      if (distanceToSegment(x, y, v[i], v[(i + 1) % v.length]) <= tolerance) return true;
    }
    return v.length === 1 && Math.hypot(x - v[0][0], y - v[0][1]) <= tolerance;
  };
  if (kind === 'line') return nearEdge(false);
  if (kind === 'polygon') return (v.length >= 3 && insidePolygon(x, y, v)) || nearEdge(true);
  return false;
}

/** The spots at (x, y) in image pixels, top first (the reverse of spotDrawOrder) */
export function spotsAt<T extends SpotShape>(spots: readonly T[], x: number, y: number, tolerance: number): T[] {
  return spotDrawOrder(spots).filter((s) => spotContains(s, x, y, tolerance)).reverse();
}
