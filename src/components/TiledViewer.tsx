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

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import { Box, CircularProgress, Typography } from '@mui/material';
import './TiledViewer.css';

const TILE_SIZE = 256;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20; // Increased from 5x to 20x for detail work
const ZOOM_STEP = 1.1;

interface TiledViewerProps {
  imagePath: string | null;
}

export interface TiledViewerRef {
  fitToScreen: () => void;
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

type RenderMode = 'thumbnail' | 'tiled';

interface ThumbnailState {
  imageObj: HTMLImageElement;
  dataUrl: string;
}

export const TiledViewer = forwardRef<TiledViewerRef, TiledViewerProps>(({ imagePath }, ref) => {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>('thumbnail');
  const [thumbnail, setThumbnail] = useState<ThumbnailState | null>(null);
  const [tiles, setTiles] = useState<Map<string, TileInfo>>(new Map());
  const [visibleTiles, setVisibleTiles] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTiles, setIsLoadingTiles] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  /**
   * Load image metadata and initialize viewer
   */
  useEffect(() => {
    if (!imagePath || !window.api) {
      // Clear state when no image
      setImageMetadata(null);
      setTiles(new Map());
      setVisibleTiles([]);
      return;
    }

    const loadImage = async () => {
      setIsLoading(true);

      // Clear previous image state immediately
      setImageMetadata(null);
      setRenderMode('thumbnail');
      setThumbnail(null);
      setTiles(new Map());
      setVisibleTiles([]);
      setZoom(1);
      setPosition({ x: 0, y: 0 });

      try {
        console.log('=== Progressive Loading: Step 1 - Load metadata ===');

        // Step 1: Load image metadata (fast, creates thumbnail)
        const result = await window.api!.loadImageWithTiles(imagePath);

        console.log('Metadata loaded:', {
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

        // Step 2: Load and display thumbnail immediately (512px max)
        console.log('=== Progressive Loading: Step 2 - Load thumbnail ===');
        const thumbnailDataUrl = await window.api!.loadThumbnail(result.hash);

        const thumbnailImg = new Image();
        thumbnailImg.src = thumbnailDataUrl;
        await new Promise((resolve) => {
          thumbnailImg.onload = resolve;
        });

        setThumbnail({
          imageObj: thumbnailImg,
          dataUrl: thumbnailDataUrl,
        });

        // Fit thumbnail to screen
        fitToScreen(result.metadata.width, result.metadata.height);

        setIsLoading(false);
        console.log('=== Thumbnail displayed, user can now interact ===');

        // Step 3: Load ALL tiles in background (not viewport-based)
        console.log('=== Progressive Loading: Step 3 - Loading all tiles in background ===');
        loadAllTiles(result.hash, result.metadata.tilesX, result.metadata.tilesY);

      } catch (error) {
        console.error('Failed to load image:', error);
        setIsLoading(false);
      }
    };

    loadImage();
  }, [imagePath]);

  /**
   * Load ALL tiles for the entire image in background
   * Uses chunked loading to keep UI responsive
   */
  const loadAllTiles = useCallback(async (hash: string, tilesX: number, tilesY: number) => {
    setIsLoadingTiles(true);
    try {
      // Generate list of ALL tile coordinates
      const allTileCoords: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
          allTileCoords.push({ x, y });
        }
      }

      console.log(`Loading all ${allTileCoords.length} tiles in background...`);

      // Load all tile data from disk (this happens in the main process)
      const results = await window.api!.loadTilesBatch(hash, allTileCoords);

      // Decode images in chunks to avoid blocking UI
      const newTiles = new Map<string, TileInfo>();
      const CHUNK_SIZE = 20; // Decode 20 images at a time

      for (let i = 0; i < results.length; i += CHUNK_SIZE) {
        const chunk = results.slice(i, i + CHUNK_SIZE);
        const chunkPromises: Promise<void>[] = [];

        for (const { x, y, dataUrl } of chunk) {
          const tileKey = `${x}_${y}`;
          const img = new Image();

          const loadPromise = new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Don't block on errors
          });
          chunkPromises.push(loadPromise);

          img.src = dataUrl;

          newTiles.set(tileKey, {
            x,
            y,
            dataUrl,
            imageObj: img,
          });
        }

        // Wait for this chunk to decode
        await Promise.all(chunkPromises);

        // Yield to browser after each chunk to allow user interactions
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      console.log(`All ${allTileCoords.length} tiles loaded and ready`);

      // Now update state ONCE with all tiles - triggers single re-render
      setTiles(newTiles);

      // Switch to tiled mode
      console.log('=== All tiles loaded, switching to tiled mode ===');
      setRenderMode('tiled');

    } catch (error) {
      console.error('Failed to load all tiles:', error);
    } finally {
      setIsLoadingTiles(false);
    }
  }, []);

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
   * Load tiles that are visible but not yet loaded (only in tiled mode)
   * In thumbnail mode, all tiles are loaded upfront by loadAllTiles()
   */
  useEffect(() => {
    // Only do on-demand tile loading in tiled mode (for pan/zoom after initial load)
    if (renderMode !== 'tiled') return;
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

      console.log(`Loading ${tilesToLoad.length} additional tiles...`);

      try {
        // Load tiles in batch
        const results = await window.api!.loadTilesBatch(imageMetadata.hash, tilesToLoad);

        // Create image objects from data URLs and wait for them to load
        const newTiles = new Map(tiles);
        const imageLoadPromises: Promise<void>[] = [];

        for (const { x, y, dataUrl } of results) {
          const tileKey = `${x}_${y}`;

          // Create image object
          const img = new Image();

          // Wait for image to actually load
          const loadPromise = new Promise<void>((resolve) => {
            img.onload = () => resolve();
          });
          imageLoadPromises.push(loadPromise);

          img.src = dataUrl;

          newTiles.set(tileKey, {
            x,
            y,
            dataUrl,
            imageObj: img,
          });
        }

        // Wait for ALL tile images to finish loading
        await Promise.all(imageLoadPromises);
        console.log(`All ${imageLoadPromises.length} additional tiles loaded`);

        setTiles(newTiles);
      } catch (error) {
        console.error('Failed to load tiles:', error);
      }
    };

    loadTiles();
  }, [visibleTiles, imageMetadata, tiles, renderMode]);

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

  // Expose fitToScreen method to parent components via ref
  useImperativeHandle(ref, () => ({
    fitToScreen: handleResetZoom,
  }), [handleResetZoom]);

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
              {/* Progressive loading: Show thumbnail first, then switch to tiles */}
              {renderMode === 'thumbnail' && thumbnail && (
                <KonvaImage
                  image={thumbnail.imageObj}
                  x={0}
                  y={0}
                  width={imageMetadata!.width}
                  height={imageMetadata!.height}
                />
              )}

              {/* Render visible tiles in tiled mode */}
              {renderMode === 'tiled' && visibleTiles.map((tileKey) => {
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

          {/* Tile loading indicator */}
          {isLoadingTiles && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 1000,
                bgcolor: 'rgba(0, 0, 0, 0.85)',
                color: '#4caf50',
                px: 2.5,
                py: 1.5,
                borderRadius: 2,
                border: '2px solid white',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              <CircularProgress size={18} sx={{ color: '#4caf50' }} />
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#4caf50' }}>
                Loading high-res tiles...
              </Typography>
            </Box>
          )}
        </>
      )}
    </div>
  );
});
