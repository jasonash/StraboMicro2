/**
 * Store Helper Functions
 *
 * Utilities for efficiently updating deeply nested ProjectMetadata structures
 * while maintaining immutability.
 */

import {
  ProjectMetadata,
  DatasetMetadata,
  SampleMetadata,
  MicrographMetadata,
  MineralogyType,
  Spot,
} from '@/types/project-types';
import type { PresetData } from '@/types/preset-types';

/**
 * Find a dataset by ID within a project
 */
export function findDatasetById(
  project: ProjectMetadata | null,
  datasetId: string
): DatasetMetadata | null {
  if (!project?.datasets) return null;
  return project.datasets.find(d => d.id === datasetId) || null;
}

/**
 * Find a sample by ID within a project
 */
export function findSampleById(
  project: ProjectMetadata | null,
  sampleId: string
): SampleMetadata | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    const sample = dataset.samples?.find(s => s.id === sampleId);
    if (sample) return sample;
  }

  return null;
}

/**
 * Find a micrograph by ID within a project
 */
export function findMicrographById(
  project: ProjectMetadata | null,
  micrographId: string
): MicrographMetadata | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      const micrograph = sample.micrographs?.find(m => m.id === micrographId);
      if (micrograph) return micrograph;
    }
  }

  return null;
}

/**
 * Find a spot by ID within a project
 */
export function findSpotById(
  project: ProjectMetadata | null,
  spotId: string
): Spot | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        const spot = micrograph.spots?.find(s => s.id === spotId);
        if (spot) return spot;
      }
    }
  }

  return null;
}

/**
 * Find a spot's parent micrograph by spot ID
 */
export function findSpotParentMicrograph(
  project: ProjectMetadata | null,
  spotId: string
): MicrographMetadata | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        const spot = micrograph.spots?.find(s => s.id === spotId);
        if (spot) return micrograph;
      }
    }
  }

  return null;
}

/**
 * Update a micrograph immutably within the project hierarchy
 */
export function updateMicrograph(
  project: ProjectMetadata,
  micrographId: string,
  updater: (micrograph: MicrographMetadata) => void
): ProjectMetadata {
  const newProject = structuredClone(project);

  for (const dataset of newProject.datasets || []) {
    for (const sample of dataset.samples || []) {
      const micrograph = sample.micrographs?.find(m => m.id === micrographId);
      if (micrograph) {
        updater(micrograph);
        return newProject;
      }
    }
  }

  return newProject;
}

/**
 * Update a spot immutably within the project hierarchy
 */
export function updateSpot(
  project: ProjectMetadata,
  spotId: string,
  updater: (spot: Spot) => void
): ProjectMetadata {
  const newProject = structuredClone(project);

  for (const dataset of newProject.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        const spot = micrograph.spots?.find(s => s.id === spotId);
        if (spot) {
          updater(spot);
          return newProject;
        }
      }
    }
  }

  return newProject;
}

/**
 * Build an index of all micrographs in the project for fast lookups
 * This includes both reference micrographs and associated micrographs
 * (Associated micrographs are stored in the same array with parentID set)
 */
export function buildMicrographIndex(
  project: ProjectMetadata | null
): Map<string, MicrographMetadata> {
  const index = new Map<string, MicrographMetadata>();

  if (!project?.datasets) return index;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        index.set(micrograph.id, micrograph);
      }
    }
  }

  return index;
}

/**
 * Build an index of all spots in the project for fast lookups
 */
export function buildSpotIndex(
  project: ProjectMetadata | null
): Map<string, Spot> {
  const index = new Map<string, Spot>();

  if (!project?.datasets) return index;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        for (const spot of micrograph.spots || []) {
          index.set(spot.id, spot);
        }
      }
    }
  }

  return index;
}

/**
 * Get the parent sample for a given micrograph
 */
export function getMicrographParentSample(
  project: ProjectMetadata | null,
  micrographId: string
): SampleMetadata | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      const hasMicrograph = sample.micrographs?.some(m => m.id === micrographId);
      if (hasMicrograph) return sample;
    }
  }

  return null;
}

/**
 * Get the parent dataset for a given sample
 */
export function getSampleParentDataset(
  project: ProjectMetadata | null,
  sampleId: string
): DatasetMetadata | null {
  if (!project?.datasets) return null;

  for (const dataset of project.datasets) {
    const hasSample = dataset.samples?.some(s => s.id === sampleId);
    if (hasSample) return dataset;
  }

  return null;
}

