/**
 * HTTP Tile Loader
 *
 * Loads tile pyramids and project data from the server via HTTP.
 * Replaces the Electron IPC-based tile loading in the desktop app.
 */

export interface TileMetadata {
  width: number;
  height: number;
  tileSize: number;
  /** Halo pixels each tile carries on edges with neighbors (cacheVersion >= 1.1). Absent for legacy .smz exports. */
  tilePadding?: number;
  tilesX: number;
  tilesY: number;
  totalTiles: number;
}

export class HttpTileLoader {
  private baseUrl: string;
  private projectId: string;

  constructor(baseUrl: string, projectId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.projectId = projectId;
  }

  /**
   * Pyramid variant — 'original' lives in tiles/<id>/, 'affine' in tilesAffine/<id>/.
   * The affine pyramid carries the warped overlay pixels for 3-point-registered
   * micrographs; it only exists when placementType === 'affine'.
   */
  private pyramidPath(variant: 'original' | 'affine'): string {
    return variant === 'affine' ? 'tilesAffine' : 'tiles';
  }

  /**
   * Load tile metadata for a micrograph
   */
  async loadMetadata(micrographId: string, variant: 'original' | 'affine' = 'original'): Promise<TileMetadata> {
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/metadata.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load metadata: ${response.status}`);
    return response.json();
  }

  /**
   * Load a single tile as an HTMLImageElement (ready for Konva)
   */
  async loadTile(micrographId: string, x: number, y: number, variant: 'original' | 'affine' = 'original'): Promise<HTMLImageElement> {
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/tiles/tile_${x}_${y}.webp`;
    return this.loadImageFromUrl(url);
  }

  /**
   * Load the medium resolution preview (2048px)
   */
  async loadMedium(micrographId: string, variant: 'original' | 'affine' = 'original'): Promise<HTMLImageElement> {
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/medium.jpg`;
    return this.loadImageFromUrl(url);
  }

  /**
   * Load the thumbnail (512px)
   */
  async loadThumbnail(micrographId: string, variant: 'original' | 'affine' = 'original'): Promise<HTMLImageElement> {
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/thumbnail.jpg`;
    return this.loadImageFromUrl(url);
  }

  /**
   * Load a composite thumbnail for the sidebar
   */
  async loadCompositeThumbnail(micrographId: string): Promise<string> {
    const url = `${this.baseUrl}/${this.projectId}/compositeThumbnails/${micrographId}`;
    return url; // Return URL directly — <img> can load it
  }

  /**
   * Get the URL for the project PDF
   */
  getPdfUrl(): string {
    return `${this.baseUrl}/${this.projectId}/project.pdf`;
  }

  /**
   * Get the URL for the .smz download
   */
  getSmzUrl(): string {
    return `/download_micro_file?project_id=${this.projectId}`;
  }

  /**
   * Get the URL for sharing this project
   */
  getShareUrl(): string {
    return `/share_micro_file?project_id=${this.projectId}`;
  }

  /**
   * Load multiple tiles in batch, returning results as they complete
   */
  async loadTilesBatch(
    micrographId: string,
    tiles: Array<{ x: number; y: number }>,
    variant: 'original' | 'affine' = 'original'
  ): Promise<Array<{ x: number; y: number; image: HTMLImageElement }>> {
    const results: Array<{ x: number; y: number; image: HTMLImageElement }> = [];

    // Load in chunks to avoid overwhelming the browser
    const CHUNK_SIZE = 20;
    for (let i = 0; i < tiles.length; i += CHUNK_SIZE) {
      const chunk = tiles.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async ({ x, y }) => {
          const image = await this.loadTile(micrographId, x, y, variant);
          return { x, y, image };
        })
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Helper: load an image from URL as HTMLImageElement
   */
  private loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }
}
