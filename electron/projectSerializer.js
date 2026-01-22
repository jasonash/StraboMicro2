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
 * Round a number to a safe precision for PostgreSQL double precision.
 * PostgreSQL double precision has ~15-17 significant decimal digits.
 * We round to 10 decimal places to avoid floating point representation issues
 * like 14590.699999999999 which should be 14590.7
 * @param {number|undefined} value - The number to round
 * @returns {number|undefined} Rounded number or undefined if input is not a number
 */
function roundForDb(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !isFinite(value)) return value;
  // Round to 10 decimal places - safe for double precision and fixes JS float issues
  return Math.round(value * 1e10) / 1e10;
}

/**
 * Round all numeric properties in an object recursively.
 * Used for objects like offsetInParent, pointInParent, etc.
 * @param {Object|undefined} obj - Object with numeric properties
 * @returns {Object|undefined} Object with rounded numeric properties
 */
function roundObjectNumbers(obj) {
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number') {
      result[key] = roundForDb(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = roundObjectNumbers(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively fix corrupted array data throughout entire data structure.
 * Arrays that were incorrectly saved as objects with numeric keys are converted back.
 * Example: { "0": {...}, "1": {...} } becomes [{...}, {...}]
 *
 * This function recursively traverses ALL nested objects and arrays to fix corruption
 * at any depth in the data structure.
 *
 * @param {any} value - Any value that might contain corrupted arrays
 * @returns {any} Fixed value with all corrupted arrays restored
 */
function fixCorruptedArraysDeep(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object') return value;

  // If it's already an array, recursively fix its contents
  if (Array.isArray(value)) {
    return value.map(item => fixCorruptedArraysDeep(item));
  }

  // Check if this object has only numeric keys (corrupted array)
  const keys = Object.keys(value);
  if (keys.length > 0) {
    const allNumericKeys = keys.every(key => /^\d+$/.test(key));
    if (allNumericKeys) {
      // Convert object with numeric keys back to array
      const maxIndex = Math.max(...keys.map(k => parseInt(k, 10)));
      const result = [];
      for (let i = 0; i <= maxIndex; i++) {
        const item = value[String(i)];
        if (item !== undefined) {
          // Recursively fix the item too
          result.push(fixCorruptedArraysDeep(item));
        }
      }
      log.warn('[ProjectSerializer] Fixed corrupted array:', { keys: keys.slice(0, 5), length: result.length });
      return result;
    }
  }

  // It's a regular object - recursively fix all its properties
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = fixCorruptedArraysDeep(val);
  }
  return result;
}

// Alias for backwards compatibility
const fixInfoObjectArrays = fixCorruptedArraysDeep;

/**
 * Serialize a coordinate object (SimpleCoordType) to legacy format.
 * Legacy schema uses uppercase X and Y, but internal code may use lowercase.
 * This function normalizes to uppercase and rounds values.
 * @param {Object|undefined} coord - Coordinate object with x/X and y/Y properties
 * @returns {Object|undefined} Object with uppercase X, Y and rounded values
 */
function serializeCoordinate(coord) {
  if (coord === undefined || coord === null) return undefined;
  if (typeof coord !== 'object') return undefined;

  // Handle both lowercase (x, y) and uppercase (X, Y) input
  const x = coord.X !== undefined ? coord.X : coord.x;
  const y = coord.Y !== undefined ? coord.Y : coord.y;

  if (x === undefined && y === undefined) return undefined;

  return {
    X: roundForDb(x),
    Y: roundForDb(y),
  };
}

/**
 * Deserialize a coordinate object from legacy format.
 * Legacy schema uses uppercase X and Y, but we normalize to uppercase for internal use.
 * Handles both uppercase (legacy) and lowercase (if present) input.
 * @param {Object|undefined} coord - Coordinate object from JSON
 * @returns {Object|undefined} Object with uppercase X, Y
 */
function deserializeCoordinate(coord) {
  if (coord === undefined || coord === null) return undefined;
  if (typeof coord !== 'object') return undefined;

  // Handle both lowercase (x, y) and uppercase (X, Y) input
  const x = coord.X !== undefined ? coord.X : coord.x;
  const y = coord.Y !== undefined ? coord.Y : coord.y;

  if (x === undefined && y === undefined) return undefined;

  // Return with uppercase keys (legacy format)
  return { X: x, Y: y };
}

/**
 * Clean an object for database compatibility:
 * - Converts null values to undefined (omitted from JSON)
 * - Rounds numeric values
 * - Recursively processes nested objects and arrays
 * Used for instrument objects and other nested data.
 * @param {Object|Array|undefined} obj - Object or array to clean
 * @returns {Object|Array|undefined} Cleaned object/array or undefined if empty/null
 */
function cleanObjectForDb(obj) {
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj !== 'object') return obj;

  // Handle arrays - preserve array structure
  if (Array.isArray(obj)) {
    const result = obj
      .map(item => cleanObjectForDb(item))
      .filter(item => item !== undefined);
    return result.length > 0 ? result : undefined;
  }

  // Handle objects
  const result = {};
  let hasValues = false;

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      // Skip null/undefined values - they will be omitted from JSON
      continue;
    } else if (typeof value === 'number') {
      result[key] = roundForDb(value);
      hasValues = true;
    } else if (typeof value === 'object') {
      const cleaned = cleanObjectForDb(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
        hasValues = true;
      }
    } else if (value !== '') {
      // Keep non-empty strings and other types
      result[key] = value;
      hasValues = true;
    }
  }

  return hasValues ? result : undefined;
}

