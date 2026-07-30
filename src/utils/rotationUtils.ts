/**
 * Helpers for the import-time Image Rotation & Flip feature.
 *
 * Rotation values are always clockwise degrees in {0, 90, 180, 270}.
 * An Orientation pairs a rotation with an optional horizontal flip, where
 * the flip mirrors the image AS DISPLAYED — i.e. it is applied after the
 * rotation, in screen space. The orientation is applied destructively to
 * the scratch image's pixels at a commit boundary (wizard Next / batch
 * import loop / sibling Add); these helpers only manage the pending UI
 * state.
 */

export type RotationDegrees = 0 | 90 | 180 | 270;

/**
 * A pending pixel transform: rotate clockwise by `rotation`, then mirror
 * the result left-right when `flip` is set.
 */
export interface Orientation {
  rotation: RotationDegrees;
  flip: boolean;
}

export const IDENTITY_ORIENTATION: Orientation = { rotation: 0, flip: false };

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

/** True when an orientation would leave the pixels untouched. */
export function isIdentityOrientation(o: Orientation): boolean {
  return o.rotation === 0 && !o.flip;
}

/**
 * Rotate the DISPLAYED image 90° clockwise. When the orientation is flipped,
 * the mirror reverses apparent rotation direction, so the underlying rotation
 * must step counter-clockwise for the on-screen image to turn clockwise.
 */
export function orientationRotateCW(o: Orientation): Orientation {
  return { ...o, rotation: o.flip ? rotateCCW(o.rotation) : rotateCW(o.rotation) };
}

/** Rotate the DISPLAYED image 90° counter-clockwise (see orientationRotateCW). */
export function orientationRotateCCW(o: Orientation): Orientation {
  return { ...o, rotation: o.flip ? rotateCW(o.rotation) : rotateCCW(o.rotation) };
}

/** Toggle the horizontal mirror. Applied in screen space, rotation is unchanged. */
export function toggleOrientationFlip(o: Orientation): Orientation {
  return { ...o, flip: !o.flip };
}

/**
 * The orientation equivalent to applying `first` to an image and then
 * applying `second` to the result. Used to track the cumulative transform
 * already baked into pixels across repeated visits to the rotation step
 * (e.g. to bring a later-added XPL sibling into lockstep).
 *
 * Derivation: with F = horizontal mirror and R = clockwise rotation, an
 * orientation is F^flip ∘ R_rotation. Moving `first`'s mirror past
 * `second`'s rotation negates that rotation (R_d ∘ F = F ∘ R_-d).
 */
export function composeOrientations(first: Orientation, second: Orientation): Orientation {
  const degrees = first.rotation + (first.flip ? -second.rotation : second.rotation);
  const normalized = (((degrees % 360) + 360) % 360) as RotationDegrees;
  return { rotation: normalized, flip: first.flip !== second.flip };
}

/**
 * CSS transform string for previewing an orientation. CSS applies the list
 * right-to-left, so scaleX(-1) listed first mirrors the already-rotated
 * image — matching the commit semantics (rotate, then mirror on screen).
 */
export function orientationCssTransform(o: Orientation): string {
  const rotate = `rotate(${o.rotation}deg)`;
  return o.flip ? `scaleX(-1) ${rotate}` : rotate;
}

/** Human-readable label for a pending orientation, relative to the current pixels. */
export function orientationLabel(o: Orientation): string {
  if (isIdentityOrientation(o)) return 'No additional rotation';
  if (o.rotation === 0) return 'Flipped';
  return `${rotationLabel(o.rotation)} + flipped`;
}
