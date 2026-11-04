/**
 * Mapping spots between a micrograph and the ones it is placed on.
 *
 * View > Show Parent Spots (Peter, 2026-10-29): the spots of every micrograph
 * above the one in the viewer, mapped into its pixels, so you can see where
 * the spots made on the reference (or a BSE image) fall on a map nested in
 * it. The reverse of Show Recursive Spots (ChildSpotsRenderer), with the same
 * placement rules: a scaled rectangle (offset of the top-left corner before
 * rotation, rotation about the center, scale = parent px/cm over child px/cm)
 * or a 3-point registration matrix. A point placement has no footprint, so
 * nothing above it can be mapped. A secondary sibling (XPL) is placed where
 * its primary (PPL) is. Pure functions (npm run test:parent-spots).
 */

import type { Geometry, MicrographMetadata, Spot } from '@/types/project-types';
import { composeMatrices, identityMatrix, invertAffineMatrix, type AffineMatrix } from '@/utils/affineTransform';
import { pairPartner, pairSpots } from '@/utils/siblingPair';

type Lookup = (id: string) => MicrographMetadata | undefined;

const applyAffine = (m: AffineMatrix, x: number, y: number): [number, number] => {
  const [a, b, tx, c, d, ty] = m;
  return [a * x + b * y + tx, c * x + d * y + ty];
};

/**
 * A shallow copy of the spot with its geometry and legacy points mapped
 * through the matrix (the original is untouched).
 */
export function transformSpot(spot: Spot, matrix: AffineMatrix): Spot {
  const next: Spot = { ...spot };
  if (spot.geometry) {
    const { type, coordinates } = spot.geometry;
    if (type === 'Point') {
      const [x, y] = coordinates as [number, number];
      next.geometry = { ...spot.geometry, coordinates: applyAffine(matrix, x, y) } as Geometry;
    } else if (type === 'LineString') {
      next.geometry = {
        ...spot.geometry,
        coordinates: (coordinates as Array<[number, number]>).map(([x, y]) => applyAffine(matrix, x, y)),
      } as Geometry;
    } else if (type === 'Polygon') {
      next.geometry = {
        ...spot.geometry,
        coordinates: (coordinates as Array<Array<[number, number]>>).map((ring) =>
          ring.map(([x, y]) => applyAffine(matrix, x, y))
        ),
      } as Geometry;
    }
  }
  if (spot.points) {
    next.points = spot.points.map((p) => {
      const [nx, ny] = applyAffine(matrix, p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0);
      return { X: nx, Y: ny };
    });
  }
  return next;
}

/** The micrograph that carries the placement: itself, or a secondary sibling's primary */
function placementCarrier(m: MicrographMetadata, lookup: Lookup): MicrographMetadata {
  if (m.isPrimarySibling === false) {
    const partner = pairPartner(m, lookup);
    if (partner) return partner;
  }
  return m;
}

/**
 * The matrix from a placed micrograph's pixels to its parent's pixels, or
 * null (point placement, no placement, unknown size)
 */
export function childToParentMatrix(child: MicrographMetadata, parent: MicrographMetadata): AffineMatrix | null {
  if (child.placementType === 'affine' && Array.isArray(child.affineMatrix) && child.affineMatrix.length === 6) {
    return [...child.affineMatrix] as AffineMatrix;
  }
  if (child.pointInParent) return null;
  const width = child.imageWidth || 0;
  const height = child.imageHeight || 0;
  if (!width || !height) return null;
  let topLeft: [number, number] | null = null;
  if (child.offsetInParent) {
    topLeft = [child.offsetInParent.X ?? child.offsetInParent.x ?? 0, child.offsetInParent.Y ?? child.offsetInParent.y ?? 0];
  } else if (typeof child.xOffset === 'number' && typeof child.yOffset === 'number') {
    topLeft = [child.xOffset, child.yOffset];
  }
  if (!topLeft) return null;
  const s = (parent.scalePixelsPerCentimeter || 100) / (child.scalePixelsPerCentimeter || 100);
  const cx = topLeft[0] + (width * s) / 2;
  const cy = topLeft[1] + (height * s) / 2;
  const angle = ((child.rotation || 0) * Math.PI) / 180;
  const a = s * Math.cos(angle);
  const b = -s * Math.sin(angle);
  const c = s * Math.sin(angle);
  const d = s * Math.cos(angle);
  // parent = center + R * s * (p - imageCenter)
  return [a, b, cx - (a * width) / 2 - (b * height) / 2, c, d, cy - (c * width) / 2 - (d * height) / 2];
}

export interface ParentSpot {
  /** The spot mapped into the pixels of the micrograph in the viewer */
  spot: Spot;
  /** The spot as saved, on its own micrograph */
  source: Spot;
  sourceMicrographId: string;
  sourceMicrographName: string;
}

/**
 * The spots of every micrograph above this one (parent, grandparent, ...),
 * mapped into its pixels, nearest level first. Stops at a level that cannot
 * be mapped (a point placement).
 */
export function ancestorSpots(micrograph: MicrographMetadata, lookup: Lookup): ParentSpot[] {
  const out: ParentSpot[] = [];
  const seen = new Set<string>([micrograph.id]);
  let current = micrograph;
  // From the viewer micrograph's pixels to the current ancestor's
  let toAncestor: AffineMatrix = identityMatrix();
  for (;;) {
    const placed = placementCarrier(current, lookup);
    const parent = placed.parentID ? lookup(placed.parentID) : undefined;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    const step = childToParentMatrix(placed, parent);
    if (!step) break;
    toAncestor = composeMatrices(toAncestor, step);
    let back: AffineMatrix;
    try {
      back = invertAffineMatrix(toAncestor);
    } catch {
      break;
    }
    const name = parent.name || 'Unnamed Micrograph';
    for (const spot of pairSpots(parent, lookup)) {
      out.push({ spot: transformSpot(spot, back), source: spot, sourceMicrographId: parent.id, sourceMicrographName: name });
    }
    current = parent;
  }
  return out;
}
