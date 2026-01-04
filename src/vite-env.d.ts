/// <reference types="vite/client" />

// App version injected by Vite at build time
declare const __APP_VERSION__: string;

declare module '*.csv?raw' {
  const value: string;
  export default value;
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

// Tile metadata interface
interface TileMetadata {
  cacheVersion: string;
  originalPath: string;
  width: number;
  height: number;
  tileSize: number;
  tilesX: number;
  tilesY: number;
  totalTiles: number;
  thumbnailSize: number;
  mediumSize: number;
  createdAt: string;
}

// Tile coordinate interface
interface TileCoordinate {
  x: number;
  y: number;
}

// Tile data interface
interface TileData extends TileCoordinate {
  dataUrl: string;
}

// Affine tile metadata interface
interface AffineTileMetadata {
  originalWidth: number;
  originalHeight: number;
  transformedWidth: number;
  transformedHeight: number;
  affineMatrix: [number, number, number, number, number, number];
  boundsOffset: { x: number; y: number };
  tileSize: number;
  tilesX: number;
  tilesY: number;
  totalTiles: number;
  createdAt: string;
}

// Affine tile generation result
interface AffineTileGenerationResult {
  success: boolean;
  metadata?: AffineTileMetadata;
  progressChannel?: string;
  error?: string;
}

// Affine progress subscription result
interface AffineProgressSubscription {
  channel: string;
  unsubscribe: () => void;
}

// Cache statistics interface
interface CacheStats {
  imageCount: number;
  totalSizeBytes: number;
  totalSizeMB: string;
  cacheDirectory: string;
  error?: string;
}

// Debug helpers (development only)
interface Window {
  __STRABO_STORE__?: any;
  inspectProject?: () => any;
  getStoreState?: () => any;
}

// Unsubscribe function type for IPC event listeners
type Unsubscribe = () => void;

// Electron API declarations
interface Window {
  api?: {
    version: string;

    // Session state persistence (replaces localStorage for packaged builds)
    session: {
      getItem: () => Promise<string | null>;
      setItem: (value: string) => Promise<void>;
      clear: () => Promise<void>;
    };

    // Project validation
    validateProjectExists: (projectId: string) => Promise<{ exists: boolean; reason?: string }>;

    onNewProject: (callback: () => void) => Unsubscribe;
    onOpenProject: (callback: () => void) => Unsubscribe;
    onEditProject: (callback: () => void) => Unsubscribe;
    onClearAllSpots: (callback: () => void) => Unsubscribe;
    onQuickEditSpots: (callback: () => void) => Unsubscribe;
    onBatchEditSpots: (callback: () => void) => Unsubscribe;
    onMergeSpots: (callback: () => void) => Unsubscribe;
    onSplitSpot: (callback: () => void) => Unsubscribe;
    onShowProjectDebug: (callback: () => void) => Unsubscribe;
    onShowSerializedJson: (callback: () => void) => Unsubscribe;
    getSerializedProjectJson: (projectData: unknown) => Promise<string>;
    onPreferences: (callback: () => void) => Unsubscribe;
    onTestOrientationStep: (callback: () => void) => Unsubscribe;
    onTestScaleBarStep: (callback: () => void) => Unsubscribe;
    onClearProject: (callback: () => void) => Unsubscribe;
    onQuickLoadImage: (callback: () => void) => Unsubscribe;
    onLoadSampleProject: (callback: () => void) => Unsubscribe;
    onResetEverything: (callback: () => void) => Unsubscribe;
    onRebuildAllThumbnails: (callback: () => void) => Unsubscribe;
    onUndo: (callback: () => void) => Unsubscribe;
    onRedo: (callback: () => void) => Unsubscribe;
    openTiffDialog: () => Promise<string | null>;
    openMultipleTiffDialog: () => Promise<string[]>;
    openFileDialog: () => Promise<string | null>;
    openFilesDialog: () => Promise<string[]>;
    saveTextFile: (content: string, defaultName: string, extension: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    openExternalLink: (url: string) => Promise<{ success: boolean }>;
    openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    loadTiffImage: (filePath: string) => Promise<{
      width: number;
      height: number;
      data: string;
      filePath: string;
      filename: string;
    }>;
    loadImagePreview: (filePath: string, size?: 'thumbnail' | 'medium' | 'full') => Promise<string>;
    setWindowTitle: (title: string) => void;
    notifyProjectChanged: (projectId: string | null) => void;
    onThemeChange: (callback: (theme: 'dark' | 'light' | 'system') => void) => Unsubscribe;
    notifyThemeChanged: (theme: 'dark' | 'light' | 'system') => void;
    onToggleRulers: (callback: (checked: boolean) => void) => Unsubscribe;
    onToggleSpotLabels: (callback: (checked: boolean) => void) => Unsubscribe;
    onToggleOverlayOutlines: (callback: (checked: boolean) => void) => Unsubscribe;
    onToggleRecursiveSpots: (callback: (checked: boolean) => void) => Unsubscribe;
    onToggleArchivedSpots: (callback: (checked: boolean) => void) => Unsubscribe;
    onShowPointCountStatistics: (callback: () => void) => Unsubscribe;
    onToggleQuickClassify: (callback: () => void) => Unsubscribe;

    // Tile-based image loading
    loadImageWithTiles: (imagePath: string) => Promise<{
      hash: string;
      metadata: TileMetadata;
      fromCache: boolean;
    }>;
    loadThumbnail: (imageHash: string) => Promise<string>;
    loadMedium: (imageHash: string) => Promise<string>;
    loadOpencvScript: () => Promise<string>;
    loadTile: (imageHash: string, tileX: number, tileY: number) => Promise<string>;
    loadTilesBatch: (imageHash: string, tiles: TileCoordinate[]) => Promise<TileData[]>;
    getCacheStats: () => Promise<CacheStats>;
    clearImageCache: (imageHash: string) => Promise<{ success: boolean }>;
    clearAllCaches: () => Promise<{ success: boolean }>;
    releaseMemory: () => Promise<{ success: boolean; error?: string }>;
    checkImageCache: (imagePath: string) => Promise<{
      cached: boolean;
      hash: string | null;
      metadata: TileMetadata | null;
    }>;

    // Tile queue and project preparation
    prepareProjectImages: (images: Array<{ imagePath: string; imageName: string }>) => Promise<{
      prepared: number;
      cached: number;
      total: number;
    }>;
    getTileQueueStatus: () => Promise<{
      queueLength: number;
      isProcessing: boolean;
      currentRequest: { type: string; imageName?: string } | null;
      stats: {
        totalImages: number;
        completedImages: number;
        currentImageName: string;
        isPreparationPhase: boolean;
      };
    }>;
    boostTileQueuePriority: (imageHash: string) => Promise<{ success: boolean }>;
    cancelTileQueueForImage: (imageHash: string) => Promise<{ success: boolean }>;
    onTileQueueProgress: (callback: (progress: {
      totalImages: number;
      completedImages: number;
      currentImageName: string;
      isPreparationPhase: boolean;
    }) => void) => Unsubscribe;
    onTileQueuePreparationStart: (callback: (data: { total: number }) => void) => Unsubscribe;
    onTileQueuePreparationComplete: (callback: (data: {
      prepared: number;
      cached: number;
      total: number;
    }) => void) => Unsubscribe;
    onTileQueueTileProgress: (callback: (data: {
      imageName: string;
      currentTile: number;
      totalTiles: number;
    }) => void) => Unsubscribe;

    // Affine tile operations (3-point registration placement)
    generateAffineTiles: (
      imagePath: string,
      imageHash: string,
      affineMatrix: [number, number, number, number, number, number]
    ) => Promise<AffineTileGenerationResult>;
    loadAffineTile: (imageHash: string, tileX: number, tileY: number) => Promise<string | null>;
    loadAffineTilesBatch: (imageHash: string, tiles: TileCoordinate[]) => Promise<TileData[]>;
    loadAffineThumbnail: (imageHash: string) => Promise<string>;
    loadAffineMedium: (imageHash: string) => Promise<string>;
    loadAffineMetadata: (imageHash: string) => Promise<AffineTileMetadata | null>;
    hasAffineTiles: (imageHash: string) => Promise<boolean>;
    deleteAffineTiles: (imageHash: string) => Promise<{ success: boolean; error?: string }>;
    onAffineProgress: (callback: (progress: number) => void) => AffineProgressSubscription;

    // Project folder structure
    getProjectDataPath: () => Promise<string>;
    ensureProjectDataDir: () => Promise<string>;
    createProjectFolders: (projectId: string) => Promise<{
      projectPath: string;
      associatedFiles: string;
      compositeImages: string;
      compositeThumbnails: string;
      images: string;
      uiImages: string;
      webImages: string;
      webThumbnails: string;
    }>;
    projectFolderExists: (projectId: string) => Promise<boolean>;
    getProjectFolderPaths: (projectId: string) => Promise<{
      projectPath: string;
      associatedFiles: string;
      compositeImages: string;
      compositeThumbnails: string;
      images: string;
      uiImages: string;
      webImages: string;
      webThumbnails: string;
      projectJson: string;
    }>;
    listProjectFolders: () => Promise<string[]>;
    deleteProjectFolder: (projectId: string) => Promise<{ success: boolean }>;
    copyToAssociatedFiles: (sourcePath: string, projectId: string, fileName: string) => Promise<{
      destinationPath: string;
      fileName: string;
      success: boolean;
    }>;
    deleteFromAssociatedFiles: (projectId: string, fileName: string) => Promise<{
      success: boolean;
      fileName: string;
      message?: string;
    }>;

    // Image conversion
    convertToScratchJPEG: (sourcePath: string) => Promise<{
      identifier: string;
      scratchPath: string;
      originalWidth: number;
      originalHeight: number;
      originalFormat: string;
      jpegWidth: number;
      jpegHeight: number;
      jpegSize: number;
    }>;
    moveFromScratch: (identifier: string, projectId: string, micrographId: string) => Promise<{
      success: boolean;
      destination: string;
    }>;
    deleteScratchImage: (identifier: string) => Promise<{ success: boolean }>;
    onConversionProgress: (callback: (progress: { stage: string; percent: number }) => void) => void;
    convertAndSaveMicrographImage: (sourcePath: string, projectId: string, micrographId: string) => Promise<{
      success: boolean;
      originalWidth: number;
      originalHeight: number;
      originalFormat: string;
      outputWidth: number;
      outputHeight: number;
      outputSize: number;
      outputPath: string;
    }>;
    generateImageVariants: (sourcePath: string, projectId: string, micrographId: string) => Promise<{
      success: boolean;
      variants: Record<string, {
        path: string;
        width: number;
        height: number;
        size: number;
      }>;
    }>;
    getImageDimensions: (imagePath: string) => Promise<{
      width: number;
      height: number;
      format: string;
    }>;
    isValidImage: (filePath: string) => Promise<boolean>;
    flipImageHorizontal: (imagePath: string) => Promise<{ success: boolean; hash: string }>;

    // Composite thumbnail generation
    generateCompositeThumbnail: (projectId: string, micrographId: string, projectData: any) => Promise<{
      success: boolean;
      thumbnailPath: string;
      width: number;
      height: number;
    }>;
    getCompositeThumbnailPath: (projectId: string, micrographId: string) => Promise<string>;
    loadCompositeThumbnail: (projectId: string, micrographId: string) => Promise<string | null>;
    rebuildAllThumbnails: (projectId: string, projectData: any) => Promise<{
      success: boolean;
      results: {
        total: number;
        succeeded: number;
        failed: number;
        errors: Array<{ micrographId: string; error: string }>;
      };
    }>;

    // Project serialization
    saveProjectJson: (project: any, projectId: string) => Promise<{
      success: boolean;
      path: string;
    }>;
    loadProjectJson: (projectId: string) => Promise<any>;

    // Debug utilities
    resetEverything: () => Promise<{
      success: boolean;
      project: any;
      message: string;
    }>;
    getMemoryInfo: () => Promise<{
      main: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
      };
      timestamp: number;
    }>;

    // PDF export
    exportDetailedNotesToPDF: (projectData: any, micrographId?: string, spotId?: string) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;

    // Micrograph download
    downloadMicrograph: (imagePath: string, suggestedName: string) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;

    // Export composite micrograph (with overlays, spots, and labels)
    exportCompositeMicrograph: (
      projectId: string,
      micrographId: string,
      projectData: any,
      options?: {
        includeSpots?: boolean;
        includeLabels?: boolean;
      }
    ) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;

    // Export micrograph as SVG (vector spots)
    exportMicrographAsSvg: (
      projectId: string,
      micrographId: string,
      projectData: any
    ) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;

    // Export all images to ZIP
    exportAllImages: (projectId: string, projectData: any, format?: 'jpeg' | 'svg') => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
      exported?: number;
      error?: string;
      errors?: Array<{ micrographId: string; name: string; error: string }>;
    }>;
    onExportAllImagesProgress: (callback: (progress: {
      current: number;
      total: number;
      currentName: string;
      status: 'processing' | 'complete' | 'error';
      error?: string;
    }) => void) => void;
    removeExportAllImagesProgressListener: () => void;

