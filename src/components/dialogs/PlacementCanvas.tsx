/**
 * PlacementCanvas Component
 *
 * Interactive canvas for placing associated micrographs on their parent micrograph.
 * Similar to ScaleBarCanvas but with an overlay child image that can be dragged, resized, and rotated.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from 'react-konva';
import { Box, Typography, Button, Stack, IconButton, Tooltip, Paper } from '@mui/material';
import { PanTool, ZoomIn, ZoomOut, RestartAlt } from '@mui/icons-material';
import Konva from 'konva';
import { useAppStore } from '@/store';

interface PlacementCanvasProps {
  parentMicrographId: string;
  childScratchPath: string; // Path to child image in scratch space
  childWidth: number;
  childHeight: number;
  scaleMethod: string; // The scale method chosen in the wizard
  initialOffsetX?: number;
  initialOffsetY?: number;
  initialRotation?: number;
  initialScaleX?: number;
  initialScaleY?: number;
  onPlacementChange: (offsetX: number, offsetY: number, rotation: number, scaleX?: number, scaleY?: number) => void;
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

const PlacementCanvas: React.FC<PlacementCanvasProps> = ({
  parentMicrographId,
  childScratchPath,
  childWidth,
  childHeight,
  scaleMethod,
  initialOffsetX = 400,
  initialOffsetY = 300,
  initialRotation = 0,
  initialScaleX = 1,
  initialScaleY = 1,
  onPlacementChange,
  onScaleDataChange,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const childGroupRef = useRef<Konva.Group>(null);

  const [parentImage, setParentImage] = useState<HTMLImageElement | null>(null);
  const [childImage, setChildImage] = useState<HTMLImageElement | null>(null);

  // Stage pan/zoom state (for parent background)
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

  // Canvas dimensions
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // Child overlay position (in parent image coordinates)
  const [childTransform, setChildTransform] = useState({
    x: initialOffsetX,
    y: initialOffsetY,
    rotation: initialRotation,
    scaleX: initialScaleX,
    scaleY: initialScaleY,
  });

  // Scale bar/input state for different scale methods
  const [scaleInputs, setScaleInputs] = useState({
    scaleBarLineLengthPixels: '',
    scaleBarPhysicalLength: '',
    scaleBarUnits: 'μm',
    pixels: '',
    physicalLength: '',
    pixelUnits: 'μm',
    imageWidthPhysical: '',
    imageHeightPhysical: '',
    sizeUnits: 'μm',
  });

  // Load parent micrograph from the store and tile cache
  useEffect(() => {
    const loadParentImage = async () => {
      try {
        const { project } = useAppStore.getState();
        if (!project) {
          console.error('[PlacementCanvas] No project loaded');
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
          console.error('[PlacementCanvas] Parent micrograph not found or has no image path');
          return;
        }

        // Build full path to parent image
        const folderPaths = await window.api.getProjectFolderPaths(project.id);
        const fullParentPath = `${folderPaths.images}/${parentMicrograph.imagePath}`;

        console.log('[PlacementCanvas] Loading parent from:', fullParentPath);

        // Load the tiled image
        const tileData = await window.api.loadImageWithTiles(fullParentPath);

        // Load medium resolution for placement canvas
        const mediumDataUrl = await window.api.loadMedium(tileData.hash);

        const img = new window.Image();
        img.onload = () => {
          setParentImage(img);

          // Fit image to canvas initially
          const scaleX = CANVAS_WIDTH / img.width;
          const scaleY = CANVAS_HEIGHT / img.height;
          const initialScale = Math.min(scaleX, scaleY, 1);
          setScale(initialScale);

          // Center image
          const x = (CANVAS_WIDTH - img.width * initialScale) / 2;
          const y = (CANVAS_HEIGHT - img.height * initialScale) / 2;
          setStagePos({ x, y });

          console.log('[PlacementCanvas] Parent image loaded:', {
            width: img.width,
            height: img.height,
            initialScale,
          });
        };
        img.src = mediumDataUrl;
      } catch (error) {
        console.error('[PlacementCanvas] Error loading parent image:', error);
      }
    };

    loadParentImage();
  }, [parentMicrographId]);

  // Load child micrograph from scratch space
  useEffect(() => {
    const loadChildImage = async () => {
      try {
        // Load the tiled image from scratch path
        const tileData = await window.api.loadImageWithTiles(childScratchPath);

        // Load medium resolution for placement canvas
        const mediumDataUrl = await window.api.loadMedium(tileData.hash);

        const img = new window.Image();
        img.onload = () => {
          setChildImage(img);
          console.log('[PlacementCanvas] Child image loaded:', {
            width: img.width,
            height: img.height,
          });
        };
        img.src = mediumDataUrl;
      } catch (error) {
        console.error('[PlacementCanvas] Error loading child image:', error);
      }
    };

    loadChildImage();
  }, [childScratchPath]);

  // Attach transformer to child group
  useEffect(() => {
    if (transformerRef.current && childGroupRef.current) {
      transformerRef.current.nodes([childGroupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [childImage]);

  // Pan/Zoom handlers
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Allow panning when clicking on empty space OR the parent image (but not the child overlay)
    const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnParent = e.target.attrs?.image === parentImage;

    if (clickedOnEmpty || clickedOnParent) {
      const stage = e.target.getStage();
      if (!stage) return;

      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;

      setIsPanning(true);
      setLastPanPos(pointerPos);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning || !lastPanPos) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const dx = pointerPos.x - lastPanPos.x;
    const dy = pointerPos.y - lastPanPos.y;

    setStagePos({
      x: stagePos.x + dx,
      y: stagePos.y + dy,
    });

    setLastPanPos(pointerPos);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setLastPanPos(null);
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

  const handleZoomIn = () => {
    const newScale = Math.min(scale * 1.2, 20);
    setScale(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale / 1.2, 0.1);
    setScale(newScale);
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

  // Child transform handlers
  const handleChildDragEnd = () => {
    const node = childGroupRef.current;
    if (!node) return;

    const newTransform = {
      ...childTransform,
      x: node.x(),
      y: node.y(),
    };

    setChildTransform(newTransform);
    onPlacementChange(newTransform.x, newTransform.y, newTransform.rotation);
  };

  const handleChildTransformEnd = () => {
    const node = childGroupRef.current;
    if (!node) return;

    const newTransform = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    };

    setChildTransform(newTransform);
    onPlacementChange(newTransform.x, newTransform.y, newTransform.rotation);
  };

  const handleResetChild = () => {
    if (!parentImage) return;

    const resetTransform = {
      x: parentImage.width / 2,
      y: parentImage.height / 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };

    setChildTransform(resetTransform);
    onPlacementChange(resetTransform.x, resetTransform.y, resetTransform.rotation);

    if (childGroupRef.current) {
      childGroupRef.current.position({ x: resetTransform.x, y: resetTransform.y });
      childGroupRef.current.rotation(0);
      childGroupRef.current.scale({ x: 1, y: 1 });
      childGroupRef.current.getLayer()?.batchDraw();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: '100%', textAlign: 'center' }}>
        Pan and zoom the parent micrograph. Drag, resize, and rotate the overlay to position it.
      </Typography>

      {/* Toolbar */}
      <Paper elevation={2} sx={{ p: 1, width: CANVAS_WIDTH }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Pan Tool">
            <IconButton size="small" color="primary">
              <PanTool />
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

          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleResetView}>
              <RestartAlt />
            </IconButton>
          </Tooltip>

          <Button size="small" variant="outlined" onClick={handleResetChild}>
            Reset Overlay
          </Button>
        </Stack>
      </Paper>

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
          cursor: isPanning ? 'grabbing' : 'grab',
          position: 'relative',
          flexShrink: 0,
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
            {/* Parent micrograph (background) */}
            {parentImage && (
              <KonvaImage
                image={parentImage}
                width={parentImage.width}
                height={parentImage.height}
              />
            )}

            {/* Child micrograph overlay (draggable, resizable, rotatable) */}
            {childImage && (
              <Group
                ref={childGroupRef}
                x={childTransform.x}
                y={childTransform.y}
                rotation={childTransform.rotation}
                scaleX={childTransform.scaleX}
                scaleY={childTransform.scaleY}
                offsetX={childWidth / 2}
                offsetY={childHeight / 2}
                draggable
                onDragEnd={handleChildDragEnd}
                onTransformEnd={handleChildTransformEnd}
              >
                <KonvaImage
                  image={childImage}
                  width={childWidth}
                  height={childHeight}
                  opacity={0.7}
                />

                {/* Border outline to make overlay visible */}
                <Rect
                  width={childWidth}
                  height={childHeight}
                  stroke="#e44c65"
                  strokeWidth={2 / scale}
                  listening={false}
                />
              </Group>
            )}

            {/* Transformer for resize/rotate handles */}
            {childImage && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={true}
                borderStroke="#e44c65"
                anchorStroke="#e44c65"
                anchorFill="#e44c65"
                anchorSize={5 / scale}
                anchorCornerRadius={2.5 / scale}
                anchorStrokeWidth={2 / scale}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                keepRatio={true}
                rotateAnchorOffset={8 / scale}
              />
            )}
          </Layer>
        </Stage>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ width: CANVAS_WIDTH, textAlign: 'center' }}>
        Overlay Position: ({childTransform.x.toFixed(1)}, {childTransform.y.toFixed(1)}) |
        Rotation: {childTransform.rotation.toFixed(1)}° |
        Zoom: {(scale * 100).toFixed(0)}%
      </Typography>
    </Box>
  );
};

export default PlacementCanvas;
