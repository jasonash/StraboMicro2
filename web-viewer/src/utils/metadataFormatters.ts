/**
 * Metadata Formatting Utilities
 *
 * Pure functions for formatting geological metadata into display strings.
 * Copied from desktop app's MetadataSummary.tsx formatting logic.
 */

import type {
  FractureType,
  FabricType,
  VeinType,
  FoldType,
  GrainBoundaryType,
  IntraGrainType,
  ClasticDeformationBandType,
  FaultsShearZonesType,
  ExtinctionMicrostructureType,
  PseudotachylyteType,
} from '../types/project-types';

/** Capitalize first letter */
export const ucFirst = (str: string | null | undefined): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/** Join array with commas, filtering nulls */
export const implode = (arr: (string | null | undefined)[] | null | undefined): string => {
  if (!arr) return '';
  return arr.filter(item => item).join(', ');
};

/**
 * Safely convert a value to an array.
 * Handles corrupted data where arrays were saved as objects with numeric keys.
 */
export const toArray = <T,>(value: T[] | Record<string, T> | null | undefined): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => parseInt(a) - parseInt(b)).map(k => (value as Record<string, T>)[k]);
    }
  }
  return [];
};

/** Check if a field has displayable data */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hasData = (field: any): boolean => {
  if (field === null || field === undefined) return false;
  if (typeof field === 'string') return field.length > 0;
  if (typeof field === 'number') return true;
  if (typeof field === 'boolean') return true;
  if (Array.isArray(field)) return field.length > 0;
  if (typeof field === 'object') {
    return Object.values(field).some(val => val !== null && val !== undefined);
  }
  return false;
};

/** Count items in an array, defaulting to 0 */
export const getItemCount = (items: unknown[] | undefined | null): number => {
  return items?.length || 0;
};

/** Format fracture for display */
export const formatFracture = (fracture: FractureType): string => {
  const parts: string[] = [];
  if (fracture.granularity) parts.push(fracture.granularity);
  if (fracture.mineralogy) parts.push(fracture.mineralogy);

  if (fracture.kinematicType === 'Opening (Mode I)') {
    parts.push(fracture.kinematicType);
    if (fracture.openingAperture != null) {
      parts.push(`Aperture: ${fracture.openingAperture} ${fracture.openingApertureUnit || ''}`);
    }
  }
  if (fracture.kinematicType === 'Shear (Modes II and III)') {
    parts.push(fracture.kinematicType);
    if (fracture.shearOffset != null) {
      parts.push(`Offset: ${fracture.shearOffset} ${fracture.shearOffsetUnit || ''}`);
    }
  }
  if (fracture.kinematicType === 'Hybrid') {
    parts.push(fracture.kinematicType);
    if (fracture.hybridAperture != null) {
      parts.push(`Aperture: ${fracture.hybridAperture} ${fracture.hybridApertureUnit || ''}`);
    }
    if (fracture.hybridOffset != null) {
      parts.push(`Offset: ${fracture.hybridOffset} ${fracture.hybridOffsetUnit || ''}`);
    }
  }
  parts.push(`Sealed/Healed: ${fracture.sealedHealed ? 'Yes' : 'No'}`);
  return parts.join('; ');
};

/** Format fabric for display */
export const formatFabric = (fabric: FabricType): { label: string; details: string } => {
  const parts: string[] = [];

  const elem = ucFirst(fabric.fabricElement || '');
  const cat = ucFirst(fabric.fabricCategory || '');
  const spacing = ucFirst(fabric.fabricSpacing || '');
  if (elem || cat || spacing) parts.push(`${elem}, ${cat}, ${spacing}`);

  if (fabric.fabricDefinedBy && fabric.fabricDefinedBy.length > 0) {
    parts.push(`Defined by: ${implode(fabric.fabricDefinedBy)}`);
  }

  if (fabric.fabricCompositionInfo?.layers && fabric.fabricCompositionInfo.layers.length > 0) {
    const layerParts = fabric.fabricCompositionInfo.layers.map(
      l => `${l.composition} ${l.thickness}${l.thicknessUnits}`
    );
    parts.push(`Composition: Layers: ${layerParts.join(', ')}`);
  }

  if (fabric.fabricGrainShapeInfo) {
    const shapeParts: string[] = [];
    if (fabric.fabricGrainShapeInfo.phases?.length) {
      shapeParts.push(`Phases: ${implode(fabric.fabricGrainShapeInfo.phases)}`);
    }
    if (fabric.fabricGrainShapeInfo.alignment) shapeParts.push(`Alignment: ${fabric.fabricGrainShapeInfo.alignment}`);
    if (fabric.fabricGrainShapeInfo.shape) shapeParts.push(`Shape: ${fabric.fabricGrainShapeInfo.shape}`);
    if (shapeParts.length > 0) parts.push(shapeParts.join('; '));
  }

  if (fabric.fabricCleavageInfo) {
    const cleavageParts: string[] = ['Cleavage Info'];
    if (fabric.fabricCleavageInfo.spacing) {
      cleavageParts.push(`Spacing: ${fabric.fabricCleavageInfo.spacing}${fabric.fabricCleavageInfo.spacingUnit || ''}`);
    }
    cleavageParts.push(`Stylolitic Cleavage: ${fabric.fabricCleavageInfo.styloliticCleavage}`);
    if (fabric.fabricCleavageInfo.geometryOfSeams?.length) {
      cleavageParts.push(`Geometry of Seams: ${implode(fabric.fabricCleavageInfo.geometryOfSeams)}`);
    }
    parts.push(cleavageParts.join(': '));
  }

  return { label: fabric.fabricLabel || 'Unnamed Fabric', details: parts.join('; ') };
};

