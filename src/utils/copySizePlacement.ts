import type { MicrographMetadata, ProjectMetadata } from '../types/project-types';
import {
  composeMatrices,
  computeTransformedBounds,
  scaleMatrix,
  type AffineMatrix,
} from './affineTransform';

/**
 * "Copy location and scale from an existing micrograph"
 *
 * Shared by NewMicrographDialog (manual import) and EditMicrographLocationDialog
 * (batch-imported micrographs and later edits) so the eligibility rules and the
 * placement math live in exactly one place.
 *
 * A copy reproduces the source micrograph's placement on the SAME parent,
 * whatever method the source used:
 * - point: the point and the scale are copied; no size requirement
 * - rectangle: offset, rotation and scale are copied; aspect ratio must match
 * - affine (3-point registration): the matrix is copied; aspect ratio must
 *   match. A different pixel size is handled by pre-scaling the matrix, and the
 *   caller must bake affine tiles for the new image under its own tile hash.
 *
 * Scale is carried over by pixel width ratio, which assumes the new image covers
 * the same physical width as the source. The UI advises the user of that
 * assumption when the pixel dimensions differ.
 */

export type SourcePlacementType = 'point' | 'rectangle' | 'affine';

export const PLACEMENT_TYPE_LABELS: Record<SourcePlacementType, string> = {
  point: 'point',
  rectangle: 'scaled rectangle',
  affine: '3-point registration',
};

/** Relative tolerance when comparing aspect ratios (1%). */
export const ASPECT_RATIO_TOLERANCE = 0.01;

export interface CopyPlacementCandidate {
  id: string;
  name: string;
  width: number;
  height: number;
  placementType: SourcePlacementType;
  /** True when the source has exactly the new image's pixel dimensions. */
  sameDimensions: boolean;
}

export interface CopiedPlacement {
  placementType: SourcePlacementType;
  /**
   * Fields to write on the new micrograph. Fields belonging to the other
   * placement methods are set to undefined so a copy also clears a previous
   * placement when used from the edit dialog. For an affine copy the caller
   * adds affineTileHash after baking tiles.
   */
  metadata: Partial<MicrographMetadata>;
  /** Matrix to bake into affine tiles for the new image (affine only). */
  affineMatrix?: AffineMatrix;
  /** True when the scale was derived by width ratio because the sizes differ. */
  scaleAssumedFromWidthRatio: boolean;
}

function pixelWidth(m: MicrographMetadata): number | null {
  return m.imageWidth || m.width || null;
}

function pixelHeight(m: MicrographMetadata): number | null {
  return m.imageHeight || m.height || null;
}

function coordValue(c: { X?: number | null; x?: number | null } | null | undefined): number | null {
  if (!c) return null;
  const v = c.X ?? c.x;
  return typeof v === 'number' ? v : null;
}

/**
 * Determine how a micrograph is placed on its parent.
 * Returns null when it carries no usable placement (for example a batch-imported
 * micrograph that has not been located yet).
 */
export function getSourcePlacementType(m: MicrographMetadata): SourcePlacementType | null {
  if (m.placementType === 'affine' && Array.isArray(m.affineMatrix) && m.affineMatrix.length === 6) {
    return 'affine';
  }
  const hasOffset =
    coordValue(m.offsetInParent) !== null ||
    (typeof m.xOffset === 'number' && typeof m.yOffset === 'number');
  if (hasOffset) return 'rectangle';
  if (coordValue(m.pointInParent) !== null) return 'point';
  return null;
}

export function aspectRatiosMatch(
  width1: number,
  height1: number,
  width2: number,
  height2: number,
  tolerance: number = ASPECT_RATIO_TOLERANCE
): boolean {
  if (!width1 || !height1 || !width2 || !height2) return false;
  const r1 = width1 / height1;
  const r2 = width2 / height2;
  return Math.abs(r1 - r2) / r2 < tolerance;
}

/**
 * List the sibling micrographs (same parent) whose placement can be copied onto
 * a new image of the given pixel size.
 *
 * @param excludeId - the micrograph being edited, so it never offers itself
 */
export function listCopyPlacementCandidates(
  project: ProjectMetadata | null | undefined,
  parentMicrographId: string | null | undefined,
  excludeId: string | null | undefined,
  newWidth: number | null | undefined,
  newHeight: number | null | undefined
): CopyPlacementCandidate[] {
  if (!project || !parentMicrographId || !newWidth || !newHeight) return [];

  const candidates: CopyPlacementCandidate[] = [];

  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        if (micro.parentID !== parentMicrographId) continue;
        if (excludeId && micro.id === excludeId) continue;

        const width = pixelWidth(micro);
        const height = pixelHeight(micro);
        if (!width || !height) continue;

        const placementType = getSourcePlacementType(micro);
        if (!placementType) continue;

        // Point placements carry no footprint, so any image can copy them.
        // Rectangle and affine placements describe a footprint, so the new
        // image must have the same shape.
        if (placementType !== 'point' && !aspectRatiosMatch(newWidth, newHeight, width, height)) {
          continue;
        }

        candidates.push({
          id: micro.id,
          name: micro.name || 'Unnamed Micrograph',
          width,
          height,
          placementType,
          sameDimensions: width === newWidth && height === newHeight,
        });
      }
    }
  }

  return candidates;
}

