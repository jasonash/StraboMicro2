/**
 * Project Serialization Service
 *
 * This module handles serialization and deserialization of project data
 * to/from the legacy project.json format for backwards compatibility.
 *
 * CRITICAL: The JSON format MUST match the legacy JavaFX schema exactly
 * to ensure projects can be opened in both the new and legacy apps.
 *
 * Schema Reference: docs/legacy-project-schema.json
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const projectFolders = require('./projectFolders');

/**
 * Serialize project data to legacy JSON format and save to disk
 * @param {Object} project - Project data from Zustand store
 * @param {string} projectId - UUID of the project
 * @returns {Promise<string>} Path to saved project.json
 */
async function saveProjectJson(project, projectId) {
  try {
    log.info(`[ProjectSerializer] Serializing project: ${projectId}`);

    // Get project folder paths
    const folderPaths = projectFolders.getProjectFolderPaths(projectId);
    const projectJsonPath = folderPaths.projectJson;

    // Serialize project to legacy format
    const legacyJson = serializeToLegacyFormat(project);

    // Write to disk with pretty printing
    await fs.promises.writeFile(
      projectJsonPath,
      JSON.stringify(legacyJson, null, 2),
      'utf8'
    );

    log.info(`[ProjectSerializer] Successfully saved project.json to: ${projectJsonPath}`);
    return projectJsonPath;
  } catch (error) {
    log.error('[ProjectSerializer] Error saving project.json:', error);
    throw error;
  }
}

/**
 * Load project.json from disk and deserialize
 * @param {string} projectId - UUID of the project
 * @returns {Promise<Object>} Deserialized project data
 */
async function loadProjectJson(projectId) {
  try {
    log.info(`[ProjectSerializer] Loading project: ${projectId}`);

    // Get project folder paths
    const folderPaths = projectFolders.getProjectFolderPaths(projectId);
    const projectJsonPath = folderPaths.projectJson;

    // Check if file exists
    await fs.promises.access(projectJsonPath, fs.constants.F_OK);

    // Read and parse JSON
    const jsonContent = await fs.promises.readFile(projectJsonPath, 'utf8');
    const legacyJson = JSON.parse(jsonContent);

    // Deserialize from legacy format
    const project = deserializeFromLegacyFormat(legacyJson);

    // Reconstruct imagePath for each micrograph (runtime field not stored in JSON)
    // Images are stored as: images/<micrograph-id> (no extension)
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          // imagePath is the micrograph ID (images are stored by ID in the images folder)
          micrograph.imagePath = micrograph.id;
          log.debug(`[ProjectSerializer] Set imagePath for micrograph ${micrograph.name}: ${micrograph.imagePath}`);
        }
      }
    }

    log.info(`[ProjectSerializer] Successfully loaded project.json from: ${projectJsonPath}`);
    return project;
  } catch (error) {
    log.error('[ProjectSerializer] Error loading project.json:', error);
    throw error;
  }
}

/**
 * Convert internal project format to legacy JSON format
 * @param {Object} project - Project from Zustand store
 * @returns {Object} Legacy format JSON
 */
function serializeToLegacyFormat(project) {
  return {
    id: project.id,
    name: project.name || '',
    startDate: project.startDate || '',
    endDate: project.endDate || '',
    purposeOfStudy: project.purposeOfStudy || '',
    otherTeamMembers: project.otherTeamMembers || '',
    areaOfInterest: project.areaOfInterest || '',
    instrumentsUsed: '', // Not used in new app
    gpsDatum: project.gpsDatum || 'WGS84',
    magneticDeclination: project.magneticDeclination || '',
    notes: project.notes || '',
    date: project.date || new Date().toISOString(),
    modifiedTimestamp: new Date().toISOString(),
    projectLocation: '', // Not used in new folder structure
    datasets: (project.datasets || []).map(serializeDataset),
    groups: project.groups || [], // Not implemented yet
    tags: project.tags || [], // Not implemented yet
  };
}

