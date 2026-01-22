/**
 * Metadata Summary Component
 *
 * Displays an accordion-style summary of all collected metadata for a micrograph or spot.
 * Each section has an edit icon that opens the corresponding metadata dialog.
 * Matches the legacy JavaFX interface (showMicrographDetails.java, showSpotDetails.java)
 * with detailed summaries showing actual data values instead of just counts.
 */

import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Stack,
  Chip,
  Link,
  IconButton,
  Tooltip,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ClearIcon from '@mui/icons-material/Clear';
import { useAppStore } from '@/store';
import type { QuickApplyPreset } from '@/types/preset-types';
import { findMicrographById, findSpotById, findSpotParentMicrograph, getMicrographParentSample } from '@/store/helpers';
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
  GrainSizeType,
  GrainShapeType,
  GrainOrientationType,
  Spot,
} from '@/types/project-types';
import {
  calculateLineLength,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  isLineSpot,
  isPolygonSpot,
} from '@/utils/geometryMeasurements';

interface MetadataSummaryProps {
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
}

interface AccordionState {
  [key: string]: boolean;
}

// Styled Accordion with left border accent when expanded
const StyledAccordion = styled(Accordion)(({ theme }) => ({
  '&:before': { display: 'none' },
  borderLeft: '3px solid transparent',
  transition: 'border-color 0.2s ease',
  '&.Mui-expanded': {
    borderLeftColor: theme.palette.primary.main,
  },
}));

// Styled AccordionSummary with background tint when expanded - compact height
const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  minHeight: 32,
  padding: '0 12px',
  transition: 'background-color 0.2s ease',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
  },
  '& .MuiAccordionSummary-content.Mui-expanded': {
    margin: '6px 0',
  },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(228, 76, 101, 0.12)'  // Primary color with transparency for dark mode
      : 'rgba(228, 76, 101, 0.08)', // Lighter for light mode
  },
}));

// Helper function to capitalize first letter
const ucFirst = (str: string | null | undefined): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Helper function to join array with commas
const implode = (arr: (string | null | undefined)[] | null | undefined): string => {
  if (!arr) return '';
  return arr.filter(item => item).join(', ');
};

/**
 * Safely convert a value to an array.
 * Handles corrupted data where arrays were saved as objects with numeric keys.
 * Example: { "0": {...}, "1": {...} } becomes [{...}, {...}]
 */
const toArray = <T,>(value: T[] | Record<string, T> | null | undefined): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    // Check if it's an object with numeric keys (corrupted array)
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => parseInt(a) - parseInt(b)).map(k => (value as Record<string, T>)[k]);
    }
  }
  return [];
};

/**
 * Format a fracture item for display
 * Matches legacy format from showMicrographDetails.java lines 3363-3389
 */
const formatFracture = (fracture: FractureType): string => {
  const parts: string[] = [];

  if (fracture.granularity) {
    parts.push(fracture.granularity);
  }

  if (fracture.mineralogy) {
    parts.push(fracture.mineralogy);
  }

  if (fracture.kinematicType === 'Opening (Mode I)') {
    parts.push(fracture.kinematicType);
    if (fracture.openingAperture !== null) {
      parts.push(`Aperture: ${fracture.openingAperture} ${fracture.openingApertureUnit}`);
    }
  }

  if (fracture.kinematicType === 'Shear (Modes II and III)') {
    parts.push(fracture.kinematicType);
    if (fracture.shearOffset !== null) {
      parts.push(`Offset: ${fracture.shearOffset} ${fracture.shearOffsetUnit}`);
    }
  }

  if (fracture.kinematicType === 'Hybrid') {
    parts.push(fracture.kinematicType);
    if (fracture.hybridAperture !== null) {
      parts.push(`Aperture: ${fracture.hybridAperture} ${fracture.hybridApertureUnit}`);
    }
    if (fracture.hybridOffset !== null) {
      parts.push(`Offset: ${fracture.hybridOffset} ${fracture.hybridOffsetUnit}`);
    }
  }

  parts.push(`Sealed/Healed: ${fracture.sealedHealed ? 'Yes' : 'No'}`);

  return parts.join('; ');
};

/**
 * Format a fabric item for display
 * Matches legacy format from showMicrographDetails.java lines 1437-1476
 */