/**
 * Serialize project data to legacy JSON format and save to disk
 * @param {Object} project - Project data from Zustand store
 * @param {string} projectId - UUID of the project
 * @returns {Promise<string>} Path to saved project.json
 */
async function saveProjectJson(project, projectId) {
  try {
    log.info(`[ProjectSerializer] Serializing project: ${projectId}`);

    if (!project) {
      throw new Error('Cannot save: project is null or undefined');
    }
    if (!projectId) {
      throw new Error('Cannot save: projectId is null or undefined');
    }

    // Get project folder paths
    const folderPaths = projectFolders.getProjectFolderPaths(projectId);
    const projectJsonPath = folderPaths.projectJson;

    // Ensure parent directory exists (handles edge case where folder was deleted)
    const parentDir = path.dirname(projectJsonPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

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

    // Fix any corrupted arrays in the entire JSON structure before deserializing
    // This repairs data that was incorrectly saved as objects with numeric keys
    const fixedJson = fixCorruptedArraysDeep(legacyJson);

    // Deserialize from legacy format
    const project = deserializeFromLegacyFormat(fixedJson);

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
    // Quick Spot Presets (project-level)
    presets: project.presets || undefined,
    presetKeyBindings: project.presetKeyBindings || undefined,
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
 * Note: Numeric values are rounded to avoid PostgreSQL double precision issues
 */
function serializeSample(sample) {
  return {
    id: sample.id,
    existsOnServer: sample.existsOnServer || false,
    label: sample.label || '',
    sampleID: sample.sampleID || '',
    igsn: sample.igsn || '',
    longitude: roundForDb(sample.longitude) || 0,
    latitude: roundForDb(sample.latitude) || 0,
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
 * Note: Numeric values are rounded to avoid PostgreSQL double precision issues
 * Note: Nested objects (instrument, *Info) are cleaned to remove null values
 */
function serializeMicrograph(micrograph) {
  return {
    id: micrograph.id,
    parentID: micrograph.parentID || undefined,
    name: micrograph.name || '',
    imageType: micrograph.imageType || '',
    width: micrograph.width || micrograph.imageWidth || 0,
    height: micrograph.height || micrograph.imageHeight || 0,
    imageWidth: micrograph.width || micrograph.imageWidth || 0,
    imageHeight: micrograph.height || micrograph.imageHeight || 0,
    opacity: roundForDb(micrograph.opacity) || 1.0,
    scale: micrograph.scale || '',
    polish: micrograph.polish || false,
    polishDescription: micrograph.polishDescription || '',
    description: micrograph.description || '',
    notes: micrograph.notes || '',
    scalePixelsPerCentimeter: roundForDb(micrograph.scalePixelsPerCentimeter) || 100,
    offsetInParent: serializeCoordinate(micrograph.offsetInParent),
    pointInParent: serializeCoordinate(micrograph.pointInParent),
    rotation: roundForDb(micrograph.rotation) || 0,
    mineralogy: cleanObjectForDb(micrograph.mineralogy),
    spots: (micrograph.spots || []).map(serializeSpot),
    grainInfo: cleanObjectForDb(micrograph.grainInfo),
    fabricInfo: cleanObjectForDb(micrograph.fabricInfo),
    orientationInfo: cleanObjectForDb(micrograph.orientationInfo),
    associatedFiles: micrograph.associatedFiles || [],
    links: micrograph.links || [],
    instrument: cleanObjectForDb(micrograph.instrument),
    clasticDeformationBandInfo: cleanObjectForDb(micrograph.clasticDeformationBandInfo),
    grainBoundaryInfo: cleanObjectForDb(micrograph.grainBoundaryInfo),
    intraGrainInfo: cleanObjectForDb(micrograph.intraGrainInfo),
    veinInfo: cleanObjectForDb(micrograph.veinInfo),
    pseudotachylyteInfo: cleanObjectForDb(micrograph.pseudotachylyteInfo),
    foldInfo: cleanObjectForDb(micrograph.foldInfo),
    faultsShearZonesInfo: cleanObjectForDb(micrograph.faultsShearZonesInfo),
    extinctionMicrostructureInfo: cleanObjectForDb(micrograph.extinctionMicrostructureInfo),
    lithologyInfo: cleanObjectForDb(micrograph.lithologyInfo),
    fractureInfo: cleanObjectForDb(micrograph.fractureInfo),
    isMicroVisible: micrograph.isMicroVisible !== undefined ? micrograph.isMicroVisible : true,
    isExpanded: micrograph.isExpanded || false,
    isSpotExpanded: micrograph.isSpotExpanded || false,
    isFlipped: micrograph.isFlipped || false,
    tags: micrograph.tags || [],
    // Affine transform placement data
    placementType: micrograph.placementType || undefined,
    affineMatrix: micrograph.affineMatrix || undefined,
    affineControlPoints: micrograph.affineControlPoints || undefined,
    affineBoundsOffset: micrograph.affineBoundsOffset || undefined,
    affineTransformedWidth: micrograph.affineTransformedWidth || undefined,
    affineTransformedHeight: micrograph.affineTransformedHeight || undefined,
    affineTileHash: micrograph.affineTileHash || undefined,
    // XPL/PPL sibling pairing
    siblingImageId: micrograph.siblingImageId || undefined,
    isPrimarySibling: micrograph.isPrimarySibling !== undefined ? micrograph.isPrimarySibling : undefined,
    siblingScaleFactor: roundForDb(micrograph.siblingScaleFactor) || undefined,
  };
}

/**
 * Serialize a spot to legacy format
 * Note: Numeric values are rounded to avoid PostgreSQL double precision issues
 * Note: Nested objects (*Info) are cleaned to remove null values
 */
function serializeSpot(spot) {
  // Round numeric values in points array
  const roundedPoints = (spot.points || []).map(point => {
    if (typeof point === 'object' && point !== null) {
      return roundObjectNumbers(point);
    }
    return point;
  });

  return {
    id: spot.id,
    name: spot.name || '',
    labelColor: spot.labelColor || '',
    showLabel: spot.showLabel || false,
    color: spot.color || '',
    opacity: roundForDb(spot.opacity),
    date: spot.date || '',
    time: spot.time || '',
    notes: spot.notes || '',
    modifiedTimestamp: spot.modifiedTimestamp || Date.now(),
    geometryType: spot.geometryType || '',
    points: roundedPoints,
    mineralogy: cleanObjectForDb(spot.mineralogy),
    grainInfo: cleanObjectForDb(spot.grainInfo),
    fabricInfo: cleanObjectForDb(spot.fabricInfo),
    associatedFiles: spot.associatedFiles || [],
    links: spot.links || [],
    clasticDeformationBandInfo: cleanObjectForDb(spot.clasticDeformationBandInfo),
    grainBoundaryInfo: cleanObjectForDb(spot.grainBoundaryInfo),
    intraGrainInfo: cleanObjectForDb(spot.intraGrainInfo),
    veinInfo: cleanObjectForDb(spot.veinInfo),
    pseudotachylyteInfo: cleanObjectForDb(spot.pseudotachylyteInfo),
    foldInfo: cleanObjectForDb(spot.foldInfo),
    faultsShearZonesInfo: cleanObjectForDb(spot.faultsShearZonesInfo),
    extinctionMicrostructureInfo: cleanObjectForDb(spot.extinctionMicrostructureInfo),
    lithologyInfo: cleanObjectForDb(spot.lithologyInfo),
    fractureInfo: cleanObjectForDb(spot.fractureInfo),
    tags: spot.tags || [],
    // Grain detection metadata
    generationMethod: spot.generationMethod || undefined,
    areaPixels: roundForDb(spot.areaPixels),
    centroid: serializeCoordinate(spot.centroid),
    // Merge/split provenance
    mergedFrom: spot.mergedFrom || undefined,
    splitFrom: spot.splitFrom || undefined,
    // Archive status
    archived: spot.archived || undefined,
    // Quick Spot Presets tracking
    appliedPresetIds: spot.appliedPresetIds || undefined,
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
    // Quick Spot Presets (project-level)
    presets: legacyJson.presets || undefined,
    presetKeyBindings: legacyJson.presetKeyBindings || undefined,
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
    igsn: sample.igsn,
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
    // Legacy JSON uses width/height, but renderer expects imageWidth/imageHeight
    width: micrograph.width,
    height: micrograph.height,
    imageWidth: micrograph.width,   // Alias for renderer compatibility
    imageHeight: micrograph.height, // Alias for renderer compatibility
    opacity: micrograph.opacity,
    scale: micrograph.scale,
    polish: micrograph.polish,
    polishDescription: micrograph.polishDescription,
    description: micrograph.description,
    notes: micrograph.notes,
    scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter,
    offsetInParent: deserializeCoordinate(micrograph.offsetInParent),
    pointInParent: deserializeCoordinate(micrograph.pointInParent),
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
    // Affine transform placement data
    placementType: micrograph.placementType,
    affineMatrix: micrograph.affineMatrix,
    affineControlPoints: micrograph.affineControlPoints,
    affineBoundsOffset: micrograph.affineBoundsOffset,
    affineTransformedWidth: micrograph.affineTransformedWidth,
    affineTransformedHeight: micrograph.affineTransformedHeight,
    affineTileHash: micrograph.affineTileHash,
    // XPL/PPL sibling pairing
    siblingImageId: micrograph.siblingImageId,
    isPrimarySibling: micrograph.isPrimarySibling,
    siblingScaleFactor: micrograph.siblingScaleFactor,
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
    opacity: spot.opacity,
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
    // Grain detection metadata
    generationMethod: spot.generationMethod,
    areaPixels: spot.areaPixels,
    centroid: deserializeCoordinate(spot.centroid),
    // Merge/split provenance
    mergedFrom: spot.mergedFrom,
    splitFrom: spot.splitFrom,
    // Archive status
    archived: spot.archived,
    // Quick Spot Presets tracking
    appliedPresetIds: spot.appliedPresetIds,
  };
}

module.exports = {
  saveProjectJson,
  loadProjectJson,
  serializeToLegacyFormat,
  deserializeFromLegacyFormat,
};
