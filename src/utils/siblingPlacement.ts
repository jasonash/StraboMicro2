/**
 * PPL/XPL sibling placement. A secondary sibling (XPL, isPrimarySibling false)
 * is hidden in the tree and drawn where its primary (PPL) is, so it must have
 * the primary's parent and placement. Every path that pairs two micrographs
 * (Link Sibling, Add Corresponding Image, the New Micrograph wizard) uses
 * siblingPlacementFrom, and loadProject repairs pairs saved before this held
 * (an XPL placed on its own PPL reference, then linked, kept the PPL as its
 * parent but lost its location: upload refused it as "missing location" and
 * the tree never showed it).
 */

import type { MicrographMetadata, ProjectMetadata } from '../types/project-types';

/** The fields that place a micrograph on its parent */
export const SIBLING_PLACEMENT_KEYS = [
  'parentID', 'xOffset', 'yOffset', 'offsetInParent', 'rotation', 'scaleX', 'scaleY', 'pointInParent',
  'placementType', 'affineMatrix', 'controlPoints', 'affineBoundsOffset', 'affineTransformedWidth',
  'affineTransformedHeight',
] as const;

type SiblingPlacement = Pick<MicrographMetadata, (typeof SIBLING_PLACEMENT_KEYS)[number] | 'affineTileHash'>;

/**
 * The primary's parent and placement for its secondary `secondaryId`. Affine
 * tiles hold one image's warped pixels, so an affine secondary gets its own
 * tile key (its id); missing tiles are made on demand when it is drawn.
 */
export function siblingPlacementFrom(primary: MicrographMetadata, secondaryId: string): SiblingPlacement {
  const placement: SiblingPlacement = {};
  for (const key of SIBLING_PLACEMENT_KEYS) {
    const value = primary[key];
    (placement as Record<string, unknown>)[key] = value === undefined ? undefined : structuredClone(value);
  }
  placement.affineTileHash = primary.placementType === 'affine' ? secondaryId : null;
  return placement;
}

/** Whether the secondary already has the primary's parent and placement */
export function siblingPlacementMatches(primary: MicrographMetadata, secondary: MicrographMetadata): boolean {
  for (const key of SIBLING_PLACEMENT_KEYS) {
    if (JSON.stringify(primary[key] ?? null) !== JSON.stringify(secondary[key] ?? null)) return false;
  }
  return primary.placementType !== 'affine' || !!secondary.affineTileHash;
}

/**
 * Link primary and secondary (in place): the bidirectional link and the
 * secondary placed where the primary is. When the primary had been placed on
 * the secondary itself, the primary first takes the secondary's place, so
 * neither becomes its own parent.
 */
export function applySiblingLink(primary: MicrographMetadata, secondary: MicrographMetadata): void {
  if (primary.parentID === secondary.id) {
    Object.assign(primary, siblingPlacementFrom(secondary, primary.id));
  }
  primary.siblingImageId = secondary.id;
  primary.isPrimarySibling = true;
  secondary.siblingImageId = primary.id;
  secondary.isPrimarySibling = false;
  Object.assign(secondary, siblingPlacementFrom(primary, secondary.id));
  const scale = inheritedScale(primary, secondary);
  if (scale !== null) secondary.scalePixelsPerCentimeter = scale;
}

/**
 * A secondary without a scale (batch imported, never set up) takes the
 * primary's, adjusted when its image is a different size. Null when it has
 * one or there is none to take.
 */
function inheritedScale(primary: MicrographMetadata, secondary: MicrographMetadata): number | null {
  if (secondary.scalePixelsPerCentimeter || !primary.scalePixelsPerCentimeter) return null;
  const ratio = primary.width && secondary.width ? secondary.width / primary.width : 1;
  return primary.scalePixelsPerCentimeter * ratio;
}

/**
 * Place every secondary sibling where its primary is (in place). Returns the
 * names of the secondaries that moved or took the primary's scale. Pairs
 * whose other half is missing or not linked back are left alone.
 */
export function repairSiblingPlacements(project: ProjectMetadata): string[] {
  const byId = new Map<string, MicrographMetadata>();
  for (const dataset of project.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const micro of sample.micrographs ?? []) byId.set(micro.id, micro);
    }
  }
  const repaired: string[] = [];
  for (const secondary of byId.values()) {
    if (secondary.isPrimarySibling !== false || !secondary.siblingImageId) continue;
    const primary = byId.get(secondary.siblingImageId);
    if (!primary || primary.siblingImageId !== secondary.id || primary.isPrimarySibling !== true) continue;
    if (siblingPlacementMatches(primary, secondary) && inheritedScale(primary, secondary) === null) continue;
    applySiblingLink(primary, secondary);
    repaired.push(secondary.name || secondary.imageFilename || secondary.id);
  }
  return repaired;
}
