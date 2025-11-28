/**
 * Version History Service
 *
 * Manages project version history with full JSON snapshots.
 * Stores versions in app userData directory (not exported with project).
 *
 * Features:
 * - Create version snapshots on save
 * - List all versions for a project
 * - Restore to previous versions
 * - Named versions (checkpoints that don't auto-prune)
 * - Automatic pruning of old versions
 * - Diff computation between versions
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const log = require('electron-log');

class VersionHistoryService {
  constructor() {
    this.baseDir = path.join(app.getPath('userData'), 'version-history');
    this.manifestCache = new Map();
    this._ensureBaseDir();
  }

  /**
   * Ensure the base version history directory exists
   */
  _ensureBaseDir() {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
        log.info('[VersionHistory] Created base directory:', this.baseDir);
      }
    } catch (error) {
      log.error('[VersionHistory] Failed to create base directory:', error);
    }
  }

  /**
   * Get the directory path for a project's version history
   */
  _getProjectDir(projectId) {
    return path.join(this.baseDir, projectId);
  }

  /**
   * Get the manifest file path for a project
   */
  _getManifestPath(projectId) {
    return path.join(this._getProjectDir(projectId), 'manifest.json');
  }

  /**
   * Get the version file path
   */
  _getVersionPath(projectId, versionNumber) {
    const paddedVersion = String(versionNumber).padStart(6, '0');
    return path.join(this._getProjectDir(projectId), `v_${paddedVersion}.json`);
  }

  /**
   * Compute SHA-256 checksum of data
   */
  _computeChecksum(data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Create an empty manifest for a new project
   */
  _createEmptyManifest(projectId) {
    return {
      schemaVersion: '1.0',
      projectId,
      versions: [],
      stats: {
        totalVersions: 0,
        totalSizeBytes: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      },
      pruningPolicy: {
        maxVersions: 200,
        maxAgeDays: 30,
        minVersionsToKeep: 10,
      },
    };
  }

  /**
   * Load manifest from disk (with caching)
   */
  async _loadManifest(projectId) {
    // Check cache first
    if (this.manifestCache.has(projectId)) {
      return this.manifestCache.get(projectId);
    }

    const manifestPath = this._getManifestPath(projectId);

    try {
      const data = await fs.promises.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(data);
      this.manifestCache.set(projectId, manifest);
      return manifest;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create new manifest
        const manifest = this._createEmptyManifest(projectId);
        this.manifestCache.set(projectId, manifest);
        return manifest;
      }
      log.error('[VersionHistory] Failed to load manifest:', error);
      throw error;
    }
  }

  /**
   * Save manifest to disk
   */
  async _saveManifest(projectId, manifest) {
    const projectDir = this._getProjectDir(projectId);
    const manifestPath = this._getManifestPath(projectId);

    // Ensure project directory exists
    if (!fs.existsSync(projectDir)) {
      await fs.promises.mkdir(projectDir, { recursive: true });
    }

    // Update stats
    manifest.stats.totalVersions = manifest.versions.length;
    manifest.stats.totalSizeBytes = manifest.versions.reduce((sum, v) => sum + v.sizeBytes, 0);

    if (manifest.versions.length > 0) {
      const timestamps = manifest.versions.map((v) => v.timestamp);
      manifest.stats.oldestTimestamp = timestamps[timestamps.length - 1];
      manifest.stats.newestTimestamp = timestamps[0];
    }

    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // Update cache
    this.manifestCache.set(projectId, manifest);
  }

  /**
   * Compute change statistics between two project states
   */
  _computeChangeStats(oldProject, newProject) {
    const stats = {
      datasetsAdded: 0,
      datasetsRemoved: 0,
      samplesAdded: 0,
      samplesRemoved: 0,
      micrographsAdded: 0,
      micrographsRemoved: 0,
      spotsAdded: 0,
      spotsRemoved: 0,
    };

    if (!oldProject) {
      // First version - count everything as added
      const newDatasets = newProject?.datasets || [];
      stats.datasetsAdded = newDatasets.length;

      for (const dataset of newDatasets) {
        const samples = dataset.samples || [];
        stats.samplesAdded += samples.length;

        for (const sample of samples) {
          const micrographs = sample.micrographs || [];
          stats.micrographsAdded += micrographs.length;

          for (const micrograph of micrographs) {
            stats.spotsAdded += (micrograph.spots || []).length;
          }
        }
      }

      return stats;
    }

    // Compare datasets
    const oldDatasetIds = new Set((oldProject.datasets || []).map((d) => d.id));
    const newDatasetIds = new Set((newProject?.datasets || []).map((d) => d.id));

    for (const id of newDatasetIds) {
      if (!oldDatasetIds.has(id)) stats.datasetsAdded++;
    }
    for (const id of oldDatasetIds) {
      if (!newDatasetIds.has(id)) stats.datasetsRemoved++;
    }

    // Compare samples
    const oldSampleIds = new Set();
    const newSampleIds = new Set();

    for (const dataset of oldProject.datasets || []) {
      for (const sample of dataset.samples || []) {
        oldSampleIds.add(sample.id);
      }
    }
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        newSampleIds.add(sample.id);
      }
    }

    for (const id of newSampleIds) {
      if (!oldSampleIds.has(id)) stats.samplesAdded++;
    }
    for (const id of oldSampleIds) {
      if (!newSampleIds.has(id)) stats.samplesRemoved++;
    }

    // Compare micrographs
    const oldMicrographIds = new Set();
    const newMicrographIds = new Set();

    for (const dataset of oldProject.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          oldMicrographIds.add(micrograph.id);
        }
      }
    }
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          newMicrographIds.add(micrograph.id);
        }
      }
    }

    for (const id of newMicrographIds) {
      if (!oldMicrographIds.has(id)) stats.micrographsAdded++;
    }
    for (const id of oldMicrographIds) {
      if (!newMicrographIds.has(id)) stats.micrographsRemoved++;
    }

    // Compare spots
    const oldSpotIds = new Set();
    const newSpotIds = new Set();

    for (const dataset of oldProject.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          for (const spot of micrograph.spots || []) {
            oldSpotIds.add(spot.id);
          }
        }
      }
    }
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          for (const spot of micrograph.spots || []) {
            newSpotIds.add(spot.id);
          }
        }
      }
    }

    for (const id of newSpotIds) {
      if (!oldSpotIds.has(id)) stats.spotsAdded++;
    }
    for (const id of oldSpotIds) {
      if (!newSpotIds.has(id)) stats.spotsRemoved++;
    }

    return stats;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Create a new version snapshot
   * @param {string} projectId - Project UUID
   * @param {Object} projectState - Current project state
   * @param {string|null} name - Optional name for named versions
   * @param {string|null} description - Optional description
   * @returns {Promise<{success: boolean, version?: number, error?: string}>}
   */
  async createVersion(projectId, projectState, name = null, description = null) {
    try {
      const manifest = await this._loadManifest(projectId);

      // Get previous version for change stats
      let previousProject = null;
      if (manifest.versions.length > 0) {
        const latestVersion = manifest.versions[0].version;
        const latestData = await this.getVersion(projectId, latestVersion);
        previousProject = latestData?.project;
      }

      // Compute next version number
      const nextVersion =
        manifest.versions.length > 0 ? Math.max(...manifest.versions.map((v) => v.version)) + 1 : 1;

      const timestamp = new Date().toISOString();
      const checksum = this._computeChecksum(projectState);
      const changeStats = this._computeChangeStats(previousProject, projectState);

      // Create version file
      const versionData = {
        version: nextVersion,
        timestamp,
        checksum,
        project: projectState,
      };

      const versionJson = JSON.stringify(versionData, null, 2);
      const versionPath = this._getVersionPath(projectId, nextVersion);

      // Ensure project directory exists
      const projectDir = this._getProjectDir(projectId);
      if (!fs.existsSync(projectDir)) {
        await fs.promises.mkdir(projectDir, { recursive: true });
      }

      await fs.promises.writeFile(versionPath, versionJson, 'utf-8');

      // Create version entry
      const versionEntry = {
        version: nextVersion,
        timestamp,
        name: name || null,
        description: description || null,
        isAutoSave: name === null,
        sizeBytes: Buffer.byteLength(versionJson, 'utf-8'),
        changeStats,
      };

      // Add to manifest (newest first)
      manifest.versions.unshift(versionEntry);
      await this._saveManifest(projectId, manifest);

      log.info(
        `[VersionHistory] Created version ${nextVersion} for project ${projectId}`,
        changeStats
      );

      // Trigger background pruning (non-blocking)
      this.pruneVersions(projectId).catch((err) =>
        log.error('[VersionHistory] Pruning error:', err)
      );

      return { success: true, version: nextVersion };
    } catch (error) {
      log.error('[VersionHistory] Failed to create version:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all versions for a project
   * @param {string} projectId - Project UUID
   * @returns {Promise<VersionEntry[]>} - Version entries (newest first)
   */
  async listVersions(projectId) {
    try {
      const manifest = await this._loadManifest(projectId);
      return manifest.versions;
    } catch (error) {
      log.error('[VersionHistory] Failed to list versions:', error);
      return [];
    }
  }

  /**
   * Get a specific version's data
   * @param {string} projectId - Project UUID
   * @param {number} versionNumber - Version number
   * @returns {Promise<{version: number, timestamp: string, project: Object}|null>}
   */
  async getVersion(projectId, versionNumber) {
    try {
      const versionPath = this._getVersionPath(projectId, versionNumber);
      const data = await fs.promises.readFile(versionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log.error('[VersionHistory] Failed to get version:', error);
      }
      return null;
    }
  }

  /**
   * Get version entry metadata (without loading full project)
   * @param {string} projectId - Project UUID
   * @param {number} versionNumber - Version number
   * @returns {Promise<VersionEntry|null>}
   */
  async getVersionInfo(projectId, versionNumber) {
    try {
      const manifest = await this._loadManifest(projectId);
      return manifest.versions.find((v) => v.version === versionNumber) || null;
    } catch (error) {
      log.error('[VersionHistory] Failed to get version info:', error);
      return null;
    }
  }

  /**
   * Restore a specific version (returns project state, doesn't apply it)
   * @param {string} projectId - Project UUID
   * @param {number} versionNumber - Version number to restore
   * @returns {Promise<{success: boolean, project?: Object, error?: string}>}
   */
  async restoreVersion(projectId, versionNumber) {
    try {
      const versionData = await this.getVersion(projectId, versionNumber);

      if (!versionData) {
        return { success: false, error: `Version ${versionNumber} not found` };
      }

      // Verify checksum
      const computedChecksum = this._computeChecksum(versionData.project);
      if (computedChecksum !== versionData.checksum) {
        log.warn('[VersionHistory] Checksum mismatch for version', versionNumber);
        // Continue anyway - the data is still usable
      }

      return { success: true, project: versionData.project };
    } catch (error) {
      log.error('[VersionHistory] Failed to restore version:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a specific version
   * @param {string} projectId - Project UUID
   * @param {number} versionNumber - Version number to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteVersion(projectId, versionNumber) {
    try {
      const manifest = await this._loadManifest(projectId);
      const versionIndex = manifest.versions.findIndex((v) => v.version === versionNumber);

      if (versionIndex === -1) {
        return { success: false, error: `Version ${versionNumber} not found` };
      }

      // Delete version file
      const versionPath = this._getVersionPath(projectId, versionNumber);
      try {
        await fs.promises.unlink(versionPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      // Remove from manifest
      manifest.versions.splice(versionIndex, 1);
      await this._saveManifest(projectId, manifest);

      log.info(`[VersionHistory] Deleted version ${versionNumber} for project ${projectId}`);
      return { success: true };
    } catch (error) {
      log.error('[VersionHistory] Failed to delete version:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all version history for a project
   * Called when opening new project or downloading from server
   * @param {string} projectId - Project UUID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async clearHistory(projectId) {
    try {
      const projectDir = this._getProjectDir(projectId);

      if (fs.existsSync(projectDir)) {
        // Delete all files in the directory
        const files = await fs.promises.readdir(projectDir);
        for (const file of files) {
          await fs.promises.unlink(path.join(projectDir, file));
        }
        // Remove the directory
        await fs.promises.rmdir(projectDir);
      }

      // Clear cache
      this.manifestCache.delete(projectId);

      log.info(`[VersionHistory] Cleared history for project ${projectId}`);
      return { success: true };
    } catch (error) {
      log.error('[VersionHistory] Failed to clear history:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete all version history for a project (alias for clearHistory)
   * @param {string} projectId - Project UUID
   */
  async deleteProjectHistory(projectId) {
    return this.clearHistory(projectId);
  }

  /**
   * Prune old versions based on pruning policy
   * @param {string} projectId - Project UUID
   * @returns {Promise<{success: boolean, prunedCount: number, error?: string}>}
   */
  async pruneVersions(projectId) {
    try {
      const manifest = await this._loadManifest(projectId);
      const { maxVersions, maxAgeDays, minVersionsToKeep } = manifest.pruningPolicy;

      // Separate auto-saves and named versions
      const autoSaveVersions = manifest.versions.filter((v) => v.isAutoSave);
      const namedVersions = manifest.versions.filter((v) => !v.isAutoSave);

      // Keep minimum count - never prune if below threshold
      if (autoSaveVersions.length <= minVersionsToKeep) {
        return { success: true, prunedCount: 0 };
      }

      const now = Date.now();
      const toRemove = [];

      // Sort by version number (oldest first for pruning)
      const sortedAutoSaves = [...autoSaveVersions].sort((a, b) => a.version - b.version);

      for (let i = 0; i < sortedAutoSaves.length; i++) {
        const v = sortedAutoSaves[i];
        const ageDays = (now - new Date(v.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        const remainingCount = autoSaveVersions.length - toRemove.length;

        // Check if we should prune this version
        const exceedsMaxVersions = remainingCount > maxVersions;
        const exceedsMaxAge = ageDays > maxAgeDays;
        const canPrune = remainingCount > minVersionsToKeep;

        if (canPrune && (exceedsMaxVersions || exceedsMaxAge)) {
          toRemove.push(v.version);
        }
      }

      if (toRemove.length === 0) {
        return { success: true, prunedCount: 0 };
      }

      // Delete version files
      for (const vNum of toRemove) {
        const versionPath = this._getVersionPath(projectId, vNum);
        try {
          await fs.promises.unlink(versionPath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            log.warn('[VersionHistory] Failed to delete version file:', vNum, err);
          }
        }
      }

      // Update manifest
      manifest.versions = manifest.versions.filter((v) => !toRemove.includes(v.version));
      await this._saveManifest(projectId, manifest);

      log.info(`[VersionHistory] Pruned ${toRemove.length} versions for project ${projectId}`);
      return { success: true, prunedCount: toRemove.length };
    } catch (error) {
      log.error('[VersionHistory] Failed to prune versions:', error);
      return { success: false, prunedCount: 0, error: error.message };
    }
  }

  /**
   * Compute diff between two versions
   * @param {string} projectId - Project UUID
   * @param {number} versionA - Older version number
   * @param {number} versionB - Newer version number
   * @returns {Promise<{success: boolean, diff?: DiffResult, error?: string}>}
   */
  async computeDiff(projectId, versionA, versionB) {
    try {
      const dataA = await this.getVersion(projectId, versionA);
      const dataB = await this.getVersion(projectId, versionB);

      if (!dataA) {
        return { success: false, error: `Version ${versionA} not found` };
      }
      if (!dataB) {
        return { success: false, error: `Version ${versionB} not found` };
      }

      const diff = this._computeDetailedDiff(dataA.project, dataB.project);
      return { success: true, diff };
    } catch (error) {
      log.error('[VersionHistory] Failed to compute diff:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Compute detailed diff between two project states
   */
  _computeDetailedDiff(oldProject, newProject) {
    const changes = [];

    // Helper to get entity path
    const getPath = (dataset, sample, micrograph) => {
      const parts = [];
      if (dataset) parts.push(dataset.name || 'Unnamed Dataset');
      if (sample) parts.push(sample.name || sample.label || 'Unnamed Sample');
      if (micrograph) parts.push(micrograph.name || 'Unnamed Micrograph');
      return parts.join(' > ');
    };

    // Build lookup maps for old project
    const oldDatasets = new Map();
    const oldSamples = new Map();
    const oldMicrographs = new Map();
    const oldSpots = new Map();
    const oldGroups = new Map();
    const oldTags = new Map();

    for (const dataset of oldProject?.datasets || []) {
      oldDatasets.set(dataset.id, dataset);
      for (const sample of dataset.samples || []) {
        oldSamples.set(sample.id, { sample, dataset });
        for (const micrograph of sample.micrographs || []) {
          oldMicrographs.set(micrograph.id, { micrograph, sample, dataset });
          for (const spot of micrograph.spots || []) {
            oldSpots.set(spot.id, { spot, micrograph, sample, dataset });
          }
        }
      }
    }

    for (const group of oldProject?.groups || []) {
      oldGroups.set(group.id, group);
    }

    for (const tag of oldProject?.tags || []) {
      oldTags.set(tag.id, tag);
    }

    // Compare with new project
    // Datasets
    for (const dataset of newProject?.datasets || []) {
      if (!oldDatasets.has(dataset.id)) {
        changes.push({
          type: 'added',
          entityType: 'dataset',
          entityId: dataset.id,
          entityName: dataset.name || 'Unnamed Dataset',
          parentPath: null,
        });
      } else {
        const oldDataset = oldDatasets.get(dataset.id);
        if (JSON.stringify(oldDataset) !== JSON.stringify(dataset)) {
          // Check if it's just nested changes or actual dataset changes
          const oldCopy = { ...oldDataset, samples: undefined };
          const newCopy = { ...dataset, samples: undefined };
          if (JSON.stringify(oldCopy) !== JSON.stringify(newCopy)) {
            changes.push({
              type: 'modified',
              entityType: 'dataset',
              entityId: dataset.id,
              entityName: dataset.name || 'Unnamed Dataset',
              parentPath: null,
            });
          }
        }
      }
    }

    for (const [id, dataset] of oldDatasets) {
      if (!newProject?.datasets?.find((d) => d.id === id)) {
        changes.push({
          type: 'removed',
          entityType: 'dataset',
          entityId: id,
          entityName: dataset.name || 'Unnamed Dataset',
          parentPath: null,
        });
      }
    }

    // Samples
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (!oldSamples.has(sample.id)) {
          changes.push({
            type: 'added',
            entityType: 'sample',
            entityId: sample.id,
            entityName: sample.name || sample.label || 'Unnamed Sample',
            parentPath: dataset.name || 'Unnamed Dataset',
          });
        } else {
          const oldData = oldSamples.get(sample.id);
          const oldCopy = { ...oldData.sample, micrographs: undefined };
          const newCopy = { ...sample, micrographs: undefined };
          if (JSON.stringify(oldCopy) !== JSON.stringify(newCopy)) {
            changes.push({
              type: 'modified',
              entityType: 'sample',
              entityId: sample.id,
              entityName: sample.name || sample.label || 'Unnamed Sample',
              parentPath: dataset.name || 'Unnamed Dataset',
            });
          }
        }
      }
    }

    for (const [id, data] of oldSamples) {
      let found = false;
      for (const dataset of newProject?.datasets || []) {
        if (dataset.samples?.find((s) => s.id === id)) {
          found = true;
          break;
        }
      }
      if (!found) {
        changes.push({
          type: 'removed',
          entityType: 'sample',
          entityId: id,
          entityName: data.sample.name || data.sample.label || 'Unnamed Sample',
          parentPath: data.dataset.name || 'Unnamed Dataset',
        });
      }
    }

    // Micrographs
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          if (!oldMicrographs.has(micrograph.id)) {
            changes.push({
              type: 'added',
              entityType: 'micrograph',
              entityId: micrograph.id,
              entityName: micrograph.name || 'Unnamed Micrograph',
              parentPath: getPath(dataset, sample, null),
            });
          } else {
            const oldData = oldMicrographs.get(micrograph.id);
            const oldCopy = { ...oldData.micrograph, spots: undefined };
            const newCopy = { ...micrograph, spots: undefined };
            if (JSON.stringify(oldCopy) !== JSON.stringify(newCopy)) {
              changes.push({
                type: 'modified',
                entityType: 'micrograph',
                entityId: micrograph.id,
                entityName: micrograph.name || 'Unnamed Micrograph',
                parentPath: getPath(dataset, sample, null),
              });
            }
          }
        }
      }
    }

    for (const [id, data] of oldMicrographs) {
      let found = false;
      for (const dataset of newProject?.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.find((m) => m.id === id)) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        changes.push({
          type: 'removed',
          entityType: 'micrograph',
          entityId: id,
          entityName: data.micrograph.name || 'Unnamed Micrograph',
          parentPath: getPath(data.dataset, data.sample, null),
        });
      }
    }

    // Spots
    for (const dataset of newProject?.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          for (const spot of micrograph.spots || []) {
            if (!oldSpots.has(spot.id)) {
              changes.push({
                type: 'added',
                entityType: 'spot',
                entityId: spot.id,
                entityName: spot.name || 'Unnamed Spot',
                parentPath: getPath(dataset, sample, micrograph),
              });
            } else {
              const oldSpot = oldSpots.get(spot.id).spot;
              if (JSON.stringify(oldSpot) !== JSON.stringify(spot)) {
                changes.push({
                  type: 'modified',
                  entityType: 'spot',
                  entityId: spot.id,
                  entityName: spot.name || 'Unnamed Spot',
                  parentPath: getPath(dataset, sample, micrograph),
                });
              }
            }
          }
        }
      }
    }

    for (const [id, data] of oldSpots) {
      let found = false;
      for (const dataset of newProject?.datasets || []) {
        for (const sample of dataset.samples || []) {
          for (const micrograph of sample.micrographs || []) {
            if (micrograph.spots?.find((s) => s.id === id)) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
      if (!found) {
        changes.push({
          type: 'removed',
          entityType: 'spot',
          entityId: id,
          entityName: data.spot.name || 'Unnamed Spot',
          parentPath: getPath(data.dataset, data.sample, data.micrograph),
        });
      }
    }

    // Groups
    for (const group of newProject?.groups || []) {
      if (!oldGroups.has(group.id)) {
        changes.push({
          type: 'added',
          entityType: 'group',
          entityId: group.id,
          entityName: group.name || 'Unnamed Group',
          parentPath: null,
        });
      } else {
        const oldGroup = oldGroups.get(group.id);
        if (JSON.stringify(oldGroup) !== JSON.stringify(group)) {
          changes.push({
            type: 'modified',
            entityType: 'group',
            entityId: group.id,
            entityName: group.name || 'Unnamed Group',
            parentPath: null,
          });
        }
      }
    }

    for (const [id, group] of oldGroups) {
      if (!newProject?.groups?.find((g) => g.id === id)) {
        changes.push({
          type: 'removed',
          entityType: 'group',
          entityId: id,
          entityName: group.name || 'Unnamed Group',
          parentPath: null,
        });
      }
    }

    // Tags
    for (const tag of newProject?.tags || []) {
      if (!oldTags.has(tag.id)) {
        changes.push({
          type: 'added',
          entityType: 'tag',
          entityId: tag.id,
          entityName: tag.name || 'Unnamed Tag',
          parentPath: null,
        });
      } else {
        const oldTag = oldTags.get(tag.id);
        if (JSON.stringify(oldTag) !== JSON.stringify(tag)) {
          changes.push({
            type: 'modified',
            entityType: 'tag',
            entityId: tag.id,
            entityName: tag.name || 'Unnamed Tag',
            parentPath: null,
          });
        }
      }
    }

    for (const [id, tag] of oldTags) {
      if (!newProject?.tags?.find((t) => t.id === id)) {
        changes.push({
          type: 'removed',
          entityType: 'tag',
          entityId: id,
          entityName: tag.name || 'Unnamed Tag',
          parentPath: null,
        });
      }
    }

    return {
      versionA: null, // Will be filled by caller
      versionB: null,
      changes,
      summary: {
        added: changes.filter((c) => c.type === 'added').length,
        removed: changes.filter((c) => c.type === 'removed').length,
        modified: changes.filter((c) => c.type === 'modified').length,
      },
    };
  }

  /**
   * Get storage statistics for a project
   * @param {string} projectId - Project UUID
   * @returns {Promise<Object>}
   */
  async getStats(projectId) {
    try {
      const manifest = await this._loadManifest(projectId);
      return manifest.stats;
    } catch (error) {
      log.error('[VersionHistory] Failed to get stats:', error);
      return null;
    }
  }
}

// Export singleton instance
const versionHistory = new VersionHistoryService();

module.exports = versionHistory;
