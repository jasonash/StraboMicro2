/**
 * Building a new spot: the one place New Spot and auto spot mode
 * (docs/auto-spot-mode-design.md 5.3) make a spot, so the two cannot drift.
 *
 * Appearance rules (as New Spot has always had them): the label color starts
 * white, the spot color and opacity start from the last ones saved in New
 * Spot, and a chosen preset sets the spot color and opacity. Presets are then
 * merged into the spot (additive, same rules as Quick Edit) and the
 * appearance is put back on top, so it wins over the presets' own.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Geometry, ProjectMetadata, Spot } from '@/types/project-types';
import type { PresetData, QuickApplyPreset } from '@/types/preset-types';
import { getMicrographParentSample, mergePresetIntoSpot } from '@/store/helpers';
import { chosenPattern, nextSpotName } from '@/utils/autoSpotName';
import { legacyColorToHex, hexToLegacyColor } from '@/utils/colorUtils';

/** Spot appearance in web form (#RRGGBB colors, opacity 0-100) */
export interface SpotAppearance {
  labelColor: string;
  spotColor: string;
  opacity: number;
}

const DEFAULT_LABEL_COLOR = '#ffffff';
const DEFAULT_SPOT_COLOR = '#00ff00';
const DEFAULT_OPACITY = 50;

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The starting appearance of a new spot (the last spot color and opacity saved in New Spot) */
export function lastUsedSpotAppearance(): SpotAppearance {
  const savedOpacity = readSaved('spot_opacity');
  const opacity = savedOpacity ? parseInt(savedOpacity, 10) : DEFAULT_OPACITY;
  return {
    labelColor: DEFAULT_LABEL_COLOR,
    spotColor: readSaved('spot_spotColor') || DEFAULT_SPOT_COLOR,
    opacity: Number.isFinite(opacity) ? opacity : DEFAULT_OPACITY,
  };
}

/** Remember the appearance New Spot saved with, for the next spot */
export function rememberSpotAppearance(appearance: SpotAppearance): void {
  try {
    localStorage.setItem('spot_labelColor', appearance.labelColor);
    localStorage.setItem('spot_spotColor', appearance.spotColor);
    localStorage.setItem('spot_opacity', appearance.opacity.toString());
  } catch {
    // storage unavailable: the next spot starts from the defaults
  }
}

/** The appearance after choosing these presets, in order (each sets spot color and opacity when it has them) */
export function withPresetAppearance(
  appearance: SpotAppearance,
  presets: ReadonlyArray<{ data: PresetData }>
): SpotAppearance {
  const next = { ...appearance };
  for (const preset of presets) {
    if (preset.data.color) next.spotColor = legacyColorToHex(preset.data.color);
    if (preset.data.opacity != null) next.opacity = preset.data.opacity;
  }
  return next;
}

/** GeoJSON geometry in the legacy form: geometryType 'point' / 'line' / 'polygon' and points */
export function geometryToLegacy(geometry: Geometry): {
  geometryType: string;
  points: Array<{ X: number; Y: number }>;
} {
  if (geometry.type === 'Point') {
    const [x, y] = geometry.coordinates as [number, number];
    return { geometryType: 'point', points: [{ X: x, Y: y }] };
  }
  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates as Array<[number, number]>;
    return { geometryType: 'line', points: coords.map(([x, y]) => ({ X: x, Y: y })) };
  }
  if (geometry.type === 'Polygon') {
    // Polygon coordinates are nested: [[[x1, y1], [x2, y2], ...]]
    const ring = (geometry.coordinates as Array<Array<[number, number]>>)[0] ?? [];
    return { geometryType: 'polygon', points: ring.map(([x, y]) => ({ X: x, Y: y })) };
  }
  return { geometryType: '', points: [] };
}

export interface NewSpotInput {
  name: string;
  notes?: string;
  geometry: Geometry;
  appearance: SpotAppearance;
  /** Presets to merge, in order (already looked up; missing ones left out) */
  presets?: ReadonlyArray<{ id: string; data: PresetData }>;
  now?: Date;
}

/** A new spot in the legacy format */
export function buildNewSpot(input: NewSpotInput): Spot {
  const { appearance } = input;
  const now = input.now ?? new Date();
  const { geometryType, points } = geometryToLegacy(input.geometry);

  const spot: Spot = {
    id: uuidv4(),
    name: input.name.trim(),
    notes: input.notes?.trim() || '',
    labelColor: hexToLegacyColor(appearance.labelColor),
    color: hexToLegacyColor(appearance.spotColor),
    opacity: appearance.opacity,
    date: now.toISOString(),
    time: now.toISOString(),
    modifiedTimestamp: now.getTime(),
    geometryType,
    points,
  };

  const presets = input.presets ?? [];
  if (presets.length > 0) {
    for (const preset of presets) mergePresetIntoSpot(spot, preset.data);
    spot.appliedPresetIds = presets.map((p) => p.id);
    // The appearance wins over the presets' own (New Spot's controls were prefilled from them)
    spot.labelColor = hexToLegacyColor(appearance.labelColor);
    spot.color = hexToLegacyColor(appearance.spotColor);
    spot.opacity = appearance.opacity;
  }

  return spot;
}

/**
 * What auto spot mode makes next on this micrograph: the name (pattern of the
 * preset, else the project's; numbered across the micrograph's sample), the
 * appearance New Spot would start with after choosing the preset, and the
 * preset to merge.
 */
export function autoSpotDraft(
  project: ProjectMetadata | null,
  micrographId: string | null,
  preset: QuickApplyPreset | null
): { name: string; number: number; pattern: string; appearance: SpotAppearance; presets: QuickApplyPreset[] } {
  const pattern = chosenPattern(preset?.spotNamePattern, project?.spotNamePattern);
  const sample = micrographId ? getMicrographParentSample(project, micrographId) : null;
  const { name, number } = nextSpotName(pattern, sample);
  const presets = preset ? [preset] : [];
  return { name, number, pattern, appearance: withPresetAppearance(lastUsedSpotAppearance(), presets), presets };
}