/** Format vein for display */
export const formatVein = (vein: VeinType): string => {
  const parts: string[] = [];
  if (vein.mineralogy) parts.push(vein.mineralogy);

  const formatSubTypes = (items: Array<{ type?: string | null; subType?: string | null; numericValue?: number | null; unit?: string | null }> | null | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (item.type) parts.push(item.type);
      if (item.subType && item.numericValue != null) {
        parts.push(`${item.subType} ${item.numericValue} ${item.unit || ''}`);
      }
    }
  };

  formatSubTypes(vein.crystalShapes);
  formatSubTypes(vein.growthMorphologies);
  formatSubTypes(vein.inclusionTrails);
  formatSubTypes(vein.kinematics);
  return parts.join('; ');
};

/** Format fold for display */
export const formatFold = (fold: FoldType): { label: string; details: string } => {
  const parts: string[] = [];

  if (fold.interLimbAngle?.length) {
    parts.push(fold.interLimbAngle.includes('Other') && fold.interLimbAngleOther
      ? fold.interLimbAngleOther : implode(fold.interLimbAngle));
  }
  if (fold.closure) parts.push(fold.closure === 'Other' && fold.closureOther ? fold.closureOther : fold.closure);
  if (fold.orientationAxialTrace) parts.push(fold.orientationAxialTrace);
  if (fold.symmetry) parts.push(fold.symmetry);
  if (fold.vergence) parts.push(fold.vergence);
  if (fold.wavelength != null) parts.push(`Wavelength: ${fold.wavelength}${fold.wavelengthUnit || ''}`);
  if (fold.amplitude != null) parts.push(`Amplitude: ${fold.amplitude}${fold.amplitudeUnit || ''}`);
  if (fold.foldStyle) parts.push(fold.foldStyle === 'Other' && fold.foldStyleOther ? fold.foldStyleOther : fold.foldStyle);
  if (fold.foldContinuity) parts.push(fold.foldContinuity === 'Other' && fold.foldContinuityOther ? fold.foldContinuityOther : fold.foldContinuity);
  if (fold.facing) parts.push(fold.facing === 'Other' && fold.facingOther ? fold.facingOther : fold.facing);

  return { label: fold.label || 'Unnamed Fold', details: parts.join('; ') };
};

/** Format grain boundary for display */
export const formatGrainBoundary = (boundary: GrainBoundaryType): string => {
  const parts: string[] = [];
  if (boundary.phase1 || boundary.phase2) {
    const phaseParts: string[] = [];
    if (boundary.phase1) phaseParts.push(boundary.phase1);
    if (boundary.phase2) phaseParts.push(boundary.phase2);
    parts.push(phaseParts.join('-'));
  }
  if (boundary.morphologies?.length) {
    for (const morph of boundary.morphologies) {
      if (morph.type) parts.push(morph.type);
    }
  }
  if (boundary.descriptors?.length) {
    for (const desc of boundary.descriptors) {
      if (desc.subTypes?.length) {
        for (const subType of desc.subTypes) {
          if (desc.type === 'Other' && subType.otherType) parts.push(subType.otherType);
          else if (subType.type) parts.push(subType.type);
        }
      } else if (desc.type) parts.push(desc.type);
    }
  }
  return parts.join('; ');
};

/** Format intragrain structure for display */
export const formatIntraGrain = (grain: IntraGrainType): string => {
  const parts: string[] = [];
  if (grain.mineral) parts.push(grain.mineral);
  if (grain.grainTextures?.length) {
    for (const texture of grain.grainTextures) {
      if (texture.type === 'Other' && texture.otherType) parts.push(texture.otherType);
      else if (texture.type) parts.push(texture.type);
    }
  }
  return parts.join('; ');
};

