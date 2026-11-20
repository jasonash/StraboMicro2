/**
 * Placement math for the rectangle placement screen (PlacementCanvas) and the
 * point placement screen (PointPlacementCanvas).
 *
 * The screens draw the parent as a smaller copy (the tile cache's medium
 * image, 2048 px at most; before 2.0.61 the 512 px thumbnail). Everything on
 * the canvas is in that copy's pixels ("display" pixels); everything saved is
 * in the parent's original pixels. `ratio` = original px per display px
 * (parent imageWidth / displayed width).
 *
 * Saved convention (legacy, kept): offsetInParent is the overlay's top-left
 * BEFORE rotation, i.e. center minus half the scaled size, in original parent
 * pixels; rotation turns about the center; scale = original parent px per
 * child px. On the canvas the overlay is a group positioned at its center.
 *
 * What is saved must not depend on the size of the copy on screen: the tests
 * (npm run test:placement-math) place the same overlay through copies of
 * different sizes and compare.
 */

/** The overlay as drawn: center in display px, scale = display px per child px */
export interface DisplayTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** The overlay as saved: top-left (pre-rotation) in original parent px, scale = parent px per child px */
export interface SavedPlacement {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Original parent px per displayed px; 1 when either size is unknown */
export function displayRatio(originalWidth: number | null | undefined, displayedWidth: number | null | undefined): number {
  if (!originalWidth || !displayedWidth || !(originalWidth > 0) || !(displayedWidth > 0)) return 1;
  return originalWidth / displayedWidth;
}

/** What to save for an overlay drawn at `t` over a parent copy shown at `ratio` */
export function displayToSaved(t: DisplayTransform, child: Size, ratio: number): SavedPlacement {
  const left = t.x - (child.width * t.scaleX) / 2;
  const top = t.y - (child.height * t.scaleY) / 2;
  return {
    offsetX: left * ratio,
    offsetY: top * ratio,
    rotation: t.rotation,
    scaleX: t.scaleX * ratio,
    scaleY: t.scaleY * ratio,
  };
}

/** Where to draw a saved overlay over a parent copy shown at `ratio` */
export function savedToDisplay(p: SavedPlacement, child: Size, ratio: number): DisplayTransform {
  const scaleX = p.scaleX / ratio;
  const scaleY = p.scaleY / ratio;
  return {
    x: p.offsetX / ratio + (child.width * scaleX) / 2,
    y: p.offsetY / ratio + (child.height * scaleY) / 2,
    rotation: p.rotation,
    scaleX,
    scaleY,
  };
}

/** A point on the parent copy (point placement) in original parent px, and back */
export function displayPointToSaved(x: number, y: number, ratio: number): { x: number; y: number } {
  return { x: x * ratio, y: y * ratio };
}

export function savedPointToDisplay(x: number, y: number, ratio: number): { x: number; y: number } {
  return { x: x / ratio, y: y / ratio };
}

/**
 * Limits of the overlay's scale on the parent's displayed copy. Wide: a
 * high-magnification child (a BSE image of a few tens of microns) on a
 * low-magnification parent is legitimately far under 0.01. Until 2.0.61 Pixel
 * Conversion Factor and Provide Width/Height clamped at 0.01 and 10 (Trace
 * Scale Bar since 2026-10-05 at these), so a child more than ~80x finer than a
 * 4000 px parent shown as a 512 px thumbnail was silently saved too large.
 */
export const MIN_OVERLAY_SCALE = 0.0001;
export const MAX_OVERLAY_SCALE = 1000;

/** Centimeters per unit, for the unit menus of the placement screens */
export const UNITS_PER_CM: Record<string, number> = {
  'μm': 10000,
  'mm': 10,
  'cm': 1,
  'm': 0.01,
  'inches': 0.393701,
};

/** A child's px/cm from "pixels per length" (Pixel Conversion Factor, a traced bar); null if unusable */
export function childPixelsPerCm(pixels: number, length: number, unit: string): number | null {
  if (!(pixels > 0) || !(length > 0) || !isFinite(pixels) || !isFinite(length)) return null;
  return (pixels / length) * (UNITS_PER_CM[unit] ?? 1);
}

/**
 * The overlay's scale on the displayed copy for a child of `childPxPerCm`:
 * the parent's px/cm in the displayed copy over the child's, within the
 * limits. Null when an input is missing.
 */
export function overlayScaleOnDisplay(args: {
  childPxPerCm: number | null;
  parentScale: number | null | undefined;
  parentDisplayedWidth: number;
  parentOriginalWidth: number | null | undefined;
}): { scale: number; clamped: boolean; raw: number } | null {
  const { childPxPerCm, parentScale, parentDisplayedWidth, parentOriginalWidth } = args;
  if (!childPxPerCm || !(childPxPerCm > 0) || !parentScale || !(parentScale > 0)) return null;
  if (!(parentDisplayedWidth > 0) || !parentOriginalWidth || !(parentOriginalWidth > 0)) return null;
  const raw = (parentScale * (parentDisplayedWidth / parentOriginalWidth)) / childPxPerCm;
  const scale = Math.min(MAX_OVERLAY_SCALE, Math.max(MIN_OVERLAY_SCALE, raw));
  return { scale, clamped: scale !== raw, raw };
}

/**
 * A placed rectangle's scale on its parent (parent px per child px) from the
 * two px/cm values, as the viewer draws it (AssociatedImageRenderer: a missing
 * scale counts as 100 px/cm). Saves keep only scalePixelsPerCentimeter, so
 * this is the scale to start from when a placement is edited again.
 */
export function savedScaleOnParent(
  childScalePixelsPerCentimeter: number | null | undefined,
  parentScalePixelsPerCentimeter: number | null | undefined,
): number {
  return (parentScalePixelsPerCentimeter || 100) / (childScalePixelsPerCentimeter || 100);
}
