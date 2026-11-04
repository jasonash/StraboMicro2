/**
 * Framing a spot on screen ("go to spot" from a chat link or the Activity
 * panel): the spot's extent in image pixels, and the zoom + pan that show it
 * centered, filling about a third of the view. Never zooms out past the
 * whole-image view. Pure functions (npm run test:spot-framing).
 */

import type { Spot } from '@/types/project-types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface View {
  zoom: number;
  position: { x: number; y: number };
}

/** Share of the view the spot's larger side fills */
export const SPOT_FILL = 1 / 3;
/** A point spot has no size: zoom this many times the whole-image view */
export const POINT_ZOOM_FACTOR = 4;
/** Margin around the image in the whole-image view (as TiledViewer's fitToScreen) */
const FIT_PADDING = 20;

function collectPairs(value: unknown, out: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  const [a, b] = value;
  if (typeof a === 'number' && typeof b === 'number') {
    out.push([a, b]);
    return;
  }
  for (const v of value) collectPairs(v, out);
}

/** The spot's extent in image pixels (geometry first, else legacy points, as SpotRenderer); null without coordinates */
export function spotBounds(spot: Pick<Spot, 'geometry' | 'points'>): Bounds | null {
  const pairs: Array<[number, number]> = [];
  if (Array.isArray(spot.geometry?.coordinates)) {
    collectPairs(spot.geometry.coordinates, pairs);
  } else {
    for (const p of spot.points ?? []) {
      const x = p.X ?? p.x;
      const y = p.Y ?? p.y;
      if (typeof x === 'number' && typeof y === 'number') pairs.push([x, y]);
    }
  }
  const finite = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (finite.length === 0) return null;
  const xs = finite.map(([x]) => x);
  const ys = finite.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Zoom of the whole-image view (the same rule as TiledViewer's fitToScreen) */
export function wholeImageZoom(view: Size, image: Size): number {
  const scaleX = (view.width - FIT_PADDING * 2) / image.width;
  const scaleY = (view.height - FIT_PADDING * 2) / image.height;
  return Math.min(scaleX, scaleY, 1);
}

/** Zoom + pan that center the spot and make it fill SPOT_FILL of the view; null when the view or image has no size */
export function frameSpot(bounds: Bounds, view: Size, image: Size, maxZoom: number): View | null {
  if (view.width <= 0 || view.height <= 0 || image.width <= 0 || image.height <= 0) return null;
  const whole = wholeImageZoom(view, image);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const wanted = w <= 0 && h <= 0
    ? whole * POINT_ZOOM_FACTOR
    : Math.min(
      w > 0 ? (view.width * SPOT_FILL) / w : Infinity,
      h > 0 ? (view.height * SPOT_FILL) / h : Infinity
    );
  const zoom = Math.min(maxZoom, Math.max(whole, wanted));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { zoom, position: { x: view.width / 2 - cx * zoom, y: view.height / 2 - cy * zoom } };
}
