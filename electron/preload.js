const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  version: process.versions.electron,

  // Dialog triggers (from menu)
  // Each returns an unsubscribe function to prevent listener accumulation
  onNewProject: (callback) => {
    ipcRenderer.on('menu:new-project', callback);
    return () => ipcRenderer.removeListener('menu:new-project', callback);
  },
  onOpenProject: (callback) => {
    ipcRenderer.on('menu:open-project', callback);
    return () => ipcRenderer.removeListener('menu:open-project', callback);
  },
  onEditProject: (callback) => {
    ipcRenderer.on('menu:edit-project', callback);
    return () => ipcRenderer.removeListener('menu:edit-project', callback);
  },
  onShowProjectDebug: (callback) => {
    ipcRenderer.on('menu:show-project-debug', callback);
    return () => ipcRenderer.removeListener('menu:show-project-debug', callback);
  },
  onPreferences: (callback) => {
    ipcRenderer.on('menu:preferences', callback);
    return () => ipcRenderer.removeListener('menu:preferences', callback);
  },
  onTestOrientationStep: (callback) => {
    ipcRenderer.on('menu:test-orientation-step', callback);
    return () => ipcRenderer.removeListener('menu:test-orientation-step', callback);
  },
  onTestScaleBarStep: (callback) => {
    ipcRenderer.on('menu:test-scale-bar-step', callback);
    return () => ipcRenderer.removeListener('menu:test-scale-bar-step', callback);
  },
  onClearProject: (callback) => {
    ipcRenderer.on('menu:clear-project', callback);
    return () => ipcRenderer.removeListener('menu:clear-project', callback);
  },
  onQuickLoadImage: (callback) => {
    ipcRenderer.on('menu:quick-load-image', callback);
    return () => ipcRenderer.removeListener('menu:quick-load-image', callback);
  },
  onLoadSampleProject: (callback) => {
    ipcRenderer.on('menu:load-sample-project', callback);
    return () => ipcRenderer.removeListener('menu:load-sample-project', callback);
  },
  onResetEverything: (callback) => {
    ipcRenderer.on('menu:reset-everything', callback);
    return () => ipcRenderer.removeListener('menu:reset-everything', callback);
  },
  onRebuildAllThumbnails: (callback) => {
    ipcRenderer.on('menu:rebuild-all-thumbnails', callback);
    return () => ipcRenderer.removeListener('menu:rebuild-all-thumbnails', callback);
  },

  // Undo/Redo
  onUndo: (callback) => {
    ipcRenderer.on('menu:undo', callback);
    return () => ipcRenderer.removeListener('menu:undo', callback);
  },
  onRedo: (callback) => {
    ipcRenderer.on('menu:redo', callback);
    return () => ipcRenderer.removeListener('menu:redo', callback);
  },

  // File dialogs
  openTiffDialog: () => ipcRenderer.invoke('dialog:open-tiff'),
  openMultipleTiffDialog: () => ipcRenderer.invoke('dialog:open-multiple-tiff'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),

  // External links
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

  // TIFF loading
  loadTiffImage: (filePath) => ipcRenderer.invoke('load-tiff-image', filePath),

  // Image preview loading (returns base64 data URL)
  // size: 'thumbnail' (max 512px, fast) or 'full' (original resolution)
  loadImagePreview: (filePath, size) => ipcRenderer.invoke('load-image-preview', filePath, size),

  // Window title
  setWindowTitle: (title) => ipcRenderer.send('set-window-title', title),

  // Notify main process of current project change (for menu updates)
  notifyProjectChanged: (projectId) => ipcRenderer.send('project:current-changed', projectId),

  // Theme management
  onThemeChange: (callback) => {
    const handler = (event, theme) => callback(theme);
    ipcRenderer.on('theme:set', handler);
    return () => ipcRenderer.removeListener('theme:set', handler);
  },
  notifyThemeChanged: (theme) => ipcRenderer.send('theme:changed', theme),

  // View preferences
  onToggleRulers: (callback) => {
    const handler = (event, checked) => callback(checked);
    ipcRenderer.on('view:toggle-rulers', handler);
    return () => ipcRenderer.removeListener('view:toggle-rulers', handler);
  },
  onToggleSpotLabels: (callback) => {
    const handler = (event, checked) => callback(checked);
    ipcRenderer.on('view:toggle-spot-labels', handler);
    return () => ipcRenderer.removeListener('view:toggle-spot-labels', handler);
  },
  onToggleOverlayOutlines: (callback) => {
    const handler = (event, checked) => callback(checked);
    ipcRenderer.on('view:toggle-overlay-outlines', handler);
    return () => ipcRenderer.removeListener('view:toggle-overlay-outlines', handler);
  },

  // Tile-based image loading
  loadImageWithTiles: (imagePath) => ipcRenderer.invoke('image:load-with-tiles', imagePath),
  loadThumbnail: (imageHash) => ipcRenderer.invoke('image:load-thumbnail', imageHash),
  loadMedium: (imageHash) => ipcRenderer.invoke('image:load-medium', imageHash),
  loadTile: (imageHash, tileX, tileY) => ipcRenderer.invoke('image:load-tile', imageHash, tileX, tileY),
  loadTilesBatch: (imageHash, tiles) => ipcRenderer.invoke('image:load-tiles-batch', imageHash, tiles),
  getCacheStats: () => ipcRenderer.invoke('image:cache-stats'),
  clearImageCache: (imageHash) => ipcRenderer.invoke('image:clear-cache', imageHash),
  clearAllCaches: () => ipcRenderer.invoke('image:clear-all-caches'),

  // Project folder structure
  getProjectDataPath: () => ipcRenderer.invoke('project:get-data-path'),
  ensureProjectDataDir: () => ipcRenderer.invoke('project:ensure-data-dir'),
  createProjectFolders: (projectId) => ipcRenderer.invoke('project:create-folders', projectId),
  projectFolderExists: (projectId) => ipcRenderer.invoke('project:folder-exists', projectId),
  getProjectFolderPaths: (projectId) => ipcRenderer.invoke('project:get-folder-paths', projectId),
  listProjectFolders: () => ipcRenderer.invoke('project:list-folders'),
  deleteProjectFolder: (projectId) => ipcRenderer.invoke('project:delete-folder', projectId),
  copyToAssociatedFiles: (sourcePath, projectId, fileName) =>
    ipcRenderer.invoke('project:copy-to-associated-files', sourcePath, projectId, fileName),
  deleteFromAssociatedFiles: (projectId, fileName) =>
    ipcRenderer.invoke('project:delete-from-associated-files', projectId, fileName),

  // Image conversion
  convertToScratchJPEG: (sourcePath) => ipcRenderer.invoke('image:convert-to-scratch', sourcePath),
  moveFromScratch: (identifier, projectId, micrographId) => ipcRenderer.invoke('image:move-from-scratch', identifier, projectId, micrographId),
  deleteScratchImage: (identifier) => ipcRenderer.invoke('image:delete-scratch', identifier),
  onConversionProgress: (callback) => ipcRenderer.on('image:conversion-progress', (event, progress) => callback(progress)),
  convertAndSaveMicrographImage: (sourcePath, projectId, micrographId) =>
    ipcRenderer.invoke('image:convert-and-save-micrograph', sourcePath, projectId, micrographId),
  generateImageVariants: (sourcePath, projectId, micrographId) =>
    ipcRenderer.invoke('image:generate-variants', sourcePath, projectId, micrographId),
  getImageDimensions: (imagePath) => ipcRenderer.invoke('image:get-dimensions', imagePath),
  isValidImage: (filePath) => ipcRenderer.invoke('image:is-valid', filePath),
  flipImageHorizontal: (imagePath) => ipcRenderer.invoke('image:flip-horizontal', imagePath),

  // Composite thumbnail generation
  generateCompositeThumbnail: (projectId, micrographId, projectData) =>
    ipcRenderer.invoke('composite:generate-thumbnail', projectId, micrographId, projectData),
  getCompositeThumbnailPath: (projectId, micrographId) =>
    ipcRenderer.invoke('composite:get-thumbnail-path', projectId, micrographId),
  loadCompositeThumbnail: (projectId, micrographId) =>
    ipcRenderer.invoke('composite:load-thumbnail', projectId, micrographId),
  rebuildAllThumbnails: (projectId, projectData) =>
    ipcRenderer.invoke('composite:rebuild-all-thumbnails', projectId, projectData),

  // Project serialization
  saveProjectJson: (project, projectId) => ipcRenderer.invoke('project:save-json', project, projectId),
  loadProjectJson: (projectId) => ipcRenderer.invoke('project:load-json', projectId),

  // Debug utilities
  resetEverything: () => ipcRenderer.invoke('debug:reset-everything'),

  // PDF export
  exportDetailedNotesToPDF: (projectData, micrographId, spotId) =>
    ipcRenderer.invoke('pdf:export-detailed-notes', projectData, micrographId, spotId),

  // Micrograph download (save to user's chosen location)
  downloadMicrograph: (imagePath, suggestedName) =>
    ipcRenderer.invoke('micrograph:download', imagePath, suggestedName),

  // Export composite micrograph (with overlays, spots, and labels)
  exportCompositeMicrograph: (projectId, micrographId, projectData, options) =>
    ipcRenderer.invoke('micrograph:export-composite', projectId, micrographId, projectData, options),

  // Export micrograph as SVG (vector spots)
  exportMicrographAsSvg: (projectId, micrographId, projectData) =>
    ipcRenderer.invoke('micrograph:export-svg', projectId, micrographId, projectData),

  // Export all images to ZIP
  exportAllImages: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-all-images', projectId, projectData),
  onExportAllImagesProgress: (callback) =>
    ipcRenderer.on('export-all-images:progress', (event, progress) => callback(progress)),
  removeExportAllImagesProgressListener: () =>
    ipcRenderer.removeAllListeners('export-all-images:progress'),

  // Menu event for export all images
  onExportAllImages: (callback) => {
    ipcRenderer.on('menu:export-all-images', callback);
    return () => ipcRenderer.removeListener('menu:export-all-images', callback);
  },

  // Export project as JSON
  exportProjectJson: (projectData) =>
    ipcRenderer.invoke('project:export-json', projectData),
  onExportProjectJson: (callback) => {
    ipcRenderer.on('menu:export-project-json', callback);
    return () => ipcRenderer.removeListener('menu:export-project-json', callback);
  },

  // Export project as PDF
  exportProjectPdf: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-pdf', projectId, projectData),
  onExportProjectPdf: (callback) => {
    ipcRenderer.on('menu:export-project-pdf', callback);
    return () => ipcRenderer.removeListener('menu:export-project-pdf', callback);
  },
  onExportPdfProgress: (callback) =>
    ipcRenderer.on('export-pdf:progress', (event, progress) => callback(progress)),
  removeExportPdfProgressListener: () =>
    ipcRenderer.removeAllListeners('export-pdf:progress'),

  // Authentication
  auth: {
    login: (email, password, restServer) => ipcRenderer.invoke('auth:login', email, password, restServer),
    logout: (restServer) => ipcRenderer.invoke('auth:logout', restServer),
    refresh: (restServer) => ipcRenderer.invoke('auth:refresh', restServer),
    check: () => ipcRenderer.invoke('auth:check'),
    getToken: () => ipcRenderer.invoke('auth:get-token'),
    checkStorage: () => ipcRenderer.invoke('auth:check-storage'),
    notifyStateChanged: (isLoggedIn) => ipcRenderer.send('auth:state-changed', isLoggedIn),
  },

  // Auth menu events
  onLoginRequest: (callback) => {
    ipcRenderer.on('menu:login', callback);
    return () => ipcRenderer.removeListener('menu:login', callback);
  },
  onLogoutRequest: (callback) => {
    ipcRenderer.on('menu:logout', callback);
    return () => ipcRenderer.removeListener('menu:logout', callback);
  },

  // Save/Export menu events
  onSaveProject: (callback) => {
    ipcRenderer.on('menu:save-project', callback);
    return () => ipcRenderer.removeListener('menu:save-project', callback);
  },
  onExportSmz: (callback) => {
    ipcRenderer.on('menu:export-smz', callback);
    return () => ipcRenderer.removeListener('menu:export-smz', callback);
  },

  // Export as .smz
  exportSmz: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-smz', projectId, projectData),
  onExportSmzProgress: (callback) =>
    ipcRenderer.on('export-smz:progress', (event, progress) => callback(progress)),
  removeExportSmzProgressListener: () =>
    ipcRenderer.removeAllListeners('export-smz:progress'),

  // Push to Server
  onPushToServer: (callback) => {
    ipcRenderer.on('menu:push-to-server', callback);
    return () => ipcRenderer.removeListener('menu:push-to-server', callback);
  },
  server: {
    checkConnectivity: () => ipcRenderer.invoke('server:check-connectivity'),
    checkProjectExists: (projectId) => ipcRenderer.invoke('server:check-project-exists', projectId),
    pushProject: (projectId, projectData, options) =>
      ipcRenderer.invoke('server:push-project', projectId, projectData, options),
    onPushProgress: (callback) =>
      ipcRenderer.on('server:push-progress', (event, progress) => callback(progress)),
    removePushProgressListener: () =>
      ipcRenderer.removeAllListeners('server:push-progress'),
    // Remote project download (Open Remote Project)
    listProjects: () => ipcRenderer.invoke('server:list-projects'),
    downloadProject: (projectId) => ipcRenderer.invoke('server:download-project', projectId),
    cleanupDownload: (zipPath) => ipcRenderer.invoke('server:cleanup-download', zipPath),
    onDownloadProgress: (callback) => {
      const handler = (event, progress) => callback(progress);
      ipcRenderer.on('server:download-progress', handler);
      return () => ipcRenderer.removeListener('server:download-progress', handler);
    },
    // Shared project download (Open Shared Project)
    downloadSharedProject: (shareCode) => ipcRenderer.invoke('server:download-shared-project', shareCode),
  },

  // Open Remote Project menu event
  onOpenRemoteProject: (callback) => {
    ipcRenderer.on('menu:open-remote-project', callback);
    return () => ipcRenderer.removeListener('menu:open-remote-project', callback);
  },

  // Open Shared Project menu event
  onOpenSharedProject: (callback) => {
    ipcRenderer.on('menu:open-shared-project', callback);
    return () => ipcRenderer.removeListener('menu:open-shared-project', callback);
  },

  // App lifecycle
  onBeforeClose: (callback) => {
    ipcRenderer.on('app:before-close', callback);
    return () => ipcRenderer.removeListener('app:before-close', callback);
  },

  // Version History
  onViewVersionHistory: (callback) => {
    ipcRenderer.on('menu:view-version-history', callback);
    return () => ipcRenderer.removeListener('menu:view-version-history', callback);
  },

  // Recent Projects
  onSwitchProject: (callback) => {
    ipcRenderer.on('menu:switch-project', callback);
    return () => ipcRenderer.removeListener('menu:switch-project', callback);
  },
  projects: {
    // Rebuild the index from disk (called on app startup)
    rebuildIndex: () => ipcRenderer.invoke('projects:rebuild-index'),
    // Get recent projects (default limit 10)
    getRecent: (limit) => ipcRenderer.invoke('projects:get-recent', limit),
    // Get all projects
    getAll: () => ipcRenderer.invoke('projects:get-all'),
    // Update lastOpened timestamp (called on open/save)
    updateOpened: (projectId, projectName) =>
      ipcRenderer.invoke('projects:update-opened', projectId, projectName),
    // Remove project from index (called on delete)
    remove: (projectId) => ipcRenderer.invoke('projects:remove', projectId),
    // Load a project by ID
    load: (projectId) => ipcRenderer.invoke('projects:load', projectId),
    // Refresh the Recent Projects menu
    refreshMenu: () => ipcRenderer.invoke('projects:refresh-menu'),
  },

  versionHistory: {
    // Create a new version (auto-save)
    create: (projectId, projectState, name, description) =>
      ipcRenderer.invoke('version:create', projectId, projectState, name, description),
    // Create a named version (checkpoint)
    createNamed: (projectId, projectState, name, description) =>
      ipcRenderer.invoke('version:create-named', projectId, projectState, name, description),
    // List all versions for a project
    list: (projectId) => ipcRenderer.invoke('version:list', projectId),
    // Get a specific version (includes full project snapshot)
    get: (projectId, versionNumber) => ipcRenderer.invoke('version:get', projectId, versionNumber),
    // Get version metadata only (without project snapshot)
    getInfo: (projectId, versionNumber) => ipcRenderer.invoke('version:get-info', projectId, versionNumber),
    // Restore a specific version (returns project state)
    restore: (projectId, versionNumber) => ipcRenderer.invoke('version:restore', projectId, versionNumber),
    // Delete a specific version
    delete: (projectId, versionNumber) => ipcRenderer.invoke('version:delete', projectId, versionNumber),
    // Clear all version history for a project
    clear: (projectId) => ipcRenderer.invoke('version:clear', projectId),
    // Compute diff between two versions
    diff: (projectId, versionA, versionB) => ipcRenderer.invoke('version:diff', projectId, versionA, versionB),
    // Get storage statistics
    stats: (projectId) => ipcRenderer.invoke('version:stats', projectId),
    // Manually trigger pruning
    prune: (projectId) => ipcRenderer.invoke('version:prune', projectId),
  },

  // SMZ Import (Open .smz files)
  smzImport: {
    // Open file selection dialog for .smz files
    selectFile: () => ipcRenderer.invoke('smz:select-file'),
    // Inspect an .smz file (get project info without importing)
    inspect: (smzPath) => ipcRenderer.invoke('smz:inspect', smzPath),
    // Import an .smz file (DESTRUCTIVE - replaces existing project)
    import: (smzPath) => ipcRenderer.invoke('smz:import', smzPath),
    // Progress updates during import
    onImportProgress: (callback) => {
      const handler = (event, progress) => callback(progress);
      ipcRenderer.on('smz:import-progress', handler);
      return () => ipcRenderer.removeListener('smz:import-progress', handler);
    },
  },
});
