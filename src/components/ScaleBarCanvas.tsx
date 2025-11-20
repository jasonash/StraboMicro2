import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva';
import { Box, Stack, IconButton, Tooltip, Paper } from '@mui/material';
import { PanTool, Timeline, ZoomIn, ZoomOut, RestartAlt } from '@mui/icons-material';
import Konva from 'konva';

export type Tool = 'pointer' | 'line';

export interface ScaleBarCanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface ScaleBarCanvasProps {
  imageUrl: string;
  originalWidth: number;  // Original full-resolution image width
  originalHeight: number; // Original full-resolution image height
  onLineDrawn: (lineData: { start: { x: number; y: number }; end: { x: number; y: number }; lengthPixels: number }) => void;
  showToolbar?: boolean;
  currentTool?: Tool;
  onToolChange?: (tool: Tool) => void;
}

export const ScaleBarCanvas = forwardRef<ScaleBarCanvasRef, ScaleBarCanvasProps>(({
  imageUrl,
  originalWidth,
  originalHeight,
  onLineDrawn,
  showToolbar = true,
  currentTool,
  onToolChange
}, ref) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [internalTool, setInternalTool] = useState<Tool>('pointer');

  // Use controlled tool if provided, otherwise use internal state
  const tool = currentTool ?? internalTool;
  const setTool = onToolChange ?? setInternalTool;
  const [line, setLine] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [tempLine, setTempLine] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas dimensions
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // Expose zoom methods via ref
  useImperativeHandle(ref, () => ({
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetZoom: handleResetZoom
  }));

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      setImage(img);
      // Fit image to canvas
      const scaleX = CANVAS_WIDTH / img.width;
      const scaleY = CANVAS_HEIGHT / img.height;
      const initialScale = Math.min(scaleX, scaleY, 1);
      setScale(initialScale);

      // Center image
      const x = (CANVAS_WIDTH - img.width * initialScale) / 2;
      const y = (CANVAS_HEIGHT - img.height * initialScale) / 2;
      setStagePos({ x, y });
    };
  }, [imageUrl]);

  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    if (tool === 'line') {
      // Convert screen coordinates to image coordinates
      const x = (pointerPos.x - stagePos.x) / scale;
      const y = (pointerPos.y - stagePos.y) / scale;

      setIsDrawing(true);
      setTempLine({ start: { x, y }, end: { x, y } });
    } else if (tool === 'pointer') {
      // Start panning
      setIsPanning(true);
      setLastPanPos(pointerPos);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    if (isDrawing && tool === 'line' && tempLine) {
      // Drawing a line
      const x = (pointerPos.x - stagePos.x) / scale;
      const y = (pointerPos.y - stagePos.y) / scale;
      setTempLine({ ...tempLine, end: { x, y } });
    } else if (isPanning && tool === 'pointer' && lastPanPos) {
      // Panning the image
      const dx = pointerPos.x - lastPanPos.x;
      const dy = pointerPos.y - lastPanPos.y;

      const newPos = {
        x: stagePos.x + dx,
        y: stagePos.y + dy,
      };

      // Apply bounds
      const bounded = dragBoundFunc(newPos);
      setStagePos(bounded);
      setLastPanPos(pointerPos);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && tempLine && image) {
      setIsDrawing(false);
      setLine(tempLine);
      setTempLine(null);

      // Calculate line length in displayed image coordinates
      const dx = tempLine.end.x - tempLine.start.x;
      const dy = tempLine.end.y - tempLine.start.y;
      const lengthInDisplayedImage = Math.sqrt(dx * dx + dy * dy);

      // Calculate the scale ratio between original and displayed image
      // The displayed image (medium resolution) might be downsampled from the original
      const scaleRatio = originalWidth / image.width;

      // Convert line length to original image pixel coordinates
      const lengthPixels = lengthInDisplayedImage * scaleRatio;

      console.log('[ScaleBarCanvas] Line drawn:', {
        displayedImageWidth: image.width,
        originalWidth,
        scaleRatio,
        lengthInDisplayedImage,
        lengthPixels
      });

      // Notify parent component with length in original image pixels
      onLineDrawn({
        start: tempLine.start,
        end: tempLine.end,
        lengthPixels
      });
    }

    // Stop panning
    setIsPanning(false);
    setLastPanPos(null);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 20));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleResetZoom = () => {
    if (!image) return;
    const scaleX = CANVAS_WIDTH / image.width;
    const scaleY = CANVAS_HEIGHT / image.height;
    const initialScale = Math.min(scaleX, scaleY, 1);
    setScale(initialScale);

    const x = (CANVAS_WIDTH - image.width * initialScale) / 2;
    const y = (CANVAS_HEIGHT - image.height * initialScale) / 2;
    setStagePos({ x, y });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = e.target.getStage();
    if (!stage) return;

    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.max(0.1, Math.min(20, newScale));

    setScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  // Constrain panning to keep image visible
  const dragBoundFunc = (pos: { x: number; y: number }) => {
    if (!image) return pos;

    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;

    // Allow dragging but keep at least 50px of the image visible
    const minVisible = 50;

    const x = Math.max(
      -imageWidth + minVisible,
      Math.min(CANVAS_WIDTH - minVisible, pos.x)
    );

    const y = Math.max(
      -imageHeight + minVisible,
      Math.min(CANVAS_HEIGHT - minVisible, pos.y)
    );

    return { x, y };
  };

  // Render line in canvas coordinates
  const renderLine = (lineData: { start: { x: number; y: number }; end: { x: number; y: number } } | null, color: string) => {
    if (!lineData) return null;

    return (
      <Line
        points={[
          lineData.start.x,
          lineData.start.y,
          lineData.end.x,
          lineData.end.y
        ]}
        stroke={color}
        strokeWidth={2 / scale}
        lineCap="round"
        lineJoin="round"
      />
    );
  };

  return (
    <Box>
      {showToolbar && (
        <Paper elevation={2} sx={{ p: 1, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Pointer Tool (Pan/Zoom)">
              <IconButton
                size="small"
                onClick={() => setTool('pointer')}
                color={tool === 'pointer' ? 'primary' : 'default'}
              >
                <PanTool />
              </IconButton>
            </Tooltip>

            <Tooltip title="Line Tool (Draw Scale Bar)">
              <IconButton
                size="small"
                onClick={() => setTool('line')}
                color={tool === 'line' ? 'primary' : 'default'}
              >
                <Timeline />
              </IconButton>
            </Tooltip>

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title="Zoom In">
              <IconButton size="small" onClick={handleZoomIn}>
                <ZoomIn />
              </IconButton>
            </Tooltip>

            <Tooltip title="Zoom Out">
              <IconButton size="small" onClick={handleZoomOut}>
                <ZoomOut />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset Zoom">
              <IconButton size="small" onClick={handleResetZoom}>
                <RestartAlt />
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>
      )}

      <Box
        ref={containerRef}
        sx={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: '#2a2a2a',
          cursor: tool === 'line' ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
          position: 'relative',
        }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <Layer>
            {image && (
              <KonvaImage
                image={image}
                width={image.width}
                height={image.height}
              />
            )}

            {/* Render saved line in red */}
            {renderLine(line, '#ff0000')}

            {/* Render temporary line while drawing in yellow */}
            {renderLine(tempLine, '#ffff00')}
          </Layer>
        </Stage>
      </Box>
    </Box>
  );
});
