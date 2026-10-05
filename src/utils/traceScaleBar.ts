/**
 * Trace Scale Bar and Drag (Edit Micrograph Location / placement): the
 * child's scale on its parent from a scale bar traced over the child.
 *
 * The line is drawn in the parent's displayed image space over the child as
 * it is shown, so its length in the child's own pixels is the line length
 * divided by the child's scale WHEN THE LINE WAS DRAWN. Measuring it against
 * the scale it is about to produce made the two feed each other: every new
 * scale changed the measured pixels, which changed the scale again, until it
 * hit the 0.01/10 limit or React stopped the loop ("Maximum update depth
 * exceeded", seen in Sentry 2026-10-05, v2.0.49).
 */

export const MIN_TRACE_SCALE = 0.01;
export const MAX_TRACE_SCALE = 10;

const TO_CM: Record<string, number> = {
  'μm': 10000,
  'mm': 10,
  'cm': 1,
  'm': 0.01,
  'inches': 0.393701,
};

export interface TracedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The traced line's length in the child's original pixels (null without a usable scale). */
export function tracedLinePixels(line: TracedLine, scaleWhenDrawn: number): number | null {
  if (!(scaleWhenDrawn > 0) || !isFinite(scaleWhenDrawn)) return null;
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1) / scaleWhenDrawn;
}

/**
 * The child's scale on the parent's displayed image: the parent's px/cm in
 * the displayed (possibly downsampled) image over the child's px/cm from the
 * scale bar, kept within MIN/MAX_TRACE_SCALE. Null when an input is missing.
 */
export function scaleFromTracedBar(args: {
  pixels: number;
  physicalLength: number;
  unit: string;
  parentScale: number;
  parentDisplayedWidth: number;
  parentOriginalWidth: number;
}): { scale: number; clamped: boolean } | null {
  const { pixels, physicalLength, unit, parentScale, parentDisplayedWidth, parentOriginalWidth } = args;
  if (!(pixels > 0) || !(physicalLength > 0) || !(parentScale > 0) || !(parentDisplayedWidth > 0) || !(parentOriginalWidth > 0)) {
    return null;
  }
  const childPixelsPerCm = (pixels / physicalLength) * (TO_CM[unit] ?? 1);
  const parentScaleInDisplayedImage = parentScale * (parentDisplayedWidth / parentOriginalWidth);
  const raw = parentScaleInDisplayedImage / childPixelsPerCm;
  const scale = Math.min(MAX_TRACE_SCALE, Math.max(MIN_TRACE_SCALE, raw));
  return { scale, clamped: scale !== raw };
}