/**
 * Get all child micrographs of a parent micrograph (for overlay hierarchy)
 * Only returns visible micrographs (isMicroVisible !== false)
 */
export function getChildMicrographs(
  project: ProjectMetadata | null,
  parentId: string
): MicrographMetadata[] {
  if (!project?.datasets) return [];

  const children: MicrographMetadata[] = [];

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        if (micrograph.parentID === parentId && micrograph.isMicroVisible !== false) {
          children.push(micrograph);
        }
      }
    }
  }

  return children;
}

/**
 * Get all descendants of a micrograph (children, grandchildren, ...) in breadth-first order.
 * Unlike getChildMicrographs, this does NOT filter by isMicroVisible — cascade operations
 * (like a scale change) need to reach hidden descendants too.
 */
export function getDescendantMicrographs(
  project: ProjectMetadata | null,
  ancestorId: string
): MicrographMetadata[] {
  if (!project?.datasets) return [];

  const childrenByParent = new Map<string, MicrographMetadata[]>();
  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        if (micrograph.parentID) {
          const arr = childrenByParent.get(micrograph.parentID) || [];
          arr.push(micrograph);
          childrenByParent.set(micrograph.parentID, arr);
        }
      }
    }
  }

  const descendants: MicrographMetadata[] = [];
  const queue: string[] = [ancestorId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = childrenByParent.get(currentId) || [];
    for (const child of children) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}

/**
 * Point-placed children render as markers, not scaled image overlays
 * (TiledViewer.tsx renders them as a Circle). Their scalePixelsPerCentimeter
 * only affects measurements made on their own canvas — never the parent.
 * So a parent's scale change must NOT cascade into them.
 */
export function isPointPlacedMicrograph(micrograph: MicrographMetadata): boolean {
  return micrograph.placementType === 'point' || micrograph.pointInParent != null;
}

/**
 * Get all reference micrographs (no parentID)
 */
export function getReferenceMicrographs(
  project: ProjectMetadata | null
): MicrographMetadata[] {
  if (!project?.datasets) return [];

  const references: MicrographMetadata[] = [];

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        if (!micrograph.parentID) {
          references.push(micrograph);
        }
      }
    }
  }

  return references;
}

/**
 * Get the ancestor chain of micrographs from root to the given micrograph
 * Returns array ordered from root (oldest ancestor) to the target micrograph
 *
 * Example: If micrograph "C" -> "flip" -> "top", calling with "top" returns [C, flip, top]
 */
export function getMicrographAncestorChain(
  project: ProjectMetadata | null,
  micrographId: string
): MicrographMetadata[] {
  if (!project) return [];

  const micrograph = findMicrographById(project, micrographId);
  if (!micrograph) return [];

  const chain: MicrographMetadata[] = [micrograph];

  // Walk up the parent chain
  let current = micrograph;
  while (current.parentID) {
    const parent = findMicrographById(project, current.parentID);
    if (!parent) break;
    chain.unshift(parent); // Add to beginning to maintain root-to-leaf order
    current = parent;
  }

  return chain;
}

/**
 * Get available mineral phases from a micrograph's or spot's mineralogy data
 * Used to populate "Which Phases?" checkboxes in grain/fabric/etc dialogs
 */
export function getAvailablePhasesFromMineralogy(
  mineralogy: MineralogyType | null | undefined
): string[] {
  if (!mineralogy?.minerals || mineralogy.minerals.length === 0) {
    return [];
  }

  // Extract unique mineral names from the minerals array
  const phases = mineralogy.minerals
    .map((m) => m.name)
    .filter((name): name is string => !!name); // Type guard to filter out undefined

  // Return unique phases
  return Array.from(new Set(phases));
}

export function getAvailablePhasesFromMicrograph(
  micrograph: MicrographMetadata | null
): string[] {
  return getAvailablePhasesFromMineralogy(micrograph?.mineralogy);
}

/**
 * Get available mineral phases from a spot's mineralogy data
 */
export function getAvailablePhasesFromSpot(
  spot: Spot | null
): string[] {
  return getAvailablePhasesFromMineralogy(spot?.mineralogy);
}

// ============================================================================
// PRESET MERGE HELPER
// ============================================================================

/**
 * Merge preset data into a spot using additive rules:
 * - Scalars (color, opacity): preset replaces spot value
 * - mineralogy.minerals[]: append preset minerals to existing
 * - Other *Info arrays: append preset entries to existing
 * - Notes fields: concatenate with newline
 */
