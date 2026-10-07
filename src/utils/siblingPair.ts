/**
 * What a linked PPL/XPL pair shows (display only, no data change). The
 * secondary (XPL, isPrimarySibling false) is hidden in the tree and toggled
 * to with the PPL/XPL button, but older projects (and a few paths before
 * v2.0.52) left micrographs and spots attached to the XPL itself, where
 * nobody could see them: Daniel Ortega-Arroyo's RGMC1b_5X_XPL carried five
 * affine-registered children and a spot (2026-10-06). Both views of a pair
 * now show both halves' children and spots, and the tree lists the XPL's
 * children under the pair ("On <XPL name>").
 *
 * The two images share one pixel space, as the PPL/XPL toggle (same zoom and
 * position) and the spots already assume; a child is sized against its own
 * parent's scale.
 */

import type { MicrographMetadata, Spot } from '../types/project-types';

type Lookup = (id: string) => MicrographMetadata | undefined;

/** The other half of a properly linked pair (each links the other, exactly one primary), or null */
export function pairPartner(micro: MicrographMetadata, lookup: Lookup): MicrographMetadata | null {
  if (!micro.siblingImageId || micro.siblingImageId === micro.id) return null;
  const other = lookup(micro.siblingImageId);
  if (!other || other.siblingImageId !== micro.id) return null;
  const onePrimary =
    (micro.isPrimarySibling === true && other.isPrimarySibling === false) ||
    (micro.isPrimarySibling === false && other.isPrimarySibling === true);
  return onePrimary ? other : null;
}

/** The hidden XPL of a primary (PPL), or null */
export function hiddenSibling(micro: MicrographMetadata, lookup: Lookup): MicrographMetadata | null {
  if (micro.isPrimarySibling !== true) return null;
  return pairPartner(micro, lookup);
}

export interface PairChild {
  child: MicrographMetadata;
  /** The child's own parent: the micrograph in view or the other half of its pair */
  parent: MicrographMetadata;
}

/**
 * The children drawn on a micrograph: its own, then (for a linked pair) the
 * other half's. Secondary siblings are left out (they are drawn as the
 * toggle, not as overlays), and so are the pair's own two micrographs.
 */
export function pairChildren(
  active: MicrographMetadata,
  childrenOf: (parentId: string) => MicrographMetadata[],
  lookup: Lookup,
): PairChild[] {
  const partner = pairPartner(active, lookup);
  const skip = new Set([active.id, partner?.id]);
  const out: PairChild[] = [];
  for (const parent of partner ? [active, partner] : [active]) {
    for (const child of childrenOf(parent.id)) {
      if (child.isPrimarySibling === false || skip.has(child.id)) continue;
      out.push({ child, parent });
    }
  }
  return out;
}

/**
 * The spots shown on a micrograph: for a linked pair, the primary's (where
 * new spots go) and then any the secondary carries itself, in both views.
 */
export function pairSpots(active: MicrographMetadata, lookup: Lookup): Spot[] {
  const partner = pairPartner(active, lookup);
  if (!partner) return active.spots ?? [];
  const [primary, secondary] = active.isPrimarySibling === true ? [active, partner] : [partner, active];
  return [...(primary.spots ?? []), ...(secondary.spots ?? [])];
}
