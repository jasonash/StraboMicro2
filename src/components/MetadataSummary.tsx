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
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById, getMicrographParentSample, getSampleParentDataset } from '@/store/helpers';
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
} from '@/types/project-types';

interface MetadataSummaryProps {
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
}

interface AccordionState {
  [key: string]: boolean;
}

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

export function MetadataSummary({ micrographId, spotId, onEditSection }: MetadataSummaryProps) {
  const project = useAppStore((state) => state.project);

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

  // Get the parent sample
  const sample = micrographId && project
    ? getMicrographParentSample(project, micrographId)
    : undefined;

  // Get the parent dataset
  const dataset = sample && project
    ? getSampleParentDataset(project, sample.id)
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

  return (
    <Stack spacing={0.5}>
      {/* Project Metadata */}
      <Accordion
        expanded={expanded['project'] || false}
        onChange={handleExpand('project')}
        disableGutters
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          }}
        >
          <Typography variant="subtitle2">Project Metadata</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={handleEdit('project')}
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
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {project?.name && (
              <Box>
                <Typography variant="caption" color="text.secondary">Name: </Typography>
                <Typography variant="body2" component="span">{project.name}</Typography>
              </Box>
            )}
            {project?.description && (
              <Box>
                <Typography variant="caption" color="text.secondary">Description: </Typography>
                <Typography variant="body2" component="span">{project.description}</Typography>
              </Box>
            )}
            {!project?.name && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No project metadata set
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Dataset Metadata */}
      {dataset && (
        <Accordion
          expanded={expanded['dataset'] || false}
          onChange={handleExpand('dataset')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Dataset Metadata</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Box
              onClick={handleEdit('dataset')}
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {dataset.name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Name: </Typography>
                  <Typography variant="body2" component="span">{dataset.name}</Typography>
                </Box>
              )}
              {!dataset.name && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No dataset metadata set
                </Typography>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Sample Metadata */}
      {sample && (
        <Accordion
          expanded={expanded['sample'] || false}
          onChange={handleExpand('sample')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
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
                  <Typography variant="body2" component="span">{sample.materialType}</Typography>
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
        </Accordion>
      )}

      {/* Micrograph/Spot Metadata */}
      <Accordion
        expanded={expanded['metadata'] || false}
        onChange={handleExpand('metadata')}
        disableGutters
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          }}
        >
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
        </AccordionSummary>
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
            {!data.name && !micrograph?.instrument && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No metadata set
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Mineralogy/Lithology */}
      {(hasData(data.mineralogy) || hasData(data.lithologyInfo)) && (
        <Accordion
          expanded={expanded['mineralogy'] || false}
          onChange={handleExpand('mineralogy')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
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
        </Accordion>
      )}

      {/* Grain Info */}
      {(hasData(data.grainInfo?.grainSizeInfo) ||
        hasData(data.grainInfo?.grainShapeInfo) ||
        hasData(data.grainInfo?.grainOrientationInfo)) && (
        <Accordion
          expanded={expanded['grain'] || false}
          onChange={handleExpand('grain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {/* Grain Size */}
              {data.grainInfo?.grainSizeInfo && data.grainInfo.grainSizeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Grain Size:
                  </Typography>
                  {data.grainInfo.grainSizeInfo.map((size: GrainSizeType, index: number) => {
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
                  {data.grainInfo.grainShapeInfo.map((shape: GrainShapeType, index: number) => (
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
                  {data.grainInfo.grainOrientationInfo.map((orient: GrainOrientationType, index: number) => (
                    <Typography key={index} variant="body2">
                      • {orient.phases} - {orient.meanOrientation}° from {orient.relativeTo}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Fabric Info */}
      {hasData(data.fabricInfo?.fabrics) && (
        <Accordion
          expanded={expanded['fabric'] || false}
          onChange={handleExpand('fabric')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {data.fabricInfo?.fabrics?.map((fabric: FabricType, index: number) => {
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
        </Accordion>
      )}

      {/* Clastic Deformation Bands */}
      {hasData(data.clasticDeformationBandInfo?.bands) && (
        <Accordion
          expanded={expanded['clastic'] || false}
          onChange={handleExpand('clastic')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.clasticDeformationBandInfo?.bands?.map((band: ClasticDeformationBandType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatClasticBand(band)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Faults and Shear Zones */}
      {hasData(data.faultsShearZonesInfo?.faultsShearZones) && (
        <Accordion
          expanded={expanded['faultsShearZones'] || false}
          onChange={handleExpand('faultsShearZones')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.faultsShearZonesInfo?.faultsShearZones?.map((fault: FaultsShearZonesType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatFaultShearZone(fault)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Extinction Microstructures */}
      {hasData(data.extinctionMicrostructureInfo?.extinctionMicrostructures) && (
        <Accordion
          expanded={expanded['extinctionMicrostructures'] || false}
          onChange={handleExpand('extinctionMicrostructures')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.extinctionMicrostructureInfo?.extinctionMicrostructures?.map((ext: ExtinctionMicrostructureType, index: number) => (
                <Typography key={index} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  • {formatExtinctionMicrostructure(ext)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Grain Boundary/Contact Info */}
      {hasData(data.grainBoundaryInfo?.boundaries) && (
        <Accordion
          expanded={expanded['grainBoundary'] || false}
          onChange={handleExpand('grainBoundary')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.grainBoundaryInfo?.boundaries?.map((boundary: GrainBoundaryType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatGrainBoundary(boundary)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Intragrain Info */}
      {hasData(data.intraGrainInfo?.grains) && (
        <Accordion
          expanded={expanded['intraGrain'] || false}
          onChange={handleExpand('intraGrain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.intraGrainInfo?.grains?.map((grain: IntraGrainType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatIntraGrain(grain)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Vein Info */}
      {hasData(data.veinInfo?.veins) && (
        <Accordion
          expanded={expanded['vein'] || false}
          onChange={handleExpand('vein')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.veinInfo?.veins?.map((vein: VeinType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatVein(vein)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Pseudotachylyte Info */}
      {hasData(data.pseudotachylyteInfo?.pseudotachylytes) && (
        <Accordion
          expanded={expanded['pseudotachylyte'] || false}
          onChange={handleExpand('pseudotachylyte')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {data.pseudotachylyteInfo?.pseudotachylytes?.map((pseudo: PseudotachylyteType, index: number) => {
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
        </Accordion>
      )}

      {/* Fold Info */}
      {hasData(data.foldInfo?.folds) && (
        <Accordion
          expanded={expanded['fold'] || false}
          onChange={handleExpand('fold')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {data.foldInfo?.folds?.map((fold: FoldType, index: number) => {
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
        </Accordion>
      )}

      {/* Fracture Info */}
      {hasData(data.fractureInfo?.fractures) && (
        <Accordion
          expanded={expanded['fracture'] || false}
          onChange={handleExpand('fracture')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.fractureInfo?.fractures?.map((fracture: FractureType, index: number) => (
                <Typography key={index} variant="body2">
                  • {formatFracture(fracture)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Notes */}
      {hasData(data.notes) && (
        <Accordion
          expanded={expanded['notes'] || false}
          onChange={handleExpand('notes')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="body2">{data.notes}</Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Associated Files */}
      {hasData(data.associatedFiles) && (
        <Accordion
          expanded={expanded['files'] || false}
          onChange={handleExpand('files')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Associated Files</Typography>
            <Chip label={`${getItemCount(data.associatedFiles)} files`} size="small" />
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
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.associatedFiles?.map((file, index) => (
                <Typography key={index} variant="body2">
                  • {file.fileName}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Links */}
      {hasData(data.links) && (
        <Accordion
          expanded={expanded['links'] || false}
          onChange={handleExpand('links')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
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
          </AccordionSummary>
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
        </Accordion>
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
