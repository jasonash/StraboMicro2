/**
 * AssociatedImageRenderer Component
 *
 * Renders a single associated (overlay) micrograph with dynamic Level-of-Detail (LOD).
 * Implements the LOD strategy from docs/overlay-strategy-discussion.md:
 *
 * - THUMBNAIL mode: 512x512 (~500KB) - when <10% screen coverage or zoomed out
 * - MEDIUM mode: 2048x2048 (~3MB) - when 10-40% coverage, moderate zoom
 * - TILED mode: Full resolution with tiling - when >40% coverage or high zoom
 *
 * This solves the key limitation of the legacy app: extreme detail is preserved
 * when zooming into overlays, no matter how small they are on the reference.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import { MicrographMetadata } from '@/types/project-types';

// Render modes based on screen coverage and zoom
export type RenderMode = 'THUMBNAIL' | 'MEDIUM' | 'TILED';

interface AssociatedImageRendererProps {
  micrograph: MicrographMetadata;
  projectId: string; // Needed to build full image path
  parentMetadata: {
    width: number;  // Original parent width
    height: number; // Original parent height
    scalePixelsPerCentimeter: number;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
  };
  stageScale: number; // Current stage scale factor
}

interface TileInfo {
  x: number;
  y: number;
  dataUrl: string;
  imageObj?: HTMLImageElement;
}

interface ImageState {
  mode: RenderMode;
  imageObj: HTMLImageElement | null;
  tiles: Map<string, TileInfo>;
  isLoading: boolean;
  targetMode?: RenderMode; // Track what mode we're currently loading
}

const TILE_SIZE = 256;

export const AssociatedImageRenderer: React.FC<AssociatedImageRendererProps> = ({
  micrograph,
  projectId,
  parentMetadata,
  viewport,
  stageScale,
}) => {
  const [imageState, setImageState] = useState<ImageState>({
    mode: 'THUMBNAIL',
    imageObj: null,
    tiles: new Map(),
    isLoading: false,
  });

  /**
   * Calculate screen coverage percentage (0.0 to 1.0)
   * How much of the viewport does this overlay occupy?
   */
  const calculateScreenCoverage = useCallback((): number => {
    if (!micrograph.imageWidth || !micrograph.imageHeight) return 0;

    // Get overlay position and dimensions in parent's original coordinate space
    const overlayWidth = micrograph.imageWidth;
    const overlayHeight = micrograph.imageHeight;

    // Calculate scale factor based on pixels per centimeter
    const childPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
    const parentPxPerCm = parentMetadata.scalePixelsPerCentimeter || 100;
    const scaleFactor = parentPxPerCm / childPxPerCm;

    // Overlay dimensions when displayed on parent (in parent's coordinate space)
    const displayedWidth = overlayWidth * scaleFactor;
    const displayedHeight = overlayHeight * scaleFactor;

    // Apply stage zoom
    const screenWidth = displayedWidth * stageScale;
    const screenHeight = displayedHeight * stageScale;

    // Calculate coverage
    const overlayArea = screenWidth * screenHeight;
    const viewportArea = viewport.width * viewport.height;

    return Math.min(overlayArea / viewportArea, 1.0);
  }, [micrograph, parentMetadata, stageScale, viewport]);

  /**
   * Determine appropriate render mode based on coverage and zoom
   */
  const determineRenderMode = useCallback((): RenderMode => {
    const coverage = calculateScreenCoverage();
    const effectiveZoom = viewport.zoom * stageScale;

    if (effectiveZoom < 0.5 || coverage < 0.1) {
      return 'THUMBNAIL'; // 512x512
    } else if (effectiveZoom < 2.0 || coverage < 0.4) {
      return 'MEDIUM'; // 2048x2048
    } else {
      return 'TILED'; // Full resolution
    }
  }, [calculateScreenCoverage, viewport.zoom, stageScale]);

  /**
   * Calculate position and scale for rendering overlay on parent
   *
   * IMPORTANT: offsetInParent is the top-left corner position BEFORE rotation.
   * For Konva rotation to work correctly, we need to:
   * 1. Convert top-left to center position
   * 2. Set offsetX/offsetY to half the image dimensions
   * 3. This makes the Group rotate around its center
   */
  const overlayTransform = useMemo(() => {
    const childPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
    const parentPxPerCm = parentMetadata.scalePixelsPerCentimeter || 100;
    const scaleFactor = parentPxPerCm / childPxPerCm;

    const imageWidth = micrograph.imageWidth || 0;
    const imageHeight = micrograph.imageHeight || 0;
    const scaledWidth = imageWidth * scaleFactor;
    const scaledHeight = imageHeight * scaleFactor;

    let centerX = 0;
    let centerY = 0;

    // Get position from appropriate field
    if (micrograph.offsetInParent) {
      // offsetInParent is top-left corner position, convert to center
      const topLeftX = micrograph.offsetInParent.X;
      const topLeftY = micrograph.offsetInParent.Y;
      centerX = topLeftX + scaledWidth / 2;
      centerY = topLeftY + scaledHeight / 2;
    } else if (micrograph.pointInParent) {
      // For point placement, position is already the center
      centerX = micrograph.pointInParent.x;
      centerY = micrograph.pointInParent.y;
    } else if (micrograph.xOffset !== undefined && micrograph.yOffset !== undefined) {
      // Legacy fields - assume top-left, convert to center
      centerX = micrograph.xOffset + scaledWidth / 2;
      centerY = micrograph.yOffset + scaledHeight / 2;
    }

    return {
      x: centerX,
      y: centerY,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
      rotation: micrograph.rotation || 0,
      offsetX: imageWidth / 2,  // Rotate around center
      offsetY: imageHeight / 2, // Rotate around center
    };
  }, [micrograph, parentMetadata]);

  /**
   * Load image for the determined render mode
   */
  useEffect(() => {
    if (!window.api || !micrograph.imagePath) return;

    // Capture imagePath in a non-null variable for TypeScript
    const imagePath = micrograph.imagePath;

    const loadImage = async () => {
      const targetMode = determineRenderMode();

      console.log(`[AssociatedImageRenderer] Current mode: ${imageState.mode}, Target mode: ${targetMode}, isLoading: ${imageState.isLoading}`);

      // If we're already in the right mode and have the image, skip
      if (imageState.mode === targetMode &&
          (imageState.imageObj || imageState.tiles.size > 0)) {
        console.log(`[AssociatedImageRenderer] Already in ${targetMode} mode with image loaded, skipping`);
        return;
      }

      // Don't reload if already loading this target mode
      if (imageState.isLoading && imageState.targetMode === targetMode) {
        console.log(`[AssociatedImageRenderer] Already loading ${targetMode}, skipping`);
        return;
      }

      console.log(`[AssociatedImageRenderer] Starting load for mode: ${targetMode}`);

      // Mark that we're loading this target mode
      setImageState(prev => ({ ...prev, isLoading: true, targetMode }));

      try {
        // Build full path: ~/Documents/StraboMicro2Data/<project-id>/images/<micrograph-id>
        const folderPaths = await window.api!.getProjectFolderPaths(projectId);
        const fullPath = `${folderPaths.images}/${imagePath}`;

        console.log(`[AssociatedImageRenderer] Loading overlay from: ${fullPath}`);

        if (targetMode === 'THUMBNAIL') {
          // Load 512x512 thumbnail
          const result = await window.api!.loadImageWithTiles(fullPath);
          const thumbnailDataUrl = await window.api!.loadThumbnail(result.hash);

          const img = new Image();
          img.src = thumbnailDataUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          // Swap to thumbnail AFTER it's loaded (keep current image visible until then)
          setImageState({
            mode: 'THUMBNAIL',
            imageObj: img,
            tiles: new Map(),
            isLoading: false,
          });

        } else if (targetMode === 'MEDIUM') {
          // Load 2048x2048 medium resolution
          const result = await window.api!.loadImageWithTiles(fullPath);
          const mediumDataUrl = await window.api!.loadMedium(result.hash);

          const img = new Image();
          img.src = mediumDataUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          // Swap to medium AFTER it's loaded (keep current image visible until then)
          setImageState({
            mode: 'MEDIUM',
            imageObj: img,
            tiles: new Map(),
            isLoading: false,
          });

        } else {
          // TILED mode - load all tiles
          const result = await window.api!.loadImageWithTiles(fullPath);
          const tilesX = result.metadata.tilesX;
          const tilesY = result.metadata.tilesY;

          // Generate tile coordinates
          const tileCoords: Array<{ x: number; y: number }> = [];
          for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
              tileCoords.push({ x: tx, y: ty });
            }
          }

          // Load tiles
          const tileResults = await window.api!.loadTilesBatch(result.hash, tileCoords);
          const newTiles = new Map<string, TileInfo>();

          // Decode tile images
          for (const { x, y, dataUrl } of tileResults) {
            const img = new Image();
            img.src = dataUrl;
            await new Promise((resolve) => {
              img.onload = resolve;
            });

            newTiles.set(`${x}_${y}`, { x, y, dataUrl, imageObj: img });
          }

          // Swap to tiled mode AFTER all tiles are loaded (keep current image visible until then)
          setImageState({
            mode: 'TILED',
            imageObj: null,
            tiles: newTiles,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('[AssociatedImageRenderer] Failed to load image:', error);
        // Don't clear the current image on error - keep showing what we have
      }
    };

    loadImage();
  }, [micrograph, determineRenderMode, imageState.mode, imageState.imageObj, imageState.tiles.size, imageState.isLoading, projectId]);

  /**
   * Render based on current mode
   * IMPORTANT: Keep rendering the current image even while loading a new one
   */
  if (!micrograph.imagePath) {
    return null;
  }

  // If we're loading but have nothing to show yet, return null
  if (imageState.isLoading && !imageState.imageObj && imageState.tiles.size === 0) {
    return null;
  }

  if (imageState.mode === 'THUMBNAIL' || imageState.mode === 'MEDIUM') {
    // Render as single image
    if (!imageState.imageObj) return null;

    return (
      <Group
        x={overlayTransform.x}
        y={overlayTransform.y}
        scaleX={overlayTransform.scaleX}
        scaleY={overlayTransform.scaleY}
        rotation={overlayTransform.rotation}
        offsetX={overlayTransform.offsetX}
        offsetY={overlayTransform.offsetY}
      >
        <KonvaImage
          image={imageState.imageObj}
          width={micrograph.imageWidth || 0}
          height={micrograph.imageHeight || 0}
          opacity={micrograph.opacity ?? 1.0}
        />
      </Group>
    );
  } else {
    // TILED mode - render individual tiles with 1px overlap to prevent seams
    if (imageState.tiles.size === 0) return null;

    return (
      <Group
        x={overlayTransform.x}
        y={overlayTransform.y}
        scaleX={overlayTransform.scaleX}
        scaleY={overlayTransform.scaleY}
        rotation={overlayTransform.rotation}
        offsetX={overlayTransform.offsetX}
        offsetY={overlayTransform.offsetY}
      >
        {Array.from(imageState.tiles.values()).map((tile) => {
          if (!tile.imageObj) return null;

          return (
            <KonvaImage
              key={`${tile.x}_${tile.y}`}
              image={tile.imageObj}
              x={tile.x * TILE_SIZE}
              y={tile.y * TILE_SIZE}
              width={TILE_SIZE + 1}  // 1px overlap to prevent seams
              height={TILE_SIZE + 1} // 1px overlap to prevent seams
              opacity={micrograph.opacity ?? 1.0}
            />
          );
        })}
      </Group>
    );
  }
};