    // Menu event for export all images
    onExportAllImages: (callback: () => void) => Unsubscribe;

    // Export project as JSON
    exportProjectJson: (projectData: any) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;
    onExportProjectJson: (callback: () => void) => Unsubscribe;

    // Export project as PDF
    exportProjectPdf: (projectId: string, projectData: any) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
    }>;
    onExportProjectPdf: (callback: () => void) => Unsubscribe;
    onExportPdfProgress: (callback: (progress: {
      phase: string;
      current: number;
      total: number;
      itemName: string;
      percentage: number;
      error?: string;
    }) => void) => void;
    removeExportPdfProgressListener: () => void;

    // Authentication
    auth: {
      login: (email: string, password: string, restServer: string) => Promise<{
        success: boolean;
        user?: { pkey: string; email: string; name: string };
        error?: string;
      }>;
      logout: (restServer: string) => Promise<{ success: boolean }>;
      refresh: (restServer: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      check: () => Promise<{
        isLoggedIn: boolean;
        user?: { pkey: string; email: string; name: string } | null;
        needsRefresh?: boolean;
      }>;
      getToken: () => Promise<{
        token: string | null;
        user?: { pkey: string; email: string; name: string };
        expired?: boolean;
      }>;
      checkStorage: () => Promise<{
        available: boolean;
        backend: string;
      }>;
      notifyStateChanged: (isLoggedIn: boolean) => void;
    };

    // Auth menu events
    onLoginRequest: (callback: () => void) => Unsubscribe;
    onLogoutRequest: (callback: () => void) => Unsubscribe;

    // Help menu events
    onShowAbout: (callback: () => void) => Unsubscribe;
    onShowLogs: (callback: () => void) => Unsubscribe;
    onSendErrorReport: (callback: () => void) => Unsubscribe;
    onCheckForUpdates: (callback: () => void) => Unsubscribe;

    // Log service (persistent logging to file)
    logs: {
      read: () => Promise<string>;
      getPath: () => Promise<string>;
      write: (level: string, message: string, source?: string) => Promise<{ success: boolean }>;
    };

    // Send error report to server
    sendErrorReport: (notes: string) => Promise<{ success: boolean; error?: string; sessionExpired?: boolean }>;

    // Auto-updater
    autoUpdater: {
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => void;
      getState: () => Promise<{
        updateAvailable: {
          version: string;
          releaseDate?: string;
          releaseNotes?: string;
        } | null;
        downloadProgress: {
          percent: number;
          bytesPerSecond: number;
          transferred: number;
          total: number;
        } | null;
        updateDownloaded: boolean;
      }>;
      onUpdateStatus: (callback: (data: {
        status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        version?: string;
        releaseDate?: string;
        releaseNotes?: string;
        percent?: number;
        bytesPerSecond?: number;
        transferred?: number;
        total?: number;
        message?: string;
      }) => void) => Unsubscribe;
    };

    // Save/Export menu events
    onSaveProject: (callback: () => void) => Unsubscribe;
    onExportSmz: (callback: () => void) => Unsubscribe;

    // Export as .smz
    exportSmz: (projectId: string, projectData: any) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
      error?: string;
    }>;
    onExportSmzProgress: (callback: (progress: {
      phase: string;
      current: number;
      total: number;
      itemName: string;
      percentage: number;
      error?: string;
    }) => void) => void;
    removeExportSmzProgressListener: () => void;

