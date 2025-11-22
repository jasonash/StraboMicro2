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
  Spot,
} from '@/types/project-types';

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
        if (micrograph.parentID === parentId) {
          children.push(micrograph);
        }
      }
    }
  }

  return children;
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
 * Get available mineral phases from a sample's mineralogy data
 * Used to populate "Which Phases?" checkboxes in grain/fabric/etc dialogs
 */
export function getAvailablePhases(
  sample: SampleMetadata | null
): string[] {
  if (!sample?.mineralogies || sample.mineralogies.length === 0) {
    return [];
  }

  // Extract unique mineral names from the mineralogies array
  const phases = sample.mineralogies
    .map(m => m.mineral)
    .filter((name): name is string => !!name); // Type guard to filter out undefined

  // Return unique phases
  return Array.from(new Set(phases));
}
