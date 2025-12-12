import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Rect, Line } from 'react-konva';
import { Box, Stack, IconButton, Tooltip, Typography, Chip } from '@mui/material';
import { PanTool, CropFree, ZoomIn, ZoomOut, RestartAlt, ClearAll } from '@mui/icons-material';
import Konva from 'konva';
import { useAppStore } from '@/store';

export interface GeneratedPoint {
  x: number;
  y: number;
  row: number;
  col: number;
}

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GenerateSpotsPreviewProps {
  micrographId: string;
  generatedPoints: GeneratedPoint[];
  regionBounds: RegionBounds | null;
  onRegionChange: (bounds: RegionBounds | null) => void;
  pointColor?: string;
  pointRadius?: number;
}

export const GenerateSpotsPreview = ({
  micrographId,
  generatedPoints,
  regionBounds,
  onRegionChange,
  pointColor = '#FF6B00',
  pointRadius = 4,
}: GenerateSpotsPreviewProps) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [thumbnailScale, setThumbnailScale] = useState(1); // Scale thumbnail to fit canvas
  const [pointScale, setPointScale] = useState(1); // Scale points from original coords to canvas
  const [isLoading, setIsLoading] = useState(true);

  // Store ref for cleanup
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (imageRef.current) {
        imageRef.current.src = '';
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
      }
    };
  }, []);

  // Stage pan/zoom state
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

  // Region selection state
  const [activeTool, setActiveTool] = useState<'pan' | 'region'>('pan');
  const [isDrawingRegion, setIsDrawingRegion] = useState(false);
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null);
  const [tempRegion, setTempRegion] = useState<RegionBounds | null>(null);

  // Canvas dimensions
  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 450;

  const stageRef = useRef<Konva.Stage>(null);

  // Load micrograph image
  useEffect(() => {
    const loadImage = async () => {
      setIsLoading(true);
      try {
        const { project, micrographIndex } = useAppStore.getState();
        if (!project) {
          console.error('[GenerateSpotsPreview] No project loaded');
          return;
        }

        // Get micrograph from index
        const micrograph = micrographIndex.get(micrographId);
        if (!micrograph) {
          console.error('[GenerateSpotsPreview] Micrograph not found:', micrographId);
          return;
        }

        // Get image dimensions from micrograph metadata
        const imgWidth = micrograph.imageWidth || micrograph.width || 1000;
        const imgHeight = micrograph.imageHeight || micrograph.height || 1000;
        setImageSize({ width: imgWidth, height: imgHeight });

        // Get project folder paths
        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) {
          console.error('[GenerateSpotsPreview] Could not get folder paths');
          return;
        }

        // Build full path to image
        const imagePath = micrograph.imagePath || '';
        const fullPath = `${folderPaths.images}/${imagePath}`;

        // Load through tile cache
        const tileData = await window.api?.loadImageWithTiles(fullPath);
        if (!tileData) {
          console.error('[GenerateSpotsPreview] Failed to load tile data');
          return;
        }

        // Load medium resolution image (2048px max for better quality in dialog)
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (!mediumDataUrl) {
          console.error('[GenerateSpotsPreview] Failed to load medium resolution image');
          return;
        }

        // Create image element
        const img = new Image();
        imageRef.current = img;

        img.onload = () => {
          setImage(img);

          // Calculate scale to fit thumbnail in canvas
          const thumbScaleX = CANVAS_WIDTH / img.width;
          const thumbScaleY = CANVAS_HEIGHT / img.height;
          const thumbFitScale = Math.min(thumbScaleX, thumbScaleY);
          setThumbnailScale(thumbFitScale);

          // Calculate scale to map original image coordinates to canvas
          // Points are in original image coords, need to map to displayed size
          const pScale = (img.width / imgWidth) * thumbFitScale;
          setPointScale(pScale);

          setScale(1);
          setStagePos({ x: 0, y: 0 });
          setIsLoading(false);
        };

        img.onerror = (err) => {
          console.error('[GenerateSpotsPreview] Image load error:', err);
          setIsLoading(false);
        };

        img.src = mediumDataUrl;

      } catch (error) {
        console.error('[GenerateSpotsPreview] Error loading image:', error);
        setIsLoading(false);
      }
    };

    if (micrographId) {
      loadImage();
    }
  }, [micrographId]);

  // Handle stage wheel for zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = direction > 0 ? oldScale * 1.2 : oldScale / 1.2;
    const clampedScale = Math.max(0.1, Math.min(10, newScale));

    setScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, [scale, stagePos]);

  // Handle mouse down
  const handleMouseDown = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (activeTool === 'pan') {
      setIsPanning(true);
      setLastPanPos(pointer);
    } else if (activeTool === 'region') {
      // Convert screen coordinates to image coordinates
      const imageX = (pointer.x - stagePos.x) / scale / pointScale;
      const imageY = (pointer.y - stagePos.y) / scale / pointScale;

      setIsDrawingRegion(true);
      setRegionStart({ x: imageX, y: imageY });
      setTempRegion({ x: imageX, y: imageY, width: 0, height: 0 });
    }
  };

  // Handle mouse move
  const handleMouseMove = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanning && lastPanPos) {
      const dx = pointer.x - lastPanPos.x;
      const dy = pointer.y - lastPanPos.y;
      setStagePos({
        x: stagePos.x + dx,
        y: stagePos.y + dy,
      });
      setLastPanPos(pointer);
    } else if (isDrawingRegion && regionStart) {
      // Convert screen coordinates to image coordinates
      const imageX = (pointer.x - stagePos.x) / scale / pointScale;
      const imageY = (pointer.y - stagePos.y) / scale / pointScale;

      // Calculate region bounds (handle negative width/height)
      const x = Math.min(regionStart.x, imageX);
      const y = Math.min(regionStart.y, imageY);
      const width = Math.abs(imageX - regionStart.x);
      const height = Math.abs(imageY - regionStart.y);

      // Clamp to image bounds
      const clampedX = Math.max(0, x);
      const clampedY = Math.max(0, y);
      const clampedWidth = Math.min(width, imageSize.width - clampedX);
      const clampedHeight = Math.min(height, imageSize.height - clampedY);

      setTempRegion({
        x: clampedX,
        y: clampedY,
        width: clampedWidth,
        height: clampedHeight,
      });
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
    } else if (isDrawingRegion && tempRegion) {
      // Only save region if it has some size
      if (tempRegion.width > 10 && tempRegion.height > 10) {
        onRegionChange(tempRegion);
      }
      setIsDrawingRegion(false);
      setRegionStart(null);
      setTempRegion(null);
      setActiveTool('pan'); // Return to pan mode after drawing
    }
  };

  // Handle zoom buttons
  const handleZoomIn = () => {
    const newScale = Math.min(10, scale * 1.5);
    setScale(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.1, scale / 1.5);
    setScale(newScale);
  };

  const handleResetView = () => {
    setScale(1);
    setStagePos({ x: 0, y: 0 });
  };

  const handleClearRegion = () => {
    onRegionChange(null);
  };

  // Filter points by region
  const visiblePoints = regionBounds
    ? generatedPoints.filter(p =>
        p.x >= regionBounds.x &&
        p.x <= regionBounds.x + regionBounds.width &&
        p.y >= regionBounds.y &&
        p.y <= regionBounds.y + regionBounds.height
      )
    : generatedPoints;

  // Calculate displayed region bounds
  const displayedRegion = regionBounds || tempRegion;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Toolbar */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title="Pan (drag to move)">
          <IconButton
            size="small"
            color={activeTool === 'pan' ? 'primary' : 'default'}
            onClick={() => setActiveTool('pan')}
          >
            <PanTool fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Select Region (draw rectangle to restrict)">
          <IconButton
            size="small"
            color={activeTool === 'region' ? 'primary' : 'default'}
            onClick={() => setActiveTool('region')}
          >
            <CropFree fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ width: 1, bgcolor: 'divider', mx: 1, height: 24 }} />
        <Tooltip title="Zoom In">
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomIn fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out">
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOut fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset View">
          <IconButton size="small" onClick={handleResetView}>
            <RestartAlt fontSize="small" />
          </IconButton>
        </Tooltip>
        {regionBounds && (
          <>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              label={`Region: ${Math.round(regionBounds.width)}×${Math.round(regionBounds.height)}px`}
              size="small"
              onDelete={handleClearRegion}
              deleteIcon={<ClearAll fontSize="small" />}
            />
          </>
        )}
      </Stack>

      {/* Canvas */}
      <Box
        sx={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          bgcolor: 'grey.100',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: activeTool === 'pan'
            ? (isPanning ? 'grabbing' : 'grab')
            : 'crosshair',
        }}
      >
        {isLoading ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            <Typography color="text.secondary">Loading image...</Typography>
          </Box>
        ) : (
          <Stage
            ref={stageRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            scaleX={scale}
            scaleY={scale}
            x={stagePos.x}
            y={stagePos.y}
          >
            <Layer>
              {/* Image */}
              {image && (
                <KonvaImage
                  image={image}
                  scaleX={thumbnailScale}
                  scaleY={thumbnailScale}
                />
              )}

              {/* Region selection rectangle */}
              {displayedRegion && (
                <Rect
                  x={displayedRegion.x * pointScale}
                  y={displayedRegion.y * pointScale}
                  width={displayedRegion.width * pointScale}
                  height={displayedRegion.height * pointScale}
                  stroke="#2196F3"
                  strokeWidth={2 / scale}
                  dash={[8 / scale, 4 / scale]}
                  fill="rgba(33, 150, 243, 0.1)"
                />
              )}

              {/* Generated points */}
              {visiblePoints.map((point, idx) => (
                <Circle
                  key={`point-${idx}`}
                  x={point.x * pointScale}
                  y={point.y * pointScale}
                  radius={pointRadius / scale}
                  fill={pointColor}
                  stroke="#ffffff"
                  strokeWidth={1 / scale}
                />
              ))}

              {/* Grid lines for regular grid visualization */}
              {generatedPoints.length > 0 && !regionBounds && pointScale > 0 && (() => {
                // Find grid dimensions
                const rows = new Set(generatedPoints.map(p => p.row));
                const cols = new Set(generatedPoints.map(p => p.col));

                // Only show grid lines if there's a clear grid pattern
                if (rows.size < 2 || cols.size < 2) return null;

                const lines: JSX.Element[] = [];

                // Group points by row and col to draw lines
                const rowMap = new Map<number, GeneratedPoint[]>();
                const colMap = new Map<number, GeneratedPoint[]>();

                generatedPoints.forEach(p => {
                  if (!rowMap.has(p.row)) rowMap.set(p.row, []);
                  if (!colMap.has(p.col)) colMap.set(p.col, []);
                  rowMap.get(p.row)!.push(p);
                  colMap.get(p.col)!.push(p);
                });

                // Draw horizontal lines (connect points in same row)
                rowMap.forEach((points, row) => {
                  points.sort((a, b) => a.col - b.col);
                  const linePoints: number[] = [];
                  points.forEach(p => {
                    linePoints.push(p.x * pointScale, p.y * pointScale);
                  });
                  if (linePoints.length >= 4) {
                    lines.push(
                      <Line
                        key={`row-${row}`}
                        points={linePoints}
                        stroke="rgba(255, 107, 0, 0.2)"
                        strokeWidth={1 / scale}
                      />
                    );
                  }
                });

                // Draw vertical lines (connect points in same column)
                colMap.forEach((points, col) => {
                  points.sort((a, b) => a.row - b.row);
                  const linePoints: number[] = [];
                  points.forEach(p => {
                    linePoints.push(p.x * pointScale, p.y * pointScale);
                  });
                  if (linePoints.length >= 4) {
                    lines.push(
                      <Line
                        key={`col-${col}`}
                        points={linePoints}
                        stroke="rgba(255, 107, 0, 0.2)"
                        strokeWidth={1 / scale}
                      />
                    );
                  }
                });

                return lines;
              })()}
            </Layer>
          </Stage>
        )}
      </Box>

      {/* Status bar */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {imageSize.width > 0 && `Image: ${imageSize.width}×${imageSize.height}px`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Zoom: {Math.round(scale * 100)}%
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {visiblePoints.length} points{regionBounds && generatedPoints.length !== visiblePoints.length && ` (${generatedPoints.length} total)`}
        </Typography>
      </Stack>
    </Box>
  );
};

export default GenerateSpotsPreview;