    // Push to Server
    onPushToServer: (callback: () => void) => Unsubscribe;
    // Open Remote Project
    onOpenRemoteProject: (callback: () => void) => Unsubscribe;
    server: {
      checkConnectivity: () => Promise<{
        online: boolean;
        error?: string;
      }>;
      checkProjectExists: (projectId: string) => Promise<{
        exists: boolean;
        error?: string;
      }>;
      pushProject: (
        projectId: string,
        projectData: any,
        options?: { overwrite?: boolean }
      ) => Promise<{
        success: boolean;
        needsOverwriteConfirm?: boolean;
        error?: string;
      }>;
      onPushProgress: (callback: (progress: {
        phase: string;
        percentage: number;
        message: string;
        itemName?: string;
        bytesUploaded?: number;
        bytesTotal?: number;
      }) => void) => void;
      removePushProgressListener: () => void;
      // Remote project download (Open Remote Project)
      listProjects: () => Promise<{
        success: boolean;
        projects?: RemoteProject[];
        error?: string;
        sessionExpired?: boolean;
      }>;
      downloadProject: (projectId: string) => Promise<{
        success: boolean;
        zipPath?: string;
        error?: string;
        sessionExpired?: boolean;
      }>;
      cleanupDownload: (zipPath: string) => Promise<{
        success: boolean;
      }>;
      onDownloadProgress: (callback: (progress: {
        phase: string;
        percentage: number;
        message: string;
        bytesDownloaded?: number;
        bytesTotal?: number;
      }) => void) => Unsubscribe;
      // Shared project download (Open Shared Project)
      downloadSharedProject: (shareCode: string) => Promise<{
        success: boolean;
        zipPath?: string;
        error?: string;
        sessionExpired?: boolean;
      }>;
    };

