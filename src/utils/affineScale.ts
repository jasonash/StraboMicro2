/**
 * Real scales for affine-placed micrographs (3-Point Registration, automatic placement).
 *
 * An affine placement's matrix maps the micrograph's pixels onto its parent's, so its real scale
 * is the parent's divided by how much the matrix enlarges. Until 2026-10-19 the app stored a
 * stand-in instead (100 px/cm from the New Micrograph wizard, or the parent's scale from Edit
 * Location) and only the viewer worked out the real one; spot measurements, Grain Size, the PDF
 * report and the web viewer read the stand-in. Every save now stores the real scale, and
 * repairAffineScales fixes projects saved before, when they are opened.
 *
 * Micrographs placed on a micrograph are drawn at (parent's scale / their scale) times their
 * pixel size, so when a micrograph's stored scale changes, cascadeScale changes theirs by the same
 * factor and they keep their size and place on it. Point-placed micrographs keep their own scale
 * (it was measured, not derived from the parent's).
 * Only type imports, so Node tests can load it.
 */

import type { AffineMatrix } from './affineTransform';
import type { MicrographMetadata, ProjectMetadata } from '../types/project-types';
import { hasLocation } from './micrographLocation.ts';

/** Renderers draw a micrograph without a scale as 100 px/cm */
const DRAWN_WITHOUT_SCALE = 100;

/**
 * Parent px per micrograph px: the square root of the matrix's area factor, so a skewed or
 * unevenly stretched placement gets its average linear enlargement
 */
export function affineMatrixScale(m: AffineMatrix): number {
  return Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
}

/** px/cm of a micrograph placed with matrix m on a parent of parentPxPerCm; null when it cannot be told */
export function affineRealScale(parentPxPerCm: number | null | undefined, m: AffineMatrix | null | undefined): number | null {
  if (!parentPxPerCm || !m || m.length !== 6) return null;
  const s = affineMatrixScale(m);
  return s > 0 && Number.isFinite(s) ? parentPxPerCm / s : null;
}

function isAffinePlaced(m: MicrographMetadata): m is MicrographMetadata & { affineMatrix: AffineMatrix } {
  return m.placementType === 'affine' && Array.isArray(m.affineMatrix) && m.affineMatrix.length === 6 && !!m.parentID;
}

function isPointPlaced(m: MicrographMetadata): boolean {
  return m.placementType === 'point' || m.pointInParent != null;
}

function allMicrographs(project: ProjectMetadata): MicrographMetadata[] {
  return (project.datasets ?? []).flatMap((d) => d.samples ?? []).flatMap((s) => s.micrographs ?? []);
}

function childrenByParent(list: MicrographMetadata[]): Map<string, MicrographMetadata[]> {
  const children = new Map<string, MicrographMetadata[]>();
  for (const m of list) {
    if (!m.parentID) continue;
    const arr = children.get(m.parentID) ?? [];
    arr.push(m);
    children.set(m.parentID, arr);
  }
  return children;
}

/**
 * After micrographId's stored scale changed by ratio (new / old, already stored): the micrographs
 * placed on it, and on those, and so on, changed in place so they keep their size and place.
 * Rectangle (and legacy) placements change by the same factor; affine ones get the real scale
 * from their parent's new one. Point-placed and unplaced micrographs, and everything on them,
 * are left alone. Returns the changed micrographs.
 */
export function cascadeScale(project: ProjectMetadata, micrographId: string, ratio: number): MicrographMetadata[] {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) return [];
  const list = allMicrographs(project);
  const byId = new Map(list.map((m) => [m.id, m]));
  const children = childrenByParent(list);
  const changed: MicrographMetadata[] = [];
  const ratios = new Map<string, number>([[micrographId, ratio]]);
  const queue = [micrographId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const parent = byId.get(id);
    for (const child of children.get(id) ?? []) {
      if (ratios.has(child.id) || isPointPlaced(child) || !hasLocation(child)) continue;
      const old = child.scalePixelsPerCentimeter || DRAWN_WITHOUT_SCALE;
      const next = isAffinePlaced(child)
        ? affineRealScale(parent?.scalePixelsPerCentimeter, child.affineMatrix)
        : old * (ratios.get(id) as number);
      if (next === null) continue;
      child.scalePixelsPerCentimeter = next;
      changed.push(child);
      ratios.set(child.id, next / old);
      queue.push(child.id);
    }
  }
  return changed;
}

/**
 * Sets micrographId's stored scale (in place) and changes the scales that follow it by the same
 * factor (cascadeScale): Edit Micrograph Metadata's scale step, placement saves, the repair.
 */
export function setScaleWithCascade(project: ProjectMetadata, micrographId: string, scale: number): void {
  const m = allMicrographs(project).find((x) => x.id === micrographId);
  if (!m || !(scale > 0)) return;
  const old = m.scalePixelsPerCentimeter;
  m.scalePixelsPerCentimeter = scale;
  // A first scale: nothing was placed relative to one
  if (old) cascadeScale(project, micrographId, scale / old);
}

/** Relative difference below which a stored scale counts as right (floating point noise) */
const SAME = 1e-9;

/**
 * Gives every affine-placed micrograph its real scale (in place) and keeps the micrographs placed on it the same size (cascadeScale). Returns the names of the
 * affine micrographs whose scale changed. Running it again changes nothing.
 */
export function repairAffineScales(project: ProjectMetadata): string[] {
  const list = allMicrographs(project);
  const byId = new Map(list.map((m) => [m.id, m]));
  // Any order: a parent's cascade sets its affine children exactly, so a child done first is
  // simply set again
  const affine = list.filter(isAffinePlaced);
  const before = new Map(affine.map((m) => [m.id, m.scalePixelsPerCentimeter]));
  for (const m of affine) {
    const parent = byId.get(m.parentID as string);
    const real = affineRealScale(parent?.scalePixelsPerCentimeter, m.affineMatrix);
    if (real === null) continue;
    const old = m.scalePixelsPerCentimeter;
    if (old && Math.abs(old - real) <= SAME * real) continue;
    setScaleWithCascade(project, m.id, real);
  }
  // Also those a parent's cascade set
  return affine
    .filter((m) => m.scalePixelsPerCentimeter !== before.get(m.id))
    .map((m) => m.name || m.imageFilename || m.id);
}

/**
 * A micrograph's real px/cm, worked out from its affine ancestors (the stored value once
 * repairAffineScales or a save has run; also right for a stand-in that arrived some other way).
 */
export function realScaleOf(
  m: MicrographMetadata,
  lookup: (id: string) => MicrographMetadata | undefined,
  depth = 0,
): number | null {
  if (isAffinePlaced(m) && depth < 64) {
    const parent = lookup(m.parentID as string);
    const real = affineRealScale(parent ? realScaleOf(parent, lookup, depth + 1) : null, m.affineMatrix);
    if (real !== null) return real;
  }
  return m.scalePixelsPerCentimeter ?? null;
}