const formatFabric = (fabric: FabricType): { label: string; details: string } => {
  const parts: string[] = [];

  const elem = ucFirst(fabric.fabricElement || '');
  const cat = ucFirst(fabric.fabricCategory || '');
  const spacing = ucFirst(fabric.fabricSpacing || '');
  if (elem || cat || spacing) {
    parts.push(`${elem}, ${cat}, ${spacing}`);
  }

  if (fabric.fabricDefinedBy && fabric.fabricDefinedBy.length > 0) {
    parts.push(`Defined by: ${implode(fabric.fabricDefinedBy)}`);
  }

  if (fabric.fabricCompositionInfo?.layers && fabric.fabricCompositionInfo.layers.length > 0) {
    const layerParts: string[] = [];
    for (const layer of fabric.fabricCompositionInfo.layers) {
      layerParts.push(`${layer.composition} ${layer.thickness}${layer.thicknessUnits}`);
    }
    parts.push(`Composition: Layers: ${layerParts.join(', ')}`);
  }

  if (fabric.fabricGrainShapeInfo) {
    const shapeParts: string[] = [];
    if (fabric.fabricGrainShapeInfo.phases && fabric.fabricGrainShapeInfo.phases.length > 0) {
      shapeParts.push(`Phases: ${implode(fabric.fabricGrainShapeInfo.phases)}`);
    }
    if (fabric.fabricGrainShapeInfo.alignment) {
      shapeParts.push(`Alignment: ${fabric.fabricGrainShapeInfo.alignment}`);
    }
    if (fabric.fabricGrainShapeInfo.shape) {
      shapeParts.push(`Shape: ${fabric.fabricGrainShapeInfo.shape}`);
    }
    if (shapeParts.length > 0) {
      parts.push(shapeParts.join('; '));
    }
  }

  if (fabric.fabricCleavageInfo) {
    const cleavageParts: string[] = ['Cleavage Info'];
    if (fabric.fabricCleavageInfo.spacing) {
      cleavageParts.push(`Spacing: ${fabric.fabricCleavageInfo.spacing}${fabric.fabricCleavageInfo.spacingUnit}`);
    }
    cleavageParts.push(`Stylolitic Cleavage: ${fabric.fabricCleavageInfo.styloliticCleavage}`);
    if (fabric.fabricCleavageInfo.geometryOfSeams && fabric.fabricCleavageInfo.geometryOfSeams.length > 0) {
      cleavageParts.push(`Geometry of Seams: ${implode(fabric.fabricCleavageInfo.geometryOfSeams)}`);
    }
    parts.push(cleavageParts.join(': '));
  }

  return {
    label: fabric.fabricLabel || 'Unnamed Fabric',
    details: parts.join('; ')
  };
};

/**
 * Format a vein item for display
 * Matches legacy format from showMicrographDetails.java lines 2422-2574
 */
const formatVein = (vein: VeinType): string => {
  const parts: string[] = [];

  if (vein.mineralogy) {
    parts.push(vein.mineralogy);
  }

  // Crystal shapes
  if (vein.crystalShapes && vein.crystalShapes.length > 0) {
    for (const shape of vein.crystalShapes) {
      if (shape.type) {
        parts.push(shape.type);
      }
      if (shape.subType && shape.numericValue !== null) {
        parts.push(`${shape.subType} ${shape.numericValue} ${shape.unit || ''}`);
      }
    }
  }

  // Growth morphologies
  if (vein.growthMorphologies && vein.growthMorphologies.length > 0) {
    for (const morph of vein.growthMorphologies) {
      if (morph.type) {
        parts.push(morph.type);
      }
      if (morph.subType && morph.numericValue !== null) {
        parts.push(`${morph.subType} ${morph.numericValue} ${morph.unit || ''}`);
      }
    }
  }

  // Inclusion trails
  if (vein.inclusionTrails && vein.inclusionTrails.length > 0) {
    for (const trail of vein.inclusionTrails) {
      if (trail.type) {
        parts.push(trail.type);
      }
      if (trail.subType && trail.numericValue !== null) {
        parts.push(`${trail.subType} ${trail.numericValue} ${trail.unit || ''}`);
      }
    }
  }

  // Kinematics
  if (vein.kinematics && vein.kinematics.length > 0) {
    for (const kin of vein.kinematics) {
      if (kin.type) {
        parts.push(kin.type);
      }
      if (kin.subType && kin.numericValue !== null) {
        parts.push(`${kin.subType} ${kin.numericValue} ${kin.unit || ''}`);
      }
    }
  }

  return parts.join('; ');
};

/**
 * Format a fold item for display
 * Matches legacy format from showMicrographDetails.java lines 3094-3283
 */
const formatFold = (fold: FoldType): { label: string; details: string } => {
  const parts: string[] = [];

  // Inter-limb angle
  if (fold.interLimbAngle && fold.interLimbAngle.length > 0) {
    if (fold.interLimbAngle.includes('Other') && fold.interLimbAngleOther) {
      parts.push(fold.interLimbAngleOther);
    } else {
      parts.push(implode(fold.interLimbAngle));
    }
  }

  // Closure
  if (fold.closure) {
    parts.push(fold.closure === 'Other' && fold.closureOther ? fold.closureOther : fold.closure);
  }

  // Orientation axial trace
  if (fold.orientationAxialTrace) {
    parts.push(fold.orientationAxialTrace);
  }

  // Symmetry
  if (fold.symmetry) {
    parts.push(fold.symmetry);
  }

  // Vergence
  if (fold.vergence) {
    parts.push(fold.vergence);
  }

  // Wavelength
  if (fold.wavelength !== null) {
    parts.push(`Wavelength: ${fold.wavelength}${fold.wavelengthUnit}`);
  }

  // Amplitude
  if (fold.amplitude !== null) {
    parts.push(`Amplitude: ${fold.amplitude}${fold.amplitudeUnit}`);
  }

  // Fold style
  if (fold.foldStyle) {
    parts.push(fold.foldStyle === 'Other' && fold.foldStyleOther ? fold.foldStyleOther : fold.foldStyle);
  }

  // Fold continuity
  if (fold.foldContinuity) {
    parts.push(fold.foldContinuity === 'Other' && fold.foldContinuityOther ? fold.foldContinuityOther : fold.foldContinuity);
  }

  // Facing
  if (fold.facing) {
    parts.push(fold.facing === 'Other' && fold.facingOther ? fold.facingOther : fold.facing);
  }

  return {
    label: fold.label || 'Unnamed Fold',
    details: parts.join('; ')
  };
};

