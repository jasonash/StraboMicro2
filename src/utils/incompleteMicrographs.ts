/**
 * Wording for incomplete micrographs (no scale, no location, instrument
 * details missing) when sync is turned on (2026-10-07 decision B). Unlike
 * export, turning sync on is never refused: live sync sends half-finished
 * work as soon as it is made, so the dialog only warns and lists them.
 * The list itself comes from findIncompleteMicrographs
 * (IncompleteMicrographsDialog.tsx), the same check export uses.
 */

/** The fields of an IncompleteMicrograph this wording reads */
export interface IncompleteItem {
  name: string;
  needsScale: boolean;
  needsLocation: boolean;
  needsInstrumentInfo: boolean;
}

/** How many names the warning lists before "and N more" */
export const INCOMPLETE_LIST_LIMIT = 5;

/** "needs a scale and a location", or null when nothing is missing */
export function missingText(item: IncompleteItem): string | null {
  const parts: string[] = [];
  if (item.needsScale) parts.push('a scale');
  if (item.needsLocation) parts.push('a location');
  if (item.needsInstrumentInfo) parts.push('instrument details');
  if (parts.length === 0) return null;
  const last = parts.pop();
  return `needs ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last}`;
}

export interface IncompleteWarning {
  title: string;
  /** "<name>: needs ..." for the first INCOMPLETE_LIST_LIMIT micrographs */
  lines: string[];
  /** "and 3 more", or null */
  more: string | null;
}

/** The turn-on dialog's warning, or null when every micrograph is complete */
export function incompleteWarning(items: IncompleteItem[]): IncompleteWarning | null {
  const listed = items
    .map((item) => ({ item, missing: missingText(item) }))
    .filter((x): x is { item: IncompleteItem; missing: string } => x.missing !== null);
  if (listed.length === 0) return null;
  const n = listed.length;
  const shown = listed.slice(0, INCOMPLETE_LIST_LIMIT);
  return {
    title: n === 1 ? "1 micrograph isn't finished yet" : `${n} micrographs aren't finished yet`,
    lines: shown.map(({ item, missing }) => `${item.name}: ${missing}`),
    more: n > shown.length ? `and ${n - shown.length} more` : null,
  };
}