    // Open Shared Project
    onOpenSharedProject: (callback: () => void) => Unsubscribe;

    // App lifecycle
    onBeforeClose: (callback: () => void) => Unsubscribe;
    signalCloseReady: () => void;

    // Recent Projects
    onSwitchProject: (callback: (event: any, projectId: string) => void) => Unsubscribe;
    projects: {
      // Rebuild the index from disk (called on app startup)
      rebuildIndex: () => Promise<{ projects: ProjectIndexEntry[] }>;
      // Get recent projects (default limit 10)
      getRecent: (limit?: number) => Promise<ProjectIndexEntry[]>;
      // Get all projects
      getAll: () => Promise<ProjectIndexEntry[]>;
      // Update lastOpened timestamp (called on open/save)
      updateOpened: (projectId: string, projectName: string) => Promise<void>;
      // Remove project from index (called on delete)
      remove: (projectId: string) => Promise<void>;
      // Load a project by ID
      load: (projectId: string) => Promise<{
        success: boolean;
        project?: any;
        error?: string;
      }>;
      // Refresh the Recent Projects menu
      refreshMenu: () => Promise<void>;
      // Close (delete) a project completely - removes from disk, index, and version history
      close: (projectId: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
    };

    // Close Project menu event
    onCloseProject: (callback: () => void) => Unsubscribe;

    // Version History
    onViewVersionHistory: (callback: () => void) => Unsubscribe;

    // SMZ Import (Open .smz files)
    smzImport: {
      // Open file selection dialog for .smz files
      selectFile: () => Promise<{
        cancelled: boolean;
        filePath?: string;
      }>;
      // Inspect an .smz file (get project info without importing)
      inspect: (smzPath: string) => Promise<{
        success: boolean;
        projectId?: string;
        projectName?: string;
        projectExists?: boolean;
        error?: string;
      }>;
      // Import an .smz file (DESTRUCTIVE - replaces existing project)
      import: (smzPath: string) => Promise<{
        success: boolean;
        projectId?: string;
        projectData?: any;
        error?: string;
      }>;
      // Progress updates during import
      onImportProgress: (callback: (progress: {
        phase: string;
        percentage: number;
        detail: string;
      }) => void) => Unsubscribe;
    };

    // File association - open .smz from double-click or command line
    onOpenSmzFile: (callback: (filePath: string) => void) => Unsubscribe;

    // Debug menu events (only used in development)
    onDebugTriggerTestError: (callback: () => void) => Unsubscribe;
    onDebugGenerateTestSpots: (callback: () => void) => Unsubscribe;
    onDebugClearAllSpots: (callback: () => void) => Unsubscribe;
    onDebugToggleMemoryMonitor: (callback: () => void) => Unsubscribe;

    // Point Count storage (separate from Spot system)
    pointCount: {
      // Save a point count session to disk
      saveSession: (projectId: string, session: PointCountSessionData) => Promise<{
        success: boolean;
        session?: PointCountSessionData;
        error?: string;
      }>;
      // Load a point count session from disk
      loadSession: (projectId: string, sessionId: string) => Promise<{
        success: boolean;
        session?: PointCountSessionData;
        error?: string;
      }>;
      // Delete a point count session
      deleteSession: (projectId: string, sessionId: string) => Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }>;
      // List all sessions for a micrograph
      listSessions: (projectId: string, micrographId: string) => Promise<{
        success: boolean;
        sessions: PointCountSessionSummaryData[];
        error?: string;
      }>;
      // List all sessions in a project
      listAllSessions: (projectId: string) => Promise<{
        success: boolean;
        sessions: PointCountSessionSummaryData[];
        error?: string;
      }>;
      // Rename a session
      renameSession: (projectId: string, sessionId: string, newName: string) => Promise<{
        success: boolean;
        session?: PointCountSessionData;
        error?: string;
      }>;
    };

