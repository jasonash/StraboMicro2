/**
 * Whether an associated micrograph has a location on its parent, and which children of a
 * micrograph still need one (Batch Import adds children without a location). One rule for the
 * tree's warning icon, the export/upload check and "Place children automatically...".
 * Only type imports, so Node tests can load it.
 */

import type { MicrographMetadata, ProjectMetadata } from '../types/project-types';

/** Location via a scaled rectangle, an approximate point, a legacy xOffset or an affine placement */
export function hasLocation(m: MicrographMetadata): boolean {
  return !!m.offsetInParent || !!m.pointInParent || m.xOffset !== undefined || m.placementType === 'affine';
}

/**
 * The children of parentId without a location, in tree order. Hidden secondary siblings (XPL of a
 * PPL/XPL pair) are left out, as in the tree: they are drawn where their primary is.
 */
export function unplacedChildren(project: ProjectMetadata | null, parentId: string): MicrographMetadata[] {
  const found: MicrographMetadata[] = [];
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const m of sample.micrographs ?? []) {
        if (m.parentID === parentId && m.isPrimarySibling !== false && !hasLocation(m)) found.push(m);
      }
    }
  }
  return found;
}

/**
 * Why the children of this micrograph cannot be placed automatically, or null when they can:
 * matching gives each child its scale from the parent's, so the parent needs a scale, and a
 * parent that is itself an associated micrograph needs a location first.
 */
export function cannotPlaceChildrenReason(parent: MicrographMetadata): string | null {
  if (!parent.scalePixelsPerCentimeter) return 'Set the scale of this micrograph first';
  if (parent.parentID && !hasLocation(parent)) return 'Place this micrograph on its parent first';
  if (!parent.imagePath) return 'This micrograph has no image';
  return null;
}
