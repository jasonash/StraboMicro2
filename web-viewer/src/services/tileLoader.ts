/**
 * HTTP Tile Loader
 *
 * Loads tile pyramids and project data from the server via HTTP.
 * Replaces the Electron IPC-based tile loading in the desktop app.
 *
 * StraboMicro v1 projects (and anything else without tiles/) have no tile
 * pyramid. For those the loader serves uiImages/<id> as a one-image pyramid:
 * loadMetadata describes it (tilesX = tilesY = 0, singleImage), and
 * loadThumbnail / loadMedium return that image. v1's uiImages copies are the
 * 2000-2500 px display images every v1 coordinate refers to; images/ (the
 * originals in local v1 saves) is never read, it would misplace the spots.
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
  /** Affine-only: ratio of output-buffer (tiled) size to parent-coord size. Renderer applies 1/oversample to bring tiles back to parent-coord space. Absent (=1) on legacy .smz exports. */
  oversample?: number;
  /** Affine-only: parent-coord AABB dimensions. Absent on legacy .smz exports — fall back to micrograph.affineTransformedWidth/Height. */
  parentSpaceWidth?: number;
  parentSpaceHeight?: number;
  /** No tile pyramid: the whole micrograph is one image (uiImages/<id>), drawn at width x height */
  singleImage?: boolean;
}

export class HttpTileLoader {
  private baseUrl: string;
  private projectId: string;
  /** uiImages/<id> loads, one per micrograph, shared by metadata, thumbnail and medium */
  private singleImages = new Map<string, Promise<HTMLImageElement>>();
  /** Micrographs known to have no tile pyramid (their metadata.json is missing) */
  private singleImageIds = new Set<string>();

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
    if (variant === 'original' && this.singleImageIds.has(micrographId)) {
      return this.singleImageMetadata(await this.singleImage(micrographId));
    }
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/metadata.json`;
    const response = await fetch(url).catch(() => null);
    if (response?.ok) return response.json();
    const failure = new Error(`Failed to load metadata: ${response?.status ?? 'network error'}`);
    // Affine pyramids have no single-image form; callers fall back to 'original'
    if (variant !== 'original') throw failure;
    let image: HTMLImageElement;
    try {
      image = await this.singleImage(micrographId);
    } catch {
      throw failure;
    }
    this.singleImageIds.add(micrographId);
    return this.singleImageMetadata(image);
  }

  private singleImageMetadata(image: HTMLImageElement): TileMetadata {
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      tileSize: 0,
      tilesX: 0,
      tilesY: 0,
      totalTiles: 0,
      singleImage: true,
    };
  }

  private singleImage(micrographId: string): Promise<HTMLImageElement> {
    let image = this.singleImages.get(micrographId);
    if (!image) {
      image = this.loadImageFromUrl(`${this.baseUrl}/${this.projectId}/uiImages/${micrographId}`);
      // Forget a failed load so a later call can try again
      image.catch(() => this.singleImages.delete(micrographId));
      this.singleImages.set(micrographId, image);
    }
    return image;
  }

  /** The pyramid's image, or for a micrograph without one, its uiImages copy */
  private async pyramidImage(url: string, micrographId: string, variant: 'original' | 'affine'): Promise<HTMLImageElement> {
    if (variant === 'original' && this.singleImageIds.has(micrographId)) return this.singleImage(micrographId);
    try {
      return await this.loadImageFromUrl(url);
    } catch (err) {
      if (variant !== 'original') throw err;
      return this.singleImage(micrographId);
    }
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
    return this.pyramidImage(url, micrographId, variant);
  }

  /**
   * Load the thumbnail (512px)
   */
  async loadThumbnail(micrographId: string, variant: 'original' | 'affine' = 'original'): Promise<HTMLImageElement> {
    const url = `${this.baseUrl}/${this.projectId}/${this.pyramidPath(variant)}/${micrographId}/thumbnail.jpg`;
    return this.pyramidImage(url, micrographId, variant);
  }

  /**
   * Load a composite thumbnail for the sidebar
   */
  async loadCompositeThumbnail(micrographId: string): Promise<string> {
    const url = `${this.baseUrl}/${this.projectId}/compositeThumbnails/${micrographId}`;
    return url; // Return URL directly — <img> can load it
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
