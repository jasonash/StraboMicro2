/**
 * AssociatedImageRenderer — Overlay child micrographs on parent
 *
 * Renders child micrographs with LOD strategy (thumbnail/medium/tiled)
 * based on zoom level and viewport visibility. Adapted from desktop
 * component with HTTP tile loading instead of IPC.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Line } from 'react-konva';
import { HttpTileLoader, TileMetadata } from '../services/tileLoader';
import type { MicrographMetadata } from '../types/project-types';

const TILE_SIZE = 256;

type RenderMode = 'THUMBNAIL' | 'MEDIUM' | 'TILED';

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  isAffine: boolean;
  transformedWidth: number;
  transformedHeight: number;
  affineOutlinePoints: number[] | null;
}

interface AssociatedImageRendererProps {
  micrograph: MicrographMetadata;
  parentScalePixelsPerCm: number;
  parentWidth: number;
  parentHeight: number;
  viewport: Viewport;
  stageScale: number;
  tileLoader: HttpTileLoader;
  onClick?: (micrographId: string) => void;
}

export function AssociatedImageRenderer({
  micrograph,
  parentScalePixelsPerCm,
  parentWidth: _parentWidth,
  parentHeight: _parentHeight,
  viewport,
  stageScale,
  tileLoader,
  onClick,
}: AssociatedImageRendererProps) {
  const [thumbnailImage, setThumbnailImage] = useState<HTMLImageElement | null>(null);
  const [mediumImage, setMediumImage] = useState<HTMLImageElement | null>(null);
  const [tiles, setTiles] = useState<Map<string, HTMLImageElement>>(new Map());
  const [tileMetadata, setTileMetadata] = useState<TileMetadata | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>('THUMBNAIL');
  const sessionRef = useRef(0);

  const imageWidth = micrograph.width || micrograph.imageWidth || 0;
  const imageHeight = micrograph.height || micrograph.imageHeight || 0;

  // ============================================================================
  // OVERLAY TRANSFORM
  // ============================================================================

  const overlayTransform = useMemo((): OverlayTransform | null => {
    if (!imageWidth || !imageHeight) return null;

    // Affine placement
    if (micrograph.placementType === 'affine') {
      const transformedWidth = micrograph.affineTransformedWidth || imageWidth;
      const transformedHeight = micrograph.affineTransformedHeight || imageHeight;
      const boundsOffset = micrograph.affineBoundsOffset || { x: 0, y: 0 };
      const matrix = micrograph.affineMatrix;

      let affineOutlinePoints: number[] | null = null;
      if (matrix && matrix.length === 6) {
        const [a, b, tx, c, d, ty] = matrix;
        const corners = [[0, 0], [imageWidth, 0], [imageWidth, imageHeight], [0, imageHeight]];
        affineOutlinePoints = corners.flatMap(([x, y]) => [
          a * x + b * y + tx - boundsOffset.x,
          c * x + d * y + ty - boundsOffset.y,
        ]);
      }

      return {
        x: boundsOffset.x + transformedWidth / 2,
        y: boundsOffset.y + transformedHeight / 2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        offsetX: transformedWidth / 2,
        offsetY: transformedHeight / 2,
        isAffine: true,
        transformedWidth,
        transformedHeight,
        affineOutlinePoints,
      };
    }

    // Standard placement
    const childPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
    const scaleFactor = parentScalePixelsPerCm / childPxPerCm;

    const scaledWidth = imageWidth * scaleFactor;
    const scaledHeight = imageHeight * scaleFactor;

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
    } else if (micrograph.xOffset != null && micrograph.yOffset != null) {
      centerX = micrograph.xOffset + scaledWidth / 2;
      centerY = micrograph.yOffset + scaledHeight / 2;
    }

    return {
      x: centerX,
      y: centerY,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
      rotation: micrograph.rotation || 0,
      offsetX: imageWidth / 2,
      offsetY: imageHeight / 2,
      isAffine: false,
      transformedWidth: imageWidth,
      transformedHeight: imageHeight,
      affineOutlinePoints: null,
    };
  }, [micrograph, imageWidth, imageHeight, parentScalePixelsPerCm]);

  // ============================================================================
  // VIEWPORT CULLING
  // ============================================================================

  const isInViewport = useCallback((): boolean => {
    if (!overlayTransform) return false;

    const { x, y, scaleX, scaleY, rotation, transformedWidth, transformedHeight } = overlayTransform;
    const displayWidth = transformedWidth * scaleX;
    const displayHeight = transformedHeight * scaleY;

    // AABB of rotated rectangle
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rotatedWidth = displayWidth * cos + displayHeight * sin;
    const rotatedHeight = displayWidth * sin + displayHeight * cos;

    const screenCenterX = x * stageScale + viewport.x;
    const screenCenterY = y * stageScale + viewport.y;
    const screenWidth = rotatedWidth * stageScale;
    const screenHeight = rotatedHeight * stageScale;

    const screenX = screenCenterX - screenWidth / 2;
    const screenY = screenCenterY - screenHeight / 2;
    const margin = 100;

    return (
      screenX < viewport.width + margin &&
      screenX + screenWidth > -margin &&
      screenY < viewport.height + margin &&
      screenY + screenHeight > -margin
    );
  }, [overlayTransform, stageScale, viewport]);

  // ============================================================================
  // DETERMINE RENDER MODE
  // ============================================================================

  const determineMode = useCallback((): RenderMode => {
    if (!isInViewport()) return 'THUMBNAIL';
    if (stageScale >= 1.0) return 'TILED';
    if (stageScale >= 0.5) return 'MEDIUM';

    // Low zoom — check coverage
    if (!overlayTransform) return 'THUMBNAIL';
    const { scaleX, scaleY, transformedWidth, transformedHeight } = overlayTransform;
    const screenWidth = transformedWidth * scaleX * stageScale;
    const screenHeight = transformedHeight * scaleY * stageScale;
    const coverage = (screenWidth * screenHeight) / (viewport.width * viewport.height);
    return coverage >= 0.3 ? 'MEDIUM' : 'THUMBNAIL';
  }, [isInViewport, stageScale, viewport, overlayTransform]);

  // Update render mode when relevant state changes
  useEffect(() => {
    setRenderMode(determineMode());
  }, [determineMode]);

  // ============================================================================
  // IMAGE LOADING
  // ============================================================================

  // Load thumbnail
  useEffect(() => {
    const session = ++sessionRef.current;
    tileLoader.loadThumbnail(micrograph.id)
      .then(img => { if (session === sessionRef.current) setThumbnailImage(img); })
      .catch(() => {});
  }, [micrograph.id, tileLoader]);

  // Load medium when needed
  useEffect(() => {
    if (renderMode !== 'MEDIUM' && renderMode !== 'TILED') return;
    if (mediumImage) return; // Already loaded

    tileLoader.loadMedium(micrograph.id)
      .then(img => setMediumImage(img))
      .catch(() => {});
  }, [renderMode, micrograph.id, tileLoader, mediumImage]);

  // Load tile metadata and tiles when in TILED mode
  useEffect(() => {
    if (renderMode !== 'TILED') return;

    const loadTiles = async () => {
      try {
        // Load metadata if not yet loaded
        let meta = tileMetadata;
        if (!meta) {
          meta = await tileLoader.loadMetadata(micrograph.id);
          setTileMetadata(meta);
        }

        // Build tile coordinate list
        const tileCoords: Array<{ x: number; y: number }> = [];
        for (let ty = 0; ty < meta.tilesY; ty++) {
          for (let tx = 0; tx < meta.tilesX; tx++) {
            const key = `${tx}_${ty}`;
            if (!tiles.has(key)) {
              tileCoords.push({ x: tx, y: ty });
            }
          }
        }

        if (tileCoords.length === 0) return;

        const results = await tileLoader.loadTilesBatch(micrograph.id, tileCoords);
        setTiles(prev => {
          const next = new Map(prev);
          for (const { x, y, image } of results) {
            next.set(`${x}_${y}`, image);
          }
          return next;
        });
      } catch {
        // Tile loading failed — fall back to medium
      }
    };

    loadTiles();
  }, [renderMode, micrograph.id, tileLoader, tileMetadata, tiles]);

  // ============================================================================
  // CLICK HANDLER
  // ============================================================================

  const handleClick = useCallback(() => {
    onClick?.(micrograph.id);
  }, [onClick, micrograph.id]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!overlayTransform) return null;
  if (micrograph.isMicroVisible === false) return null;

  const { x, y, scaleX, scaleY, rotation, offsetX, offsetY, isAffine, transformedWidth, transformedHeight, affineOutlinePoints } = overlayTransform;
  const opacity = (micrograph.opacity ?? 100) / 100;

  // Get the best available image for current mode
  let displayImage: HTMLImageElement | null = null;
  let showTiles = false;

  if (renderMode === 'TILED' && tiles.size > 0) {
    showTiles = true;
  } else if (renderMode === 'MEDIUM' && mediumImage) {
    displayImage = mediumImage;
  } else if (renderMode === 'TILED' && mediumImage) {
    displayImage = mediumImage; // Fallback while tiles load
  } else {
    displayImage = thumbnailImage;
  }

  if (!displayImage && !showTiles) return null;

  return (
    <Group
      x={x}
      y={y}
      scaleX={scaleX}
      scaleY={scaleY}
      rotation={rotation}
      offsetX={offsetX}
      offsetY={offsetY}
      onClick={handleClick}
      onTap={handleClick}
    >
      {/* Single image mode (thumbnail or medium) */}
      {displayImage && !showTiles && (
        <KonvaImage
          image={displayImage}
          x={0}
          y={0}
          width={transformedWidth}
          height={transformedHeight}
          opacity={opacity}
        />
      )}

      {/* Tiled mode */}
      {showTiles && Array.from(tiles.entries()).map(([key, img]) => {
        const [tx, ty] = key.split('_').map(Number);
        return (
          <KonvaImage
            key={key}
            image={img}
            x={tx * TILE_SIZE}
            y={ty * TILE_SIZE}
            width={TILE_SIZE + 2}
            height={TILE_SIZE + 2}
            opacity={opacity}
          />
        );
      })}

      {/* Outline */}
      {isAffine && affineOutlinePoints ? (
        <Line
          points={affineOutlinePoints}
          stroke="#5b9aff"
          strokeWidth={1 / stageScale}
          closed
          opacity={0.5}
          listening={false}
        />
      ) : (
        <Rect
          x={0}
          y={0}
          width={transformedWidth}
          height={transformedHeight}
          stroke="#5b9aff"
          strokeWidth={1 / stageScale}
          opacity={0.5}
          listening={false}
        />
      )}
    </Group>
  );
}