export function mergePresetIntoSpot(spot: Spot, presetData: PresetData): void {
  // Merge scalar appearance properties (replace)
  if (presetData.color !== undefined) {
    spot.color = presetData.color;
  }
  if (presetData.labelColor !== undefined) {
    spot.labelColor = presetData.labelColor;
  }
  if (presetData.opacity !== undefined) {
    spot.opacity = presetData.opacity;
  }

  // Merge mineralogy (append minerals)
  if (presetData.mineralogy) {
    if (!spot.mineralogy) {
      spot.mineralogy = structuredClone(presetData.mineralogy);
    } else {
      // Append minerals
      if (presetData.mineralogy.minerals?.length) {
        if (!spot.mineralogy.minerals) {
          spot.mineralogy.minerals = [];
        }
        spot.mineralogy.minerals.push(...structuredClone(presetData.mineralogy.minerals));
      }
      // Concatenate notes
      if (presetData.mineralogy.notes) {
        spot.mineralogy.notes = spot.mineralogy.notes
          ? `${spot.mineralogy.notes}\n${presetData.mineralogy.notes}`
          : presetData.mineralogy.notes;
      }
      // Replace other fields if set
      if (presetData.mineralogy.percentageCalculationMethod) {
        spot.mineralogy.percentageCalculationMethod = presetData.mineralogy.percentageCalculationMethod;
      }
      if (presetData.mineralogy.mineralogyMethod) {
        spot.mineralogy.mineralogyMethod = presetData.mineralogy.mineralogyMethod;
      }
    }
  }

  // Merge grainInfo (append arrays, concatenate notes)
  if (presetData.grainInfo) {
    if (!spot.grainInfo) {
      spot.grainInfo = structuredClone(presetData.grainInfo);
    } else {
      if (presetData.grainInfo.grainSizeInfo?.length) {
        if (!spot.grainInfo.grainSizeInfo) spot.grainInfo.grainSizeInfo = [];
        spot.grainInfo.grainSizeInfo.push(...structuredClone(presetData.grainInfo.grainSizeInfo));
      }
      if (presetData.grainInfo.grainShapeInfo?.length) {
        if (!spot.grainInfo.grainShapeInfo) spot.grainInfo.grainShapeInfo = [];
        spot.grainInfo.grainShapeInfo.push(...structuredClone(presetData.grainInfo.grainShapeInfo));
      }
      if (presetData.grainInfo.grainOrientationInfo?.length) {
        if (!spot.grainInfo.grainOrientationInfo) spot.grainInfo.grainOrientationInfo = [];
        spot.grainInfo.grainOrientationInfo.push(...structuredClone(presetData.grainInfo.grainOrientationInfo));
      }
      if (presetData.grainInfo.grainSizeNotes) {
        spot.grainInfo.grainSizeNotes = spot.grainInfo.grainSizeNotes
          ? `${spot.grainInfo.grainSizeNotes}\n${presetData.grainInfo.grainSizeNotes}`
          : presetData.grainInfo.grainSizeNotes;
      }
      if (presetData.grainInfo.grainShapeNotes) {
        spot.grainInfo.grainShapeNotes = spot.grainInfo.grainShapeNotes
          ? `${spot.grainInfo.grainShapeNotes}\n${presetData.grainInfo.grainShapeNotes}`
          : presetData.grainInfo.grainShapeNotes;
      }
      if (presetData.grainInfo.grainOrientationNotes) {
        spot.grainInfo.grainOrientationNotes = spot.grainInfo.grainOrientationNotes
          ? `${spot.grainInfo.grainOrientationNotes}\n${presetData.grainInfo.grainOrientationNotes}`
          : presetData.grainInfo.grainOrientationNotes;
      }
    }
  }

  // Merge fabricInfo (append fabrics array, concatenate notes)
  if (presetData.fabricInfo) {
    if (!spot.fabricInfo) {
      spot.fabricInfo = structuredClone(presetData.fabricInfo);
    } else {
      if (presetData.fabricInfo.fabrics?.length) {
        if (!spot.fabricInfo.fabrics) spot.fabricInfo.fabrics = [];
        spot.fabricInfo.fabrics.push(...structuredClone(presetData.fabricInfo.fabrics));
      }
      if (presetData.fabricInfo.notes) {
        spot.fabricInfo.notes = spot.fabricInfo.notes
          ? `${spot.fabricInfo.notes}\n${presetData.fabricInfo.notes}`
          : presetData.fabricInfo.notes;
      }
    }
  }

  // Merge fractureInfo (append fractures array, concatenate notes)
  if (presetData.fractureInfo) {
    if (!spot.fractureInfo) {
      spot.fractureInfo = structuredClone(presetData.fractureInfo);
    } else {
      if (presetData.fractureInfo.fractures?.length) {
        if (!spot.fractureInfo.fractures) spot.fractureInfo.fractures = [];
        spot.fractureInfo.fractures.push(...structuredClone(presetData.fractureInfo.fractures));
      }
      if (presetData.fractureInfo.notes) {
        spot.fractureInfo.notes = spot.fractureInfo.notes
          ? `${spot.fractureInfo.notes}\n${presetData.fractureInfo.notes}`
          : presetData.fractureInfo.notes;
      }
    }
  }

  // Merge foldInfo (append folds array, concatenate notes)
  if (presetData.foldInfo) {
    if (!spot.foldInfo) {
      spot.foldInfo = structuredClone(presetData.foldInfo);
    } else {
      if (presetData.foldInfo.folds?.length) {
        if (!spot.foldInfo.folds) spot.foldInfo.folds = [];
        spot.foldInfo.folds.push(...structuredClone(presetData.foldInfo.folds));
      }
      if (presetData.foldInfo.notes) {
        spot.foldInfo.notes = spot.foldInfo.notes
          ? `${spot.foldInfo.notes}\n${presetData.foldInfo.notes}`
          : presetData.foldInfo.notes;
      }
    }
  }

  // Merge veinInfo (append veins array, concatenate notes)
  if (presetData.veinInfo) {
    if (!spot.veinInfo) {
      spot.veinInfo = structuredClone(presetData.veinInfo);
    } else {
      if (presetData.veinInfo.veins?.length) {
        if (!spot.veinInfo.veins) spot.veinInfo.veins = [];
        spot.veinInfo.veins.push(...structuredClone(presetData.veinInfo.veins));
      }
      if (presetData.veinInfo.notes) {
        spot.veinInfo.notes = spot.veinInfo.notes
          ? `${spot.veinInfo.notes}\n${presetData.veinInfo.notes}`
          : presetData.veinInfo.notes;
      }
    }
  }

  // Merge clasticDeformationBandInfo
  if (presetData.clasticDeformationBandInfo) {
    if (!spot.clasticDeformationBandInfo) {
      spot.clasticDeformationBandInfo = structuredClone(presetData.clasticDeformationBandInfo);
    } else {
      if (presetData.clasticDeformationBandInfo.bands?.length) {
        if (!spot.clasticDeformationBandInfo.bands) spot.clasticDeformationBandInfo.bands = [];
        spot.clasticDeformationBandInfo.bands.push(...structuredClone(presetData.clasticDeformationBandInfo.bands));
      }
      if (presetData.clasticDeformationBandInfo.notes) {
        spot.clasticDeformationBandInfo.notes = spot.clasticDeformationBandInfo.notes
          ? `${spot.clasticDeformationBandInfo.notes}\n${presetData.clasticDeformationBandInfo.notes}`
          : presetData.clasticDeformationBandInfo.notes;
      }
    }
  }

  // Merge grainBoundaryInfo
  if (presetData.grainBoundaryInfo) {
    if (!spot.grainBoundaryInfo) {
      spot.grainBoundaryInfo = structuredClone(presetData.grainBoundaryInfo);
    } else {
      if (presetData.grainBoundaryInfo.boundaries?.length) {
        if (!spot.grainBoundaryInfo.boundaries) spot.grainBoundaryInfo.boundaries = [];
        spot.grainBoundaryInfo.boundaries.push(...structuredClone(presetData.grainBoundaryInfo.boundaries));
      }
      if (presetData.grainBoundaryInfo.notes) {
        spot.grainBoundaryInfo.notes = spot.grainBoundaryInfo.notes
          ? `${spot.grainBoundaryInfo.notes}\n${presetData.grainBoundaryInfo.notes}`
          : presetData.grainBoundaryInfo.notes;
      }
    }
  }

  // Merge intraGrainInfo
  if (presetData.intraGrainInfo) {
    if (!spot.intraGrainInfo) {
      spot.intraGrainInfo = structuredClone(presetData.intraGrainInfo);
    } else {
      if (presetData.intraGrainInfo.grains?.length) {
        if (!spot.intraGrainInfo.grains) spot.intraGrainInfo.grains = [];
        spot.intraGrainInfo.grains.push(...structuredClone(presetData.intraGrainInfo.grains));
      }
      if (presetData.intraGrainInfo.notes) {
        spot.intraGrainInfo.notes = spot.intraGrainInfo.notes
          ? `${spot.intraGrainInfo.notes}\n${presetData.intraGrainInfo.notes}`
          : presetData.intraGrainInfo.notes;
      }
    }
  }

  // Merge pseudotachylyteInfo
  if (presetData.pseudotachylyteInfo) {
    if (!spot.pseudotachylyteInfo) {
      spot.pseudotachylyteInfo = structuredClone(presetData.pseudotachylyteInfo);
    } else {
      if (presetData.pseudotachylyteInfo.pseudotachylytes?.length) {
        if (!spot.pseudotachylyteInfo.pseudotachylytes) spot.pseudotachylyteInfo.pseudotachylytes = [];
        spot.pseudotachylyteInfo.pseudotachylytes.push(...structuredClone(presetData.pseudotachylyteInfo.pseudotachylytes));
      }
      if (presetData.pseudotachylyteInfo.notes) {
        spot.pseudotachylyteInfo.notes = spot.pseudotachylyteInfo.notes
          ? `${spot.pseudotachylyteInfo.notes}\n${presetData.pseudotachylyteInfo.notes}`
          : presetData.pseudotachylyteInfo.notes;
      }
      if (presetData.pseudotachylyteInfo.reasoning) {
        spot.pseudotachylyteInfo.reasoning = spot.pseudotachylyteInfo.reasoning
          ? `${spot.pseudotachylyteInfo.reasoning}\n${presetData.pseudotachylyteInfo.reasoning}`
          : presetData.pseudotachylyteInfo.reasoning;
      }
    }
  }

  // Merge faultsShearZonesInfo
  if (presetData.faultsShearZonesInfo) {
    if (!spot.faultsShearZonesInfo) {
      spot.faultsShearZonesInfo = structuredClone(presetData.faultsShearZonesInfo);
    } else {
      if (presetData.faultsShearZonesInfo.faultsShearZones?.length) {
        if (!spot.faultsShearZonesInfo.faultsShearZones) spot.faultsShearZonesInfo.faultsShearZones = [];
        spot.faultsShearZonesInfo.faultsShearZones.push(...structuredClone(presetData.faultsShearZonesInfo.faultsShearZones));
      }
      if (presetData.faultsShearZonesInfo.notes) {
        spot.faultsShearZonesInfo.notes = spot.faultsShearZonesInfo.notes
          ? `${spot.faultsShearZonesInfo.notes}\n${presetData.faultsShearZonesInfo.notes}`
          : presetData.faultsShearZonesInfo.notes;
      }
    }
  }

  // Merge extinctionMicrostructureInfo
  if (presetData.extinctionMicrostructureInfo) {
    if (!spot.extinctionMicrostructureInfo) {
      spot.extinctionMicrostructureInfo = structuredClone(presetData.extinctionMicrostructureInfo);
    } else {
      if (presetData.extinctionMicrostructureInfo.extinctionMicrostructures?.length) {
        if (!spot.extinctionMicrostructureInfo.extinctionMicrostructures) spot.extinctionMicrostructureInfo.extinctionMicrostructures = [];
        spot.extinctionMicrostructureInfo.extinctionMicrostructures.push(...structuredClone(presetData.extinctionMicrostructureInfo.extinctionMicrostructures));
      }
      if (presetData.extinctionMicrostructureInfo.notes) {
        spot.extinctionMicrostructureInfo.notes = spot.extinctionMicrostructureInfo.notes
          ? `${spot.extinctionMicrostructureInfo.notes}\n${presetData.extinctionMicrostructureInfo.notes}`
          : presetData.extinctionMicrostructureInfo.notes;
      }
    }
  }

  // Merge lithologyInfo
  if (presetData.lithologyInfo) {
    if (!spot.lithologyInfo) {
      spot.lithologyInfo = structuredClone(presetData.lithologyInfo);
    } else {
      if (presetData.lithologyInfo.lithologies?.length) {
        if (!spot.lithologyInfo.lithologies) spot.lithologyInfo.lithologies = [];
        spot.lithologyInfo.lithologies.push(...structuredClone(presetData.lithologyInfo.lithologies));
      }
      if (presetData.lithologyInfo.notes) {
        spot.lithologyInfo.notes = spot.lithologyInfo.notes
          ? `${spot.lithologyInfo.notes}\n${presetData.lithologyInfo.notes}`
          : presetData.lithologyInfo.notes;
      }
    }
  }
}