/**
 * Format grain boundary for display
 * Matches legacy format from showMicrographDetails.java lines 2165-2299
 */
const formatGrainBoundary = (boundary: GrainBoundaryType): string => {
  const parts: string[] = [];

  // Phases
  if (boundary.phase1 || boundary.phase2) {
    const phaseParts: string[] = [];
    if (boundary.phase1) phaseParts.push(boundary.phase1);
    if (boundary.phase2) phaseParts.push(boundary.phase2);
    parts.push(phaseParts.join('-'));
  }

  // Morphologies
  if (boundary.morphologies && boundary.morphologies.length > 0) {
    for (const morph of boundary.morphologies) {
      if (morph.type) {
        parts.push(morph.type);
      }
    }
  }

  // Descriptors
  if (boundary.descriptors && boundary.descriptors.length > 0) {
    for (const desc of boundary.descriptors) {
      if (desc.subTypes && desc.subTypes.length > 0) {
        for (const subType of desc.subTypes) {
          if (desc.type === 'Other' && subType.otherType) {
            parts.push(subType.otherType);
          } else if (subType.type) {
            parts.push(subType.type);
          }
        }
      } else if (desc.type) {
        parts.push(desc.type);
      }
    }
  }

  return parts.join('; ');
};

/**
 * Format intragrain structure for display
 * Matches legacy format from showMicrographDetails.java lines 2303-2420
 */
const formatIntraGrain = (grain: IntraGrainType): string => {
  const parts: string[] = [];

  if (grain.mineral) {
    parts.push(grain.mineral);
  }

  if (grain.grainTextures && grain.grainTextures.length > 0) {
    for (const texture of grain.grainTextures) {
      if (texture.type === 'Other' && texture.otherType) {
        parts.push(texture.otherType);
      } else if (texture.type) {
        parts.push(texture.type);
      }
    }
  }

  return parts.join('; ');
};

/**
 * Format clastic deformation band for display
 * Matches legacy format from showMicrographDetails.java lines 1571-1699
 */
const formatClasticBand = (band: ClasticDeformationBandType): string => {
  const parts: string[] = [];

  // Band types
  if (band.types && band.types.length > 0) {
    for (const bandType of band.types) {
      if (bandType.type) {
        parts.push(bandType.type);
      }

      if (bandType.type === 'Dilation' && bandType.aperture !== null) {
        parts.push(`${bandType.aperture} ${bandType.apertureUnit || ''} Aperture`);
      }

      if (bandType.type === 'Shear' && bandType.offset !== null) {
        parts.push(`${bandType.offset} ${bandType.offsetUnit || ''} Offset`);
      }
    }
  }

  // Cements
  if (band.cements) {
    parts.push(`${band.cements} Cement`);
  }

  // Thickness
  if (band.thickness !== null) {
    parts.push(`${band.thickness} ${band.thicknessUnit || ''} Thickness`);
  }

  return parts.join('; ');
};

/**
 * Format faults/shear zones for display
 * Matches legacy format from showMicrographDetails.java lines 1738-1867
 */
const formatFaultShearZone = (fault: FaultsShearZonesType): string => {
  const parts: string[] = [];

  // Shear senses
  if (fault.shearSenses && fault.shearSenses.length > 0) {
    parts.push(implode(fault.shearSenses.map(s => s.type)));
  }

  // Indicators
  if (fault.indicators && fault.indicators.length > 0) {
    parts.push(implode(fault.indicators.map(i => i.type)));
  }

  // Offset
  if (fault.offset !== null) {
    parts.push(`Offset: ${fault.offset} ${fault.offsetUnit}`);
  }

  // Width
  if (fault.width !== null) {
    parts.push(`Width: ${fault.width} ${fault.widthUnit}`);
  }

  return parts.join('; ');
};

/**
 * Format extinction microstructure for display
 * Matches legacy format from showMicrographDetails.java lines 1919-2109
 */
const formatExtinctionMicrostructure = (ext: ExtinctionMicrostructureType): string => {
  const parts: string[] = [];

  if (ext.phase) {
    parts.push(ext.phase);
  }

  // Dislocations
  if (ext.dislocations && ext.dislocations.length > 0) {
    const dislocationTypes = ext.dislocations.map(d => d.type).filter((t): t is string => t !== null && t !== undefined);
    if (dislocationTypes.length > 0) {
      parts.push(`Dislocations: ${dislocationTypes.join(', ')}`);
    }
  }

  // Heterogeneous extinctions
  if (ext.heterogeneousExtinctions && ext.heterogeneousExtinctions.length > 0) {
    const extinctions = ext.heterogeneousExtinctions.map(h => h.type).filter((t): t is string => t !== null && t !== undefined);
    if (extinctions.length > 0) {
      parts.push(`Heterogeneous extinction: ${extinctions.join(', ')}`);
    }
  }

  // Subgrain structures
  if (ext.subGrainStructures && ext.subGrainStructures.length > 0) {
    const structures = ext.subGrainStructures.map(s => s.type).filter((t): t is string => t !== null && t !== undefined);
    if (structures.length > 0) {
      parts.push(`Subgrain Structures: ${structures.join(', ')}`);
    }
  }

  // Extinction bands
  if (ext.extinctionBands && ext.extinctionBands.length > 0) {
    const bands = ext.extinctionBands.map(b => b.type).filter((t): t is string => t !== null && t !== undefined);
    if (bands.length > 0) {
      parts.push(`Extinction Bands: ${bands.join(', ')}`);
    }
  }

  return parts.join('; ');
};

