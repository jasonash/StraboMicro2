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

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
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
  onTileLoadingStart?: (message: string) => void; // Notify parent when tile loading starts
  onTileLoadingEnd?: () => void; // Notify parent when tile loading ends
  onClick?: (micrographId: string) => void; // Called when overlay is clicked (for drill-down navigation)
  showOutline?: boolean; // Show red outline around overlay (like legacy app)
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
  retryCount: number; // Track retries to avoid infinite loops
}

const TILE_SIZE = 256;

export const AssociatedImageRenderer: React.FC<AssociatedImageRendererProps> = ({
  micrograph,
  projectId,
  parentMetadata,
  viewport,
  stageScale,
  onTileLoadingStart,
  onTileLoadingEnd,
  onClick,
  showOutline = false,
}) => {
  const [imageState, setImageState] = useState<ImageState>({
    mode: 'THUMBNAIL',
    imageObj: null,
    tiles: new Map(),
    isLoading: false,
    retryCount: 0,
  });

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clean up main image
      if (imageState.imageObj) {
        imageState.imageObj.src = '';
        imageState.imageObj.onload = null;
        imageState.imageObj.onerror = null;
      }
      // Clean up all tiles
      for (const [, tileInfo] of imageState.tiles) {
        if (tileInfo.imageObj) {
          tileInfo.imageObj.src = '';
          tileInfo.imageObj.onload = null;
          tileInfo.imageObj.onerror = null;
        }
      }
    };
  }, [imageState.imageObj, imageState.tiles]);

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
   * Check if overlay is visible in the current viewport
   * Accounts for rotation by computing the axis-aligned bounding box of the rotated rectangle
   */
  const isInViewport = useCallback((): boolean => {
    if (!micrograph.imageWidth || !micrograph.imageHeight) return false;

    const childPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
    const parentPxPerCm = parentMetadata.scalePixelsPerCentimeter || 100;
    const scaleFactor = parentPxPerCm / childPxPerCm;

    const imageWidth = micrograph.imageWidth || 0;
    const imageHeight = micrograph.imageHeight || 0;
    const scaledWidth = imageWidth * scaleFactor;
    const scaledHeight = imageHeight * scaleFactor;

    // Get overlay center position
    let centerX = 0;
    let centerY = 0;

    if (micrograph.offsetInParent) {
      const topLeftX = micrograph.offsetInParent.X ?? micrograph.offsetInParent.x ?? 0;
      const topLeftY = micrograph.offsetInParent.Y ?? micrograph.offsetInParent.y ?? 0;
      centerX = topLeftX + scaledWidth / 2;
      centerY = topLeftY + scaledHeight / 2;
    } else if (micrograph.pointInParent) {
      centerX = micrograph.pointInParent.x ?? micrograph.pointInParent.X ?? 0;
      centerY = micrograph.pointInParent.y ?? micrograph.pointInParent.Y ?? 0;
    } else if (micrograph.xOffset !== undefined && micrograph.xOffset !== null &&
               micrograph.yOffset !== undefined && micrograph.yOffset !== null) {
      centerX = micrograph.xOffset + scaledWidth / 2;
      centerY = micrograph.yOffset + scaledHeight / 2;
    }

    // Calculate the bounding box accounting for rotation
    const rotation = micrograph.rotation || 0;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    // Rotated bounding box dimensions
    const rotatedWidth = scaledWidth * cos + scaledHeight * sin;
    const rotatedHeight = scaledWidth * sin + scaledHeight * cos;

    // Apply stage transform to get screen coordinates (center-based)
    const screenCenterX = centerX * stageScale + viewport.x;
    const screenCenterY = centerY * stageScale + viewport.y;
    const screenWidth = rotatedWidth * stageScale;
    const screenHeight = rotatedHeight * stageScale;

    // Convert to top-left for intersection test
    const screenX = screenCenterX - screenWidth / 2;
    const screenY = screenCenterY - screenHeight / 2;

    // Check if overlay intersects with viewport
    const overlayRight = screenX + screenWidth;
    const overlayBottom = screenY + screenHeight;
    const viewportRight = viewport.width;
    const viewportBottom = viewport.height;

    // Add margin for smoother transitions
    const margin = 100; // pixels

    return (
      screenX < viewportRight + margin &&
      overlayRight > -margin &&
      screenY < viewportBottom + margin &&
      overlayBottom > -margin
    );
  }, [micrograph, parentMetadata, stageScale, viewport]);

  /**
   * Determine appropriate render mode based on zoom and viewport visibility
   *
   * Priority: Zoom level is the primary factor.
   * If zoomed in enough to see detail, use high-res tiles.
   * Coverage is only used at low zoom levels to optimize memory.
   */
  const determineRenderMode = useCallback((): RenderMode => {
    // If not in viewport at all, use THUMBNAIL (smallest memory footprint)
    if (!isInViewport()) {
      return 'THUMBNAIL';
    }

    // Use stageScale directly as the zoom level
    // (viewport.zoom and stageScale are the same value)
    const zoom = stageScale;

    // High zoom always gets tiles - user is looking at detail
    // This ensures tiles load when zoomed in, regardless of coverage
    if (zoom >= 1.0) {
      return 'TILED'; // Full resolution
    }

    // Medium zoom (0.5 to 1.0) - use medium resolution
    if (zoom >= 0.5) {
      return 'MEDIUM'; // 2048x2048
    }

    // Low zoom (< 0.5) - use coverage to decide
    const coverage = calculateScreenCoverage();
    if (coverage >= 0.3) {
      return 'MEDIUM';
    }
    return 'THUMBNAIL'; // 512x512
  }, [isInViewport, calculateScreenCoverage, stageScale]);

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
      const topLeftX = micrograph.offsetInParent.X ?? micrograph.offsetInParent.x ?? 0;
      const topLeftY = micrograph.offsetInParent.Y ?? micrograph.offsetInParent.y ?? 0;
      centerX = topLeftX + scaledWidth / 2;
      centerY = topLeftY + scaledHeight / 2;
    } else if (micrograph.pointInParent) {
      // For point placement, position is already the center
      centerX = micrograph.pointInParent.x ?? micrograph.pointInParent.X ?? 0;
      centerY = micrograph.pointInParent.y ?? micrograph.pointInParent.Y ?? 0;
    } else if (micrograph.xOffset !== undefined && micrograph.xOffset !== null &&
               micrograph.yOffset !== undefined && micrograph.yOffset !== null) {
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
   * Includes retry logic to handle race conditions during initial project load
   */
  useEffect(() => {
    if (!window.api || !micrograph.imagePath) return;

    // Capture imagePath in a non-null variable for TypeScript
    const imagePath = micrograph.imagePath;

    // Max retries to avoid infinite loops
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 200;

    const loadImage = async () => {
      const targetMode = determineRenderMode();

      // If we're already in the right mode and have the image, skip
      if (imageState.mode === targetMode &&
          (imageState.imageObj || imageState.tiles.size > 0)) {
        return;
      }

      // Don't reload if already loading this target mode
      if (imageState.isLoading && imageState.targetMode === targetMode) {
        return;
      }

      // Give up after max retries
      if (imageState.retryCount >= MAX_RETRIES) {
        console.warn(`[AssociatedImageRenderer] Max retries (${MAX_RETRIES}) reached for ${micrograph.name}`);
        return;
      }

      // Mark that we're loading this target mode
      setImageState(prev => ({ ...prev, isLoading: true, targetMode }));

      try {
        // Build full path: ~/Documents/StraboMicro2Data/<project-id>/images/<micrograph-id>
        const folderPaths = await window.api!.getProjectFolderPaths(projectId);
        const fullPath = `${folderPaths.images}/${imagePath}`;


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
            retryCount: 0, // Reset retry count on success
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
            retryCount: 0, // Reset retry count on success
          });

        } else {
          // TILED mode - load all tiles
          const result = await window.api!.loadImageWithTiles(fullPath);
          const tilesX = result.metadata.tilesX;
          const tilesY = result.metadata.tilesY;

          // Notify parent that we're loading tiles
          const message = result.fromCache
            ? `Loading overlay tiles from cache...`
            : `Generating overlay tiles (first load)...`;
          onTileLoadingStart?.(message);

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
            retryCount: 0, // Reset retry count on success
          });

          // Notify parent that we're done loading tiles
          onTileLoadingEnd?.();
        }
      } catch (error) {
        // Only log error on final retry attempt to avoid console noise
        if (imageState.retryCount >= MAX_RETRIES - 1) {
          console.error('[AssociatedImageRenderer] Failed to load image after retries:', error);
        }
        // Reset loading state and schedule retry after delay
        // This handles race conditions during initial project load
        setTimeout(() => {
          setImageState(prev => ({
            ...prev,
            isLoading: false,
            retryCount: prev.retryCount + 1,
          }));
        }, RETRY_DELAY_MS);
      }
    };

    loadImage();
  }, [micrograph, determineRenderMode, imageState.mode, imageState.imageObj, imageState.tiles.size, imageState.isLoading, imageState.retryCount, projectId]);

  // Track mouse position to distinguish clicks from drags
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD = 5; // pixels - movement beyond this is considered a drag

  // Handlers for click and cursor - MUST be before any early returns (React hooks rule)
  const handleMouseDown = useCallback((e: any) => {
    // Store the mouse position at mousedown
    const stage = e.target.getStage();
    if (stage) {
      const pos = stage.getPointerPosition();
      mouseDownPosRef.current = pos ? { x: pos.x, y: pos.y } : null;
    }
  }, []);

  const handleMouseUp = useCallback((e: any) => {
    if (!onClick || !mouseDownPosRef.current) {
      mouseDownPosRef.current = null;
      return;
    }

    // Check if mouse moved significantly (was it a drag?)
    const stage = e.target.getStage();
    if (stage) {
      const pos = stage.getPointerPosition();
      if (pos) {
        const dx = Math.abs(pos.x - mouseDownPosRef.current.x);
        const dy = Math.abs(pos.y - mouseDownPosRef.current.y);

        // Only trigger click if movement was within threshold
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
          onClick(micrograph.id);
        }
      }
    }

    mouseDownPosRef.current = null;
  }, [onClick, micrograph.id]);

  const handleMouseEnter = useCallback((e: any) => {
    if (onClick) {
      const container = e.target.getStage()?.container();
      if (container) {
        container.style.cursor = 'pointer';
      }
    }
  }, [onClick]);

  const handleMouseLeave = useCallback((e: any) => {
    if (onClick) {
      const container = e.target.getStage()?.container();
      if (container) {
        container.style.cursor = 'grab';
      }
    }
  }, [onClick]);

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

  const imageWidth = micrograph.imageWidth || 0;
  const imageHeight = micrograph.imageHeight || 0;

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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTap={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <KonvaImage
          image={imageState.imageObj}
          width={imageWidth}
          height={imageHeight}
          opacity={micrograph.opacity ?? 1.0}
        />
        {/* Red outline around overlay */}
        {showOutline && (
          <Rect
            x={0}
            y={0}
            width={imageWidth}
            height={imageHeight}
            stroke="#cc3333"
            strokeWidth={3 / (stageScale * overlayTransform.scaleX)} // Constant screen size regardless of zoom/scale
            listening={false}
          />
        )}
        {/* Transparent hit area for reliable click detection */}
        {onClick && (
          <Rect
            x={0}
            y={0}
            width={imageWidth}
            height={imageHeight}
            fill="transparent"
          />
        )}
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTap={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {Array.from(imageState.tiles.values()).map((tile) => {
          if (!tile.imageObj) return null;

          return (
            <KonvaImage
              key={`${tile.x}_${tile.y}`}
              image={tile.imageObj}
              x={tile.x * TILE_SIZE}
              y={tile.y * TILE_SIZE}
              width={TILE_SIZE + 2}  // 2px overlap to prevent seams when rotated
              height={TILE_SIZE + 2} // 2px overlap to prevent seams when rotated
              opacity={micrograph.opacity ?? 1.0}
            />
          );
        })}
        {/* Red outline around overlay */}
        {showOutline && (
          <Rect
            x={0}
            y={0}
            width={imageWidth}
            height={imageHeight}
            stroke="#cc3333"
            strokeWidth={3 / (stageScale * overlayTransform.scaleX)} // Constant screen size regardless of zoom/scale
            listening={false}
          />
        )}
        {/* Transparent hit area for reliable click detection */}
        {onClick && (
          <Rect
            x={0}
            y={0}
            width={imageWidth}
            height={imageHeight}
            fill="transparent"
          />
        )}
      </Group>
    );
  }
};
