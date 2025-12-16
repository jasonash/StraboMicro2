/**
 * Image Comparator Dialog
 *
 * A full-screen modal for comparing multiple micrographs side-by-side.
 * Supports 2 (side-by-side) or 4 (2x2 grid) independent canvases.
 * Each canvas has its own pan/zoom and can display any micrograph.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Avatar,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import GridViewIcon from '@mui/icons-material/GridView';
import PlaceIcon from '@mui/icons-material/Place';
import LayersIcon from '@mui/icons-material/Layers';
import { Stage, Layer, Image as KonvaImage, Group, Circle, Line, Rect } from 'react-konva';
import { useAppStore } from '@/store';
import { getEffectiveTheme } from '@/hooks/useTheme';
import type { MicrographMetadata, Spot } from '@/types/project-types';

const TILE_SIZE = 256;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1;

interface ImageComparatorDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TileInfo {
  x: number;
  y: number;
  dataUrl: string;
  imageObj?: HTMLImageElement;
}

interface ImageData {
  hash: string;
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  imagePath: string;
}

interface MicrographOption {
  id: string;
  name: string;
  sampleName?: string;
  datasetName?: string;
  thumbnail?: string;
}

interface OverlayImage {
  id: string;
  imageObj: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isAffine: boolean;
  affineOutlinePoints?: number[]; // For parallelogram outline on affine overlays
}

interface CanvasState {
  micrographId: string | null;
  imageData: ImageData | null;
  tiles: Map<string, TileInfo>;
  thumbnail: HTMLImageElement | null;
  overlayImages: OverlayImage[];
  zoom: number;
  position: { x: number; y: number };
  showSpots: boolean;
  showOverlays: boolean;
  isLoading: boolean;
}

const initialCanvasState: CanvasState = {
  micrographId: null,
  imageData: null,
  tiles: new Map(),
  thumbnail: null,
  overlayImages: [],
  zoom: 1,
  position: { x: 0, y: 0 },
  showSpots: true,
  showOverlays: true,
  isLoading: false,
};

/**
 * Individual comparator canvas with independent pan/zoom
 */
