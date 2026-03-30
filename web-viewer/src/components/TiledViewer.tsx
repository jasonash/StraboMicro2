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
  tileLoader: HttpTileLoader;
  onSpotClick?: (spot: Spot) => void;
  onOverlayClick?: (micrographId: string) => void;
}

export function TiledViewer({ micrographId, spots, sketchLayers, scalePixelsPerCentimeter, childMicrographs, imageWidth, imageHeight, tileLoader, onSpotClick, onOverlayClick }: TiledViewerProps) {
  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Image state
  const [metadata, setMetadata] = useState<TileMetadata | null>(null);
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);
  const [tiles, setTiles] = useState<Map<string, TileInfo>>(new Map());
  const [renderMode, setRenderMode] = useState<'loading' | 'thumbnail' | 'tiled'>('loading');
  const [visibleTiles, setVisibleTiles] = useState<string[]>([]);

  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [cursorImagePos, setCursorImagePos] = useState<{ x: number; y: number } | null>(null);

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
      setThumbnail(null);

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
          // Thumbnail might not exist, try medium
          const mediumImg = await tileLoader.loadMedium(micrographId);
          if (currentSession !== sessionRef.current) return;
          setThumbnail(mediumImg);
          setRenderMode('thumbnail');
          fitToScreen(meta.width, meta.height);
        }

        setIsLoading(false);

        // Step 3: Load all tiles in background
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
        setRenderMode('tiled');
        setLoadingMessage('');
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
    setHasDragged(false);

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

    // Track cursor position in image coordinates
    const imageX = (pos.x - position.x) / zoom;
    const imageY = (pos.y - position.y) / zoom;
    setCursorImagePos({ x: imageX, y: imageY });

    if (isPanning && lastPointerPos) {
      const dx = pos.x - lastPointerPos.x;
      const dy = pos.y - lastPointerPos.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setHasDragged(true);
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

  // ============================================================================
  // SPOT CLICK
  // ============================================================================

  const handleSpotClick = useCallback((spot: Spot) => {
    if (hasDragged) return;
    onSpotClick?.(spot);
  }, [hasDragged, onSpotClick]);

  // ============================================================================
  // SELECTED SPOT (for highlight)
  // ============================================================================

  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  const handleSpotClickWithSelect = useCallback((spot: Spot) => {
    if (hasDragged) return;
    setSelectedSpotId(spot.id);
    onSpotClick?.(spot);
  }, [hasDragged, onSpotClick]);

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
        backgroundColor: '#1a1a2e',
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
        onMouseLeave={handleMouseUp}
      >
        {/* Image layer */}
        <Layer
          x={position.x}
          y={position.y}
          scaleX={zoom}
          scaleY={zoom}
        >
          {/* Thumbnail fallback */}
          {renderMode === 'thumbnail' && thumbnail && metadata && (
            <KonvaImage
              image={thumbnail}
              x={0}
              y={0}
              width={metadata.width}
              height={metadata.height}
            />
          )}

          {/* Tiled rendering */}
          {renderMode === 'tiled' &&
            visibleTiles.map((tileKey) => {
              const tile = tiles.get(tileKey);
              if (!tile) return null;

              return (
                <KonvaImage
                  key={tileKey}
                  image={tile.image}
                  x={tile.x * TILE_SIZE}
                  y={tile.y * TILE_SIZE}
                  width={TILE_SIZE + 1}
                  height={TILE_SIZE + 1}
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
              />
            ))}
          </Layer>
        )}

        {/* Spots layer */}
        <Layer
          x={position.x}
          y={position.y}
          scaleX={zoom}
          scaleY={zoom}
        >
          {(renderMode === 'thumbnail' || renderMode === 'tiled') &&
            spots.map((spot) => (
              <SpotRenderer
                key={spot.id}
                spot={spot}
                scale={zoom}
                isSelected={spot.id === selectedSpotId}
                onClick={handleSpotClickWithSelect}
              />
            ))}
        </Layer>

        {/* Sketch layers */}
        {sketchLayers && sketchLayers.length > 0 && (
          <Layer
            x={position.x}
            y={position.y}
            scaleX={zoom}
            scaleY={zoom}
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
