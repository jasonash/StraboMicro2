/**
 * PlacementCanvas Component
 *
 * Interactive canvas for placing associated micrographs on their parent micrograph.
 * Uses tiled rendering for both the parent (from disk) and child (from scratch space).
 * Allows drag, resize, and rotate interactions to position the associated micrograph.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from 'react-konva';
import { Box, Typography, Button, Stack } from '@mui/material';
import Konva from 'konva';
import { useAppStore } from '@/store';

interface PlacementCanvasProps {
  parentMicrographId: string;
  childScratchPath: string; // Path to child image in scratch space
  childWidth: number;
  childHeight: number;
  initialOffsetX?: number;
  initialOffsetY?: number;
  initialRotation?: number;
  onPlacementChange: (offsetX: number, offsetY: number, rotation: number) => void;
}

const PlacementCanvas: React.FC<PlacementCanvasProps> = ({
  parentMicrographId,
  childScratchPath,
  childWidth,
  childHeight,
  initialOffsetX = 0,
  initialOffsetY = 0,
  initialRotation = 0,
  onPlacementChange,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const childGroupRef = useRef<Konva.Group>(null);

  const [parentImage, setParentImage] = useState<HTMLImageElement | null>(null);
  const [childImage, setChildImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Child overlay transform state
  const [childTransform, setChildTransform] = useState({
    x: initialOffsetX,
    y: initialOffsetY,
    rotation: initialRotation,
    scaleX: 1,
    scaleY: 1,
  });

  // Load parent micrograph from the store and tile cache
  useEffect(() => {
    const loadParentImage = async () => {
      try {
        // Get parent micrograph from store to find its image hash
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
        // imagePath is stored as just the micrograph ID, need to construct full path
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

          // Fit stage to parent image while maintaining aspect ratio
          const containerWidth = 800;
          const containerHeight = 600;
          const scale = Math.min(
            containerWidth / img.width,
            containerHeight / img.height
          );

          setStageSize({
            width: img.width * scale,
            height: img.height * scale,
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

  // Handle transform changes (drag, resize, rotate)
  const handleTransformEnd = () => {
    const node = childGroupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and update dimensions instead (keeps scaling consistent)
    node.scaleX(1);
    node.scaleY(1);

    const newTransform = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX,
      scaleY,
    };

    setChildTransform(newTransform);
    onPlacementChange(newTransform.x, newTransform.y, newTransform.rotation);
  };

  const handleDragEnd = () => {
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

  // Reset placement to center
  const handleReset = () => {
    const centerX = stageSize.width / 2 - (childWidth * childTransform.scaleX) / 2;
    const centerY = stageSize.height / 2 - (childHeight * childTransform.scaleY) / 2;

    const resetTransform = {
      x: centerX,
      y: centerY,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };

    setChildTransform(resetTransform);
    onPlacementChange(resetTransform.x, resetTransform.y, resetTransform.rotation);

    if (childGroupRef.current) {
      childGroupRef.current.position({ x: centerX, y: centerY });
      childGroupRef.current.rotation(0);
      childGroupRef.current.scale({ x: 1, y: 1 });
      childGroupRef.current.getLayer()?.batchDraw();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Drag, resize, and rotate the overlay to position it on the parent micrograph.
      </Typography>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: 'background.default',
          minHeight: 600,
        }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
        >
          <Layer>
            {/* Parent micrograph (background) */}
            {parentImage && (
              <KonvaImage
                image={parentImage}
                width={stageSize.width}
                height={stageSize.height}
              />
            )}

            {/* Child micrograph overlay (draggable, resizable, rotatable) */}
            {childImage && (
              <Group
                ref={childGroupRef}
                x={childTransform.x}
                y={childTransform.y}
                rotation={childTransform.rotation}
                draggable
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
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
                  stroke="#00ff00"
                  strokeWidth={2}
                  listening={false}
                />
              </Group>
            )}

            {/* Transformer for resize/rotate handles */}
            {childImage && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={true}
                borderStroke="#00ff00"
                anchorStroke="#00ff00"
                anchorFill="#ffffff"
                anchorSize={8}
              />
            )}
          </Layer>
        </Stage>
      </Box>

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={handleReset}>
          Reset Position
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Position: ({childTransform.x.toFixed(1)}, {childTransform.y.toFixed(1)}) |
        Rotation: {childTransform.rotation.toFixed(1)}°
      </Typography>
    </Box>
  );
};

export default PlacementCanvas;