/**
 * Format pseudotachylyte for display (simplified - this is the most complex structure)
 * Matches legacy format from showMicrographDetails.java lines 2578-2850+
 */
const formatPseudotachylyte = (pseudo: PseudotachylyteType): { label: string; sections: { title: string; content: string }[] } => {
  const sections: { title: string; content: string }[] = [];

  // Matrix/Groundmass
  if (pseudo.hasMatrixGroundmass) {
    const parts: string[] = [];
    if (pseudo.matrixGroundmassColor) {
      parts.push(`Color: ${pseudo.matrixGroundmassColor}`);
    }
    if (parts.length > 0) {
      sections.push({ title: 'Matrix/Groundmass', content: parts.join('; ') });
    }
  }

  // Crystallites
  if (pseudo.hasCrystallites) {
    const parts: string[] = [];
    if (pseudo.crystallitesMineralogy) {
      parts.push(`Mineralogy: ${pseudo.crystallitesMineralogy}`);
    }
    if (pseudo.crystallitesLowerSize !== null && pseudo.crystallitesUpperSize !== null) {
      const lowerUnit = pseudo.crystallitesLowerSizeUnit || '';
      const upperUnit = pseudo.crystallitesUpperSizeUnit || '';
      parts.push(`Sizes: ${pseudo.crystallitesLowerSize}${lowerUnit}-${pseudo.crystallitesUpperSize}${upperUnit}`);
    }
    if (parts.length > 0) {
      sections.push({ title: '(Micro)Crystallites', content: parts.join('; ') });
    }
  }

  // Survivor Clasts
  if (pseudo.hasSurvivorClasts) {
    const parts: string[] = [];
    if (pseudo.survivorClastsMineralogy) {
      parts.push(`Mineralogy: ${pseudo.survivorClastsMineralogy}`);
    }
    if (pseudo.survivorClastsMarginDescription) {
      parts.push(`Margin Description: ${pseudo.survivorClastsMarginDescription}`);
    }
    if (parts.length > 0) {
      sections.push({ title: 'Survivor Clasts', content: parts.join('; ') });
    }
  }

  // Sulphide/Oxide
  if (pseudo.hasSulphideOxide) {
    const parts: string[] = [];
    if (pseudo.sulphideOxideMineralogy) {
      parts.push(`Mineralogy: ${pseudo.sulphideOxideMineralogy}`);
    }
    if (pseudo.sulphideOxideLowerSize !== null && pseudo.sulphideOxideUpperSize !== null) {
      const lowerUnit = pseudo.sulphideOxideLowerSizeUnit || '';
      const upperUnit = pseudo.sulphideOxideUpperSizeUnit || '';
      parts.push(`Size: ${pseudo.sulphideOxideLowerSize}${lowerUnit}-${pseudo.sulphideOxideUpperSize}${upperUnit}`);
    }
    if (parts.length > 0) {
      sections.push({ title: 'Sulphide/Oxide', content: parts.join('; ') });
    }
  }

  return {
    label: pseudo.label || 'Unnamed Pseudotachylyte',
    sections
  };
};

/**
 * SpotMeasurements - displays calculated measurements for line and polygon spots
 */
function SpotMeasurements({ spot, scale }: { spot: Spot; scale: number }) {
  const isLine = isLineSpot(spot.geometry, spot.geometryType);
  const isPolygon = isPolygonSpot(spot.geometry, spot.geometryType);

  if (!isLine && !isPolygon) return null;

  const lineLength = isLine
    ? calculateLineLength(spot.geometry, spot.points, scale)
    : null;

  const polygonArea = isPolygon
    ? calculatePolygonArea(spot.geometry, spot.points, scale)
    : null;

  const polygonPerimeter = isPolygon
    ? calculatePolygonPerimeter(spot.geometry, spot.points, scale)
    : null;

  if (!lineLength && !polygonArea && !polygonPerimeter) return null;

  return (
    <>
      {lineLength && (
        <Box>
          <Typography variant="caption" color="text.secondary">Length: </Typography>
          <Typography variant="body2" component="span">{lineLength.formatted}</Typography>
        </Box>
      )}
      {polygonArea && (
        <Box>
          <Typography variant="caption" color="text.secondary">Area: </Typography>
          <Typography variant="body2" component="span">{polygonArea.formatted}</Typography>
        </Box>
      )}
      {polygonPerimeter && (
        <Box>
          <Typography variant="caption" color="text.secondary">Perimeter: </Typography>
          <Typography variant="body2" component="span">{polygonPerimeter.formatted}</Typography>
        </Box>
      )}
    </>
  );
}