function ComparatorCanvas({
  state,
  onStateChange,
  micrographOptions,
  project,
}: {
  state: CanvasState;
  onStateChange: (updates: Partial<CanvasState>) => void;
  micrographOptions: MicrographOption[];
  project: any;
}) {
  const stageRef = useRef<any>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 300 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Get theme for canvas background color
  const themeMode = useAppStore((state) => state.theme);
  const effectiveTheme = getEffectiveTheme(themeMode);
  const isDark = effectiveTheme === 'dark';
  const canvasBgColor = isDark ? '#1e1e1e' : '#d0d0d0';

  // Measure actual canvas area
  useEffect(() => {
    if (!canvasAreaRef.current) return;

    const updateSize = () => {
      if (canvasAreaRef.current) {
        const rect = canvasAreaRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCanvasSize({ width: rect.width, height: rect.height });
        }
      }
    };

    // Initial measurement
    updateSize();

    // Use ResizeObserver for dynamic updates
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasAreaRef.current);

    return () => observer.disconnect();
  }, []);

  // Get spots for the selected micrograph
  const spots = useMemo(() => {
    if (!state.micrographId || !project) return [];

    const allSpots: Spot[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === state.micrographId) {
            allSpots.push(...(micro.spots || []));
          }
        }
      }
    }
    return allSpots;
  }, [state.micrographId, project]);

  // Get child micrographs (overlays) for the selected micrograph
  const overlays = useMemo(() => {
    if (!state.micrographId || !project) return [];

    const children: MicrographMetadata[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.parentID === state.micrographId) {
            children.push(micro);
          }
        }
      }
    }
    return children;
  }, [state.micrographId, project]);

  // Get the selected micrograph metadata
  const selectedMicrograph = useMemo(() => {
    if (!state.micrographId || !project) return null;

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === state.micrographId) {
            return micro;
          }
        }
      }
    }
    return null;
  }, [state.micrographId, project]);

  // Load image when micrograph changes
  useEffect(() => {
    if (!state.micrographId || !project) return;

    const loadImage = async () => {
      onStateChange({ isLoading: true, tiles: new Map(), thumbnail: null, imageData: null, overlayImages: [] });

      try {
        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) throw new Error('Could not get project folder paths');

        const imagePath = `${folderPaths.images}/${state.micrographId}`;
        const result = await window.api?.loadImageWithTiles(imagePath);

        if (!result) throw new Error('Failed to load image metadata');

        const imageData: ImageData = {
          hash: result.hash,
          width: result.metadata.width,
          height: result.metadata.height,
          tilesX: result.metadata.tilesX,
          tilesY: result.metadata.tilesY,
          imagePath,
        };

        // Load medium resolution thumbnail
        const thumbDataUrl = await window.api?.loadMedium(result.hash);
        let thumbnailImg: HTMLImageElement | null = null;

        if (thumbDataUrl) {
          thumbnailImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = thumbDataUrl;
          });
        }

        // Load overlay images
        const loadedOverlays: OverlayImage[] = [];
        for (const overlay of overlays) {
          // Handle affine overlays
          if (overlay.placementType === 'affine') {
            try {
              const overlayPath = `${folderPaths.images}/${overlay.id}`;
              const overlayResult = await window.api?.loadImageWithTiles(overlayPath);
              if (!overlayResult) continue;

              // Use stored affine tile hash for loading pre-transformed tiles
              const tileHash = overlay.affineTileHash || overlayResult.hash;
              const overlayThumbUrl = await window.api?.loadAffineMedium(tileHash);
              if (!overlayThumbUrl) continue;

              const overlayImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = overlayThumbUrl;
              });

              // For affine overlays, use the transformed dimensions and bounds offset
              const transformedWidth = overlay.affineTransformedWidth || overlay.imageWidth || 0;
              const transformedHeight = overlay.affineTransformedHeight || overlay.imageHeight || 0;
              const boundsOffset = overlay.affineBoundsOffset || { x: 0, y: 0 };
              const matrix = overlay.affineMatrix;
              const srcWidth = overlay.imageWidth || 0;
              const srcHeight = overlay.imageHeight || 0;

              // Calculate parallelogram outline points from affine matrix
              let affineOutlinePoints: number[] | undefined;
              if (matrix && matrix.length === 6) {
                const [a, b, tx, c, d, ty] = matrix;
                const corners = [
                  [0, 0],
                  [srcWidth, 0],
                  [srcWidth, srcHeight],
                  [0, srcHeight],
                ];
                // Transform corners and subtract boundsOffset to get positions relative to tile grid
                affineOutlinePoints = corners.flatMap(([x, y]) => [
                  a * x + b * y + tx - boundsOffset.x,
                  c * x + d * y + ty - boundsOffset.y,
                ]);
              }

              loadedOverlays.push({
                id: overlay.id,
                imageObj: overlayImg,
                x: boundsOffset.x,
                y: boundsOffset.y,
                width: transformedWidth,
                height: transformedHeight,
                rotation: 0, // No rotation - transform is baked into tiles
                isAffine: true,
                affineOutlinePoints,
              });
            } catch (overlayErr) {
              console.error(`Failed to load affine overlay ${overlay.id}:`, overlayErr);
            }
            continue;
          }

          // Handle standard overlays (need offsetInParent)
          if (!overlay.offsetInParent) continue;

          try {
            const overlayPath = `${folderPaths.images}/${overlay.id}`;
            const overlayResult = await window.api?.loadImageWithTiles(overlayPath);
            if (!overlayResult) continue;

            const overlayThumbUrl = await window.api?.loadMedium(overlayResult.hash);
            if (!overlayThumbUrl) continue;

            const overlayImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = overlayThumbUrl;
            });

            // Calculate overlay dimensions using scalePixelsPerCentimeter ratio
            // This matches how AssociatedImageRenderer calculates the scale factor
            const childPxPerCm = overlay.scalePixelsPerCentimeter || 100;
            const parentPxPerCm = selectedMicrograph?.scalePixelsPerCentimeter || 100;
            const scaleFactor = parentPxPerCm / childPxPerCm;

            const overlayNativeWidth = overlay.imageWidth || overlayResult.metadata.width;
            const overlayNativeHeight = overlay.imageHeight || overlayResult.metadata.height;
            const overlayWidth = overlayNativeWidth * scaleFactor;
            const overlayHeight = overlayNativeHeight * scaleFactor;

            loadedOverlays.push({
              id: overlay.id,
              imageObj: overlayImg,
              x: overlay.offsetInParent.X || 0,
              y: overlay.offsetInParent.Y || 0,
              width: overlayWidth,
              height: overlayHeight,
              rotation: overlay.rotation || 0,
              isAffine: false,
            });
          } catch (overlayErr) {
            console.error(`Failed to load overlay ${overlay.id}:`, overlayErr);
          }
        }

        // Calculate fit-to-canvas zoom
        const scaleX = canvasSize.width / imageData.width;
        const scaleY = canvasSize.height / imageData.height;
        const fitZoom = Math.min(scaleX, scaleY) * 0.95;

        onStateChange({
          imageData,
          thumbnail: thumbnailImg,
          overlayImages: loadedOverlays,
          zoom: fitZoom,
          position: {
            x: (canvasSize.width - imageData.width * fitZoom) / 2,
            y: (canvasSize.height - imageData.height * fitZoom) / 2,
          },
          isLoading: false,
        });
      } catch (err) {
        console.error('Failed to load image:', err);
        onStateChange({ isLoading: false });
      }
    };

    loadImage();
  }, [state.micrographId, project, canvasSize.width, canvasSize.height, overlays, selectedMicrograph]);

  // Load visible tiles
  const loadVisibleTiles = useCallback(async () => {
    if (!state.imageData) return;

    const { zoom, position, imageData, tiles } = state;

    // Calculate visible tile range
    const viewportLeft = -position.x / zoom;
    const viewportTop = -position.y / zoom;
    const viewportRight = viewportLeft + canvasSize.width / zoom;
    const viewportBottom = viewportTop + canvasSize.height / zoom;

    const startTileX = Math.max(0, Math.floor(viewportLeft / TILE_SIZE));
    const startTileY = Math.max(0, Math.floor(viewportTop / TILE_SIZE));
    const endTileX = Math.min(imageData.tilesX - 1, Math.ceil(viewportRight / TILE_SIZE));
    const endTileY = Math.min(imageData.tilesY - 1, Math.ceil(viewportBottom / TILE_SIZE));

    const tilesToLoad: Array<{ x: number; y: number }> = [];

    for (let ty = startTileY; ty <= endTileY; ty++) {
      for (let tx = startTileX; tx <= endTileX; tx++) {
        const tileKey = `${tx}_${ty}`;
        if (!tiles.has(tileKey)) {
          tilesToLoad.push({ x: tx, y: ty });
        }
      }
    }

    if (tilesToLoad.length > 0) {
      const results = await window.api?.loadTilesBatch(imageData.hash, tilesToLoad);
      if (results) {
        const newTiles = new Map(tiles);
        for (const tile of results) {
          const tileKey = `${tile.x}_${tile.y}`;
          const img = new Image();
          img.src = tile.dataUrl;
          newTiles.set(tileKey, { x: tile.x, y: tile.y, dataUrl: tile.dataUrl, imageObj: img });
        }
        onStateChange({ tiles: newTiles });
      }
    }
  }, [state.imageData, state.zoom, state.position, state.tiles, canvasSize]);

  // Load tiles when viewport changes
  useEffect(() => {
    if (state.imageData && !state.isLoading) {
      loadVisibleTiles();
    }
  }, [state.imageData, state.zoom, state.position, state.isLoading]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = direction > 0
      ? Math.min(state.zoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(state.zoom / ZOOM_STEP, MIN_ZOOM);

    const mousePointTo = {
      x: (pointer.x - state.position.x) / state.zoom,
      y: (pointer.y - state.position.y) / state.zoom,
    };

    onStateChange({
      zoom: newZoom,
      position: {
        x: pointer.x - mousePointTo.x * newZoom,
        y: pointer.y - mousePointTo.y * newZoom,
      },
    });
  }, [state.zoom, state.position, onStateChange]);

  // Handle panning
  const handleMouseDown = useCallback(() => {
    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    setIsPanning(true);
    setLastPointerPos(pointer);
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isPanning || !lastPointerPos) return;

    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    const dx = pointer.x - lastPointerPos.x;
    const dy = pointer.y - lastPointerPos.y;

    onStateChange({
      position: {
        x: state.position.x + dx,
        y: state.position.y + dy,
      },
    });
    setLastPointerPos(pointer);
  }, [isPanning, lastPointerPos, state.position, onStateChange]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  // Render tiles
  const renderTiles = () => {
    if (!state.imageData) return null;

    const elements: React.ReactNode[] = [];

    // Thumbnail as base layer
    if (state.thumbnail) {
      elements.push(
        <KonvaImage
          key="thumbnail"
          image={state.thumbnail}
          x={0}
          y={0}
          width={state.imageData.width}
          height={state.imageData.height}
        />
      );
    }

    // Tiles on top
    for (const tile of state.tiles.values()) {
      if (tile.imageObj) {
        elements.push(
          <KonvaImage
            key={`tile_${tile.x}_${tile.y}`}
            image={tile.imageObj}
            x={tile.x * TILE_SIZE}
            y={tile.y * TILE_SIZE}
          />
        );
      }
    }

    return elements;
  };

  // Render spots
  const renderSpots = () => {
    if (!state.showSpots || spots.length === 0) return null;

    return spots.map((spot) => {
      const color = spot.color || '#FF0000';
      const geometry = spot.geometry;
      const geometryType = spot.geometryType || geometry?.type;

      // Handle GeoJSON geometry
      if (geometry && geometry.type) {
        if (geometry.type === 'Point') {
          const coords = geometry.coordinates as [number, number];
          return (
            <Circle
              key={spot.id}
              x={coords[0]}
              y={coords[1]}
              radius={8 / state.zoom}
              fill={color}
              stroke="#000"
              strokeWidth={1 / state.zoom}
            />
          );
        }

        if (geometry.type === 'LineString') {
          const coords = geometry.coordinates as number[][];
          const points = coords.flatMap((p) => [p[0], p[1]]);
          return (
            <Line
              key={spot.id}
              points={points}
              stroke={color}
              strokeWidth={3 / state.zoom}
            />
          );
        }

        if (geometry.type === 'Polygon') {
          const coords = geometry.coordinates as number[][][];
          const outerRing = coords[0] || [];
          const points = outerRing.flatMap((p) => [p[0], p[1]]);
          return (
            <Line
              key={spot.id}
              points={points}
              stroke={color}
              strokeWidth={2 / state.zoom}
              fill={`${color}40`}
              closed
            />
          );
        }
      }

      // Handle legacy points array
      if (spot.points && spot.points.length > 0) {
        const firstPoint = spot.points[0];
        if (geometryType === 'Point' || spot.points.length === 1) {
          return (
            <Circle
              key={spot.id}
              x={firstPoint.X ?? 0}
              y={firstPoint.Y ?? 0}
              radius={8 / state.zoom}
              fill={color}
              stroke="#000"
              strokeWidth={1 / state.zoom}
            />
          );
        }

        const points = spot.points.flatMap((p) => [p.X ?? 0, p.Y ?? 0]);
        if (geometryType === 'LineString' || spot.points.length === 2) {
          return (
            <Line
              key={spot.id}
              points={points}
              stroke={color}
              strokeWidth={3 / state.zoom}
            />
          );
        }

        // Polygon
        return (
          <Line
            key={spot.id}
            points={points}
            stroke={color}
            strokeWidth={2 / state.zoom}
            fill={`${color}40`}
            closed
          />
        );
      }

      return null;
    });
  };

  // Render overlay images with red outlines
  const renderOverlays = () => {
    if (!state.showOverlays || state.overlayImages.length === 0) return null;

    return state.overlayImages.map((overlay) => {
      // For rotated images, we need to position the group at the overlay position
      // and rotate around the top-left corner (which matches how the main viewer does it)
      return (
        <Group
          key={overlay.id}
          x={overlay.x}
          y={overlay.y}
          rotation={overlay.rotation}
        >
          {/* Overlay image */}
          <KonvaImage
            image={overlay.imageObj}
            width={overlay.width}
            height={overlay.height}
          />
          {/* Red outline - use Line for affine (parallelogram), Rect otherwise */}
          {overlay.isAffine && overlay.affineOutlinePoints ? (
            <Line
              points={overlay.affineOutlinePoints}
              closed
              stroke="#cc3333"
              strokeWidth={3 / state.zoom}
            />
          ) : (
            <Rect
              width={overlay.width}
              height={overlay.height}
              stroke="#cc3333"
              strokeWidth={2 / state.zoom}
            />
          )}
        </Group>
      );
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Canvas header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        {/* Micrograph selector */}
        <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
          <Select
            value={state.micrographId || ''}
            onChange={(e) => {
              const newId = e.target.value || null;
              onStateChange({ micrographId: newId, tiles: new Map(), thumbnail: null, imageData: null });
            }}
            displayEmpty
            renderValue={(selected) => {
              if (!selected) return <em>Select micrograph...</em>;
              const option = micrographOptions.find((o) => o.id === selected);
              return option?.name || 'Unknown';
            }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {micrographOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Avatar
                    src={option.thumbnail}
                    variant="rounded"
                    sx={{ width: 32, height: 32 }}
                  >
                    <LayersIcon fontSize="small" />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={option.name}
                  secondary={option.sampleName}
                  primaryTypographyProps={{ noWrap: true }}
                  secondaryTypographyProps={{ noWrap: true }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Toggle buttons */}
        <Tooltip title={state.showSpots ? 'Hide Spots' : 'Show Spots'}>
          <ToggleButton
            value="spots"
            selected={state.showSpots}
            onChange={() => onStateChange({ showSpots: !state.showSpots })}
            size="small"
            sx={{ p: 0.5 }}
          >
            <PlaceIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>

        <Tooltip title={state.showOverlays ? 'Hide Overlays' : 'Show Overlays'}>
          <ToggleButton
            value="overlays"
            selected={state.showOverlays}
            onChange={() => onStateChange({ showOverlays: !state.showOverlays })}
            size="small"
            sx={{ p: 0.5 }}
          >
            <LayersIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </Box>

      {/* Canvas area */}
      <Box
        ref={canvasAreaRef}
        sx={{
          flex: 1,
          position: 'relative',
          bgcolor: canvasBgColor,
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
      >
        {state.isLoading ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <CircularProgress size={40} />
          </Box>
        ) : !state.micrographId ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'grey.500',
            }}
          >
            <Typography>Select a micrograph</Typography>
          </Box>
        ) : (
          <Stage
            ref={stageRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <Layer>
              <Group x={state.position.x} y={state.position.y} scaleX={state.zoom} scaleY={state.zoom}>
                {renderTiles()}
                {renderSpots()}
                {renderOverlays()}
              </Group>
            </Layer>
          </Stage>
        )}
      </Box>
    </Box>
  );
}

/**
 * Main Image Comparator Dialog
 */
export function ImageComparatorDialog({ open, onClose }: ImageComparatorDialogProps) {
  const project = useAppStore((state) => state.project);

  // Grid mode: 2 or 4 canvases
  const [gridMode, setGridMode] = useState<2 | 4>(2);

  // Canvas states
  const [canvasStates, setCanvasStates] = useState<CanvasState[]>([
    { ...initialCanvasState },
    { ...initialCanvasState },
    { ...initialCanvasState },
    { ...initialCanvasState },
  ]);

  // Build micrograph options with thumbnails
  const [micrographOptions, setMicrographOptions] = useState<MicrographOption[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setGridMode(2);
      setCanvasStates([
        { ...initialCanvasState },
        { ...initialCanvasState },
        { ...initialCanvasState },
        { ...initialCanvasState },
      ]);
    }
  }, [open]);

  // Build micrograph options
  useEffect(() => {
    if (!open || !project) {
      setMicrographOptions([]);
      return;
    }

    const buildOptions = async () => {
      const options: MicrographOption[] = [];
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);

      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          for (const micro of sample.micrographs || []) {
            options.push({
              id: micro.id,
              name: micro.name || 'Unnamed',
              sampleName: sample.label || sample.sampleID || undefined,
              datasetName: dataset.name || undefined,
            });
          }
        }
      }

      // Load thumbnails in parallel
      if (folderPaths) {
        const thumbnailPromises = options.map(async (option) => {
          try {
            const imagePath = `${folderPaths.images}/${option.id}`;
            const cacheInfo = await window.api?.checkImageCache(imagePath);
            if (cacheInfo?.cached && cacheInfo.hash) {
              const dataUrl = await window.api?.loadThumbnail(cacheInfo.hash);
              return { id: option.id, dataUrl };
            }
          } catch (err) {
            // Ignore thumbnail load errors
          }
          return null;
        });

        const results = await Promise.all(thumbnailPromises);
        for (const result of results) {
          if (result?.dataUrl) {
            const option = options.find((o) => o.id === result.id);
            if (option) {
              option.thumbnail = result.dataUrl;
            }
          }
        }
      }

      setMicrographOptions(options);
    };

    buildOptions();
  }, [open, project]);

  // Update canvas state helper
  const updateCanvasState = useCallback((index: number, updates: Partial<CanvasState>) => {
    setCanvasStates((prev) => {
      const newStates = [...prev];
      newStates[index] = { ...newStates[index], ...updates };
      return newStates;
    });
  }, []);

  // Handle grid mode change
  const handleGridModeChange = (_: any, newMode: 2 | 4 | null) => {
    if (newMode !== null) {
      setGridMode(newMode);
    }
  };

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const activeCanvasCount = gridMode;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: { bgcolor: 'background.default' },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Image Comparator
        </Typography>

        {/* Grid mode toggle */}
        <ToggleButtonGroup
          value={gridMode}
          exclusive
          onChange={handleGridModeChange}
          size="small"
        >
          <ToggleButton value={2}>
            <Tooltip title="2 Images (Side by Side)">
              <ViewStreamIcon sx={{ transform: 'rotate(90deg)' }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value={4}>
            <Tooltip title="4 Images (Grid)">
              <GridViewIcon />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Close (Escape)">
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Canvas grid */}
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: gridMode === 4 ? 'repeat(2, 1fr)' : '1fr',
          gap: 1,
          p: 1,
          overflow: 'hidden',
        }}
      >
        {Array.from({ length: activeCanvasCount }).map((_, index) => (
          <ComparatorCanvas
            key={index}
            state={canvasStates[index]}
            onStateChange={(updates) => updateCanvasState(index, updates)}
            micrographOptions={micrographOptions}
            project={project}
          />
        ))}
      </Box>
    </Dialog>
  );
}
