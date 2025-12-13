/**
 * GridPreviewCanvas Component
 *
 * Interactive preview canvas for Point Count grid configuration.
 * Shows the micrograph with generated points overlaid, allowing
 * users to zoom in and verify point distribution before creating a session.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Rect } from 'react-konva';
import { Box, CircularProgress, Typography, IconButton, Tooltip, Stack } from '@mui/material';
import { ZoomIn, ZoomOut, FitScreen } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { generatePoints, type GridType } from '@/services/pointCounting';

// ============================================================================
// TYPES
// ============================================================================

interface GridPreviewCanvasProps {
  micrographId: string;
  gridType: GridType;
  pointCount: number;
  /** Canvas width in pixels */
  width?: number;
  /** Canvas height in pixels */
  height?: number;
}

interface GeneratedPoint {
  x: number;
  y: number;
  row: number;
  col: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 375;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.2;
const POINT_RADIUS = 3; // Base radius at zoom 1
const POINT_COLOR = '#FF5722'; // Orange-red for visibility

// ============================================================================
// COMPONENT
// ============================================================================

export function GridPreviewCanvas({
  micrographId,
  gridType,
  pointCount,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: GridPreviewCanvasProps) {
  const stageRef = useRef<any>(null);

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Store
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const micrograph = micrographIndex.get(micrographId);

  // Get actual image dimensions
  const imageWidth = micrograph?.imageWidth || micrograph?.width || 1000;
  const imageHeight = micrograph?.imageHeight || micrograph?.height || 1000;

  // Generate preview points
  const previewPoints = useMemo((): GeneratedPoint[] => {
    return generatePoints(gridType, imageWidth, imageHeight, pointCount, true);
  }, [gridType, imageWidth, imageHeight, pointCount]);

  // Load micrograph image (medium resolution for good zoom quality)
  useEffect(() => {
    if (!micrograph || !project) {
      console.error('[GridPreviewCanvas] No micrograph or project');
      setError('Micrograph not found');
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const loadImage = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get project folder paths
        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) {
          console.error('[GridPreviewCanvas] Could not get folder paths');
          if (mounted) {
            setError('Failed to get project paths');
            setIsLoading(false);
          }
          return;
        }
        if (!mounted) return;

        // Build full path to image
        const imagePath = micrograph.imagePath || '';
        const fullPath = `${folderPaths.images}/${imagePath}`;
        console.log('[GridPreviewCanvas] Loading image from:', fullPath);

        // Load tile data to get hash
        const tileData = await window.api?.loadImageWithTiles(fullPath);
        if (!tileData) {
          console.error('[GridPreviewCanvas] Failed to load tile data');
          if (mounted) {
            setError('Failed to load image');
            setIsLoading(false);
          }
          return;
        }
        if (!mounted) return;

        console.log('[GridPreviewCanvas] Got tile data, hash:', tileData.hash);

        // Try to load medium resolution first, fall back to thumbnail
        let dataUrl = await window.api?.loadMedium(tileData.hash);
        if (!dataUrl) {
          console.log('[GridPreviewCanvas] No medium, trying thumbnail');
          dataUrl = await window.api?.loadThumbnail(tileData.hash);
        }

        if (!dataUrl) {
          console.error('[GridPreviewCanvas] Failed to load any resolution');
          if (mounted) {
            setError('Failed to load preview');
            setIsLoading(false);
          }
          return;
        }
        if (!mounted) return;

        console.log('[GridPreviewCanvas] Got dataUrl, length:', dataUrl.length);

        // Create image element
        const img = new Image();
        img.onload = () => {
          if (mounted) {
            console.log('[GridPreviewCanvas] Image loaded:', img.width, 'x', img.height);
            setImage(img);
            setImageSize({ width: img.width, height: img.height });
            setIsLoading(false);

            // Fit to canvas initially
            const scaleX = width / imageWidth;
            const scaleY = height / imageHeight;
            const initialZoom = Math.min(scaleX, scaleY) * 0.9;
            setZoom(initialZoom);

            // Center image
            const x = (width - imageWidth * initialZoom) / 2;
            const y = (height - imageHeight * initialZoom) / 2;
            setPosition({ x, y });
          }
        };
        img.onerror = (err) => {
          console.error('[GridPreviewCanvas] Image decode error:', err);
          if (mounted) {
            setError('Failed to decode image');
            setIsLoading(false);
          }
        };
        img.src = dataUrl;
      } catch (err) {
        console.error('[GridPreviewCanvas] Error:', err);
        if (mounted) {
          setError('Error loading image');
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [micrograph, project, width, height, imageWidth, imageHeight]);

  // Fit to screen
  const handleFitToScreen = useCallback(() => {
    const scaleX = width / imageWidth;
    const scaleY = height / imageHeight;
    const newZoom = Math.min(scaleX, scaleY) * 0.9;
    setZoom(newZoom);

    const x = (width - imageWidth * newZoom) / 2;
    const y = (height - imageHeight * newZoom) / 2;
    setPosition({ x, y });
  }, [width, height, imageWidth, imageHeight]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM));
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldZoom = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - position.x) / oldZoom,
      y: (pointer.y - position.y) / oldZoom,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = direction > 0
      ? Math.min(oldZoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(oldZoom / ZOOM_STEP, MIN_ZOOM);

    const newPos = {
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    };

    setZoom(newZoom);
    setPosition(newPos);
  }, [zoom, position]);

  // Pan handling
  const handleMouseDown = useCallback((e: any) => {
    if (e.evt.button !== 0) return;
    setIsPanning(true);
    const stage = stageRef.current;
    if (stage) {
      setLastPointerPos(stage.getPointerPosition());
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isPanning || !lastPointerPos) return;
    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const dx = pos.x - lastPointerPos.x;
    const dy = pos.y - lastPointerPos.y;

    setPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
    setLastPointerPos(pos);
  }, [isPanning, lastPointerPos]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  // Calculate point radius based on zoom
  const scaledPointRadius = POINT_RADIUS / zoom;

  // Render loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.900',
          borderRadius: 1,
        }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.900',
          borderRadius: 1,
        }}
      >
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width, height }}>
      {/* Zoom controls */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          borderRadius: 1,
          p: 0.5,
        }}
      >
        <Tooltip title="Zoom In">
          <IconButton size="small" onClick={handleZoomIn} sx={{ color: 'white' }}>
            <ZoomIn fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out">
          <IconButton size="small" onClick={handleZoomOut} sx={{ color: 'white' }}>
            <ZoomOut fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit to View">
          <IconButton size="small" onClick={handleFitToScreen} sx={{ color: 'white' }}>
            <FitScreen fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Zoom indicator */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          zIndex: 10,
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          px: 1,
          py: 0.25,
          borderRadius: 0.5,
        }}
      >
        {Math.round(zoom * 100)}%
      </Typography>

      {/* Point count indicator */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 10,
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          px: 1,
          py: 0.25,
          borderRadius: 0.5,
        }}
      >
        {previewPoints.length} points
      </Typography>

      {/* Canvas */}
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Background */}
        <Layer>
          <Rect x={0} y={0} width={width} height={height} fill="#1a1a1a" />
        </Layer>

        {/* Image and points layer */}
        <Layer x={position.x} y={position.y} scaleX={zoom} scaleY={zoom}>
          {/* Micrograph image */}
          {image && imageSize && (
            <KonvaImage
              image={image}
              x={0}
              y={0}
              width={imageWidth}
              height={imageHeight}
            />
          )}

          {/* Preview points */}
          {previewPoints.map((point, index) => (
            <Circle
              key={index}
              x={point.x}
              y={point.y}
              radius={scaledPointRadius}
              fill={POINT_COLOR}
              opacity={0.8}
              listening={false}
            />
          ))}
        </Layer>
      </Stage>
    </Box>
  );
}

export default GridPreviewCanvas;