export function MetadataSummary({ micrographId, spotId, onEditSection }: MetadataSummaryProps) {
  const project = useAppStore((state) => state.project);
  const globalPresets = useAppStore((state) => state.globalPresets);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Load expansion state from localStorage
  const [expanded, setExpanded] = useState<AccordionState>(() => {
    const saved = localStorage.getItem('metadataSummaryExpanded');
    return saved ? JSON.parse(saved) : {};
  });

  // Save expansion state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('metadataSummaryExpanded', JSON.stringify(expanded));
  }, [expanded]);

  const handleExpand = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded((prev) => ({ ...prev, [panel]: isExpanded }));
  };

  const handleEdit = (sectionId: string) => (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion from expanding/collapsing
    onEditSection(sectionId);
  };

  // Get the micrograph or spot data
  const micrograph = micrographId ? findMicrographById(project, micrographId) : undefined;
  const spot = spotId ? findSpotById(project, spotId) : undefined;
  const data = micrograph || spot;

  // Get the parent micrograph for spots
  const spotParentMicrograph = spotId && project ? findSpotParentMicrograph(project, spotId) : undefined;

  // Get the parent sample (from micrograph or spot's parent micrograph)
  const activeMicrographId = micrographId || spotParentMicrograph?.id;
  const sample = activeMicrographId && project
    ? getMicrographParentSample(project, activeMicrographId)
    : undefined;

  if (!data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
        No data available
      </Typography>
    );
  }

  // Helper to check if a section has data
  const hasData = (field: any): boolean => {
    if (field === null || field === undefined) return false;
    if (typeof field === 'string') return field.length > 0;
    if (typeof field === 'number') return true;
    if (typeof field === 'boolean') return true;
    if (Array.isArray(field)) return field.length > 0;
    if (typeof field === 'object') {
      // Check if object has any non-null values
      return Object.values(field).some(val => val !== null && val !== undefined);
    }
    return false;
  };

  // Count items in array-based data
  const getItemCount = (items: any[] | undefined | null): number => {
    return items?.length || 0;
  };

  // Get applied presets for spots
  const appliedPresets: QuickApplyPreset[] = [];
  if (spot && spot.appliedPresetIds && spot.appliedPresetIds.length > 0) {
    // Build a map of all presets (global + project)
    const presetMap = new Map<string, QuickApplyPreset>();
    for (const preset of globalPresets) {
      presetMap.set(preset.id, preset);
    }
    for (const preset of project?.presets || []) {
      presetMap.set(preset.id, preset);
    }
    // Get presets for each applied ID
    for (const presetId of spot.appliedPresetIds) {
      const preset = presetMap.get(presetId);
      if (preset) {
        appliedPresets.push(preset);
      }
    }
  }

  // Clear a specific preset from the spot
  const clearPreset = (presetId: string) => {
    if (!spot || !spotId) return;
    const newAppliedIds = spot.appliedPresetIds?.filter((id) => id !== presetId) || [];
    updateSpotData(spotId, {
      appliedPresetIds: newAppliedIds.length > 0 ? newAppliedIds : undefined,
    });
  };

  // Clear all presets from the spot
  const clearAllPresets = () => {
    if (!spot || !spotId) return;
    updateSpotData(spotId, { appliedPresetIds: undefined });
  };

  return (
    <Stack spacing={0.5}>
      {/* Sample Metadata */}
      {sample && (
        <StyledAccordion
          expanded={expanded['sample'] || false}
          onChange={handleExpand('sample')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Sample Metadata</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('sample')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {/* Linked to StraboField indicator */}
              {sample.existsOnServer && (
                <Box
                  onClick={() => {
                    window.api?.openExternalLink(`https://strabospot.org/spotdetails/?s=${sample.id}`);
                  }}
                  sx={{
                    display: 'block',
                    p: 1,
                    mb: 1,
                    bgcolor: 'success.main',
                    color: 'success.contrastText',
                    borderRadius: 1,
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'success.dark',
                      textDecoration: 'underline',
                    },
                  }}
                >
                  Linked to StraboField (View on Server)
                </Box>
              )}
              {sample.name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Name: </Typography>
                  <Typography variant="body2" component="span">{sample.name}</Typography>
                </Box>
              )}
              {sample.label && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Label: </Typography>
                  <Typography variant="body2" component="span">{sample.label}</Typography>
                </Box>
              )}
              {sample.sampleID && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Sample ID: </Typography>
                  <Typography variant="body2" component="span">{sample.sampleID}</Typography>
                </Box>
              )}
              {(sample.latitude !== null || sample.longitude !== null) && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Location: </Typography>
                  <Typography variant="body2" component="span">
                    {sample.latitude !== null && `Lat: ${sample.latitude}`}
                    {sample.latitude !== null && sample.longitude !== null && ', '}
                    {sample.longitude !== null && `Lon: ${sample.longitude}`}
                  </Typography>
                </Box>
              )}
              {sample.sampleDescription && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Description: </Typography>
                  <Typography variant="body2" component="span">{sample.sampleDescription}</Typography>
                </Box>
              )}
              {sample.materialType && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Material Type: </Typography>
                  <Typography variant="body2" component="span">
                    {sample.materialType === 'other' && sample.otherMaterialType
                      ? sample.otherMaterialType
                      : sample.materialType}
                  </Typography>
                </Box>
              )}
              {sample.sampleType && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Sample Type: </Typography>
                  <Typography variant="body2" component="span">{sample.sampleType}</Typography>
                </Box>
              )}
              {!sample.name && !sample.label && !sample.sampleID && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No sample metadata set
                </Typography>
              )}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Micrograph/Spot Metadata */}
      <StyledAccordion
        expanded={expanded['metadata'] || false}
        onChange={handleExpand('metadata')}
        disableGutters
      >
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">
            {micrographId ? 'Micrograph' : 'Spot'} Metadata
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={handleEdit(micrographId ? 'micrograph' : 'spot')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              mr: 1,
              cursor: 'pointer',
              borderRadius: '50%',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {data.name && (
              <Box>
                <Typography variant="caption" color="text.secondary">Name: </Typography>
                <Typography variant="body2" component="span">{data.name}</Typography>
              </Box>
            )}
            {micrograph && micrograph.polish !== null && micrograph.polish !== undefined && (
              <Box>
                <Typography variant="caption" color="text.secondary">Polished: </Typography>
                <Typography variant="body2" component="span">
                  {micrograph.polish ? 'Yes' : 'No'}
                  {micrograph.polish && micrograph.polishDescription && ` (${micrograph.polishDescription})`}
                </Typography>
              </Box>
            )}
            {micrograph?.instrument?.instrumentType && (
              <Box>
                <Typography variant="caption" color="text.secondary">Instrument: </Typography>
                <Typography variant="body2" component="span">
                  {micrograph.instrument.instrumentType}
                </Typography>
              </Box>
            )}
            {micrograph?.imageType && (
              <Box>
                <Typography variant="caption" color="text.secondary">Image Type: </Typography>
                <Typography variant="body2" component="span">{micrograph.imageType}</Typography>
              </Box>
            )}
            {/* Spot Measurements - only shown for spots with scale set */}
            {spot && spotParentMicrograph?.scalePixelsPerCentimeter && (
              <SpotMeasurements spot={spot} scale={spotParentMicrograph.scalePixelsPerCentimeter} />
            )}
            {!data.name && !micrograph?.instrument && !spot && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No metadata set
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </StyledAccordion>

      {/* Applied Presets (spots only) */}
      {spot && appliedPresets.length > 0 && (
        <StyledAccordion
          expanded={expanded['appliedPresets'] || false}
          onChange={handleExpand('appliedPresets')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Applied Presets</Typography>
            <Chip label={`${appliedPresets.length}`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="Untrack all presets (metadata is preserved)">
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllPresets();
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  mr: 1,
                  cursor: 'pointer',
                  borderRadius: '50%',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ClearIcon fontSize="small" />
              </Box>
            </Tooltip>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {appliedPresets.map((preset) => (
                <Box
                  key={preset.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.5,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {/* Color indicator */}
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: preset.color,
                      flexShrink: 0,
                    }}
                  />
                  {/* Preset name */}
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {preset.name}
                  </Typography>
                  {/* Clear button */}
                  <Tooltip title="Untrack preset (metadata is preserved)">
                    <IconButton
                      size="small"
                      onClick={() => clearPreset(preset.id)}
                      sx={{ p: 0.25 }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Mineralogy/Lithology */}
      {(hasData(data.mineralogy) || hasData(data.lithologyInfo)) && (
        <StyledAccordion
          expanded={expanded['mineralogy'] || false}
          onChange={handleExpand('mineralogy')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Mineralogy/Lithology</Typography>
            {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
              <Chip label={`${data.mineralogy.minerals.length} minerals`} size="small" />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('mineralogy')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Minerals:
                  </Typography>
                  {data.mineralogy.minerals.map((mineral, index) => (
                    <Typography key={index} variant="body2">
                      • {mineral.name}
                      {mineral.operator && mineral.percentage && ` ${mineral.operator} ${mineral.percentage}%`}
                    </Typography>
                  ))}
                </Box>
              )}
              {data.lithologyInfo?.lithologies && data.lithologyInfo.lithologies.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Lithology:
                  </Typography>
                  {data.lithologyInfo.lithologies.map((lithology, index) => (
                    <Typography key={index} variant="body2">
                      • {lithology.level1}
                      {lithology.level2 && ` / ${lithology.level2}`}
                      {lithology.level3 && ` / ${lithology.level3}`}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Grain Info */}
      {(hasData(data.grainInfo?.grainSizeInfo) ||
        hasData(data.grainInfo?.grainShapeInfo) ||
        hasData(data.grainInfo?.grainOrientationInfo)) && (
        <StyledAccordion
          expanded={expanded['grain'] || false}
          onChange={handleExpand('grain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Grain Info</Typography>
            <Chip
              label={`${
                getItemCount(data.grainInfo?.grainSizeInfo) +
                getItemCount(data.grainInfo?.grainShapeInfo) +
                getItemCount(data.grainInfo?.grainOrientationInfo)
              } items`}
              size="small"
            />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('grain')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {/* Grain Size */}
              {data.grainInfo?.grainSizeInfo && data.grainInfo.grainSizeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Grain Size:
                  </Typography>
                  {toArray(data.grainInfo.grainSizeInfo).map((size: GrainSizeType, index: number) => {
                    const sizeValue = size.mean ?? size.median ?? size.mode;
                    const sizeStr = sizeValue !== null
                      ? `${sizeValue}${size.sizeUnit}${size.standardDeviation !== null ? ` ± ${size.standardDeviation}` : ''}`
                      : '';
                    return (
                      <Typography key={index} variant="body2">
                        • {size.phases} - {sizeStr}
                      </Typography>
                    );
                  })}
                </Box>
              )}

              {/* Grain Shape */}
              {data.grainInfo?.grainShapeInfo && data.grainInfo.grainShapeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Grain Shape:
                  </Typography>
                  {toArray(data.grainInfo.grainShapeInfo).map((shape: GrainShapeType, index: number) => (
                    <Typography key={index} variant="body2">
                      • {shape.phases} - {shape.shape}
                    </Typography>
                  ))}
                </Box>
              )}

              {/* Grain Orientation */}
              {data.grainInfo?.grainOrientationInfo && data.grainInfo.grainOrientationInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Grain Orientation:
                  </Typography>
                  {toArray(data.grainInfo.grainOrientationInfo).map((orient: GrainOrientationType, index: number) => (
                    <Typography key={index} variant="body2">
                      • {orient.phases} - {orient.meanOrientation}° from {orient.relativeTo}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Fabric Info */}
      {hasData(data.fabricInfo?.fabrics) && (
        <StyledAccordion
          expanded={expanded['fabric'] || false}
          onChange={handleExpand('fabric')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Fabric Info</Typography>
            <Chip label={`${getItemCount(data.fabricInfo?.fabrics)} fabrics`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('fabric')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {toArray(data.fabricInfo?.fabrics).map((fabric: FabricType, index: number) => {
                const formatted = formatFabric(fabric);
                return (
                  <Box key={index}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', textDecoration: 'underline' }}>
                      • {formatted.label}
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, whiteSpace: 'pre-wrap' }}>
                      {formatted.details}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Clastic Deformation Bands */}
      {hasData(data.clasticDeformationBandInfo?.bands) && (
        <StyledAccordion
          expanded={expanded['clastic'] || false}
          onChange={handleExpand('clastic')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Clastic Deformation Bands</Typography>
            <Chip label={`${getItemCount(data.clasticDeformationBandInfo?.bands)} bands`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('clastic')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.clasticDeformationBandInfo?.bands).map((band: ClasticDeformationBandType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatClasticBand(band)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Faults and Shear Zones */}
      {hasData(data.faultsShearZonesInfo?.faultsShearZones) && (
        <StyledAccordion
          expanded={expanded['faultsShearZones'] || false}
          onChange={handleExpand('faultsShearZones')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Faults and Shear Zones</Typography>
            <Chip label={`${getItemCount(data.faultsShearZonesInfo?.faultsShearZones)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('faultsShearZones')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.faultsShearZonesInfo?.faultsShearZones).map((fault: FaultsShearZonesType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatFaultShearZone(fault)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Extinction Microstructures */}
      {hasData(data.extinctionMicrostructureInfo?.extinctionMicrostructures) && (
        <StyledAccordion
          expanded={expanded['extinctionMicrostructures'] || false}
          onChange={handleExpand('extinctionMicrostructures')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Extinction Microstructures</Typography>
            <Chip label={`${getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('extinctionMicrostructures')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.extinctionMicrostructureInfo?.extinctionMicrostructures).map((ext: ExtinctionMicrostructureType, index: number) => (
                <Typography key={index} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  • {formatExtinctionMicrostructure(ext)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Grain Boundary/Contact Info */}
      {hasData(data.grainBoundaryInfo?.boundaries) && (
        <StyledAccordion
          expanded={expanded['grainBoundary'] || false}
          onChange={handleExpand('grainBoundary')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Grain Boundary/Contact Info</Typography>
            <Chip label={`${getItemCount(data.grainBoundaryInfo?.boundaries)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('grainBoundary')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.grainBoundaryInfo?.boundaries).map((boundary: GrainBoundaryType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatGrainBoundary(boundary)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Intragrain Info */}
      {hasData(data.intraGrainInfo?.grains) && (
        <StyledAccordion
          expanded={expanded['intraGrain'] || false}
          onChange={handleExpand('intraGrain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Intragrain (Single Grain) Info</Typography>
            <Chip label={`${getItemCount(data.intraGrainInfo?.grains)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('intraGrain')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.intraGrainInfo?.grains).map((grain: IntraGrainType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatIntraGrain(grain)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Vein Info */}
      {hasData(data.veinInfo?.veins) && (
        <StyledAccordion
          expanded={expanded['vein'] || false}
          onChange={handleExpand('vein')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Vein Info</Typography>
            <Chip label={`${getItemCount(data.veinInfo?.veins)} veins`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('vein')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.veinInfo?.veins).map((vein: VeinType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatVein(vein)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Pseudotachylyte Info */}
      {hasData(data.pseudotachylyteInfo?.pseudotachylytes) && (
        <StyledAccordion
          expanded={expanded['pseudotachylyte'] || false}
          onChange={handleExpand('pseudotachylyte')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Pseudotachylyte Info</Typography>
            <Chip label={`${getItemCount(data.pseudotachylyteInfo?.pseudotachylytes)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('pseudotachylyte')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {toArray(data.pseudotachylyteInfo?.pseudotachylytes).map((pseudo: PseudotachylyteType, index: number) => {
                const formatted = formatPseudotachylyte(pseudo);
                return (
                  <Box key={index}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', textDecoration: 'underline' }}>
                      • {formatted.label}
                    </Typography>
                    {formatted.sections.map((section, idx) => (
                      <Box key={idx} sx={{ ml: 2, mt: 0.5 }}>
                        <Typography variant="caption" sx={{ textDecoration: 'underline' }}>
                          {section.title}:
                        </Typography>
                        <Typography variant="body2" component="div" sx={{ ml: 1 }}>
                          {section.content}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                );
              })}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Fold Info */}
      {hasData(data.foldInfo?.folds) && (
        <StyledAccordion
          expanded={expanded['fold'] || false}
          onChange={handleExpand('fold')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Fold Info</Typography>
            <Chip label={`${getItemCount(data.foldInfo?.folds)} folds`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('fold')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {toArray(data.foldInfo?.folds).map((fold: FoldType, index: number) => {
                const formatted = formatFold(fold);
                return (
                  <Box key={index}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', textDecoration: 'underline' }}>
                      • {formatted.label}
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2 }}>
                      {formatted.details}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Fracture Info */}
      {hasData(data.fractureInfo?.fractures) && (
        <StyledAccordion
          expanded={expanded['fracture'] || false}
          onChange={handleExpand('fracture')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Fracture Info</Typography>
            <Chip label={`${getItemCount(data.fractureInfo?.fractures)} fractures`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('fracture')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {toArray(data.fractureInfo?.fractures).map((fracture: FractureType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatFracture(fracture)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Notes */}
      <StyledAccordion
        expanded={expanded['notes'] || false}
        onChange={handleExpand('notes')}
        disableGutters
      >
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Notes</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={handleEdit('notes')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              mr: 1,
              cursor: 'pointer',
              borderRadius: '50%',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          {data.notes ? (
            <Typography variant="body2">{data.notes}</Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No notes
            </Typography>
          )}
        </AccordionDetails>
      </StyledAccordion>

      {/* Associated Files */}
      <StyledAccordion
        expanded={expanded['files'] || false}
        onChange={handleExpand('files')}
        disableGutters
      >
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Associated Files</Typography>
          {hasData(data.associatedFiles) && (
            <Chip label={`${getItemCount(data.associatedFiles)} files`} size="small" />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={handleEdit('files')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              mr: 1,
              cursor: 'pointer',
              borderRadius: '50%',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          {hasData(data.associatedFiles) ? (
            <Stack spacing={0.5}>
              {data.associatedFiles?.map((file, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" component="span">•&nbsp;</Typography>
                  <Link
                    component="button"
                    variant="body2"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!project?.id || !window.api?.openFilePath || !window.api?.getProjectFolderPaths) return;
                      try {
                        const paths = await window.api.getProjectFolderPaths(project.id);
                        const filePath = `${paths.associatedFiles}/${file.fileName}`;
                        const result = await window.api.openFilePath(filePath);
                        if (!result.success) {
                          alert(`Could not open file: ${result.error || 'Unknown error'}`);
                        }
                      } catch (error) {
                        alert('Failed to open file. It may have been moved or deleted.');
                      }
                    }}
                    sx={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    {file.fileName}
                    <OpenInNewIcon sx={{ fontSize: 12, opacity: 0.7 }} />
                  </Link>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No associated files
            </Typography>
          )}
        </AccordionDetails>
      </StyledAccordion>

      {/* Links */}
      {hasData(data.links) && (
        <StyledAccordion
          expanded={expanded['links'] || false}
          onChange={handleExpand('links')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Links</Typography>
            <Chip label={`${getItemCount(data.links)} links`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('links')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: 1,
                cursor: 'pointer',
                borderRadius: '50%',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <EditIcon fontSize="small" />
            </Box>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.links?.map((link, index) => (
                <Box key={index}>
                  <Typography variant="body2" fontWeight="medium">• {link.label}</Typography>
                  <Typography variant="caption" color="primary" sx={{ wordBreak: 'break-all', ml: 2 }}>
                    {link.url}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* Show empty state if no metadata exists */}
      {!hasData(data.mineralogy) &&
       !hasData(data.lithologyInfo) &&
       !hasData(data.grainInfo) &&
       !hasData(data.fabricInfo) &&
       !hasData(data.clasticDeformationBandInfo) &&
       !hasData(data.faultsShearZonesInfo) &&
       !hasData(data.extinctionMicrostructureInfo) &&
       !hasData(data.grainBoundaryInfo) &&
       !hasData(data.intraGrainInfo) &&
       !hasData(data.veinInfo) &&
       !hasData(data.pseudotachylyteInfo) &&
       !hasData(data.foldInfo) &&
       !hasData(data.fractureInfo) &&
       !hasData(data.notes) &&
       !hasData(data.associatedFiles) &&
       !hasData(data.links) && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2, textAlign: 'center' }}>
          No metadata collected yet. Use the dropdown above to add data.
        </Typography>
      )}
    </Stack>
  );
}
