/**
 * Finish Importing (Jason, 2026-10-30): what an imported micrograph still needs
 * and the steps of the wizard that completes one or several. Only type imports
 * and micrographLocation, so Node tests can load it (npm run test:finish-importing).
 */

import type { MicrographMetadata, ProjectMetadata } from '../types/project-types';
import { hasLocation } from './micrographLocation';

export type FinishStep = 'Micrographs' | 'Rotate / Flip' | 'Instrument & Image Info' | 'Instrument Data' | 'Placement' | 'Scale';

export interface MicrographNeeds {
  instrument: boolean;
  scale: boolean;
  location: boolean;
}

/** The same rule as the tree's warning dot */
export function needsOf(m: MicrographMetadata): MicrographNeeds {
  return {
    instrument: !!m.needsInstrumentInfo,
    scale: !m.scalePixelsPerCentimeter,
    location: !!m.parentID && !hasLocation(m),
  };
}

export function isIncomplete(m: MicrographMetadata): boolean {
  const needs = needsOf(m);
  return needs.instrument || needs.scale || needs.location;
}

/**
 * The incomplete micrographs to finish together with this one, in tree order:
 * those on the same parent, or for a reference micrograph the incomplete
 * reference micrographs of its sample. Hidden secondary siblings (XPL of a pair)
 * are left out, as in the tree.
 */
export function finishGroup(project: ProjectMetadata | null, micrographId: string): MicrographMetadata[] {
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      const micrographs = sample.micrographs ?? [];
      const clicked = micrographs.find((m) => m.id === micrographId);
      if (!clicked) continue;
      return micrographs.filter((m) =>
        (m.parentID || null) === (clicked.parentID || null) &&
        m.isPrimarySibling !== false &&
        (m.id === micrographId || isIncomplete(m)));
    }
  }
  return [];
}

/**
 * Pixels may be turned only while nothing depends on them: no placement on a
 * parent (bulk placement can place a micrograph that still needs its instrument
 * info), no spots, nothing placed on it, no sibling.
 */
export function canRotate(project: ProjectMetadata | null, m: MicrographMetadata): boolean {
  if (hasLocation(m) || (m.spots?.length ?? 0) > 0 || m.siblingImageId) return false;
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      if ((sample.micrographs ?? []).some((c) => c.parentID === m.id)) return false;
    }
  }
  return true;
}

/**
 * The wizard's steps for the checked micrographs. Placement and Scale are a step
 * of their own only for several; one micrograph goes straight to its own dialog
 * (Edit Micrograph Location, Set Scale) after the steps before.
 */
export function finishSteps(
  project: ProjectMetadata | null,
  rows: MicrographMetadata[],
  options: { showList: boolean; skipRotation: boolean }
): FinishStep[] {
  const steps: FinishStep[] = [];
  if (options.showList) steps.push('Micrographs');
  if (!options.skipRotation && rows.some((m) => canRotate(project, m))) steps.push('Rotate / Flip');
  if (rows.some((m) => needsOf(m).instrument)) steps.push('Instrument & Image Info', 'Instrument Data');
  const toPlace = rows.filter((m) => needsOf(m).location || (m.parentID && needsOf(m).scale));
  const toScale = rows.filter((m) => !m.parentID && needsOf(m).scale);
  if (toPlace.length > 1) steps.push('Placement');
  if (toScale.length > 1) steps.push('Scale');
  return steps;
}

/** Whether clicking this micrograph needs no wizard: it alone needs only its location or scale */
export function goesStraightToItsDialog(group: MicrographMetadata[]): boolean {
  return group.length === 1 && !needsOf(group[0]).instrument;
}

/** Short words for what a row still needs */
export function needsText(m: MicrographMetadata): string {
  const needs = needsOf(m);
  const parts: string[] = [];
  if (needs.instrument) parts.push('instrument info');
  if (needs.scale && !m.parentID) parts.push('scale');
  if (needs.location || (m.parentID && needs.scale)) parts.push('location');
  return `Needs ${parts.join(', ')}`;
}
