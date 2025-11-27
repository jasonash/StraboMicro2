const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  version: process.versions.electron,

  // Dialog triggers (from menu)
  onNewProject: (callback) => ipcRenderer.on('menu:new-project', callback),
  onOpenProject: (callback) => ipcRenderer.on('menu:open-project', callback),
  onEditProject: (callback) => ipcRenderer.on('menu:edit-project', callback),
  onShowProjectDebug: (callback) => ipcRenderer.on('menu:show-project-debug', callback),
  onPreferences: (callback) => ipcRenderer.on('menu:preferences', callback),
  onTestOrientationStep: (callback) => ipcRenderer.on('menu:test-orientation-step', callback),
  onTestScaleBarStep: (callback) => ipcRenderer.on('menu:test-scale-bar-step', callback),
  onClearProject: (callback) => ipcRenderer.on('menu:clear-project', callback),
  onQuickLoadImage: (callback) => ipcRenderer.on('menu:quick-load-image', callback),
  onLoadSampleProject: (callback) => ipcRenderer.on('menu:load-sample-project', callback),
  onResetEverything: (callback) => ipcRenderer.on('menu:reset-everything', callback),
  onRebuildAllThumbnails: (callback) => ipcRenderer.on('menu:rebuild-all-thumbnails', callback),

  // Undo/Redo
  onUndo: (callback) => ipcRenderer.on('menu:undo', callback),
  onRedo: (callback) => ipcRenderer.on('menu:redo', callback),

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

  // Theme management
  onThemeChange: (callback) => ipcRenderer.on('theme:set', (event, theme) => callback(theme)),
  notifyThemeChanged: (theme) => ipcRenderer.send('theme:changed', theme),

  // View preferences
  onToggleRulers: (callback) => ipcRenderer.on('view:toggle-rulers', (event, checked) => callback(checked)),
  onToggleSpotLabels: (callback) => ipcRenderer.on('view:toggle-spot-labels', (event, checked) => callback(checked)),

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

  // Export all images to ZIP
  exportAllImages: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-all-images', projectId, projectData),
  onExportAllImagesProgress: (callback) =>
    ipcRenderer.on('export-all-images:progress', (event, progress) => callback(progress)),
  removeExportAllImagesProgressListener: () =>
    ipcRenderer.removeAllListeners('export-all-images:progress'),

  // Menu event for export all images
  onExportAllImages: (callback) => ipcRenderer.on('menu:export-all-images', callback),

  // Export project as JSON
  exportProjectJson: (projectData) =>
    ipcRenderer.invoke('project:export-json', projectData),
  onExportProjectJson: (callback) => ipcRenderer.on('menu:export-project-json', callback),

  // Export project as PDF
  exportProjectPdf: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-pdf', projectId, projectData),
  onExportProjectPdf: (callback) => ipcRenderer.on('menu:export-project-pdf', callback),
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
  onLoginRequest: (callback) => ipcRenderer.on('menu:login', callback),
  onLogoutRequest: (callback) => ipcRenderer.on('menu:logout', callback),

  // Save/Export menu events
  onSaveProject: (callback) => ipcRenderer.on('menu:save-project', callback),
  onExportSmz: (callback) => ipcRenderer.on('menu:export-smz', callback),

  // Export as .smz
  exportSmz: (projectId, projectData) =>
    ipcRenderer.invoke('project:export-smz', projectId, projectData),
  onExportSmzProgress: (callback) =>
    ipcRenderer.on('export-smz:progress', (event, progress) => callback(progress)),
  removeExportSmzProgressListener: () =>
    ipcRenderer.removeAllListeners('export-smz:progress'),
});
