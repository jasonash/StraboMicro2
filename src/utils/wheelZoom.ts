/**
 * Which way a wheel event zooms a canvas: 1 = in, -1 = out, 0 = not at all.
 * A Mac trackpad or Magic Mouse sends many events with no vertical movement
 * (sideways wobble in a swipe, zero-delta events at the start and end of the
 * momentum). Testing only `deltaY > 0` counted those as zoom in, so a swipe
 * to zoom out was undone as it went (Peter, 2026-10-29). An event with no
 * vertical movement, or more sideways than vertical, does not zoom.
 * Pure (npm run test:wheel-zoom).
 */

export type WheelZoomDirection = 1 | -1 | 0;

export function wheelZoomDirection(evt: { deltaX: number; deltaY: number }): WheelZoomDirection {
  const { deltaX, deltaY } = evt;
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  if (Number.isFinite(deltaX) && Math.abs(deltaX) > Math.abs(deltaY)) return 0;
  return deltaY > 0 ? -1 : 1;
}