    // Tools menu events
    onPointCount: (callback: () => void) => Unsubscribe;
    onGrainDetection: (callback: () => void) => Unsubscribe;
    onImageComparator: (callback: () => void) => Unsubscribe;
    onGrainSizeAnalysis: (callback: () => void) => Unsubscribe;

    // FastSAM Grain Detection
    fastsam: {
      // Check if FastSAM model is available
      isAvailable: () => Promise<{
        available: boolean;
        modelPath?: string;
        error?: string;
      }>;
      // Get path where model should be downloaded
      getDownloadPath: () => Promise<string>;
      // Get model status (available, path, download info)
      getModelStatus: () => Promise<{
        available: boolean;
        path?: string;
        sizeBytes?: number;
        downloadPath?: string;
        downloadUrl?: string;
        expectedSizeBytes?: number;
        error?: string;
      }>;
      // Download model from Hugging Face
      downloadModel: () => Promise<{
        success: boolean;
        modelPath?: string;
        error?: string;
      }>;
      // Listen for download progress updates
      onDownloadProgress: (
        callback: (progress: {
          percent: number;
          downloadedBytes: number;
          totalBytes: number;
          status: string;
        }) => void
      ) => Unsubscribe;
      // Preload model (optional optimization)
      preloadModel: () => Promise<{
        success: boolean;
        error?: string;
      }>;
      // Unload model to free memory
      unloadModel: () => Promise<{
        success: boolean;
        error?: string;
      }>;
      // Run detection on image file path (legacy - uses broken contour extraction)
      detectGrains: (
        imagePath: string,
        params?: FastSAMDetectionParams,
        options?: FastSAMDetectionOptions
      ) => Promise<FastSAMDetectionResult>;
      // Run detection from image buffer (legacy - uses broken contour extraction)
      detectGrainsFromBuffer: (
        imageBuffer: string | ArrayBuffer,
        params?: FastSAMDetectionParams,
        options?: FastSAMDetectionOptions
      ) => Promise<FastSAMDetectionResult>;
      // NEW: Run detection and return raw masks for OpenCV.js processing (GrainSight-compatible)
      detectRawMasks: (
        imagePath: string,
        params?: FastSAMDetectionParams
      ) => Promise<FastSAMRawMaskResult>;
      // NEW: Run detection from buffer and return raw masks
      detectRawMasksFromBuffer: (
        imageBuffer: string | ArrayBuffer,
        params?: FastSAMDetectionParams
      ) => Promise<FastSAMRawMaskResult>;
      // Listen for detection progress updates
      onProgress: (callback: (progress: { step: string; percent: number }) => void) => Unsubscribe;
    };

