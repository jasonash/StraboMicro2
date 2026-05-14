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
  /** Whether the user is currently dragging/panning — suppresses click */
  hasDragged?: boolean;
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
  hasDragged,
}: AssociatedImageRendererProps) {
  const [thumbnailImage, setThumbnailImage] = useState<HTMLImageElement | null>(null);
  const [mediumImage, setMediumImage] = useState<HTMLImageElement | null>(null);
  const [tiles, setTiles] = useState<Map<string, HTMLImageElement>>(new Map());
  const [tileMetadata, setTileMetadata] = useState<TileMetadata | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>('THUMBNAIL');
  // Which pyramid to load tiles from. Affine overlays prefer tilesAffine/<id>/
  // (warped pixels), but legacy .smz exports stored those at tiles/<id>/, so
  // we fall back to 'original' if the affine metadata 404s.
  const [tileVariant, setTileVariant] = useState<'original' | 'affine' | null>(null);
  const sessionRef = useRef(0);

  // Dimensions from project.json — may be 0 if not serialized
  const projectWidth = micrograph.width || micrograph.imageWidth || 0;
  const projectHeight = micrograph.height || micrograph.imageHeight || 0;

  // Use tile metadata dimensions as fallback when project.json has 0
  const imageWidth = projectWidth || tileMetadata?.width || 0;
  const imageHeight = projectHeight || tileMetadata?.height || 0;

  // ============================================================================
  // EAGERLY LOAD TILE METADATA (needed for dimensions and tiled mode)
  // For affine placements: try tilesAffine/ first, fall back to tiles/ if absent.
  // ============================================================================

  useEffect(() => {
    let cancelled = false;
    const isAffine = micrograph.placementType === 'affine';

    const resolve = async () => {
      if (isAffine) {
        try {
          const meta = await tileLoader.loadMetadata(micrograph.id, 'affine');
          if (cancelled) return;
          setTileVariant('affine');
          setTileMetadata(meta);
          return;
        } catch {
          // tilesAffine/ missing — legacy .smz where tiles/ holds the warped pyramid
        }
      }
      try {
        const meta = await tileLoader.loadMetadata(micrograph.id, 'original');
        if (cancelled) return;
        setTileVariant('original');
        setTileMetadata(meta);
      } catch {
        if (cancelled) return;
        setTileVariant('original');
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [micrograph.id, micrograph.placementType, tileLoader]);

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
    if (!tileVariant) return;
    const session = ++sessionRef.current;
    tileLoader.loadThumbnail(micrograph.id, tileVariant)
      .then(img => { if (session === sessionRef.current) setThumbnailImage(img); })
      .catch(() => {});
  }, [micrograph.id, tileLoader, tileVariant]);

  // Load medium when needed
  useEffect(() => {
    if (!tileVariant) return;
    if (renderMode !== 'MEDIUM' && renderMode !== 'TILED') return;
    if (mediumImage) return; // Already loaded

    tileLoader.loadMedium(micrograph.id, tileVariant)
      .then(img => setMediumImage(img))
      .catch(() => {});
  }, [renderMode, micrograph.id, tileLoader, mediumImage, tileVariant]);

  // Load tile metadata and tiles when in TILED mode
  useEffect(() => {
    if (renderMode !== 'TILED') return;
    if (!tileVariant) return;

    const loadTiles = async () => {
      try {
        // Load metadata if not yet loaded
        let meta = tileMetadata;
        if (!meta) {
          meta = await tileLoader.loadMetadata(micrograph.id, tileVariant);
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

        const results = await tileLoader.loadTilesBatch(micrograph.id, tileCoords, tileVariant);
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
  }, [renderMode, micrograph.id, tileLoader, tileMetadata, tiles, tileVariant]);

  // ============================================================================
  // CLICK HANDLER
  // ============================================================================

  const handleClick = useCallback(() => {
    if (hasDragged) return;
    onClick?.(micrograph.id);
  }, [onClick, micrograph.id, hasDragged]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!overlayTransform) return null;
  if (micrograph.isMicroVisible === false) return null;

  const { x, y, scaleX, scaleY, rotation, offsetX, offsetY, isAffine, transformedWidth, transformedHeight, affineOutlinePoints } = overlayTransform;
  // Micrograph overlay opacity is 0-1 (not 0-100 like spots)
  const opacity = micrograph.opacity ?? 1.0;

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

      {/* Tiled mode — halo-padded tiles render at natural size with offset; legacy falls back to +2 stretch */}
      {showTiles && Array.from(tiles.entries()).map(([key, img]) => {
        const [tx, ty] = key.split('_').map(Number);
        const padding = tileMetadata?.tilePadding ?? 0;
        if (padding > 0) {
          const padLeft = tx > 0 ? padding : 0;
          const padTop = ty > 0 ? padding : 0;
          return (
            <KonvaImage
              key={key}
              image={img}
              x={tx * TILE_SIZE - padLeft}
              y={ty * TILE_SIZE - padTop}
              width={img.naturalWidth}
              height={img.naturalHeight}
              opacity={opacity}
            />
          );
        }
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
