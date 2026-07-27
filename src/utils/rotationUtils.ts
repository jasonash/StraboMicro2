/**
 * Helpers for the import-time Image Rotation feature.
 *
 * Rotation values are always clockwise degrees in {0, 90, 180, 270}.
 * The rotation is applied destructively to the scratch image's pixels at a
 * commit boundary (wizard Next / batch import loop / sibling Add); these
 * helpers only manage the pending-rotation UI state.
 */

export type RotationDegrees = 0 | 90 | 180 | 270;

const CLOCKWISE: Record<RotationDegrees, RotationDegrees> = { 0: 90, 90: 180, 180: 270, 270: 0 };
const COUNTER_CLOCKWISE: Record<RotationDegrees, RotationDegrees> = { 0: 270, 90: 0, 180: 90, 270: 180 };

/** Advance a rotation 90° clockwise. */
export function rotateCW(degrees: RotationDegrees): RotationDegrees {
  return CLOCKWISE[degrees];
}

/** Advance a rotation 90° counter-clockwise. */
export function rotateCCW(degrees: RotationDegrees): RotationDegrees {
  return COUNTER_CLOCKWISE[degrees];
}

/** True when the rotation swaps an image's width and height (90° or 270°). */
export function isQuarterTurn(degrees: number): boolean {
  return degrees % 180 !== 0;
}

/** Human-readable label for a pending rotation, relative to the current pixels. */
export function rotationLabel(degrees: RotationDegrees): string {
  switch (degrees) {
    case 90:
      return '90° clockwise';
    case 180:
      return '180°';
    case 270:
      return '90° counter-clockwise';
    default:
      return 'No additional rotation';
  }
}
