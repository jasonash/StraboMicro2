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

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle } from 'react-konva';
import { Box, CircularProgress, Typography, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAppStore } from '@/store';
import { getChildMicrographs } from '@/store/helpers';
import { AssociatedImageRenderer } from './AssociatedImageRenderer';
import { SpotRenderer } from './SpotRenderer';
import { SpotContextMenu } from './SpotContextMenu';
import { EditingToolbar } from './EditingToolbar';
import { NewSpotDialog } from './dialogs/NewSpotDialog';
import { EditSpotDialog } from './dialogs/metadata/EditSpotDialog';
import RulerCanvas from './RulerCanvas';
import { Geometry, Spot } from '@/types/project-types';
import { usePolygonDrawing } from '@/hooks/usePolygonDrawing';
import { useLineDrawing } from '@/hooks/useLineDrawing';
import { useImperativeGeometryEditing } from '@/hooks/useImperativeGeometryEditing';
import { getEffectiveTheme } from '@/hooks/useTheme';
import './TiledViewer.css';

const TILE_SIZE = 256;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20; // Increased from 5x to 20x for detail work
const ZOOM_STEP = 1.1;

interface TiledViewerProps {
  imagePath: string | null;
  onCursorMove?: (coords: { x: number; y: number; unit: string; decimals: number } | null) => void;
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

export const TiledViewer = forwardRef<TiledViewerRef, TiledViewerProps>(({ imagePath, onCursorMove }, ref) => {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingLayerRef = useRef<any>(null);
  const loadingSessionRef = useRef<number>(0); // Track current loading session to abort stale loads

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
  const [tileLoadingMessage, setTileLoadingMessage] = useState<string>('');
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [hasDragged, setHasDragged] = useState(false); // Track if user has dragged since mousedown

  // Track overlay tile loading state
  const [overlayLoadingCount, setOverlayLoadingCount] = useState(0);

  // New Spot Dialog state
  const [newSpotDialogOpen, setNewSpotDialogOpen] = useState(false);
  const [pendingSpotGeometry, setPendingSpotGeometry] = useState<Geometry | null>(null);

  // Edit Spot Dialog state
  const [editSpotDialogOpen, setEditSpotDialogOpen] = useState(false);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);

  // Context Menu state
  const [contextMenuSpot, setContextMenuSpot] = useState<Spot | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Get project and active micrograph from store
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeTool = useAppStore((state) => state.activeTool);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const showRulers = useAppStore((state) => state.showRulers);
  const showMicrographOutlines = useAppStore((state) => state.showMicrographOutlines);
  const theme = useAppStore((state) => state.theme);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const addSpot = useAppStore((state) => state.addSpot);
  const deleteSpot = useAppStore((state) => state.deleteSpot);
  const drillDownToMicrograph = useAppStore((state) => state.drillDownToMicrograph);
  const navigateBack = useAppStore((state) => state.navigateBack);
  const micrographNavigationStack = useAppStore((state) => state.micrographNavigationStack);
  const micrographIndex = useAppStore((state) => state.micrographIndex);

  // Find active micrograph and its associated children
  const activeMicrograph = useCallback(() => {
    if (!project || !activeMicrographId || !project.datasets) return null;
    for (const dataset of project.datasets) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find(m => m.id === activeMicrographId);
        if (micro) return micro;
      }
    }
    return null;
  }, [project, activeMicrographId])();

  // Get child micrographs (overlays)
  const childMicrographs = useCallback(() => {
    if (!activeMicrographId) return [];
    return getChildMicrographs(project, activeMicrographId);
  }, [project, activeMicrographId])();

  // Drawing hooks for polygon and line tools
  const polygonDrawing = usePolygonDrawing({
    layer: drawingLayerRef.current,
    scale: zoom,
    onComplete: (points) => {
      // Convert points to polygon geometry
      const coordinates: Array<[number, number]> = [];
      for (let i = 0; i < points.length; i += 2) {
        coordinates.push([points[i], points[i + 1]]);
      }

      const polygonGeometry: Geometry = {
        type: 'Polygon',
        coordinates: [coordinates], // Polygon coordinates are array of rings
      };

      setPendingSpotGeometry(polygonGeometry);
      setNewSpotDialogOpen(true);
    },
  });

  const lineDrawing = useLineDrawing({
    layer: drawingLayerRef.current,
    scale: zoom,
    onComplete: (points) => {
      // Convert points to line geometry
      const coordinates: Array<[number, number]> = [];
      for (let i = 0; i < points.length; i += 2) {
        coordinates.push([points[i], points[i + 1]]);
      }

      const lineGeometry: Geometry = {
        type: 'LineString',
        coordinates,
      };

      setPendingSpotGeometry(lineGeometry);
      setNewSpotDialogOpen(true);
    },
  });

  // Imperative geometry editing hook (pass refs as stable object)
  const geometryEditing = useImperativeGeometryEditing({
    layerRef: drawingLayerRef,
    stageRef: stageRef,
  });

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

    // Increment session ID to invalidate any in-progress loads
    const currentSession = ++loadingSessionRef.current;

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

        // Check if we're still the current session (user may have switched images)
        if (loadingSessionRef.current !== currentSession) {
          console.log('[TiledViewer] Session invalidated during metadata load, aborting');
          return;
        }

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

        // Check session again after async operation
        if (loadingSessionRef.current !== currentSession) {
          console.log('[TiledViewer] Session invalidated during thumbnail load, aborting');
          return;
        }

        const thumbnailImg = new Image();
        thumbnailImg.src = thumbnailDataUrl;
        await new Promise((resolve) => {
          thumbnailImg.onload = resolve;
        });

        // Check session again after image decode
        if (loadingSessionRef.current !== currentSession) {
          console.log('[TiledViewer] Session invalidated during thumbnail decode, aborting');
          return;
        }

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
        loadAllTiles(result.hash, result.metadata.tilesX, result.metadata.tilesY, result.fromCache, currentSession);

      } catch (error) {
        console.error('Failed to load image:', error);
        setIsLoading(false);
      }
    };

    loadImage();
  }, [imagePath]);

  /**
   * Handle keyboard events (e.g., Escape to cancel editing mode)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel imperative editing mode
        geometryEditing.cancelEdits();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [geometryEditing]);

  /**
   * Load ALL tiles for the entire image in background
   * Uses chunked loading to keep UI responsive
   *
   * @param sessionId - The loading session ID; if it no longer matches loadingSessionRef.current,
   *                    we abort the decode loop (but let main process tile generation continue)
   */
  const loadAllTiles = useCallback(async (hash: string, tilesX: number, tilesY: number, fromCache: boolean, sessionId: number) => {
    setIsLoadingTiles(true);

    // Set message based on whether tiles are cached or being generated
    if (fromCache) {
      setTileLoadingMessage('Loading high-res tiles from cache...');
    } else {
      setTileLoadingMessage('Generating high-res tiles (first load)...');
    }

    try {
      // Generate list of ALL tile coordinates
      const allTileCoords: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
          allTileCoords.push({ x, y });
        }
      }

      console.log(`[Session ${sessionId}] Loading all ${allTileCoords.length} tiles in background... (fromCache: ${fromCache})`);

      // Load all tile data from disk (this happens in the main process)
      // Note: We don't cancel this - let tile generation complete so it's cached for later
      const results = await window.api!.loadTilesBatch(hash, allTileCoords);

      // Check if session is still valid before starting expensive decode loop
      if (loadingSessionRef.current !== sessionId) {
        console.log(`[Session ${sessionId}] Session invalidated after tile fetch, skipping decode (tiles are cached for later)`);
        setIsLoadingTiles(false);
        return;
      }

      // Decode images in chunks to avoid blocking UI
      const newTiles = new Map<string, TileInfo>();
      const CHUNK_SIZE = 20; // Decode 20 images at a time

      for (let i = 0; i < results.length; i += CHUNK_SIZE) {
        // Check session at start of each chunk - abort decode loop if user switched images
        if (loadingSessionRef.current !== sessionId) {
          console.log(`[Session ${sessionId}] Session invalidated during decode loop, aborting (decoded ${i}/${results.length} tiles)`);
          setIsLoadingTiles(false);
          return;
        }

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

      // Final session check before updating state
      if (loadingSessionRef.current !== sessionId) {
        console.log(`[Session ${sessionId}] Session invalidated after decode complete, discarding results`);
        setIsLoadingTiles(false);
        return;
      }

      console.log(`[Session ${sessionId}] All ${allTileCoords.length} tiles loaded and ready`);

      // Now update state ONCE with all tiles - triggers single re-render
      setTiles(newTiles);

      // Switch to tiled mode
      console.log(`[Session ${sessionId}] Switching to tiled mode`);
      setRenderMode('tiled');

    } catch (error) {
      console.error('Failed to load all tiles:', error);
    } finally {
      // Only clear loading state if we're still the active session
      if (loadingSessionRef.current === sessionId) {
        setIsLoadingTiles(false);
      }
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

    // Update stroke widths in drawing hooks
    polygonDrawing.updateStrokeWidth(newZoom);
    lineDrawing.updateStrokeWidth(newZoom);

    // Update editing handle sizes if in edit mode
    geometryEditing.updateHandleSizes(newZoom);
  }, [zoom, position, polygonDrawing, lineDrawing, geometryEditing]);

  /**
   * Handle pan (drag to move)
   */
  const handleMouseDown = useCallback((e: any) => {
    if (e.evt.button !== 0) return; // Only left mouse button

    // Reset drag tracking
    setHasDragged(false);

    // Don't enable panning if we clicked on a draggable shape (editing handles)
    const target = e.target;
    if (target && target.draggable && target.draggable()) {
      return; // Clicked on a draggable element, don't start panning
    }

    // Only enable panning if no drawing tool is active
    if (!activeTool || activeTool === 'select') {
      setIsPanning(true);
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      setLastPointerPos(pos);
    }
  }, [activeTool]);

  const handleMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Handle panning
    if (isPanning && lastPointerPos) {
      const dx = pos.x - lastPointerPos.x;
      const dy = pos.y - lastPointerPos.y;

      // Mark as dragged if movement exceeds threshold (3 pixels)
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setHasDragged(true);
      }

      setPosition({
        x: position.x + dx,
        y: position.y + dy,
      });

      setLastPointerPos(pos);
      return; // Don't update drawing preview while panning
    }

    // Handle drawing tool preview (polygon/line)
    if (activeTool === 'polygon' || activeTool === 'line') {
      // Convert to image coordinates
      const imageX = (pos.x - position.x) / zoom;
      const imageY = (pos.y - position.y) / zoom;

      if (activeTool === 'polygon') {
        polygonDrawing.handleMouseMove(imageX, imageY);
      } else if (activeTool === 'line') {
        lineDrawing.handleMouseMove(imageX, imageY);
      }
    }

    // Update cursor location (convert screen coords to image coords)
    const imageX = (pos.x - position.x) / zoom;
    const imageY = (pos.y - position.y) / zoom;

    // Format and send coordinates to parent
    if (onCursorMove && activeMicrograph?.scalePixelsPerCentimeter) {
      const scale = activeMicrograph.scalePixelsPerCentimeter;

      // Convert pixel coordinates to centimeters
      const xInCm = imageX / scale;
      const yInCm = imageY / scale;

      // Determine which unit to use (same logic as rulers)
      let xValue: number;
      let yValue: number;
      let unit: string;
      let decimals: number;

      // Convert to mm first
      const xInMm = xInCm * 10;
      const yInMm = yInCm * 10;

      if (Math.abs(xInCm) >= 0.2 || Math.abs(yInCm) >= 0.2) {
        // Use cm for larger values
        xValue = xInCm;
        yValue = yInCm;
        unit = 'cm';
        decimals = 3;
      } else if (Math.abs(xInMm) >= 0.2 || Math.abs(yInMm) >= 0.2) {
        // Use mm for medium values
        xValue = xInMm;
        yValue = yInMm;
        unit = 'mm';
        decimals = 3;
      } else {
        // Use µm for small values
        xValue = xInMm * 1000; // Convert mm to µm (1mm = 1000µm)
        yValue = yInMm * 1000;
        unit = 'µm';
        decimals = 1;
      }

      onCursorMove({ x: xValue, y: yValue, unit, decimals });
    } else {
      onCursorMove?.(null);
    }
  }, [isPanning, lastPointerPos, position, activeTool, zoom, polygonDrawing, lineDrawing, onCursorMove, activeMicrograph]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
    onCursorMove?.(null); // Clear coordinates in status bar
  }, [onCursorMove]);

  /**
   * Handle stage click for drawing tools
   */
  const handleStageClick = useCallback((e: any) => {
    // Ignore clicks that were actually drags
    if (hasDragged) {
      return;
    }

    // If clicking directly on the stage (not on a spot), clear spot selection
    if (!activeTool || activeTool === 'select') {
      // Check if click target or its parent is a spot (spots have names like "spot-{id}")
      const targetName = e.target.name?.() || e.target.attrs?.name || '';
      const parentName = e.target.parent?.name?.() || e.target.parent?.attrs?.name || '';

      const isSpot = (typeof targetName === 'string' && targetName.startsWith('spot-')) ||
                     (typeof parentName === 'string' && parentName.startsWith('spot-'));

      // Only clear selection if NOT clicking on a spot
      // BUT: Don't cancel editing mode - user must explicitly Save or Cancel
      if (!isSpot) {
        // Don't clear selection if we're in editing mode
        const editingSpotId = useAppStore.getState().editingSpotId;
        if (!editingSpotId) {
          selectActiveSpot(null);
        }
      }
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;

    // Get click position in stage coordinates
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Convert to image coordinates (account for zoom/pan)
    const imageX = (pos.x - position.x) / zoom;
    const imageY = (pos.y - position.y) / zoom;

    console.log('Click at image coordinates:', imageX, imageY, 'Tool:', activeTool);

    // Handle point tool
    if (activeTool === 'point') {
      const pointGeometry: Geometry = {
        type: 'Point',
        coordinates: [imageX, imageY],
      };
      setPendingSpotGeometry(pointGeometry);
      setNewSpotDialogOpen(true);
    }

    // Handle polygon tool
    if (activeTool === 'polygon') {
      polygonDrawing.handleClick(imageX, imageY);
    }

    // Handle line tool
    if (activeTool === 'line') {
      lineDrawing.handleClick(imageX, imageY);
    }
  }, [activeTool, position, zoom, polygonDrawing, lineDrawing, selectActiveSpot, hasDragged]);

  /**
   * Cleanup drawing when tool changes or dialog closes
   */
  useEffect(() => {
    if (activeTool !== 'polygon') {
      polygonDrawing.cleanup();
    }
    if (activeTool !== 'line') {
      lineDrawing.cleanup();
    }
  }, [activeTool, polygonDrawing, lineDrawing]);

  /**
   * Handle saving new spot from dialog
   */
  const handleSaveSpot = useCallback((spot: Spot) => {
    if (!activeMicrographId) {
      console.error('No active micrograph');
      return;
    }

    // Add spot to the active micrograph
    addSpot(activeMicrographId, spot);

    // Select the newly created spot
    selectActiveSpot(spot.id);

    // Clear the drawing tool
    setActiveTool(null);

    console.log('Spot created:', spot);
  }, [activeMicrographId, addSpot, selectActiveSpot, setActiveTool]);

  /**
   * Handle edit spot geometry
   */
  const handleEditGeometry = useCallback((spot: Spot) => {
    console.log('Edit geometry for spot:', spot.name);

    // Enter imperative edit mode, passing current zoom for correct handle sizes
    geometryEditing.enterEditMode(spot, zoom);

    // Also select the spot to highlight it
    selectActiveSpot(spot.id);

    // Disable any active drawing tool
    setActiveTool(null);
  }, [geometryEditing, selectActiveSpot, setActiveTool, zoom]);

  /**
   * Handle edit spot metadata
   */
  const handleEditMetadata = useCallback((spot: Spot) => {
    // Open the spot metadata editor dialog
    selectActiveSpot(spot.id);
    setEditingSpot(spot);
    setEditSpotDialogOpen(true);
  }, [selectActiveSpot]);

  /**
   * Handle spot deletion with confirmation
   */
  const handleDeleteSpot = useCallback((spot: Spot) => {
    if (window.confirm(`Delete spot "${spot.name}"?\n\nThis action cannot be undone.`)) {
      deleteSpot(spot.id);
      console.log('Spot deleted:', spot.name);
    }
  }, [deleteSpot]);

  /**
   * Handle overlay click for drill-down navigation
   */
  const handleOverlayClick = useCallback((micrographId: string) => {
    drillDownToMicrograph(micrographId);
  }, [drillDownToMicrograph]);

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

  const RULER_SIZE = 30; // Width/height of ruler bars

  // Get themed colors for rulers
  const effectiveTheme = getEffectiveTheme(theme);
  const isDark = effectiveTheme === 'dark';
  const rulerBgColor = isDark ? '#252525' : '#f5f5f0';
  const rulerBorderColor = isDark ? '#404040' : '#d0d0c8';

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

      {/* Editing toolbar */}
      <EditingToolbar
        onSave={() => geometryEditing.saveEdits()}
        onCancel={() => geometryEditing.cancelEdits()}
      />

      {/* Back navigation button - shows when navigated via overlay click */}
      {micrographNavigationStack.length > 0 && (
        <Tooltip
          title={(() => {
            const previousId = micrographNavigationStack[micrographNavigationStack.length - 1];
            const previousMicro = micrographIndex.get(previousId);
            return `Back to ${previousMicro?.name || 'previous micrograph'}`;
          })()}
          placement="right"
        >
          <IconButton
            onClick={navigateBack}
            sx={{
              position: 'absolute',
              top: showRulers ? 40 : 10,
              left: showRulers ? 40 : 10,
              zIndex: 1001,
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.85)',
              },
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
            size="medium"
          >
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
      )}

      {imageMetadata && (
        <>
          {/* Rulers positioned absolutely on top of canvas */}
          {showRulers && (
            <>
              {/* Top-left corner (empty) */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: RULER_SIZE,
                height: RULER_SIZE,
                backgroundColor: rulerBgColor,
                borderRight: `1px solid ${rulerBorderColor}`,
                borderBottom: `1px solid ${rulerBorderColor}`,
                zIndex: 1000,
              }} />

              {/* Top ruler (horizontal) */}
              <div style={{ position: 'absolute', top: 0, left: RULER_SIZE, zIndex: 1000 }}>
                <RulerCanvas
                  orientation="horizontal"
                  width={stageSize.width}
                  height={RULER_SIZE}
                  zoom={zoom}
                  position={position}
                  imageWidth={activeMicrograph?.imageWidth || activeMicrograph?.width || imageMetadata.width}
                  imageHeight={activeMicrograph?.imageHeight || activeMicrograph?.height || imageMetadata.height}
                  scalePixelsPerCentimeter={activeMicrograph?.scalePixelsPerCentimeter || null}
                />
              </div>

              {/* Left ruler (vertical) */}
              <div style={{ position: 'absolute', top: RULER_SIZE, left: 0, zIndex: 1000 }}>
                <RulerCanvas
                  orientation="vertical"
                  width={RULER_SIZE}
                  height={stageSize.height}
                  zoom={zoom}
                  position={position}
                  imageWidth={activeMicrograph?.imageWidth || activeMicrograph?.width || imageMetadata.width}
                  imageHeight={activeMicrograph?.imageHeight || activeMicrograph?.height || imageMetadata.height}
                  scalePixelsPerCentimeter={activeMicrograph?.scalePixelsPerCentimeter || null}
                />
              </div>
            </>
          )}

          {/* Main canvas area - offset when rulers are shown */}
          <div style={{
            position: 'absolute',
            top: showRulers ? RULER_SIZE : 0,
            left: showRulers ? RULER_SIZE : 0,
          }}>
            <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{
              cursor: activeTool === 'point' || activeTool === 'line' || activeTool === 'polygon'
                ? 'crosshair'
                : isPanning
                ? 'grabbing'
                : 'grab'
            }}
          >
            <Layer
              key="image-layer"
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

              {/* Render visible tiles in tiled mode with 1px overlap to prevent seams */}
              {renderMode === 'tiled' && visibleTiles.map((tileKey) => {
                const tile = tiles.get(tileKey);
                if (!tile || !tile.imageObj) return null;

                return (
                  <KonvaImage
                    key={tileKey}
                    image={tile.imageObj}
                    x={tile.x * TILE_SIZE}
                    y={tile.y * TILE_SIZE}
                    width={TILE_SIZE + 1}  // 1px overlap to prevent seams
                    height={TILE_SIZE + 1} // 1px overlap to prevent seams
                  />
                );
              })}

              {/* Render associated micrographs (overlays) - only rectangle-located ones */}
              {/* Filter out: batch-imported without scale, and point-located micrographs */}
              {activeMicrograph && project && childMicrographs
                .filter((childMicro) => {
                  // Must have scale set
                  if (childMicro.scalePixelsPerCentimeter === undefined || childMicro.scalePixelsPerCentimeter === null) {
                    return false;
                  }
                  // Must NOT be point-located (pointInParent means it's a point, not an overlay)
                  if ((childMicro as { pointInParent?: unknown }).pointInParent) {
                    return false;
                  }
                  return true;
                })
                .map((childMicro) => (
                <AssociatedImageRenderer
                  key={childMicro.id}
                  micrograph={childMicro}
                  projectId={project.id}
                  parentMetadata={{
                    width: activeMicrograph.imageWidth || activeMicrograph.width || imageMetadata?.width || 0,
                    height: activeMicrograph.imageHeight || activeMicrograph.height || imageMetadata?.height || 0,
                    scalePixelsPerCentimeter: activeMicrograph.scalePixelsPerCentimeter || 100,
                  }}
                  viewport={{
                    x: position.x,
                    y: position.y,
                    zoom: zoom,
                    width: stageSize.width,
                    height: stageSize.height,
                  }}
                  stageScale={zoom}
                  onTileLoadingStart={(message) => {
                    setTileLoadingMessage(message);
                    setOverlayLoadingCount(prev => prev + 1);
                  }}
                  onTileLoadingEnd={() => {
                    setOverlayLoadingCount(prev => Math.max(0, prev - 1));
                  }}
                  onClick={handleOverlayClick}
                  showOutline={showMicrographOutlines}
                />
              ))}
            </Layer>

            {/* Spots Layer - render all saved spots and point-located micrographs */}
            <Layer
              key="spots-layer"
              x={position.x}
              y={position.y}
              scaleX={zoom}
              scaleY={zoom}
            >
              {/* Render point-located associated micrographs as clickable markers */}
              {activeMicrograph && project && childMicrographs
                .filter((childMicro) => {
                  // Must have pointInParent (point-located micrograph)
                  const pointData = (childMicro as { pointInParent?: { x?: number; y?: number; X?: number; Y?: number } }).pointInParent;
                  return pointData !== undefined;
                })
                .map((childMicro) => {
                  const pointData = (childMicro as { pointInParent: { x?: number; y?: number; X?: number; Y?: number } }).pointInParent;
                  // Handle both lowercase (new) and uppercase (legacy) property names
                  const px = pointData.x ?? pointData.X ?? 0;
                  const py = pointData.y ?? pointData.Y ?? 0;
                  return (
                    <Circle
                      key={`point-${childMicro.id}`}
                      x={px}
                      y={py}
                      radius={9 / zoom}
                      fill="#e44c65"
                      stroke="#ffffff"
                      strokeWidth={1.5 / zoom}
                      onClick={() => {
                        // Navigate to the child micrograph when clicked
                        useAppStore.getState().selectMicrograph(childMicro.id);
                      }}
                      onTap={() => {
                        useAppStore.getState().selectMicrograph(childMicro.id);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}

              {/* First pass: Render all spot shapes */}
              {activeMicrograph?.spots?.map((spot) => (
                <SpotRenderer
                  key={spot.id}
                  spot={spot}
                  scale={zoom}
                  isSelected={spot.id === activeSpotId}
                  onClick={(spot) => {
                    selectActiveSpot(spot.id);
                    setActiveTool(null); // Deactivate drawing tool when selecting spot
                  }}
                  onContextMenu={(spot, x, y) => {
                    setContextMenuSpot(spot);
                    setContextMenuPosition({ x, y });
                  }}
                  renderLabelsOnly={false}
                />
              ))}

              {/* Second pass: Render all spot labels (ensures labels are on top) */}
              {activeMicrograph?.spots?.map((spot) => (
                <SpotRenderer
                  key={`${spot.id}-label`}
                  spot={spot}
                  scale={zoom}
                  isSelected={spot.id === activeSpotId}
                  renderLabelsOnly={true}
                />
              ))}
            </Layer>

            {/* Drawing Layer - for temporary drawing in progress */}
            <Layer
              key="drawing-layer"
              ref={drawingLayerRef}
              x={position.x}
              y={position.y}
              scaleX={zoom}
              scaleY={zoom}
            >
              {/* Drawing shapes (polygon/line in progress) are added by the drawing hooks */}
            </Layer>
          </Stage>
          </div>

          {/* Non-ruler layout (when rulers are off) */}
          {!showRulers && (
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              onWheel={handleWheel}
              onClick={handleStageClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              style={{
                cursor: activeTool === 'point' || activeTool === 'line' || activeTool === 'polygon'
                  ? 'crosshair'
                  : isPanning
                  ? 'grabbing'
                  : 'grab'
              }}
            >
              <Layer
                key="image-layer"
                x={position.x}
                y={position.y}
                scaleX={zoom}
                scaleY={zoom}
              >
                {/* Progressive loading: Show thumbnail first, then switch to tiles */}
                {renderMode === 'thumbnail' && thumbnail && (
                  <KonvaImage
                    image={thumbnail.imageObj}
                    width={imageMetadata.width}
                    height={imageMetadata.height}
                  />
                )}

                {renderMode === 'tiled' && visibleTiles.map((tileKey) => {
                  const tile = tiles.get(tileKey);
                  if (!tile || !tile.imageObj) return null;

                  return (
                    <KonvaImage
                      key={tileKey}
                      image={tile.imageObj}
                      x={tile.x * TILE_SIZE}
                      y={tile.y * TILE_SIZE}
                      width={TILE_SIZE + 1}
                      height={TILE_SIZE + 1}
                    />
                  );
                })}

                {/* Render associated micrographs (overlays) */}
                {/* Only render children that have scale set (not batch-imported without setup) */}
                {activeMicrograph && project && childMicrographs
                  .filter((childMicro) => childMicro.scalePixelsPerCentimeter !== undefined && childMicro.scalePixelsPerCentimeter !== null)
                  .map((childMicro) => (
                  <AssociatedImageRenderer
                    key={childMicro.id}
                    micrograph={childMicro}
                    projectId={project.id}
                    parentMetadata={{
                      width: activeMicrograph.imageWidth || activeMicrograph.width || imageMetadata?.width || 0,
                      height: activeMicrograph.imageHeight || activeMicrograph.height || imageMetadata?.height || 0,
                      scalePixelsPerCentimeter: activeMicrograph.scalePixelsPerCentimeter || 100,
                    }}
                    viewport={{
                      x: position.x,
                      y: position.y,
                      zoom: zoom,
                      width: stageSize.width,
                      height: stageSize.height,
                    }}
                    stageScale={zoom}
                    onTileLoadingStart={(message) => {
                      setTileLoadingMessage(message);
                      setOverlayLoadingCount(prev => prev + 1);
                    }}
                    onTileLoadingEnd={() => {
                      setOverlayLoadingCount(prev => Math.max(0, prev - 1));
                    }}
                    onClick={handleOverlayClick}
                  />
                ))}
              </Layer>

              {/* Spots Layer - render all saved spots */}
              <Layer
                key="spots-layer"
                x={position.x}
                y={position.y}
                scaleX={zoom}
                scaleY={zoom}
              >
                {/* First pass: Render all spot shapes */}
                {activeMicrograph?.spots?.map((spot) => (
                  <SpotRenderer
                    key={spot.id}
                    spot={spot}
                    scale={zoom}
                    isSelected={spot.id === activeSpotId}
                    onClick={(spot) => {
                      selectActiveSpot(spot.id);
                      setActiveTool(null);
                    }}
                    onContextMenu={(spot, x, y) => {
                      setContextMenuSpot(spot);
                      setContextMenuPosition({ x, y });
                    }}
                    renderLabelsOnly={false}
                  />
                ))}

                {/* Second pass: Render all spot labels */}
                {activeMicrograph?.spots?.map((spot) => (
                  <SpotRenderer
                    key={`${spot.id}-label`}
                    spot={spot}
                    scale={zoom}
                    isSelected={spot.id === activeSpotId}
                    renderLabelsOnly={true}
                  />
                ))}
              </Layer>

              {/* Drawing Layer */}
              <Layer
                key="drawing-layer"
                ref={drawingLayerRef}
                x={position.x}
                y={position.y}
                scaleX={zoom}
                scaleY={zoom}
              >
                {/* Drawing shapes added by hooks */}
              </Layer>
            </Stage>
          )}

          {/* Tile loading indicator - shows for both reference and overlay tiles */}
          {(isLoadingTiles || overlayLoadingCount > 0) && (
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
                {tileLoadingMessage || 'Loading tiles...'}
                {overlayLoadingCount > 0 && ` (${overlayLoadingCount} overlay${overlayLoadingCount > 1 ? 's' : ''})`}
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* New Spot Dialog */}
      {pendingSpotGeometry && activeMicrographId && (
        <NewSpotDialog
          open={newSpotDialogOpen}
          onClose={() => setNewSpotDialogOpen(false)}
          onSave={handleSaveSpot}
          geometry={pendingSpotGeometry}
          micrographId={activeMicrographId}
          existingSpots={activeMicrograph?.spots || []}
        />
      )}

      {/* Edit Spot Dialog */}
      {editingSpot && (
        <EditSpotDialog
          isOpen={editSpotDialogOpen}
          onClose={() => {
            setEditSpotDialogOpen(false);
            setEditingSpot(null);
          }}
          spotId={editingSpot.id}
        />
      )}

      {/* Spot Context Menu */}
      <SpotContextMenu
        spot={contextMenuSpot}
        anchorPosition={contextMenuPosition}
        onClose={() => {
          setContextMenuSpot(null);
          setContextMenuPosition(null);
        }}
        onEditGeometry={handleEditGeometry}
        onEditMetadata={handleEditMetadata}
        onDelete={handleDeleteSpot}
      />
    </div>
  );
});
