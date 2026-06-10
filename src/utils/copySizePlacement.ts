import type { MicrographMetadata } from '../types/project-types';

/**
 * Placement data derived from a sibling micrograph for the
 * "Copy Size from Existing Micrograph" scale method.
 *
 * Shared by NewMicrographDialog and EditMicrographLocationDialog so the
 * physical-footprint math lives in exactly one place.
 */
export interface CopySizePlacement {
  /** Sibling's top-left position in original parent coordinates (rectangle placement). */
  xOffset: number;
  yOffset: number;
  /** Sibling's rotation in degrees (rectangle placement). */
  rotation: number;
  /**
   * Pixels-per-centimeter for the NEW image. The new image covers the same
   * physical area as the sibling but has its own pixel dimensions:
   *   newPxPerCm = siblingPxPerCm * (newWidth / siblingWidth)
   */
  newImagePixelsPerCm: number;
  /** Sibling's point position in original parent coordinates (point placement). */
  pointInParent?: { x: number; y: number };
}

/**
 * Compute copy-size placement data from a sibling micrograph.
 *
 * Returns null when the sibling lacks the scale/dimension data needed for the
 * calculation. Position fields default to 0 when the sibling has no rectangle
 * placement; callers that require a specific placement type should check
 * offsetInParent/pointInParent on the sibling before using the result.
 */
export function computeCopySizePlacement(
  sibling: MicrographMetadata,
  newImageWidth: number | null | undefined
): CopySizePlacement | null {
  if (!sibling.scalePixelsPerCentimeter || !sibling.imageWidth || !newImageWidth) {
    return null;
  }

  const newImagePixelsPerCm =
    sibling.scalePixelsPerCentimeter * (newImageWidth / sibling.imageWidth);

  // offsetInParent is the saved field; xOffset/yOffset are legacy fallbacks.
  // SimpleCoord carries both casings for legacy compatibility.
  const xOffset = sibling.offsetInParent?.X ?? sibling.offsetInParent?.x ?? sibling.xOffset ?? 0;
  const yOffset = sibling.offsetInParent?.Y ?? sibling.offsetInParent?.y ?? sibling.yOffset ?? 0;

  const pointInParent = sibling.pointInParent
    ? {
        x: sibling.pointInParent.x ?? sibling.pointInParent.X ?? 0,
        y: sibling.pointInParent.y ?? sibling.pointInParent.Y ?? 0,
      }
    : undefined;

  return {
    xOffset,
    yOffset,
    rotation: sibling.rotation ?? 0,
    newImagePixelsPerCm,
    pointInParent,
  };
}