/** Human-readable dropdown label for a candidate. */
export function describeCopyPlacementCandidate(c: CopyPlacementCandidate): string {
  return `${c.name} (${c.width} × ${c.height}, ${PLACEMENT_TYPE_LABELS[c.placementType]})`;
}

const CLEAR_RECTANGLE: Partial<MicrographMetadata> = {
  offsetInParent: undefined,
  xOffset: undefined,
  yOffset: undefined,
  rotation: undefined,
  scaleX: undefined,
  scaleY: undefined,
};

const CLEAR_POINT: Partial<MicrographMetadata> = {
  pointInParent: undefined,
};

const CLEAR_AFFINE: Partial<MicrographMetadata> = {
  placementType: undefined,
  affineMatrix: undefined,
  controlPoints: undefined,
  affineBoundsOffset: undefined,
  affineTransformedWidth: undefined,
  affineTransformedHeight: undefined,
  affineTileHash: undefined,
};

/**
 * Compute the placement a new image of the given pixel size inherits from a
 * source micrograph. Returns null when the source has no usable placement or
 * lacks the dimensions needed for the math.
 */
export function computeCopiedPlacement(
  source: MicrographMetadata,
  newWidth: number | null | undefined,
  newHeight: number | null | undefined
): CopiedPlacement | null {
  const placementType = getSourcePlacementType(source);
  const sourceWidth = pixelWidth(source);
  const sourceHeight = pixelHeight(source);
  if (!placementType || !sourceWidth || !sourceHeight || !newWidth || !newHeight) return null;

  const widthRatio = newWidth / sourceWidth;
  const sameDimensions = sourceWidth === newWidth && sourceHeight === newHeight;
  const sourceScale = source.scalePixelsPerCentimeter ?? null;
  // Same field of view, different pixel count: px/cm scales with the width ratio
  const scalePixelsPerCentimeter = sourceScale !== null ? sourceScale * widthRatio : undefined;

  if (placementType === 'point') {
    const X = coordValue(source.pointInParent) ?? 0;
    const Y = source.pointInParent?.Y ?? source.pointInParent?.y ?? 0;
    return {
      placementType,
      metadata: {
        pointInParent: { X, Y },
        scalePixelsPerCentimeter,
        ...CLEAR_RECTANGLE,
        ...CLEAR_AFFINE,
      },
      scaleAssumedFromWidthRatio: !sameDimensions,
    };
  }

  if (placementType === 'rectangle') {
    const X = coordValue(source.offsetInParent) ?? source.xOffset ?? 0;
    const Y = source.offsetInParent?.Y ?? source.offsetInParent?.y ?? source.yOffset ?? 0;
    return {
      placementType,
      metadata: {
        offsetInParent: { X, Y },
        rotation: source.rotation ?? 0,
        scalePixelsPerCentimeter,
        ...CLEAR_POINT,
        ...CLEAR_AFFINE,
      },
      scaleAssumedFromWidthRatio: !sameDimensions,
    };
  }

  // Affine: the source matrix maps source pixels to parent pixels. For a new
  // image of a different size, first map new pixels onto source pixels.
  const sourceMatrix = source.affineMatrix as AffineMatrix;
  const affineMatrix: AffineMatrix = sameDimensions
    ? [...sourceMatrix]
    : composeMatrices(scaleMatrix(sourceWidth / newWidth, sourceHeight / newHeight), sourceMatrix);

  const bounds = computeTransformedBounds(newWidth, newHeight, affineMatrix);
  const controlPoints = (source.controlPoints ?? []).map((cp) => ({
    source: [cp.source[0] * (newWidth / sourceWidth), cp.source[1] * (newHeight / sourceHeight)] as [
      number,
      number,
    ],
    target: [cp.target[0], cp.target[1]] as [number, number],
  }));

  return {
    placementType,
    metadata: {
      placementType: 'affine',
      affineMatrix,
      controlPoints,
      affineBoundsOffset: { x: bounds.minX, y: bounds.minY },
      affineTransformedWidth: Math.ceil(bounds.width),
      affineTransformedHeight: Math.ceil(bounds.height),
      // Placeholder for affine descendants; the effective scale is derived from
      // the nearest non-affine ancestor at render time
      scalePixelsPerCentimeter,
      ...CLEAR_RECTANGLE,
      ...CLEAR_POINT,
    },
    affineMatrix,
    scaleAssumedFromWidthRatio: !sameDimensions,
  };
}

/**
 * Bake affine overlay tiles for a copied affine placement. The tile hash must be
 * unique per overlay (the new micrograph's id is the convention), because the
 * tiles hold that image's warped pixels.
 */
export async function bakeAffineTilesForCopy(
  imagePath: string,
  affineTileHash: string,
  affineMatrix: AffineMatrix
): Promise<void> {
  const result = await window.api?.generateAffineTiles(imagePath, affineTileHash, affineMatrix);
  if (!result?.success) {
    throw new Error(`Affine tile generation failed: ${result?.error ?? 'unknown error'}`);
  }
}