/** Format clastic deformation band for display */
export const formatClasticBand = (band: ClasticDeformationBandType): string => {
  const parts: string[] = [];
  if (band.types?.length) {
    for (const bandType of band.types) {
      if (bandType.type) parts.push(bandType.type);
      if (bandType.type === 'Dilation' && bandType.aperture != null) {
        parts.push(`${bandType.aperture} ${bandType.apertureUnit || ''} Aperture`);
      }
      if (bandType.type === 'Shear' && bandType.offset != null) {
        parts.push(`${bandType.offset} ${bandType.offsetUnit || ''} Offset`);
      }
    }
  }
  if (band.cements) parts.push(`${band.cements} Cement`);
  if (band.thickness != null) parts.push(`${band.thickness} ${band.thicknessUnit || ''} Thickness`);
  return parts.join('; ');
};

/** Format faults/shear zones for display */
export const formatFaultShearZone = (fault: FaultsShearZonesType): string => {
  const parts: string[] = [];
  if (fault.shearSenses?.length) parts.push(implode(fault.shearSenses.map(s => s.type)));
  if (fault.indicators?.length) parts.push(implode(fault.indicators.map(i => i.type)));
  if (fault.offset != null) parts.push(`Offset: ${fault.offset} ${fault.offsetUnit || ''}`);
  if (fault.width != null) parts.push(`Width: ${fault.width} ${fault.widthUnit || ''}`);
  return parts.join('; ');
};

/** Format extinction microstructure for display */
export const formatExtinctionMicrostructure = (ext: ExtinctionMicrostructureType): string => {
  const parts: string[] = [];
  if (ext.phase) parts.push(ext.phase);

  const formatTypes = (label: string, items: Array<{ type?: string | null }> | null | undefined) => {
    if (!items?.length) return;
    const types = items.map(d => d.type).filter((t): t is string => !!t);
    if (types.length > 0) parts.push(`${label}: ${types.join(', ')}`);
  };

  formatTypes('Dislocations', ext.dislocations);
  formatTypes('Heterogeneous extinction', ext.heterogeneousExtinctions);
  formatTypes('Subgrain Structures', ext.subGrainStructures);
  formatTypes('Extinction Bands', ext.extinctionBands);
  return parts.join('; ');
};

/** Format pseudotachylyte for display */
export const formatPseudotachylyte = (pseudo: PseudotachylyteType): { label: string; sections: { title: string; content: string }[] } => {
  const sections: { title: string; content: string }[] = [];

  if (pseudo.hasMatrixGroundmass) {
    const parts: string[] = [];
    if (pseudo.matrixGroundmassColor) parts.push(`Color: ${pseudo.matrixGroundmassColor}`);
    if (parts.length > 0) sections.push({ title: 'Matrix/Groundmass', content: parts.join('; ') });
  }

  if (pseudo.hasCrystallites) {
    const parts: string[] = [];
    if (pseudo.crystallitesMineralogy) parts.push(`Mineralogy: ${pseudo.crystallitesMineralogy}`);
    if (pseudo.crystallitesLowerSize != null && pseudo.crystallitesUpperSize != null) {
      parts.push(`Sizes: ${pseudo.crystallitesLowerSize}${pseudo.crystallitesLowerSizeUnit || ''}-${pseudo.crystallitesUpperSize}${pseudo.crystallitesUpperSizeUnit || ''}`);
    }
    if (parts.length > 0) sections.push({ title: '(Micro)Crystallites', content: parts.join('; ') });
  }

  if (pseudo.hasSurvivorClasts) {
    const parts: string[] = [];
    if (pseudo.survivorClastsMineralogy) parts.push(`Mineralogy: ${pseudo.survivorClastsMineralogy}`);
    if (pseudo.survivorClastsMarginDescription) parts.push(`Margin Description: ${pseudo.survivorClastsMarginDescription}`);
    if (parts.length > 0) sections.push({ title: 'Survivor Clasts', content: parts.join('; ') });
  }

  if (pseudo.hasSulphideOxide) {
    const parts: string[] = [];
    if (pseudo.sulphideOxideMineralogy) parts.push(`Mineralogy: ${pseudo.sulphideOxideMineralogy}`);
    if (pseudo.sulphideOxideLowerSize != null && pseudo.sulphideOxideUpperSize != null) {
      parts.push(`Size: ${pseudo.sulphideOxideLowerSize}${pseudo.sulphideOxideLowerSizeUnit || ''}-${pseudo.sulphideOxideUpperSize}${pseudo.sulphideOxideUpperSizeUnit || ''}`);
    }
    if (parts.length > 0) sections.push({ title: 'Sulphide/Oxide', content: parts.join('; ') });
  }

  return { label: pseudo.label || 'Unnamed Pseudotachylyte', sections };
};
