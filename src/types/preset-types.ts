/**
 * Quick Spot Preset Types
 *
 * Type definitions for reusable metadata templates that can be quickly
 * applied to spots via keyboard shortcuts (1-9) in Quick Edit mode.
 */

import type {
  MineralogyType,
  GrainInfoType,
  FabricInfoType,
  FractureInfoType,
  FoldInfoType,
  VeinInfoType,
  ClasticDeformationBandInfoType,
  GrainBoundaryInfoType,
  IntraGrainInfoType,
  PseudotachylyteInfoType,
  FaultsShearZonesInfoType,
  ExtinctionMicrostructureInfoType,
  LithologyInfoType,
} from './project-types';

/**
 * Data that can be stored in a preset and applied to spots.
 * Mirrors the feature info fields on Spot interface.
 */
export interface PresetData {
  // Core spot appearance properties
  labelColor?: string | null;
  color?: string | null;
  opacity?: number | null;

  // All 13 feature info types (same structure as Spot)
  mineralogy?: MineralogyType | null;
  grainInfo?: GrainInfoType | null;
  fabricInfo?: FabricInfoType | null;
  fractureInfo?: FractureInfoType | null;
  foldInfo?: FoldInfoType | null;
  veinInfo?: VeinInfoType | null;
  clasticDeformationBandInfo?: ClasticDeformationBandInfoType | null;
  grainBoundaryInfo?: GrainBoundaryInfoType | null;
  intraGrainInfo?: IntraGrainInfoType | null;
  pseudotachylyteInfo?: PseudotachylyteInfoType | null;
  faultsShearZonesInfo?: FaultsShearZonesInfoType | null;
  extinctionMicrostructureInfo?: ExtinctionMicrostructureInfoType | null;
  lithologyInfo?: LithologyInfoType | null;
}

/**
 * Quick Spot Preset
 * A reusable metadata template that can be applied to spots.
 */
export interface QuickApplyPreset {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null; // Optional - legacy field, no longer used in UI
  createdAt: string; // ISO timestamp
  modifiedAt: string; // ISO timestamp
  data: PresetData;
}

/**
 * Scope of a preset - global (app-wide) or project-level
 */
export type PresetScope = 'global' | 'project';

/**
 * Preset with scope information attached
 */
export interface PresetWithScope extends QuickApplyPreset {
  scope: PresetScope;
}

/**
 * Key binding map - maps keys "1"-"9" to preset IDs
 */
export type PresetKeyBindings = Record<string, string>;

/**
 * Feature info field names that can be included in presets
 */
export type PresetFeatureField =
  | 'mineralogy'
  | 'grainInfo'
  | 'fabricInfo'
  | 'fractureInfo'
  | 'foldInfo'
  | 'veinInfo'
  | 'clasticDeformationBandInfo'
  | 'grainBoundaryInfo'
  | 'intraGrainInfo'
  | 'pseudotachylyteInfo'
  | 'faultsShearZonesInfo'
  | 'extinctionMicrostructureInfo'
  | 'lithologyInfo';

/**
 * All feature info fields that can be in a preset
 */
export const PRESET_FEATURE_FIELDS: PresetFeatureField[] = [
  'mineralogy',
  'grainInfo',
  'fabricInfo',
  'fractureInfo',
  'foldInfo',
  'veinInfo',
  'clasticDeformationBandInfo',
  'grainBoundaryInfo',
  'intraGrainInfo',
  'pseudotachylyteInfo',
  'faultsShearZonesInfo',
  'extinctionMicrostructureInfo',
  'lithologyInfo',
];

/**
 * Display names for feature fields (for UI)
 */
export const PRESET_FEATURE_DISPLAY_NAMES: Record<PresetFeatureField, string> = {
  mineralogy: 'Mineralogy',
  grainInfo: 'Grain Info',
  fabricInfo: 'Fabric Info',
  fractureInfo: 'Fracture Info',
  foldInfo: 'Fold Info',
  veinInfo: 'Vein Info',
  clasticDeformationBandInfo: 'Deformation Bands',
  grainBoundaryInfo: 'Grain Boundaries',
  intraGrainInfo: 'Intra-Grain',
  pseudotachylyteInfo: 'Pseudotachylyte',
  faultsShearZonesInfo: 'Faults/Shear Zones',
  extinctionMicrostructureInfo: 'Extinction Microstructure',
  lithologyInfo: 'Lithology',
};


/**
 * Check if a preset has any data defined
 */
export function isPresetEmpty(preset: QuickApplyPreset): boolean {
  const { data } = preset;
  if (!data) return true;

  // Check appearance properties
  if (data.color || data.labelColor || data.opacity != null) {
    return false;
  }

  // Check feature info fields
  for (const field of PRESET_FEATURE_FIELDS) {
    const value = data[field];
    if (value != null && Object.keys(value).length > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Get a summary of what data is in a preset (for display)
 */
export function getPresetSummary(preset: QuickApplyPreset): string[] {
  const summary: string[] = [];
  const { data } = preset;

  if (!data) return summary;

  // Check appearance
  if (data.color) summary.push('Spot color');
  if (data.labelColor) summary.push('Label color');
  if (data.opacity != null) summary.push('Opacity');

  // Check feature fields
  for (const field of PRESET_FEATURE_FIELDS) {
    const value = data[field];
    if (value != null && Object.keys(value).length > 0) {
      summary.push(PRESET_FEATURE_DISPLAY_NAMES[field]);
    }
  }

  return summary;
}
