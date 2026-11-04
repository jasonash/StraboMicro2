/**
 * Spot names for auto spot mode (docs/auto-spot-mode-design.md 5.2).
 *
 * A name pattern holds `{n}` where the number goes, as in Generate Spots
 * ("Ol-{n}" makes Ol-1, Ol-2, ...). Numbers are not padded. The next number
 * is the highest one already used by that pattern among all spots of the
 * sample (archived spots included, so a hidden Ol-7 is not made twice) plus
 * 1. It is derived each time, never stored; gaps are never filled.
 */

import type { SampleMetadata } from '../types/project-types';

export const DEFAULT_SPOT_NAME_PATTERN = 'Spot {n}';

const PLACEHOLDER = '{n}';

/**
 * The pattern actually used: empty means the default, and a pattern without
 * {n} gets " {n}" added ("Olivine" makes Olivine 1, Olivine 2, ...)
 */
export function effectivePattern(pattern: string | null | undefined): string {
  const p = (pattern ?? '').trim();
  if (p === '') return DEFAULT_SPOT_NAME_PATTERN;
  return p.includes(PLACEHOLDER) ? p : `${p} ${PLACEHOLDER}`;
}

/** The pattern auto mode uses: the preset's spot name when it has one, else the project's default */
export function chosenPattern(
  presetPattern: string | null | undefined,
  projectPattern: string | null | undefined
): string {
  return effectivePattern(presetPattern?.trim() ? presetPattern : projectPattern);
}

/** The name for number n (only the first {n} is replaced, as in Generate Spots) */
export function spotNameFor(pattern: string | null | undefined, n: number): string {
  return effectivePattern(pattern).replace(PLACEHOLDER, String(n));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a whole name made by the pattern; group 1 is the number */
function patternRegExp(pattern: string | null | undefined): RegExp {
  const p = effectivePattern(pattern);
  const at = p.indexOf(PLACEHOLDER);
  const before = escapeRegExp(p.slice(0, at));
  const after = escapeRegExp(p.slice(at + PLACEHOLDER.length));
  return new RegExp(`^${before}(\\d+)${after}$`);
}

/** The highest number the pattern has used among these names (0 = none) */
export function highestNumber(pattern: string | null | undefined, names: Iterable<string>): number {
  const re = patternRegExp(pattern);
  let highest = 0;
  for (const name of names) {
    const m = re.exec(name.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > highest) highest = n;
  }
  return highest;
}

/** Names of every spot on every micrograph of the sample, archived ones included */
export function sampleSpotNames(sample: SampleMetadata | null | undefined): string[] {
  const names: string[] = [];
  for (const micrograph of sample?.micrographs ?? []) {
    for (const spot of micrograph.spots ?? []) {
      if (typeof spot.name === 'string') names.push(spot.name);
    }
  }
  return names;
}

/** The next auto name for the pattern in the sample */
export function nextSpotName(
  pattern: string | null | undefined,
  sample: SampleMetadata | null | undefined
): { name: string; number: number } {
  const number = highestNumber(pattern, sampleSpotNames(sample)) + 1;
  return { name: spotNameFor(pattern, number), number };
}