/**
 * Serialize a dataset to legacy format
 */
function serializeDataset(dataset) {
  return {
    id: dataset.id,
    name: dataset.name || '',
    date: dataset.date || new Date().toISOString(),
    modifiedTimestamp: new Date().toISOString(),
    samples: (dataset.samples || []).map(serializeSample),
  };
}

/**
 * Serialize a sample to legacy format
 */
function serializeSample(sample) {
  return {
    id: sample.id,
    existsOnServer: sample.existsOnServer || false,
    label: sample.label || '',
    sampleID: sample.sampleID || '',
    longitude: sample.longitude || 0,
    latitude: sample.latitude || 0,
    mainSamplingPurpose: sample.mainSamplingPurpose || '',
    sampleDescription: sample.sampleDescription || '',
    materialType: sample.materialType || '',
    inplacenessOfSample: sample.inplacenessOfSample || '',
    orientedSample: sample.orientedSample || '',
    sampleSize: sample.sampleSize || '',
    degreeOfWeathering: sample.degreeOfWeathering || '',
    sampleNotes: sample.sampleNotes || '',
    sampleType: sample.sampleType || '',
    color: sample.color || '',
    lithology: sample.lithology || '',
    sampleUnit: sample.sampleUnit || '',
    otherMaterialType: sample.otherMaterialType || '',
    sampleOrientationNotes: sample.sampleOrientationNotes || '',
    otherSamplingPurpose: sample.otherSamplingPurpose || '',
    micrographs: (sample.micrographs || []).map(serializeMicrograph),
    isExpanded: sample.isExpanded || false,
    isSpotExpanded: sample.isSpotExpanded || false,
  };
}

/**
 * Serialize a micrograph to legacy format
 */
function serializeMicrograph(micrograph) {
  return {
    id: micrograph.id,
    parentID: micrograph.parentID || undefined,
    name: micrograph.name || '',
    imageType: micrograph.imageType || '',
    width: micrograph.width || micrograph.imageWidth || 0,
    height: micrograph.height || micrograph.imageHeight || 0,
    opacity: micrograph.opacity || 1.0,
    scale: micrograph.scale || '',
    polish: micrograph.polish || false,
    polishDescription: micrograph.polishDescription || '',
    description: micrograph.description || '',
    notes: micrograph.notes || '',
    scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter || 100,
    offsetInParent: micrograph.offsetInParent || undefined,
    pointInParent: micrograph.pointInParent || undefined,
    rotation: micrograph.rotation || 0,
    mineralogy: micrograph.mineralogy || undefined,
    spots: (micrograph.spots || []).map(serializeSpot),
    grainInfo: micrograph.grainInfo || undefined,
    fabricInfo: micrograph.fabricInfo || undefined,
    orientationInfo: micrograph.orientationInfo || undefined,
    associatedFiles: micrograph.associatedFiles || [],
    links: micrograph.links || [],
    instrument: micrograph.instrument || undefined,
    clasticDeformationBandInfo: micrograph.clasticDeformationBandInfo || undefined,
    grainBoundaryInfo: micrograph.grainBoundaryInfo || undefined,
    intraGrainInfo: micrograph.intraGrainInfo || undefined,
    veinInfo: micrograph.veinInfo || undefined,
    pseudotachylyteInfo: micrograph.pseudotachylyteInfo || undefined,
    foldInfo: micrograph.foldInfo || undefined,
    faultsShearZonesInfo: micrograph.faultsShearZonesInfo || undefined,
    extinctionMicrostructureInfo: micrograph.extinctionMicrostructureInfo || undefined,
    lithologyInfo: micrograph.lithologyInfo || undefined,
    fractureInfo: micrograph.fractureInfo || undefined,
    isMicroVisible: micrograph.isMicroVisible !== undefined ? micrograph.isMicroVisible : true,
    isExpanded: micrograph.isExpanded || false,
    isSpotExpanded: micrograph.isSpotExpanded || false,
    isFlipped: micrograph.isFlipped || false,
    tags: micrograph.tags || [],
  };
}

