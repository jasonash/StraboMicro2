/**
 * TiledViewer — Read-only tiled image viewer
 *
 * Adapted from the desktop app's TiledViewer.tsx, stripped down to:
 * - Tile loading via HTTP (not IPC)
 * - Pan/zoom interaction
 * - Spot rendering
 * - No editing, drawing, or sketch tools
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { SpotRenderer } from './SpotRenderer';
import { SketchLayerRenderer } from './SketchLayerRenderer';
import { AssociatedImageRenderer } from './AssociatedImageRenderer';
import { ScaleBar } from './ScaleBar';
import { CursorLocation } from './CursorLocation';
import { HttpTileLoader, TileMetadata } from '../services/tileLoader';
import type { Spot, SketchLayer, MicrographMetadata } from '../types/project-types';

// Constants matching desktop app
const TILE_SIZE = 256;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.1;

interface TileInfo {
  x: number;
  y: number;
  image: HTMLImageElement;
}

interface TiledViewerProps {
  micrographId: string | null;
  spots: Spot[];
  sketchLayers?: SketchLayer[] | null;
  scalePixelsPerCentimeter?: number | null;
  /** Child micrographs to render as overlays */
  childMicrographs?: MicrographMetadata[];
  /** Parent image dimensions (needed for overlay positioning) */
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** Currently selected spot ID (controlled from parent) */
  selectedSpotId?: string | null;
  tileLoader: HttpTileLoader;
  onSpotClick?: (spot: Spot) => void;
  /** Called when user clicks empty canvas (deselect) */
  onCanvasClick?: () => void;
  onOverlayClick?: (micrographId: string) => void;
}

