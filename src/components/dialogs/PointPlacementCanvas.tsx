import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line } from 'react-konva';
import { Box, Stack, IconButton, Tooltip, Paper, TextField, Select, MenuItem, FormControl, InputLabel, Typography, Grid } from '@mui/material';
import { PanTool, Timeline, ZoomIn, ZoomOut, RestartAlt, Place } from '@mui/icons-material';
import Konva from 'konva';
import { useAppStore } from '@/store';

interface PointPlacementCanvasProps {
  parentMicrographId: string;
  childScratchPath: string; // Path to child image in scratch space
  childWidth: number;
  childHeight: number;
  scaleMethod: string;
  initialOffsetX?: number;
  initialOffsetY?: number;
  copySizePixelsPerCm?: number; // For "Copy Size from Existing" - calculated px/cm for new image
  onPlacementChange: (offsetX: number, offsetY: number) => void;
  onScaleDataChange?: (data: {
    scaleBarLineLengthPixels?: number;
    scaleBarPhysicalLength?: number;
    scaleBarUnits?: string;
    pixels?: number;
    physicalLength?: number;
    pixelUnits?: string;
    imageWidthPhysical?: number;
    imageHeightPhysical?: number;
    sizeUnits?: string;
  }) => void;
}

export const PointPlacementCanvas = ({
  parentMicrographId,
  childScratchPath,
  childWidth,
  childHeight,
  scaleMethod,
  initialOffsetX = 0,
  initialOffsetY = 0,
  copySizePixelsPerCm, // For "Copy Size from Existing" - used to detect copy mode
  onPlacementChange,
  onScaleDataChange,
}: PointPlacementCanvasProps) => {
  const [parentImage, setParentImage] = useState<HTMLImageElement | null>(null);
  const [childImage, setChildImage] = useState<HTMLImageElement | null>(null);
  const [_parentScale, setParentScale] = useState<number>(0); // Currently unused but may be needed
  const [parentOriginalWidth, setParentOriginalWidth] = useState<number>(0);

  // Stage pan/zoom state
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

  // Canvas dimensions
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // Child overlay position (for "Trace Scale Bar" method - in DISPLAYED image coordinates)
  const [childOverlayPos, setChildOverlayPos] = useState({ x: 0, y: 0 });
  const [isDraggingChild, setIsDraggingChild] = useState(false);

  // Point marker position (in DISPLAYED image coordinates) - only one point allowed
  const [pointPos, setPointPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPoint, setIsDraggingPoint] = useState(false);

  // Tool state
  const [activeTool, setActiveTool] = useState<'pan' | 'point' | 'line'>('pan');

  // State for Pixel Conversion Factor inputs
  const [pixelInput, setPixelInput] = useState('');
  const [physicalLengthInput, setPhysicalLengthInput] = useState('');
  const [unitInput, setUnitInput] = useState('μm');

  // State for Width/Height inputs
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [sizeUnitInput, setSizeUnitInput] = useState('μm');

  // State for Trace Scale Bar inputs
  const [scaleBarPixelInput, setScaleBarPixelInput] = useState('');
  const [scaleBarPhysicalInput, setScaleBarPhysicalInput] = useState('');
  const [scaleBarUnitInput, setScaleBarUnitInput] = useState('μm');

  // State for traced scale bar line
  const [currentLine, setCurrentLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDrawingLine, setIsDrawingLine] = useState(false);

  const stageRef = useRef<Konva.Stage>(null);

  // For "Copy Size from Existing", immediately report the copied position to the parent
  // This ensures the form data is updated even if the user doesn't drag the point
  useEffect(() => {
    if (scaleMethod === 'Copy Size from Existing Micrograph' && copySizePixelsPerCm &&
        initialOffsetX !== 0 && initialOffsetY !== 0) {
      console.log('[PointPlacementCanvas] Copy Size - reporting initial position:', { initialOffsetX, initialOffsetY });
      onPlacementChange(initialOffsetX, initialOffsetY);
    }
  }, [scaleMethod, copySizePixelsPerCm, initialOffsetX, initialOffsetY, onPlacementChange]);

  // Load parent image
  useEffect(() => {
    const loadParentImage = async () => {
      try {
        const { project } = useAppStore.getState();
        if (!project) {
          console.error('[PointPlacementCanvas] No project loaded');
          return;
        }

        // Find parent micrograph
        let parentMicrograph = null;
        outer: for (const dataset of project.datasets || []) {
          for (const sample of dataset.samples || []) {
            for (const micrograph of sample.micrographs || []) {
              if (micrograph.id === parentMicrographId) {
                parentMicrograph = micrograph;
                break outer;
              }
            }
          }
        }

        if (!parentMicrograph || !parentMicrograph.imagePath) {
          console.error('[PointPlacementCanvas] Parent micrograph not found or has no image path');
          return;
        }

        // Store parent scale and original dimensions for calculations
        if (parentMicrograph.scalePixelsPerCentimeter) {
          setParentScale(parentMicrograph.scalePixelsPerCentimeter);
        }
        if (parentMicrograph.imageWidth) {
          setParentOriginalWidth(parentMicrograph.imageWidth);
        }

        // Build full path to parent image
        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) return;
        const fullParentPath = `${folderPaths.images}/${parentMicrograph.imagePath}`;

        // Load the tiled image
        const tileData = await window.api?.loadImageWithTiles(fullParentPath);
        if (!tileData) return;

        // Load medium resolution for placement canvas
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (!mediumDataUrl) return;

        const img = new window.Image();
        img.onload = () => {
          setParentImage(img);

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
        img.src = mediumDataUrl;
      } catch (error) {
        console.error('[PointPlacementCanvas] Failed to load parent image:', error);
      }
    };

    loadParentImage();
  }, [parentMicrographId]);

  // Load child image (only for Trace Scale Bar method)
  useEffect(() => {
    const loadChildImage = async () => {
      if (scaleMethod !== 'Trace Scale Bar') {
        setChildImage(null);
        return;
      }

      try {
        // Load child from scratch space via tile cache
        const tileData = await window.api?.loadImageWithTiles(childScratchPath);
        if (!tileData) return;
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (!mediumDataUrl) return;

        const img = new window.Image();
        img.onload = () => {
          setChildImage(img);
        };
        img.src = mediumDataUrl;
      } catch (error) {
        console.error('[PointPlacementCanvas] Failed to load child image:', error);
      }
    };

    loadChildImage();
  }, [scaleMethod, childScratchPath]);

  // Initialize positions when parent image loads (only once)
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!parentImage || !parentOriginalWidth || initialized) return;

    // Calculate scale ratio
    const scaleRatio = parentImage.width / parentOriginalWidth;

    // If we have initial values (editing existing), convert from original to displayed coordinates
    if (initialOffsetX !== 0 || initialOffsetY !== 0) {
      const displayedX = initialOffsetX * scaleRatio;
      const displayedY = initialOffsetY * scaleRatio;
      setPointPos({ x: displayedX, y: displayedY });
      // Child overlay stays centered - don't move it to the point position
    }

    // Always center the child overlay (independent of point position)
    const centerX = parentImage.width / 2;
    const centerY = parentImage.height / 2;
    setChildOverlayPos({ x: centerX, y: centerY });

    setInitialized(true);
  }, [parentImage, parentOriginalWidth, initialOffsetX, initialOffsetY, initialized]);

  // Notify parent of scale data changes
  useEffect(() => {
    if (!onScaleDataChange) return;

    if (scaleMethod === 'Trace Scale Bar') {
      if (scaleBarPixelInput && scaleBarPhysicalInput) {
        onScaleDataChange({
          scaleBarLineLengthPixels: parseFloat(scaleBarPixelInput),
          scaleBarPhysicalLength: parseFloat(scaleBarPhysicalInput),
          scaleBarUnits: scaleBarUnitInput,
        });
      }
    } else if (scaleMethod === 'Pixel Conversion Factor') {
      if (pixelInput && physicalLengthInput) {
        onScaleDataChange({
          pixels: parseFloat(pixelInput),
          physicalLength: parseFloat(physicalLengthInput),
          pixelUnits: unitInput,
        });
      }
    } else if (scaleMethod === 'Provide Width/Height of Image') {
      if (widthInput || heightInput) {
        onScaleDataChange({
          imageWidthPhysical: widthInput ? parseFloat(widthInput) : undefined,
          imageHeightPhysical: heightInput ? parseFloat(heightInput) : undefined,
          sizeUnits: sizeUnitInput,
        });
      }
    }
  }, [
    scaleMethod,
    scaleBarPixelInput,
    scaleBarPhysicalInput,
    scaleBarUnitInput,
    pixelInput,
    physicalLengthInput,
    unitInput,
    widthInput,
    heightInput,
    sizeUnitInput,
    onScaleDataChange,
  ]);

  // Auto-populate width/height based on aspect ratio
  useEffect(() => {
    if (scaleMethod !== 'Provide Width/Height of Image') return;

    const width = parseFloat(widthInput);
    const height = parseFloat(heightInput);
    const aspectRatio = childWidth / childHeight;

    if (!isNaN(width) && width > 0) {
      // Auto-populate height based on width
      const calculatedHeight = (width / aspectRatio).toFixed(2);
      if (heightInput !== calculatedHeight) {
        setHeightInput(calculatedHeight);
      }
    } else if (!isNaN(height) && height > 0) {
      // Auto-populate width based on height
      const calculatedWidth = (height * aspectRatio).toFixed(2);
      if (widthInput !== calculatedWidth) {
        setWidthInput(calculatedWidth);
      }
    }
  }, [widthInput, heightInput, childWidth, childHeight, scaleMethod]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // Convert screen coordinates to parent image coordinates
    const imageX = (pointerPos.x - stagePos.x) / scale;
    const imageY = (pointerPos.y - stagePos.y) / scale;

    // Check if clicking on existing point to drag it
    if (pointPos && activeTool === 'pan') {
      const POINT_RADIUS = 8; // Match the visual radius
      const distToPoint = Math.sqrt(
        Math.pow((imageX - pointPos.x) * scale, 2) +
        Math.pow((imageY - pointPos.y) * scale, 2)
      );

      if (distToPoint <= POINT_RADIUS + 5) { // 5px tolerance
        setIsDraggingPoint(true);
        setLastPanPos(pointerPos);
        return;
      }
    }

    // Check if clicking on child overlay for "Trace Scale Bar" method
    if (scaleMethod === 'Trace Scale Bar' && childImage && activeTool === 'pan') {
      const childLeft = childOverlayPos.x - childImage.width / 2;
      const childRight = childOverlayPos.x + childImage.width / 2;
      const childTop = childOverlayPos.y - childImage.height / 2;
      const childBottom = childOverlayPos.y + childImage.height / 2;

      if (imageX >= childLeft && imageX <= childRight && imageY >= childTop && imageY <= childBottom) {
        // Start dragging the child overlay
        setIsDraggingChild(true);
        setLastPanPos(pointerPos);
        return;
      }
    }

    if (activeTool === 'point') {
      // Only allow placing one point
      if (!pointPos) {
        setPointPos({ x: imageX, y: imageY });

        // Convert from displayed image coordinates to original image coordinates
        const scaleRatio = parentOriginalWidth / (parentImage?.width || 1);
        const originalX = imageX * scaleRatio;
        const originalY = imageY * scaleRatio;

        onPlacementChange(originalX, originalY);
        // Switch back to pan tool after placing the point
        setActiveTool('pan');
      }
    } else if (activeTool === 'line') {
      // Start drawing line for scale bar (on child overlay for "Trace Scale Bar")
      setIsDrawingLine(true);
      setCurrentLine({ x1: imageX, y1: imageY, x2: imageX, y2: imageY });
    } else if (activeTool === 'pan') {
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

    if (isDraggingPoint && lastPanPos && pointPos) {
      // Drag the point marker
      const dx = pointerPos.x - lastPanPos.x;
      const dy = pointerPos.y - lastPanPos.y;

      // Convert screen delta to image delta
      const imageDx = dx / scale;
      const imageDy = dy / scale;

      const newX = pointPos.x + imageDx;
      const newY = pointPos.y + imageDy;

      setPointPos({ x: newX, y: newY });
      setLastPanPos(pointerPos);
    } else if (isDraggingChild && lastPanPos) {
      // Drag the child overlay
      const dx = pointerPos.x - lastPanPos.x;
      const dy = pointerPos.y - lastPanPos.y;

      // Convert screen delta to image delta
      const imageDx = dx / scale;
      const imageDy = dy / scale;

      const newX = childOverlayPos.x + imageDx;
      const newY = childOverlayPos.y + imageDy;

      setChildOverlayPos({ x: newX, y: newY });
      setLastPanPos(pointerPos);
    } else if (isDrawingLine && activeTool === 'line' && currentLine) {
      // Update line endpoint
      const x = (pointerPos.x - stagePos.x) / scale;
      const y = (pointerPos.y - stagePos.y) / scale;

      setCurrentLine({ ...currentLine, x2: x, y2: y });
    } else if (isPanning && activeTool === 'pan' && lastPanPos) {
      // Pan the view
      const dx = pointerPos.x - lastPanPos.x;
      const dy = pointerPos.y - lastPanPos.y;

      setStagePos({
        x: stagePos.x + dx,
        y: stagePos.y + dy,
      });
      setLastPanPos(pointerPos);
    }
  };

  const handleMouseUp = () => {
    if (isDraggingPoint && pointPos) {
      // Finished dragging point - convert to original image coordinates and notify parent
      const scaleRatio = parentOriginalWidth / (parentImage?.width || 1);
      const originalX = pointPos.x * scaleRatio;
      const originalY = pointPos.y * scaleRatio;

      onPlacementChange(originalX, originalY);
      setIsDraggingPoint(false);
      setLastPanPos(null);
      return;
    }

    if (isDraggingChild) {
      // Finished dragging child overlay - no need to notify parent (only point matters)
      setIsDraggingChild(false);
      setLastPanPos(null);
      return;
    }

    if (isDrawingLine && currentLine) {
      // Calculate line length in pixels
      const dx = currentLine.x2 - currentLine.x1;
      const dy = currentLine.y2 - currentLine.y1;
      const lengthInDisplayedImage = Math.sqrt(dx * dx + dy * dy);

      // Convert to original CHILD image pixel coordinates
      // (not parent - the line is drawn on the child overlay)
      const childScaleRatio = childWidth / (childImage?.width || 1);
      const lengthPixels = lengthInDisplayedImage * childScaleRatio;

      setScaleBarPixelInput(lengthPixels.toFixed(2));
      setIsDrawingLine(false);
      setCurrentLine(null); // Clear the line
      setActiveTool('pan'); // Auto-switch back to pan tool
    }

    setIsPanning(false);
    setLastPanPos(null);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 20));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleResetView = () => {
    if (!parentImage) return;
    const scaleX = CANVAS_WIDTH / parentImage.width;
    const scaleY = CANVAS_HEIGHT / parentImage.height;
    const initialScale = Math.min(scaleX, scaleY, 1);
    setScale(initialScale);

    const x = (CANVAS_WIDTH - parentImage.width * initialScale) / 2;
    const y = (CANVAS_HEIGHT - parentImage.height * initialScale) / 2;
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

  const getCursor = () => {
    if (activeTool === 'point') {
      // Show crosshair only if no point placed yet
      return pointPos ? 'not-allowed' : 'crosshair';
    }
    if (activeTool === 'line') return 'crosshair';
    if (isDraggingPoint) return 'grabbing';
    if (isDraggingChild) return 'grabbing';
    if (isPanning) return 'grabbing';
    return 'grab';
  };

  const showLineTools = scaleMethod === 'Trace Scale Bar';
  const showPointTool = true; // Always show point tool for point placement

  return (
    <Box>
      {/* Toolbar */}
      <Paper elevation={2} sx={{ p: 1, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Pan Tool">
            <IconButton
              size="small"
              onClick={() => setActiveTool('pan')}
              color={activeTool === 'pan' ? 'primary' : 'default'}
            >
              <PanTool />
            </IconButton>
          </Tooltip>

          {showPointTool && (
            <Tooltip title="Point Tool (Click to Place Location)">
              <IconButton
                size="small"
                onClick={() => setActiveTool('point')}
                color={activeTool === 'point' ? 'primary' : 'default'}
              >
                <Place />
              </IconButton>
            </Tooltip>
          )}

          {showLineTools && (
            <Tooltip title="Line Tool (Draw Scale Bar)">
              <IconButton
                size="small"
                onClick={() => setActiveTool('line')}
                color={activeTool === 'line' ? 'primary' : 'default'}
              >
                <Timeline />
              </IconButton>
            </Tooltip>
          )}

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

          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleResetView}>
              <RestartAlt />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Input fields for Trace Scale Bar method */}
      {scaleMethod === 'Trace Scale Bar' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Trace Scale Bar on Child Image
          </Typography>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={4}>
              <TextField
                label="Pixels"
                type="number"
                value={scaleBarPixelInput}
                onChange={(e) => setScaleBarPixelInput(e.target.value)}
                fullWidth
                size="small"
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Physical Length"
                type="number"
                value={scaleBarPhysicalInput}
                onChange={(e) => setScaleBarPhysicalInput(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Unit</InputLabel>
                <Select
                  value={scaleBarUnitInput}
                  onChange={(e) => setScaleBarUnitInput(e.target.value)}
                  label="Unit"
                >
                  <MenuItem value="μm">μm (micrometers)</MenuItem>
                  <MenuItem value="mm">mm (millimeters)</MenuItem>
                  <MenuItem value="cm">cm (centimeters)</MenuItem>
                  <MenuItem value="m">m (meters)</MenuItem>
                  <MenuItem value="inches">inches</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Use the line tool to trace a scale bar on the child image overlay. Enter the physical length.
          </Typography>
        </Paper>
      )}

      {/* Input fields for Pixel Conversion Factor method */}
      {scaleMethod === 'Pixel Conversion Factor' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Pixel Conversion Factor
          </Typography>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={4}>
              <TextField
                label="Number of Pixels"
                type="number"
                value={pixelInput}
                onChange={(e) => setPixelInput(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Physical Length"
                type="number"
                value={physicalLengthInput}
                onChange={(e) => setPhysicalLengthInput(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Unit</InputLabel>
                <Select
                  value={unitInput}
                  onChange={(e) => setUnitInput(e.target.value)}
                  label="Unit"
                >
                  <MenuItem value="μm">μm (micrometers)</MenuItem>
                  <MenuItem value="mm">mm (millimeters)</MenuItem>
                  <MenuItem value="cm">cm (centimeters)</MenuItem>
                  <MenuItem value="m">m (meters)</MenuItem>
                  <MenuItem value="inches">inches</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter how many pixels correspond to a known physical length. Use the point tool to mark the location.
          </Typography>
        </Paper>
      )}

      {/* Input fields for Provide Width/Height method */}
      {scaleMethod === 'Provide Width/Height of Image' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Image Physical Dimensions
          </Typography>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={4}>
              <TextField
                label="Width"
                type="number"
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Height"
                type="number"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Unit</InputLabel>
                <Select
                  value={sizeUnitInput}
                  onChange={(e) => setSizeUnitInput(e.target.value)}
                  label="Unit"
                >
                  <MenuItem value="μm">μm (micrometers)</MenuItem>
                  <MenuItem value="mm">mm (millimeters)</MenuItem>
                  <MenuItem value="cm">cm (centimeters)</MenuItem>
                  <MenuItem value="m">m (meters)</MenuItem>
                  <MenuItem value="inches">inches</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter width or height (the other will auto-populate). Use the point tool to mark the location.
          </Typography>
        </Paper>
      )}

      {/* Canvas */}
      <Box
        sx={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: '#2a2a2a',
          cursor: getCursor(),
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Main content layer - scaled and panned */}
          <Layer
            scaleX={scale}
            scaleY={scale}
            x={stagePos.x}
            y={stagePos.y}
          >
            {/* Parent micrograph (background) */}
            {parentImage && (
              <KonvaImage
                image={parentImage}
                width={parentImage.width}
                height={parentImage.height}
              />
            )}

            {/* Child image overlay - only shown for "Trace Scale Bar" method */}
            {scaleMethod === 'Trace Scale Bar' && childImage && (
              <KonvaImage
                image={childImage}
                x={childOverlayPos.x - childImage.width / 2}
                y={childOverlayPos.y - childImage.height / 2}
                width={childImage.width}
                height={childImage.height}
                opacity={0.5}
                listening={false}
              />
            )}

            {/* Traced scale bar line */}
            {scaleMethod === 'Trace Scale Bar' && currentLine && (
              <Line
                points={[currentLine.x1, currentLine.y1, currentLine.x2, currentLine.y2]}
                stroke="#00ff00"
                strokeWidth={3 / scale}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            )}
          </Layer>

          {/* Point marker layer - NOT scaled, only shown if point is placed */}
          <Layer>
            {pointPos && (
              <Circle
                x={pointPos.x * scale + stagePos.x}
                y={pointPos.y * scale + stagePos.y}
                radius={8}
                fill="#e44c65"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
          </Layer>
        </Stage>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ width: CANVAS_WIDTH, textAlign: 'center', mt: 1, display: 'block' }}>
        {pointPos
          ? `Point Location: (${pointPos.x.toFixed(1)}, ${pointPos.y.toFixed(1)}) | Zoom: ${(scale * 100).toFixed(0)}%`
          : `No point placed yet | Zoom: ${(scale * 100).toFixed(0)}%`
        }
      </Typography>
    </Box>
  );
};