    versionHistory: {
      // Create a new version (auto-save)
      create: (
        projectId: string,
        projectState: any,
        name?: string | null,
        description?: string | null
      ) => Promise<{
        success: boolean;
        version?: number;
        error?: string;
      }>;
      // Create a named version (checkpoint)
      createNamed: (
        projectId: string,
        projectState: any,
        name: string,
        description?: string | null
      ) => Promise<{
        success: boolean;
        version?: number;
        error?: string;
      }>;
      // List all versions for a project
      list: (projectId: string) => Promise<VersionEntry[]>;
      // Get a specific version (includes full project snapshot)
      get: (projectId: string, versionNumber: number) => Promise<{
        version: number;
        timestamp: string;
        checksum: string;
        project: any;
      } | null>;
      // Get version metadata only (without project snapshot)
      getInfo: (projectId: string, versionNumber: number) => Promise<VersionEntry | null>;
      // Restore a specific version (returns project state)
      restore: (projectId: string, versionNumber: number) => Promise<{
        success: boolean;
        project?: any;
        error?: string;
      }>;
      // Delete a specific version
      delete: (projectId: string, versionNumber: number) => Promise<{
        success: boolean;
        error?: string;
      }>;
      // Clear all version history for a project
      clear: (projectId: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      // Compute diff between two versions
      diff: (projectId: string, versionA: number, versionB: number) => Promise<{
        success: boolean;
        diff?: VersionDiff;
        error?: string;
      }>;
      // Get storage statistics
      stats: (projectId: string) => Promise<VersionStats | null>;
      // Manually trigger pruning
      prune: (projectId: string) => Promise<{
        success: boolean;
        prunedCount: number;
        error?: string;
      }>;
    };
  };
}