/**
 * Serialize a spot to legacy format
 */
function serializeSpot(spot) {
  return {
    id: spot.id,
    name: spot.name || '',
    labelColor: spot.labelColor || '',
    showLabel: spot.showLabel || false,
    color: spot.color || '',
    date: spot.date || '',
    time: spot.time || '',
    notes: spot.notes || '',
    modifiedTimestamp: spot.modifiedTimestamp || Date.now(),
    geometryType: spot.geometryType || '',
    points: spot.points || [],
    mineralogy: spot.mineralogy || undefined,
    grainInfo: spot.grainInfo || undefined,
    fabricInfo: spot.fabricInfo || undefined,
    associatedFiles: spot.associatedFiles || [],
    links: spot.links || [],
    clasticDeformationBandInfo: spot.clasticDeformationBandInfo || undefined,
    grainBoundaryInfo: spot.grainBoundaryInfo || undefined,
    intraGrainInfo: spot.intraGrainInfo || undefined,
    veinInfo: spot.veinInfo || undefined,
    pseudotachylyteInfo: spot.pseudotachylyteInfo || undefined,
    foldInfo: spot.foldInfo || undefined,
    faultsShearZonesInfo: spot.faultsShearZonesInfo || undefined,
    extinctionMicrostructureInfo: spot.extinctionMicrostructureInfo || undefined,
    lithologyInfo: spot.lithologyInfo || undefined,
    fractureInfo: spot.fractureInfo || undefined,
    tags: spot.tags || [],
  };
}

/**
 * Convert legacy JSON format to internal project format
 * @param {Object} legacyJson - Legacy format JSON
 * @returns {Object} Internal project format
 */
function deserializeFromLegacyFormat(legacyJson) {
  return {
    id: legacyJson.id,
    name: legacyJson.name,
    startDate: legacyJson.startDate || undefined,
    endDate: legacyJson.endDate || undefined,
    purposeOfStudy: legacyJson.purposeOfStudy || undefined,
    otherTeamMembers: legacyJson.otherTeamMembers || undefined,
    areaOfInterest: legacyJson.areaOfInterest || undefined,
    gpsDatum: legacyJson.gpsDatum || 'WGS84',
    magneticDeclination: legacyJson.magneticDeclination || undefined,
    notes: legacyJson.notes || undefined,
    date: legacyJson.date,
    datasets: (legacyJson.datasets || []).map(deserializeDataset),
    groups: legacyJson.groups || [],
    tags: legacyJson.tags || [],
  };
}

/**
 * Deserialize a dataset from legacy format
 */
function deserializeDataset(dataset) {
  return {
    id: dataset.id,
    name: dataset.name,
    date: dataset.date,
    samples: (dataset.samples || []).map(deserializeSample),
  };
}

/**
 * Deserialize a sample from legacy format
 */
function deserializeSample(sample) {
  return {
    id: sample.id,
    existsOnServer: sample.existsOnServer,
    label: sample.label,
    sampleID: sample.sampleID,
    longitude: sample.longitude,
    latitude: sample.latitude,
    mainSamplingPurpose: sample.mainSamplingPurpose,
    sampleDescription: sample.sampleDescription,
    materialType: sample.materialType,
    inplacenessOfSample: sample.inplacenessOfSample,
    orientedSample: sample.orientedSample,
    sampleSize: sample.sampleSize,
    degreeOfWeathering: sample.degreeOfWeathering,
    sampleNotes: sample.sampleNotes,
    sampleType: sample.sampleType,
    color: sample.color,
    lithology: sample.lithology,
    sampleUnit: sample.sampleUnit,
    otherMaterialType: sample.otherMaterialType,
    sampleOrientationNotes: sample.sampleOrientationNotes,
    otherSamplingPurpose: sample.otherSamplingPurpose,
    micrographs: (sample.micrographs || []).map(deserializeMicrograph),
    isExpanded: sample.isExpanded,
    isSpotExpanded: sample.isSpotExpanded,
  };
}

