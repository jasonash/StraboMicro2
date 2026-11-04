/**
 * Turns a found placement (detail px -> parent px matrix, both in the app's stored pixel sizes)
 * into the fields the app saves: a scaled rectangle (offsetInParent = top-left before rotation,
 * rotation in degrees clockwise about the center, as AssociatedImageRenderer draws it) or an
 * affine placement like 3-Point Registration's (three control points, transformed bounds).
 * Only type imports, so Node tests can load it.
 */

import type { AffineMatrix, ControlPoint } from '@/utils/affineTransform';
import type { MicrographMetadata } from '@/types/project-types';
import { affineRealScale } from '../../utils/affineScale.ts';

export interface RectanglePlacement {
  /** offsetInParent, parent px */
  offsetX: number;
  offsetY: number;
  /** degrees, clockwise on screen */
  rotation: number;
  /** parent px per detail px (the child's scalePixelsPerCentimeter = the parent's / scale) */
  scale: number;
}

export interface AffinePlacement {
  matrix: AffineMatrix;
  controlPoints: ControlPoint[];
  boundsOffset: { x: number; y: number };
  transformedWidth: number;
  transformedHeight: number;
}

/** A found (and possibly adjusted) placement; affine ones carry the key of their baked tiles */
export type AutoPlacementOutcome =
  | ({ kind: 'rectangle' } & RectanglePlacement)
  | ({ kind: 'affine'; tileHash: string } & AffinePlacement);

function apply(m: AffineMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

/** The closest move-turn-resize of m, as rectangle fields (exact when m is one) */
export function rectangleFields(m: AffineMatrix, w: number, h: number): RectanglePlacement {
  const p = (m[0] + m[4]) / 2;
  const q = (m[3] - m[1]) / 2;
  const scale = Math.hypot(p, q);
  const rotation = (Math.atan2(q, p) * 180) / Math.PI;
  const [cx, cy] = apply(m, w / 2, h / 2);
  return { offsetX: cx - (w * scale) / 2, offsetY: cy - (h * scale) / 2, rotation, scale };
}

/** Where a rectangle placement puts detail pixel (x, y) on the parent (the renderer's convention) */
export function rectanglePoint(r: RectanglePlacement, w: number, h: number, x: number, y: number): [number, number] {
  const cx = r.offsetX + (w * r.scale) / 2;
  const cy = r.offsetY + (h * r.scale) / 2;
  const a = (r.rotation * Math.PI) / 180;
  const dx = (x - w / 2) * r.scale;
  const dy = (y - h / 2) * r.scale;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** Affine fields like 3-Point Registration saves; the control points are three well-spread detail points */
export function affineFields(m: AffineMatrix, w: number, h: number): AffinePlacement {
  const sources: Array<[number, number]> = [
    [w * 0.1, h * 0.1],
    [w * 0.9, h * 0.1],
    [w * 0.1, h * 0.9],
  ];
  const controlPoints = sources.map((source) => ({ source, target: apply(m, source[0], source[1]) }));
  const corners = [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
  const minX = Math.min(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  const maxY = Math.max(...corners.map((c) => c[1]));
  return {
    matrix: m,
    controlPoints,
    boundsOffset: { x: minX, y: minY },
    transformedWidth: Math.ceil(maxX - minX),
    transformedHeight: Math.ceil(maxY - minY),
  };
}

/** m measured in file pixels -> the same placement in the app's stored pixel sizes */
export function toAppPixels(
  m: AffineMatrix,
  detailFile: { width: number; height: number },
  detailApp: { width: number; height: number },
  parentFile: { width: number; height: number },
  parentApp: { width: number; height: number },
): AffineMatrix {
  const sx = detailFile.width / detailApp.width;
  const sy = detailFile.height / detailApp.height;
  const px = parentApp.width / parentFile.width;
  const py = parentApp.height / parentFile.height;
  return [m[0] * sx * px, m[1] * sy * px, m[2] * px, m[3] * sx * py, m[4] * sy * py, m[5] * py];
}

/**
 * The micrograph fields that save an outcome, clearing the other placement methods. A rectangle's
 * scale comes from the parent's (parent px per cm / parent px per child px); so does an affine
 * placement's (src/utils/affineScale.ts).
 */
export function placementUpdates(
  outcome: AutoPlacementOutcome,
  parentPxPerCm: number,
  childPxPerCm: number | null | undefined,
  opacity: number,
): Partial<MicrographMetadata> {
  if (outcome.kind === 'rectangle') {
    return {
      offsetInParent: { X: outcome.offsetX, Y: outcome.offsetY },
      rotation: outcome.rotation,
      scalePixelsPerCentimeter: parentPxPerCm / outcome.scale,
      opacity,
      pointInParent: undefined,
      placementType: undefined,
      affineMatrix: undefined,
      controlPoints: undefined,
      affineBoundsOffset: undefined,
      affineTransformedWidth: undefined,
      affineTransformedHeight: undefined,
      affineTileHash: undefined,
    };
  }
  return {
    placementType: 'affine',
    affineMatrix: outcome.matrix,
    controlPoints: outcome.controlPoints,
    affineBoundsOffset: outcome.boundsOffset,
    affineTransformedWidth: outcome.transformedWidth,
    affineTransformedHeight: outcome.transformedHeight,
    affineTileHash: outcome.tileHash,
    scalePixelsPerCentimeter: affineRealScale(parentPxPerCm, outcome.matrix) ?? childPxPerCm ?? parentPxPerCm,
    opacity,
    offsetInParent: undefined,
    rotation: undefined,
    scaleX: undefined,
    scaleY: undefined,
    pointInParent: undefined,
  };
}