// Projects Index Types
interface ProjectIndexEntry {
  id: string;
  name: string;
  lastOpened: string;
}

// Version History Types
interface VersionEntry {
  version: number;
  timestamp: string;
  name: string | null;
  description: string | null;
  isAutoSave: boolean;
  sizeBytes: number;
  changeStats: {
    datasetsAdded: number;
    datasetsRemoved: number;
    samplesAdded: number;
    samplesRemoved: number;
    micrographsAdded: number;
    micrographsRemoved: number;
    spotsAdded: number;
    spotsRemoved: number;
  };
}

interface VersionDiff {
  versionA: number | null;
  versionB: number | null;
  changes: DiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

interface DiffEntry {
  type: 'added' | 'removed' | 'modified';
  entityType: 'dataset' | 'sample' | 'micrograph' | 'spot' | 'group' | 'tag';
  entityId: string;
  entityName: string;
  parentPath: string | null;
}

interface VersionStats {
  totalVersions: number;
  totalSizeBytes: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
}

// Remote Project Types (Server Download)
interface RemoteProject {
  id: string;
  name: string;
  uploadDate: string;
  modifiedTimestamp: number;
  bytes: number;
  bytesFormatted: string;
}

// Point Count Types
interface PointCountPointData {
  id: string;
  x: number;
  y: number;
  row: number;
  col: number;
  mineral?: string;
  classifiedAt?: string;
}

interface PointCountGridSettingsData {
  rows: number;
  cols: number;
  totalPoints: number;
  offset?: { x: number; y: number };
}

interface PointCountSummaryData {
  totalPoints: number;
  classifiedCount: number;
  modalComposition: Record<string, number>;
}

interface PointCountSessionData {
  id: string;
  micrographId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gridType: 'regular' | 'random' | 'stratified';
  gridSettings: PointCountGridSettingsData;
  points: PointCountPointData[];
  summary: PointCountSummaryData;
}

interface PointCountSessionSummaryData {
  id: string;
  micrographId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gridType: 'regular' | 'random' | 'stratified';
  totalPoints: number;
  classifiedCount: number;
}

// FastSAM Detection Types
interface FastSAMDetectionParams {
  confidenceThreshold?: number; // 0.0-1.0, default 0.5
  iouThreshold?: number; // 0.0-1.0, default 0.7
  minAreaPercent?: number; // Minimum area as % of image, default 0.01
  maxDetections?: number; // Maximum detections, default 500
}

interface FastSAMDetectionOptions {
  simplifyTolerance?: number; // Douglas-Peucker epsilon, default 2.0
  simplifyOutlines?: boolean; // Whether to simplify polygons, default true
  betterQuality?: boolean; // Apply morphological cleanup, default true
}

interface FastSAMDetectedGrain {
  tempId: string;
  contour: Array<{ x: number; y: number }>;
  area: number;
  centroid: { x: number; y: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  perimeter: number;
  circularity: number;
  confidence: number;
}

interface FastSAMDetectionResult {
  success: boolean;
  grains?: FastSAMDetectedGrain[];
  processingTimeMs?: number;
  inferenceTimeMs?: number;
  imageDimensions?: { width: number; height: number };
  error?: string;
}

// Raw mask result for OpenCV.js processing (GrainSight-compatible)
interface FastSAMRawMask {
  maskBase64: string; // Base64-encoded PNG of upsampled binary mask
  confidence: number;
  area: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2] in INPUT_SIZE coords
}

interface FastSAMRawMaskResult {
  success: boolean;
  masks?: FastSAMRawMask[];
  preprocessInfo?: {
    origW: number;
    origH: number;
    scale: number;
    padX: number;
    padY: number;
  };
  processingTimeMs?: number;
  inferenceTimeMs?: number;
  error?: string;
}
