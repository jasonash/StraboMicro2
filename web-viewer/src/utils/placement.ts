/**
 * Whether a child micrograph has been placed on its parent. A child without
 * a location is not drawn on its parent (it used to land centered on the
 * parent's top-left corner at a guessed size, looking placed) and the tree
 * marks it "Location not set". Same rule as the desktop's export
 * (electron/imageExport.js) and its incomplete check
 * (findIncompleteMicrographs). Live sync puts half-finished work on the
 * server, so the viewer meets such children more often (2026-10-07).
 */

import type { MicrographMetadata } from '../types/project-types';

export function hasLocation(m: MicrographMetadata): boolean {
  return (
    m.placementType === 'affine' ||
    !!m.offsetInParent ||
    !!m.pointInParent ||
    (m.xOffset != null && m.yOffset != null)
  );
}

/** A child micrograph (has a parent) that has not been placed on it yet */
export function needsLocation(m: MicrographMetadata): boolean {
  return !!m.parentID && !hasLocation(m);
}
