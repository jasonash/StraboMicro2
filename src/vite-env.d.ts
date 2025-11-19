/// <reference types="vite/client" />

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

// Electron API declarations
interface Window {
  api?: {
    version: string;
    onNewProject: (callback: () => void) => void;
    onOpenProject: (callback: () => void) => void;
    onEditProject: (callback: () => void) => void;
    onShowProjectDebug: (callback: () => void) => void;
    onTestOrientationStep: (callback: () => void) => void;
    onTestScaleBarStep: (callback: () => void) => void;
    onClearProject: (callback: () => void) => void;
    onQuickLoadImage: (callback: () => void) => void;
    onLoadSampleProject: (callback: () => void) => void;
    onUndo: (callback: () => void) => void;
    onRedo: (callback: () => void) => void;
    openTiffDialog: () => Promise<string | null>;
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
  };
}