export function TiledViewer({ micrographId, spots, sketchLayers, scalePixelsPerCentimeter, childMicrographs, imageWidth, imageHeight, selectedSpotId, tileLoader, onSpotClick, onCanvasClick, onOverlayClick }: TiledViewerProps) {
  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Image state
  const [metadata, setMetadata] = useState<TileMetadata | null>(null);
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);
  const [mediumImage, setMediumImage] = useState<HTMLImageElement | null>(null);
  const [tiles, setTiles] = useState<Map<string, TileInfo>>(new Map());
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [renderMode, setRenderMode] = useState<'loading' | 'thumbnail' | 'medium' | 'tiled'>('loading');
  const [visibleTiles, setVisibleTiles] = useState<string[]>([]);

  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const [cursorImagePos, setCursorImagePos] = useState<{ x: number; y: number } | null>(null);
  const cursorThrottleRef = useRef<number>(0);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const sessionRef = useRef(0);

  // ============================================================================
  // CONTAINER RESIZE
  // ============================================================================

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
    });

    observer.observe(container);
    setStageSize({ width: container.clientWidth, height: container.clientHeight });

    return () => observer.disconnect();
  }, []);

  // ============================================================================
  // FIT TO SCREEN
  // ============================================================================

  const fitToScreen = useCallback((imageWidth: number, imageHeight: number) => {
    const scaleX = stageSize.width / imageWidth;
    const scaleY = stageSize.height / imageHeight;
    const newZoom = Math.min(scaleX, scaleY) * 0.95; // 5% padding

    const newX = (stageSize.width - imageWidth * newZoom) / 2;
    const newY = (stageSize.height - imageHeight * newZoom) / 2;

    setZoom(newZoom);
    setPosition({ x: newX, y: newY });
  }, [stageSize]);

  // ============================================================================
  // IMAGE LOADING
  // ============================================================================

  useEffect(() => {
    if (!micrographId) {
      setMetadata(null);
      setThumbnail(null);
      setTiles(new Map());
      setRenderMode('loading');
      return;
    }

    const currentSession = ++sessionRef.current;

    const loadImage = async () => {
      setIsLoading(true);
      setLoadingMessage('Loading metadata...');
      setRenderMode('loading');
      setTiles(new Map());
      setTilesLoaded(false);
      setThumbnail(null);
      setMediumImage(null);

      try {
        // Step 1: Load metadata
        const meta = await tileLoader.loadMetadata(micrographId);
        if (currentSession !== sessionRef.current) return;

        setMetadata(meta);

        // Step 2: Load thumbnail for quick display
        setLoadingMessage('Loading preview...');
        try {
          const thumbImg = await tileLoader.loadThumbnail(micrographId);
          if (currentSession !== sessionRef.current) return;
          setThumbnail(thumbImg);
          setRenderMode('thumbnail');
          fitToScreen(meta.width, meta.height);
        } catch {
          // Thumbnail might not exist, skip
        }

        // Step 3: Load medium image (2048px — seamless, good for most zoom levels)
        try {
          const medImg = await tileLoader.loadMedium(micrographId);
          if (currentSession !== sessionRef.current) return;
          setMediumImage(medImg);
          setRenderMode('medium');
          if (!thumbnail) fitToScreen(meta.width, meta.height);
        } catch {
          // Medium might not exist, skip
        }

        setIsLoading(false);

        // Step 4: Load all tiles in background (for high-zoom detail)
        setLoadingMessage('Loading tiles...');
        const allCoords: Array<{ x: number; y: number }> = [];
        for (let y = 0; y < meta.tilesY; y++) {
          for (let x = 0; x < meta.tilesX; x++) {
            allCoords.push({ x, y });
          }
        }

        const results = await tileLoader.loadTilesBatch(micrographId, allCoords);
        if (currentSession !== sessionRef.current) return;

        const newTiles = new Map<string, TileInfo>();
        for (const { x, y, image } of results) {
          newTiles.set(`${x}_${y}`, { x, y, image });
        }

        setTiles(newTiles);
        setTilesLoaded(true);
        setLoadingMessage('');
        // Don't switch to 'tiled' here — let the zoom-based LOD effect handle it
      } catch (err) {
        if (currentSession !== sessionRef.current) return;
        console.error('Failed to load image:', err);
        setLoadingMessage('Failed to load image');
        setIsLoading(false);
      }
    };

    loadImage();
  }, [micrographId, tileLoader, fitToScreen]);

  // ============================================================================
  // VISIBLE TILE CALCULATION
  // ============================================================================

  useEffect(() => {
    if (!metadata || renderMode !== 'tiled') return;

    const viewportX = -position.x / zoom;
    const viewportY = -position.y / zoom;
    const viewportWidth = stageSize.width / zoom;
    const viewportHeight = stageSize.height / zoom;

    const padding = 1;
    const startTileX = Math.max(0, Math.floor(viewportX / TILE_SIZE) - padding);
    const endTileX = Math.min(metadata.tilesX - 1, Math.ceil((viewportX + viewportWidth) / TILE_SIZE) + padding);
    const startTileY = Math.max(0, Math.floor(viewportY / TILE_SIZE) - padding);
    const endTileY = Math.min(metadata.tilesY - 1, Math.ceil((viewportY + viewportHeight) / TILE_SIZE) + padding);

    const visible: string[] = [];
    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        visible.push(`${x}_${y}`);
      }
    }

    setVisibleTiles(visible);
  }, [metadata, position, zoom, stageSize, renderMode]);

  // ============================================================================
  // ZOOM-BASED LOD: Switch between medium and tiled based on zoom level
  // Debounced to prevent thrashing during rapid zoom
  // ============================================================================

  const lodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!metadata) return;
    if (!mediumImage && !tilesLoaded) return;

    const TILE_ZOOM_THRESHOLD = 0.5;

    // Determine target mode
    const targetMode = (tilesLoaded && zoom >= TILE_ZOOM_THRESHOLD) ? 'tiled' : 'medium';

    if (targetMode === renderMode) return;

    // Switching TO tiled is expensive (many nodes) — debounce it
    // Switching FROM tiled to medium is cheap — do it immediately to stop rendering tiles
    if (targetMode === 'medium') {
      if (lodTimerRef.current) clearTimeout(lodTimerRef.current);
      lodTimerRef.current = null;
      setRenderMode('medium');
    } else {
      // Debounce switching to tiled — wait for zoom to settle
      if (lodTimerRef.current) clearTimeout(lodTimerRef.current);
      lodTimerRef.current = setTimeout(() => {
        setRenderMode('tiled');
        lodTimerRef.current = null;
      }, 200);
    }

    return () => {
      if (lodTimerRef.current) clearTimeout(lodTimerRef.current);
    };
  }, [zoom, tilesLoaded, mediumImage, metadata, renderMode]);

  // ============================================================================
  // WHEEL ZOOM
  // ============================================================================

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldZoom = zoom;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, oldZoom * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
    );

    // Zoom toward mouse position
    const mousePointTo = {
      x: (pointer.x - position.x) / oldZoom,
      y: (pointer.y - position.y) / oldZoom,
    };

    setZoom(newZoom);
    setPosition({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    });
  }, [zoom, position]);

  // ============================================================================
  // PAN HANDLERS
  // ============================================================================

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    hasDraggedRef.current = false;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    setIsPanning(true);
    setLastPointerPos(pos);
  }, []);

  const handleMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Track cursor position in image coordinates (throttled to avoid excess re-renders)
    const now = Date.now();
    if (now - cursorThrottleRef.current > 50) {
      cursorThrottleRef.current = now;
      const imageX = (pos.x - position.x) / zoom;
      const imageY = (pos.y - position.y) / zoom;
      setCursorImagePos({ x: imageX, y: imageY });
    }

    if (isPanning && lastPointerPos) {
      const dx = pos.x - lastPointerPos.x;
      const dy = pos.y - lastPointerPos.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDraggedRef.current = true;
      }

      setPosition({
        x: position.x + dx,
        y: position.y + dy,
      });
      setLastPointerPos(pos);
    }
  }, [isPanning, lastPointerPos, position, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  // Deselect on click — Konva 'click' only fires for genuine clicks (not drags)
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (hasDraggedRef.current) return;
    if (spotClickedRef.current) {
      spotClickedRef.current = false;
      return;
    }
    // Only deselect if clicking on the stage background or image tiles (not a spot)
    const target = e.target;
    const stage = stageRef.current;
    if (target === stage || target.getClassName() === 'Image' || target.getClassName() === 'Rect') {
      onCanvasClick?.();
    }
  }, [onCanvasClick]);

  // ============================================================================
  // SPOT CLICK
  // ============================================================================

  const spotClickedRef = useRef(false);

  const handleSpotClickInternal = useCallback((spot: Spot) => {
    if (hasDraggedRef.current) return;
    spotClickedRef.current = true;
    onSpotClick?.(spot);
  }, [onSpotClick]);

  // ============================================================================
  // CURSOR STYLE
  // ============================================================================

  const cursorStyle = isPanning ? 'grabbing' : 'grab';

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
        cursor: cursorStyle,
        position: 'relative',
      }}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          fontSize: '18px',
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '16px 24px',
          borderRadius: '8px',
        }}>
          {loadingMessage}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setLastPointerPos(null); }}
        onClick={handleStageClick}
      >
        {/* Image layer — no interaction needed, disable hit detection */}
        <Layer
          x={position.x}
          y={position.y}
          scaleX={zoom}
          scaleY={zoom}
          listening={false}
        >
          {/* Thumbnail (lowest res, shown first while loading) */}
          {renderMode === 'thumbnail' && thumbnail && metadata && (
            <KonvaImage
              image={thumbnail}
              x={0}
              y={0}
              width={metadata.width}
              height={metadata.height}
            />
          )}

          {/* Medium image (2048px — seamless, used when zoomed out) */}
          {renderMode === 'medium' && mediumImage && metadata && (
            <KonvaImage
              image={mediumImage}
              x={0}
              y={0}
              width={metadata.width}
              height={metadata.height}
            />
          )}

          {/* Tiled rendering (full resolution, used when zoomed in). Halo-padded tiles render
              at their natural size offset by padLeft/padTop; legacy tiles fall back to the +1 stretch. */}
          {renderMode === 'tiled' &&
            visibleTiles.map((tileKey) => {
              const tile = tiles.get(tileKey);
              if (!tile) return null;

              const padding = metadata?.tilePadding ?? 0;
              if (padding > 0) {
                const padLeft = tile.x > 0 ? padding : 0;
                const padTop = tile.y > 0 ? padding : 0;
                return (
                  <KonvaImage
                    key={tileKey}
                    image={tile.image}
                    x={tile.x * TILE_SIZE - padLeft}
                    y={tile.y * TILE_SIZE - padTop}
                    width={tile.image.naturalWidth}
                    height={tile.image.naturalHeight}
                    perfectDrawEnabled={false}
                  />
                );
              }

              return (
                <KonvaImage
                  key={tileKey}
                  image={tile.image}
                  x={tile.x * TILE_SIZE}
                  y={tile.y * TILE_SIZE}
                  width={TILE_SIZE + 1}
                  height={TILE_SIZE + 1}
                  perfectDrawEnabled={false}
                />
              );
            })}
        </Layer>

        {/* Associated image overlays */}
        {childMicrographs && childMicrographs.length > 0 && (
          <Layer
            x={position.x}
            y={position.y}
            scaleX={zoom}
            scaleY={zoom}
          >
            {childMicrographs.map(child => (
              <AssociatedImageRenderer
                key={child.id}
                micrograph={child}
                parentScalePixelsPerCm={scalePixelsPerCentimeter || 100}
                parentWidth={imageWidth || metadata?.width || 0}
                parentHeight={imageHeight || metadata?.height || 0}
                viewport={{
                  x: position.x,
                  y: position.y,
                  width: stageSize.width,
                  height: stageSize.height,
                }}
                stageScale={zoom}
                tileLoader={tileLoader}
                onClick={onOverlayClick}
                hasDragged={hasDraggedRef.current}
              />
            ))}
          </Layer>
        )}

        {/* Spots layer — click enabled, hover removed from SpotRenderer */}
        <Layer
          x={position.x}
          y={position.y}
          scaleX={zoom}
          scaleY={zoom}
        >
          {renderMode !== 'loading' &&
            spots.map((spot) => (
              <SpotRenderer
                key={spot.id}
                spot={spot}
                scale={zoom}
                isSelected={spot.id === selectedSpotId}
                onClick={handleSpotClickInternal}
              />
            ))}
        </Layer>

        {/* Sketch layers — read-only, no interaction */}
        {sketchLayers && sketchLayers.length > 0 && (
          <Layer
            x={position.x}
            y={position.y}
            scaleX={zoom}
            scaleY={zoom}
            listening={false}
          >
            <SketchLayerRenderer layers={sketchLayers} />
          </Layer>
        )}
      </Stage>

      {/* Scale bar overlay */}
      <ScaleBar scalePixelsPerCentimeter={scalePixelsPerCentimeter} zoom={zoom} />

      {/* Cursor location overlay */}
      <CursorLocation
        x={cursorImagePos?.x ?? null}
        y={cursorImagePos?.y ?? null}
        scalePixelsPerCentimeter={scalePixelsPerCentimeter}
      />
    </div>
  );
}
