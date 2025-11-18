/**
 * TiledViewer Component
 *
 * Konva-based viewer for large micrograph images with tiled rendering.
 * Implements the approved architecture from docs/tile-cache-discussion.md
 * and docs/overlay-strategy-discussion.md
 *
 * Features:
 * - Disk-based tile caching for fast loading
 * - Viewport culling (only renders visible tiles)
 * - Zoom and pan controls
 * - Support for 100MB+ TIFF files
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import './TiledViewer.css';

const TILE_SIZE = 256;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20; // Increased from 5x to 20x for detail work
const ZOOM_STEP = 1.1;

interface TiledViewerProps {
  imagePath: string | null;
}

interface TileInfo {
  x: number;
  y: number;
  dataUrl: string;
  imageObj?: HTMLImageElement;
}

interface ImageMetadata {
  hash: string;
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  fromCache: boolean;
}

export const TiledViewer: React.FC<TiledViewerProps> = ({ imagePath }) => {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);
  const [tiles, setTiles] = useState<Map<string, TileInfo>>(new Map());
  const [visibleTiles, setVisibleTiles] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  /**
   * Load image metadata and initialize viewer
   */
  useEffect(() => {
    if (!imagePath || !window.api) return;

    const loadImage = async () => {
      setIsLoading(true);
      try {
        console.log('Loading image with tiles:', imagePath);

        const result = await window.api!.loadImageWithTiles(imagePath);

        console.log('Image loaded:', {
          hash: result.hash,
          dimensions: `${result.metadata.width}x${result.metadata.height}`,
          tiles: `${result.metadata.tilesX}x${result.metadata.tilesY}`,
          fromCache: result.fromCache,
        });

        setImageMetadata({
          hash: result.hash,
          width: result.metadata.width,
          height: result.metadata.height,
          tilesX: result.metadata.tilesX,
          tilesY: result.metadata.tilesY,
          fromCache: result.fromCache,
        });

        // Reset view
        fitToScreen(result.metadata.width, result.metadata.height);
      } catch (error) {
        console.error('Failed to load image:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [imagePath]);

  /**
   * Fit image to screen on initial load
   */
  const fitToScreen = useCallback((width: number, height: number) => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Calculate zoom to fit
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const newZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

    // Center the image
    const newX = (containerWidth - width * newZoom) / 2;
    const newY = (containerHeight - height * newZoom) / 2;

    setZoom(newZoom);
    setPosition({ x: newX, y: newY });
  }, []);

  /**
   * Calculate which tiles are visible in the current viewport
   */
  const calculateVisibleTiles = useCallback(() => {
    if (!imageMetadata || !containerRef.current) return;

    const { tilesX, tilesY } = imageMetadata;

    // Get viewport bounds in image space
    const viewportX = -position.x / zoom;
    const viewportY = -position.y / zoom;
    const viewportWidth = stageSize.width / zoom;
    const viewportHeight = stageSize.height / zoom;

    // Calculate tile range with padding (load 1 tile beyond viewport)
    const padding = 1;
    const startTileX = Math.max(0, Math.floor(viewportX / TILE_SIZE) - padding);
    const endTileX = Math.min(tilesX - 1, Math.ceil((viewportX + viewportWidth) / TILE_SIZE) + padding);
    const startTileY = Math.max(0, Math.floor(viewportY / TILE_SIZE) - padding);
    const endTileY = Math.min(tilesY - 1, Math.ceil((viewportY + viewportHeight) / TILE_SIZE) + padding);

    // Generate list of visible tile keys
    const visible: string[] = [];
    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        visible.push(`${x}_${y}`);
      }
    }

    setVisibleTiles(visible);
  }, [imageMetadata, position, zoom, stageSize]);

  /**
   * Load tiles that are visible but not yet loaded
   */
  useEffect(() => {
    if (!imageMetadata || visibleTiles.length === 0 || !window.api) return;

    const loadTiles = async () => {
      const tilesToLoad: Array<{ x: number; y: number }> = [];

      // Find tiles that need loading
      for (const tileKey of visibleTiles) {
        if (!tiles.has(tileKey)) {
          const [x, y] = tileKey.split('_').map(Number);
          tilesToLoad.push({ x, y });
        }
      }

      if (tilesToLoad.length === 0) return;

      console.log(`Loading ${tilesToLoad.length} tiles...`);

      try {
        // Load tiles in batch
        const results = await window.api!.loadTilesBatch(imageMetadata.hash, tilesToLoad);

        // Create image objects from data URLs
        const newTiles = new Map(tiles);

        for (const { x, y, dataUrl } of results) {
          const tileKey = `${x}_${y}`;

          // Create image object
          const img = new Image();
          img.src = dataUrl;

          newTiles.set(tileKey, {
            x,
            y,
            dataUrl,
            imageObj: img,
          });
        }

        setTiles(newTiles);
      } catch (error) {
        console.error('Failed to load tiles:', error);
      }
    };

    loadTiles();
  }, [visibleTiles, imageMetadata, tiles]);

  /**
   * Update visible tiles when viewport changes
   */
  useEffect(() => {
    calculateVisibleTiles();
  }, [calculateVisibleTiles]);

  /**
   * Handle container resize
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setStageSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  /**
   * Handle mouse wheel zoom
   */
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldZoom = zoom;
    const pointer = stage.getPointerPosition();

    // Calculate new zoom
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));

    if (newZoom === oldZoom) return;

    // Zoom to pointer position
    const mousePointTo = {
      x: (pointer.x - position.x) / oldZoom,
      y: (pointer.y - position.y) / oldZoom,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    };

    setZoom(newZoom);
    setPosition(newPos);
  }, [zoom, position]);

  /**
   * Handle pan (drag to move)
   */
  const handleMouseDown = useCallback((e: any) => {
    if (e.evt.button !== 0) return; // Only left mouse button
    setIsPanning(true);
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    setLastPointerPos(pos);
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isPanning || !lastPointerPos) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    const dx = pos.x - lastPointerPos.x;
    const dy = pos.y - lastPointerPos.y;

    setPosition({
      x: position.x + dx,
      y: position.y + dy,
    });

    setLastPointerPos(pos);
  }, [isPanning, lastPointerPos, position]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  /**
   * Reset zoom (fit to screen)
   */
  const handleResetZoom = useCallback(() => {
    if (!imageMetadata) return;
    fitToScreen(imageMetadata.width, imageMetadata.height);
  }, [imageMetadata, fitToScreen]);

  return (
    <div className="tiled-viewer" ref={containerRef}>
      {isLoading && (
        <div className="tiled-viewer-loading">
          <div className="spinner" />
          <p>Loading image...</p>
        </div>
      )}

      {!imagePath && !isLoading && (
        <div className="tiled-viewer-empty">
          <p>No image loaded</p>
          <p className="hint">Create a new project to get started</p>
        </div>
      )}

      {imageMetadata && (
        <>
          <div className="tiled-viewer-toolbar">
            <div className="zoom-info">
              Zoom: {(zoom * 100).toFixed(0)}%
            </div>
            <button onClick={handleResetZoom} className="reset-zoom-btn">
              Fit to Screen
            </button>
            <div className="image-info">
              {imageMetadata.width} × {imageMetadata.height} px
              {imageMetadata.fromCache && <span className="cache-badge">Cached</span>}
            </div>
          </div>

          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            <Layer
              x={position.x}
              y={position.y}
              scaleX={zoom}
              scaleY={zoom}
            >
              {/* Render visible tiles */}
              {visibleTiles.map((tileKey) => {
                const tile = tiles.get(tileKey);
                if (!tile || !tile.imageObj) return null;

                return (
                  <KonvaImage
                    key={tileKey}
                    image={tile.imageObj}
                    x={tile.x * TILE_SIZE}
                    y={tile.y * TILE_SIZE}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                  />
                );
              })}
            </Layer>
          </Stage>
        </>
      )}
    </div>
  );
};
