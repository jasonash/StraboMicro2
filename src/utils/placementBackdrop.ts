/**
 * Which image the placement screens show behind the overlay when the parent
 * is half of a linked PPL/XPL pair (Caroline Woods, 2026-11-19: BSE reference
 * points are easier to see in XPL). The two halves share one pixel space
 * (src/utils/siblingPair.ts), so the other half is drawn stretched over the
 * parent's own frame: what is placed, and what is saved (on the parent), is
 * the same whichever half is shown.
 *
 * The choice is remembered for the session as "show the XPL" (the secondary
 * half), so placing forty BSE images on XPL needs one click, not forty.
 */

import type { MicrographMetadata } from '../types/project-types';
import { pairPartner } from './siblingPair.ts';

type Lookup = (id: string) => MicrographMetadata | undefined;

export interface PlacementBackdrop {
  /** The micrograph the overlay is placed on (and saved against) */
  parent: MicrographMetadata;
  /** The other half of its pair, or null */
  partner: MicrographMetadata | null;
  /** Whether the partner's image is the one shown */
  showingPartner: boolean;
  /** Short names of the two halves for the toggle, the viewer's words */
  parentLabel: string;
  partnerLabel: string;
}

/** The backdrop for `parent`, given the remembered "show the XPL" choice */
export function placementBackdrop(parent: MicrographMetadata, lookup: Lookup, showSecondary: boolean): PlacementBackdrop {
  const partner = pairPartner(parent, lookup);
  const parentIsPrimary = parent.isPrimarySibling !== false;
  return {
    parent,
    partner,
    showingPartner: partner !== null && (parentIsPrimary ? showSecondary : !showSecondary),
    parentLabel: parentIsPrimary ? 'PPL' : 'XPL',
    partnerLabel: parentIsPrimary ? 'XPL' : 'PPL',
  };
}

/** The remembered choice after the user picks a half */
export function showSecondaryAfterPick(backdrop: PlacementBackdrop, pickPartner: boolean): boolean {
  const parentIsPrimary = backdrop.parent.isPrimarySibling !== false;
  return parentIsPrimary ? pickPartner : !pickPartner;
}
