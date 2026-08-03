/**
 * Helpers for HTMLImageElement lifecycle in Konva-rendered components.
 *
 * Konva draws image elements directly with canvas drawImage(), which THROWS
 * InvalidStateError for an element whose load FAILED (onerror fired — the
 * "broken" state). Verified empirically in Electron 28 / Chromium 120: a
 * failed decode throws; an element with cleared/removed src silently no-ops.
 * So a failed load must never be stored where a Konva node can reach it
 * (Sentry event a62c1124, 2026-08-03), and render paths should gate on
 * isImageUsable() as a backstop.
 */

/**
 * Release an image element: detach handlers and abort any in-flight load.
 * Removing the src attribute leaves the element "unavailable" per spec;
 * setting src='' is nominally the "broken" state, which Chromium currently
 * tolerates in drawImage but the spec says throws — prefer the removal.
 */
export function releaseImage(img: HTMLImageElement): void {
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
}

/**
 * True when the element has successfully decoded pixel data and is safe to
 * hand to Konva. Broken images report complete=true but naturalWidth=0;
 * still-loading images report complete=false.
 */
export function isImageUsable(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}
