/**
 * Spot data sections (the right pane's Add Data list) and whether a spot or
 * micrograph has data in each, plus the spot filter built on them
 * (View > Filter Spots..., Angus 2026-10-28).
 *
 * "Has data" is the same test the Properties panel uses to show a section,
 * so "Has Veins" in the filter always matches "the Veins section shows".
 * A new section only needs an entry in SPOT_DATA_SECTIONS.
 */

import type { Spot } from '../types/project-types';

/** Does a value hold anything: text that is not blank, a number, a yes/no, or a list/object with such a value inside */
export function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.values(value).some(hasContent);
  return false;
}

/** The fields the sections look at (a spot or a micrograph) */
export type SectionSource = Partial<Pick<Spot,
  | 'mineralogy' | 'lithologyInfo' | 'grainInfo' | 'fabricInfo' | 'clasticDeformationBandInfo'
  | 'grainBoundaryInfo' | 'intraGrainInfo' | 'veinInfo' | 'pseudotachylyteInfo' | 'foldInfo'
  | 'faultsShearZonesInfo' | 'extinctionMicrostructureInfo' | 'fractureInfo' | 'notes'
  | 'associatedFiles' | 'links' | 'customUserData'
>>;

export interface SpotDataSection {
  id: string;
  /** As in the Add Data menu */
  label: string;
  has: (data: SectionSource) => boolean;
}

/** In the Add Data menu's order; Custom User Data (its own section in Properties) last */
export const SPOT_DATA_SECTIONS = [
  { id: 'mineralogy', label: 'Mineralogy/Lithology', has: (d) => hasContent(d.mineralogy) || hasContent(d.lithologyInfo) },
  {
    id: 'grain',
    label: 'Grain Size/Shape/SPO',
    has: (d) =>
      hasContent(d.grainInfo?.grainSizeInfo) ||
      hasContent(d.grainInfo?.grainShapeInfo) ||
      hasContent(d.grainInfo?.grainOrientationInfo),
  },
  { id: 'fabric', label: 'Fabrics', has: (d) => hasContent(d.fabricInfo?.fabrics) },
  { id: 'clastic', label: 'Clastic Deformation Bands', has: (d) => hasContent(d.clasticDeformationBandInfo?.bands) },
  { id: 'grainBoundary', label: 'Grain Boundaries / Contacts', has: (d) => hasContent(d.grainBoundaryInfo?.boundaries) },
  { id: 'intraGrain', label: 'Intragranular Structures', has: (d) => hasContent(d.intraGrainInfo?.grains) },
  { id: 'vein', label: 'Veins', has: (d) => hasContent(d.veinInfo?.veins) },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte', has: (d) => hasContent(d.pseudotachylyteInfo?.pseudotachylytes) },
  { id: 'fold', label: 'Folds', has: (d) => hasContent(d.foldInfo?.folds) },
  { id: 'faultsShearZones', label: 'Faults and Shear Zones', has: (d) => hasContent(d.faultsShearZonesInfo?.faultsShearZones) },
  {
    id: 'extinctionMicrostructures',
    label: 'Extinction Microstructures',
    has: (d) => hasContent(d.extinctionMicrostructureInfo?.extinctionMicrostructures),
  },
  { id: 'fracture', label: 'Fractures', has: (d) => hasContent(d.fractureInfo?.fractures) },
  { id: 'notes', label: 'Notes', has: (d) => hasContent(d.notes) },
  { id: 'files', label: 'Associated Files', has: (d) => hasContent(d.associatedFiles) },
  { id: 'links', label: 'Links', has: (d) => hasContent(d.links) },
  { id: 'customUserData', label: 'Custom User Data', has: (d) => hasContent(d.customUserData) },
] as const satisfies readonly SpotDataSection[];

export type SpotDataSectionId = (typeof SPOT_DATA_SECTIONS)[number]['id'];

const SECTION_BY_ID = new Map<string, SpotDataSection>(SPOT_DATA_SECTIONS.map((s) => [s.id, s]));

export function sectionHasData(id: SpotDataSectionId, data: SectionSource | null | undefined): boolean {
  const section = SECTION_BY_ID.get(id);
  return !!data && !!section && section.has(data);
}

// ============================================================================
// Spot filter
// ============================================================================

export type SectionChoice = 'has' | 'without';

export interface SpotFilter {
  /** Sections with a choice; a section left out matches every spot */
  sections: Partial<Record<SpotDataSectionId, SectionChoice>>;
  /** What happens to spots that do not match */
  others: 'dim' | 'hide';
}

export const NO_SPOT_FILTER: SpotFilter = { sections: {}, others: 'dim' };

export function isSpotFilterOn(filter: SpotFilter): boolean {
  return Object.values(filter.sections).some((choice) => choice === 'has' || choice === 'without');
}

/** Does the spot meet every chosen section (all of them, not any) */
export function spotMatchesFilter(spot: SectionSource, filter: SpotFilter): boolean {
  for (const [id, choice] of Object.entries(filter.sections)) {
    if (choice !== 'has' && choice !== 'without') continue;
    const section = SECTION_BY_ID.get(id);
    if (!section) continue;
    if (section.has(spot) !== (choice === 'has')) return false;
  }
  return true;
}

/** How a spot is drawn under the filter */
export function spotFilterLook(spot: SectionSource, filter: SpotFilter): 'normal' | 'dim' | 'hidden' {
  if (!isSpotFilterOn(filter) || spotMatchesFilter(spot, filter)) return 'normal';
  return filter.others === 'hide' ? 'hidden' : 'dim';
}

/** Short text of the chosen sections, e.g. "has Mineralogy/Lithology, no Links" */
export function describeSpotFilter(filter: SpotFilter): string {
  return SPOT_DATA_SECTIONS.flatMap((s) => {
    const choice = filter.sections[s.id];
    if (choice === 'has') return [`has ${s.label}`];
    if (choice === 'without') return [`no ${s.label}`];
    return [];
  }).join(', ');
}