/**
 * Deserialize a micrograph from legacy format
 */
function deserializeMicrograph(micrograph) {
  return {
    id: micrograph.id,
    parentID: micrograph.parentID,
    name: micrograph.name,
    imageType: micrograph.imageType,
    // NOTE: Runtime-only fields NOT in legacy schema (do not serialize):
    //   - imagePath (runtime file path, images stored separately in .smz)
    //   - imageWidth/imageHeight (use width/height instead)
    width: micrograph.width,
    height: micrograph.height,
    opacity: micrograph.opacity,
    scale: micrograph.scale,
    polish: micrograph.polish,
    polishDescription: micrograph.polishDescription,
    description: micrograph.description,
    notes: micrograph.notes,
    scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter,
    offsetInParent: micrograph.offsetInParent,
    pointInParent: micrograph.pointInParent,
    rotation: micrograph.rotation,
    mineralogy: micrograph.mineralogy,
    spots: (micrograph.spots || []).map(deserializeSpot),
    grainInfo: micrograph.grainInfo,
    fabricInfo: micrograph.fabricInfo,
    orientationInfo: micrograph.orientationInfo,
    associatedFiles: micrograph.associatedFiles,
    links: micrograph.links,
    instrument: micrograph.instrument,
    clasticDeformationBandInfo: micrograph.clasticDeformationBandInfo,
    grainBoundaryInfo: micrograph.grainBoundaryInfo,
    intraGrainInfo: micrograph.intraGrainInfo,
    veinInfo: micrograph.veinInfo,
    pseudotachylyteInfo: micrograph.pseudotachylyteInfo,
    foldInfo: micrograph.foldInfo,
    faultsShearZonesInfo: micrograph.faultsShearZonesInfo,
    extinctionMicrostructureInfo: micrograph.extinctionMicrostructureInfo,
    lithologyInfo: micrograph.lithologyInfo,
    fractureInfo: micrograph.fractureInfo,
    isMicroVisible: micrograph.isMicroVisible,
    isExpanded: micrograph.isExpanded,
    isSpotExpanded: micrograph.isSpotExpanded,
    isFlipped: micrograph.isFlipped,
    tags: micrograph.tags,
  };
}

/**
 * Deserialize a spot from legacy format
 */
function deserializeSpot(spot) {
  return {
    id: spot.id,
    name: spot.name,
    labelColor: spot.labelColor,
    showLabel: spot.showLabel,
    color: spot.color,
    date: spot.date,
    time: spot.time,
    notes: spot.notes,
    modifiedTimestamp: spot.modifiedTimestamp,
    geometryType: spot.geometryType,
    points: spot.points,
    mineralogy: spot.mineralogy,
    grainInfo: spot.grainInfo,
    fabricInfo: spot.fabricInfo,
    associatedFiles: spot.associatedFiles,
    links: spot.links,
    clasticDeformationBandInfo: spot.clasticDeformationBandInfo,
    grainBoundaryInfo: spot.grainBoundaryInfo,
    intraGrainInfo: spot.intraGrainInfo,
    veinInfo: spot.veinInfo,
    pseudotachylyteInfo: spot.pseudotachylyteInfo,
    foldInfo: spot.foldInfo,
    faultsShearZonesInfo: spot.faultsShearZonesInfo,
    extinctionMicrostructureInfo: spot.extinctionMicrostructureInfo,
    lithologyInfo: spot.lithologyInfo,
    fractureInfo: spot.fractureInfo,
    tags: spot.tags,
  };
}

module.exports = {
  saveProjectJson,
  loadProjectJson,
  serializeToLegacyFormat,
  deserializeFromLegacyFormat,
};
