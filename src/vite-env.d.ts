/// <reference types="vite/client" />

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

// Electron API declarations
interface Window {
  api?: {
    version: string;
    onNewProject: (callback: () => void) => void;
    onOpenProject: (callback: () => void) => void;
    onEditProject: (callback: () => void) => void;
    onShowProjectDebug: (callback: () => void) => void;
    onPreferences: (callback: () => void) => void;
    onTestOrientationStep: (callback: () => void) => void;
    onTestScaleBarStep: (callback: () => void) => void;
    onClearProject: (callback: () => void) => void;
    onQuickLoadImage: (callback: () => void) => void;
    onLoadSampleProject: (callback: () => void) => void;
    onResetEverything: (callback: () => void) => void;
    onRebuildAllThumbnails: (callback: () => void) => void;
    onUndo: (callback: () => void) => void;
    onRedo: (callback: () => void) => void;
    openTiffDialog: () => Promise<string | null>;
    openMultipleTiffDialog: () => Promise<string[]>;
    openFileDialog: () => Promise<string | null>;
    openExternalLink: (url: string) => Promise<{ success: boolean }>;
    loadTiffImage: (filePath: string) => Promise<{
      width: number;
      height: number;
      data: string;
      filePath: string;
      filename: string;
    }>;
    loadImagePreview: (filePath: string, size?: 'thumbnail' | 'medium' | 'full') => Promise<string>;
    setWindowTitle: (title: string) => void;
    onThemeChange: (callback: (theme: 'dark' | 'light' | 'system') => void) => void;
    notifyThemeChanged: (theme: 'dark' | 'light' | 'system') => void;
    onToggleRulers: (callback: (checked: boolean) => void) => void;
    onToggleSpotLabels: (callback: (checked: boolean) => void) => void;

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
    onExportAllImages: (callback: () => void) => void;

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
    onLoginRequest: (callback: () => void) => void;
    onLogoutRequest: (callback: () => void) => void;
  };
}
