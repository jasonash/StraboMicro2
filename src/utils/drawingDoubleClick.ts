/**
 * Double-click that finishes a line or polygon (useLineDrawing,
 * usePolygonDrawing): the second click must come soon after the first AND
 * land on the same place. Time alone took a quick click at a new vertex for
 * a double-click, which closed the shape without that vertex (Jason
 * 2026-10-13: fast two-segment lines in auto spot mode kept one segment).
 */

/** Longest gap between the two clicks */
export const DOUBLE_CLICK_MS = 500;
/** Farthest apart the two clicks may be, in screen pixels */
export const DOUBLE_CLICK_SCREEN_PX = 8;

export interface LastClick {
  time: number;
  x: number;
  y: number;
}

/** Whether a click at (x, y) image coordinates, at zoom `scale`, completes a double-click with the last one */
export function isDoubleClick(last: LastClick | null, x: number, y: number, scale: number, now: number): boolean {
  if (!last) return false;
  if (now - last.time >= DOUBLE_CLICK_MS) return false;
  const screenDistance = Math.hypot(x - last.x, y - last.y) * scale;
  return screenDistance <= DOUBLE_CLICK_SCREEN_PX;
}
