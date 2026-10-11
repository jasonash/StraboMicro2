/**
 * PPL/XPL image types for sibling pairs. Optical Microscopy and Scanner both
 * take plane and cross polarized images, under different names:
 * "Plane Polarized Light" / "Cross Polarized Light" (Optical Microscopy) and
 * "Plane Polarized" / "Cross Polarized" (Scanner). Scanner pairs were not
 * offered before 2026-10-11 (user request). A pair never mixes instruments.
 */

import type { MicrographMetadata } from '../types/project-types';

export type PolarizedRole = 'PPL' | 'XPL';

/** The PPL and XPL image type of each instrument that takes pairs */
const PAIR_TYPES: { instrumentType: string; ppl: string; xpl: string }[] = [
  { instrumentType: 'Optical Microscopy', ppl: 'Plane Polarized Light', xpl: 'Cross Polarized Light' },
  { instrumentType: 'Scanner', ppl: 'Plane Polarized', xpl: 'Cross Polarized' },
];

/** Other spellings seen in older or imported projects (Link Sibling accepted them) */
const OTHER_PPL = ['PPL', 'Plane-Polarized Light'];
const OTHER_XPL = ['XPL', 'Cross-Polarized Light', 'Crossed Polarized Light'];

const normalize = (s: string) => s.trim().toUpperCase();
const PPL_NAMES = new Set([...PAIR_TYPES.map((p) => p.ppl), ...OTHER_PPL].map(normalize));
const XPL_NAMES = new Set([...PAIR_TYPES.map((p) => p.xpl), ...OTHER_XPL].map(normalize));

/** 'PPL' or 'XPL' for an image type that can be half of a pair, else null */
export function polarizedRole(imageType: string | null | undefined): PolarizedRole | null {
  if (!imageType) return null;
  const n = normalize(imageType);
  if (PPL_NAMES.has(n)) return 'PPL';
  if (XPL_NAMES.has(n)) return 'XPL';
  return null;
}

/** The label of the other half: 'XPL' for a PPL image type, 'PPL' otherwise */
export function partnerRole(imageType: string | null | undefined): PolarizedRole {
  return polarizedRole(imageType) === 'PPL' ? 'XPL' : 'PPL';
}

/**
 * The image type the other half of a pair gets, in the same instrument's
 * vocabulary ("Plane Polarized" -> "Cross Polarized" for Scanner). Other
 * spellings map to the Optical Microscopy names, as before.
 */
export function partnerImageType(imageType: string | null | undefined): string {
  const n = imageType ? normalize(imageType) : '';
  for (const p of PAIR_TYPES) {
    if (n === normalize(p.ppl)) return p.xpl;
    if (n === normalize(p.xpl)) return p.ppl;
  }
  return partnerRole(imageType) === 'XPL' ? PAIR_TYPES[0].xpl : PAIR_TYPES[0].ppl;
}

/**
 * Whether a micrograph may be linked as the other half of source's pair:
 * the opposite role (or no image type set, as Link Sibling always allowed)
 * and never a different instrument.
 */
export function canPairWith(source: MicrographMetadata, candidate: MicrographMetadata): boolean {
  const sourceRole = polarizedRole(source.imageType);
  if (!sourceRole) return false;
  if (candidate.imageType && polarizedRole(candidate.imageType) !== (sourceRole === 'PPL' ? 'XPL' : 'PPL')) {
    return false;
  }
  const a = source.instrument?.instrumentType || instrumentOfImageType(source.imageType);
  const b = candidate.instrument?.instrumentType || instrumentOfImageType(candidate.imageType);
  return !a || !b || a === b;
}

/** The instrument whose own name this image type is, or null for other spellings */
function instrumentOfImageType(imageType: string | null | undefined): string | null {
  if (!imageType) return null;
  const n = normalize(imageType);
  return PAIR_TYPES.find((p) => n === normalize(p.ppl) || n === normalize(p.xpl))?.instrumentType ?? null;
}
