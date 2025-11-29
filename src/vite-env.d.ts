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
    };

    onNewProject: (callback: () => void) => Unsubscribe;
    onOpenProject: (callback: () => void) => Unsubscribe;
    onEditProject: (callback: () => void) => Unsubscribe;
    onShowProjectDebug: (callback: () => void) => Unsubscribe;
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

    // Tile-based image loading
    loadImageWithTiles: (imagePath: string) => Promise<{
      hash: string;
      metadata: TileMetadata;
      fromCache: boolean;
    }>;
    loadThumbnail: (imageHash: string) => Promise<string>;
    loadMedium: (imageHash: string) => Promise<string>;
    loadTile: (imageHash: string, tileX: number, tileY: number) => Promise<string>;
    loadTilesBatch: (imageHash: string, tiles: TileCoordinate[]) => Promise<TileData[]>;
    getCacheStats: () => Promise<CacheStats>;
    clearImageCache: (imageHash: string) => Promise<{ success: boolean }>;
    clearAllCaches: () => Promise<{ success: boolean }>;

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
    exportAllImages: (projectId: string, projectData: any) => Promise<{
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
      }>;
      downloadProject: (projectId: string) => Promise<{
        success: boolean;
        zipPath?: string;
        error?: string;
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
      }>;
    };

    // Open Shared Project
    onOpenSharedProject: (callback: () => void) => Unsubscribe;

    // App lifecycle
    onBeforeClose: (callback: () => void) => Unsubscribe;

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

    // Debug menu events (only used in development)
    onDebugTriggerTestError: (callback: () => void) => Unsubscribe;

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
