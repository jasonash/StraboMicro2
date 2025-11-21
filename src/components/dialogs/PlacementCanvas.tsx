/**
 * PlacementCanvas Component
 *
 * Interactive canvas for placing associated micrographs on their parent micrograph.
 * Similar to ScaleBarCanvas but with an overlay child image that can be dragged, resized, and rotated.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group, Line } from 'react-konva';
import {
  Box, Typography, Stack, IconButton, Tooltip, Paper,
  TextField, Select, MenuItem, FormControl, InputLabel, Grid
} from '@mui/material';
import { PanTool, RestartAlt, Timeline } from '@mui/icons-material';
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
  copySizePixelsPerCm?: number; // For "Copy Size from Existing" - the calculated px/cm for the new image
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
  copySizePixelsPerCm,
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

  // Tool state for Trace Scale Bar
  const [activeTool, setActiveTool] = useState<'pan' | 'line'>('pan');
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [currentLine, setCurrentLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Parent micrograph metadata (for scale calculations)
  const [parentScale, setParentScale] = useState<number | null>(null);
  const [parentOriginalWidth, setParentOriginalWidth] = useState<number | null>(null);

  // Helper function to convert from center-based to top-left-based coordinates
  const convertCenterToTopLeft = (centerX: number, centerY: number, _rotation: number, scaleX: number, scaleY: number) => {
    // The child Group is positioned at its center due to offsetX/offsetY
    // We need to calculate the top-left corner position in the UNROTATED coordinate system
    // The legacy app measures offset BEFORE rotation is applied

    // Calculate half dimensions considering scale
    const halfWidth = (childWidth * scaleX) / 2;
    const halfHeight = (childHeight * scaleY) / 2;

    // Top-left is simply center minus half dimensions (no rotation applied)
    const topLeftX = centerX - halfWidth;
    const topLeftY = centerY - halfHeight;

    return { x: topLeftX, y: topLeftY };
  };

  // Determine if resize handles should be shown based on scale method
  // "Copy Size from Existing" should NOT allow resize (keeps copied size intact)
  const enableResizeHandles = scaleMethod === 'Stretch and Drag';

  // For "Trace Scale Bar", disable drag when line tool is active
  // For "Copy Size from Existing", allow drag and rotate (but not resize)
  const enableDrag = activeTool !== 'line';
  const enableRotate = true;

  // For "Trace Scale Bar", rotation is enabled but resize is not
  // (This is already handled by enableResizeHandles above, just noting for clarity)

  // Load parent micrograph from the store and tile cache
  useEffect(() => {
    console.log('[PlacementCanvas] Parent image loading effect triggered');
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

        // Store parent scale and original dimensions for calculations
        if (parentMicrograph.scalePixelsPerCentimeter) {
          setParentScale(parentMicrograph.scalePixelsPerCentimeter);
          console.log('[PlacementCanvas] Parent scale:', parentMicrograph.scalePixelsPerCentimeter, 'px/cm');
        }
        if (parentMicrograph.imageWidth) {
          setParentOriginalWidth(parentMicrograph.imageWidth);
          console.log('[PlacementCanvas] Parent original width:', parentMicrograph.imageWidth, 'px');
        }

        // Build full path to parent image
        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) return;
        const fullParentPath = `${folderPaths.images}/${parentMicrograph.imagePath}`;

        console.log('[PlacementCanvas] Loading parent from:', fullParentPath);

        // Load the tiled image
        const tileData = await window.api?.loadImageWithTiles(fullParentPath);
        if (!tileData) return;

        // Load medium resolution for placement canvas
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (!mediumDataUrl) return;

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

          // Initialize child position
          // Check for default/uninitialized values (0, 0) or (400, 300)
          if ((initialOffsetX === 0 && initialOffsetY === 0) ||
              (initialOffsetX === 400 && initialOffsetY === 300)) {
            // These are the default values, so center the child
            const centerX = img.width / 2;
            const centerY = img.height / 2;
            setChildTransform(prev => ({
              ...prev,
              x: centerX,
              y: centerY,
            }));
            // Convert center to top-left for legacy compatibility
            const topLeft = convertCenterToTopLeft(centerX, centerY, initialRotation, initialScaleX, initialScaleY);
            // Convert to original image coordinates
            if (!parentOriginalWidth) return;
            const scaleRatio = parentOriginalWidth / img.width;
            const originalX = topLeft.x * scaleRatio;
            const originalY = topLeft.y * scaleRatio;
            onPlacementChange(originalX, originalY, initialRotation, initialScaleX, initialScaleY);
            console.log('[PlacementCanvas] Initialized child position to center:', { centerX, centerY, topLeft, originalX, originalY });
          } else {
            // We have existing values - convert from original image coordinates to displayed coordinates
            if (!parentOriginalWidth) return;
            const scaleRatio = img.width / parentOriginalWidth;
            // Initial values are in top-left format, convert to center
            const centerX = (initialOffsetX * scaleRatio) + (childWidth * scaleRatio * initialScaleX) / 2;
            const centerY = (initialOffsetY * scaleRatio) + (childHeight * scaleRatio * initialScaleY) / 2;
            setChildTransform(prev => ({
              ...prev,
              x: centerX,
              y: centerY,
            }));
            console.log('[PlacementCanvas] Initialized from existing values:', {
              originalX: initialOffsetX,
              originalY: initialOffsetY,
              scaleRatio,
              displayedCenterX: centerX,
              displayedCenterY: centerY,
            });
          }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentMicrographId]); // Only reload when parent ID changes, not on every offset/scale update

  // Load child micrograph from scratch space
  useEffect(() => {
    const loadChildImage = async () => {
      try {
        // Load the tiled image from scratch path
        const tileData = await window.api?.loadImageWithTiles(childScratchPath);
        if (!tileData) return;

        // Load medium resolution for placement canvas
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (!mediumDataUrl) return;

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

  // Auto-calculate child scale for Pixel Conversion Factor method
  useEffect(() => {
    if (scaleMethod !== 'Pixel Conversion Factor') return;
    if (!parentScale || !parentOriginalWidth || !parentImage || !pixelInput || !physicalLengthInput) return;

    const pixels = parseFloat(pixelInput);
    const physicalLength = parseFloat(physicalLengthInput);

    if (isNaN(pixels) || isNaN(physicalLength) || physicalLength === 0) return;

    // Calculate child's pixels per unit
    const childPixelsPerUnit = pixels / physicalLength;

    // Convert to pixels per centimeter
    const conversionToCm: { [key: string]: number } = {
      'μm': 10000,
      'mm': 10,
      'cm': 1,
      'm': 0.01,
      'inches': 0.393701
    };
    const childPixelsPerCm = childPixelsPerUnit * (conversionToCm[unitInput] || 1);

    // Account for parent downsampling
    // The parent scale (px/cm) is for the original image, but we're displaying a downsampled version
    const parentDownsampleRatio = parentImage.width / parentOriginalWidth;
    const parentScaleInDisplayedImage = parentScale * parentDownsampleRatio;

    // Calculate scale factor: parent scale / child scale
    // If child is more zoomed in (higher px/cm), it should appear smaller on parent (scale < 1)
    // If child is more zoomed out (lower px/cm), it should appear larger on parent (scale > 1)
    let scaleFactor = parentScaleInDisplayedImage / childPixelsPerCm;

    // Sanity checks: prevent wildly large or small scales
    // Max scale: child can't be more than 10x the size of parent
    // Min scale: child can't be less than 0.01x the size of parent
    const MIN_SCALE = 0.01;
    const MAX_SCALE = 10;

    if (scaleFactor > MAX_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too large, clamping to', MAX_SCALE);
      scaleFactor = MAX_SCALE;
    } else if (scaleFactor < MIN_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too small, clamping to', MIN_SCALE);
      scaleFactor = MIN_SCALE;
    }

    console.log('[PlacementCanvas] Pixel Conversion Factor calculation:', {
      pixels,
      physicalLength,
      unit: unitInput,
      childPixelsPerCm,
      parentScale,
      parentDownsampleRatio,
      parentScaleInDisplayedImage,
      scaleFactor,
      clamped: scaleFactor !== parentScaleInDisplayedImage / childPixelsPerCm,
    });

    // Update child scale (without calling onPlacementChange during render)
    setChildTransform(prev => ({
      ...prev,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
    }));
  }, [scaleMethod, pixelInput, physicalLengthInput, unitInput, parentScale]);

  // Auto-calculate child scale for "Copy Size from Existing Micrograph" method
  useEffect(() => {
    if (scaleMethod !== 'Copy Size from Existing Micrograph') return;
    if (!parentScale || !parentOriginalWidth || !parentImage || !copySizePixelsPerCm) return;

    // Use the same formula as Pixel Conversion Factor
    const childPixelsPerCm = copySizePixelsPerCm;

    // Account for parent downsampling
    const parentDownsampleRatio = parentImage.width / parentOriginalWidth;
    const parentScaleInDisplayedImage = parentScale * parentDownsampleRatio;

    // Calculate scale factor: parent scale / child scale
    let scaleFactor = parentScaleInDisplayedImage / childPixelsPerCm;

    // Sanity checks
    const MIN_SCALE = 0.01;
    const MAX_SCALE = 10;
    if (scaleFactor > MAX_SCALE) scaleFactor = MAX_SCALE;
    else if (scaleFactor < MIN_SCALE) scaleFactor = MIN_SCALE;

    console.log('[PlacementCanvas] Copy Size from Existing calculation:', {
      copySizePixelsPerCm,
      parentScale,
      parentOriginalWidth,
      parentDisplayedWidth: parentImage.width,
      parentDownsampleRatio,
      parentScaleInDisplayedImage,
      scaleFactor,
    });

    // Update child scale
    setChildTransform(prev => ({
      ...prev,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
    }));
  }, [scaleMethod, copySizePixelsPerCm, parentScale, parentOriginalWidth, parentImage]);

  // Call onPlacementChange when scale changes automatically (for auto-scale methods)
  // Use a ref to track previous scale to avoid calling on every render
  const prevScaleRef = useRef({ scaleX: initialScaleX, scaleY: initialScaleY });
  useEffect(() => {
    // Only for methods that auto-calculate scale
    if (scaleMethod !== 'Pixel Conversion Factor' &&
        scaleMethod !== 'Provide Width/Height of Image' &&
        scaleMethod !== 'Trace Scale Bar and Drag' &&
        scaleMethod !== 'Copy Size from Existing Micrograph') return;

    // Only call if scale actually changed (not just position)
    if (childTransform.scaleX !== prevScaleRef.current.scaleX ||
        childTransform.scaleY !== prevScaleRef.current.scaleY) {
      // Convert center position to top-left for legacy compatibility
      const topLeft = convertCenterToTopLeft(childTransform.x, childTransform.y, childTransform.rotation, childTransform.scaleX, childTransform.scaleY);
      onPlacementChange(topLeft.x, topLeft.y, childTransform.rotation, childTransform.scaleX, childTransform.scaleY);
      prevScaleRef.current = { scaleX: childTransform.scaleX, scaleY: childTransform.scaleY };
    }
  }, [scaleMethod, childTransform.scaleX, childTransform.scaleY, childTransform.x, childTransform.y, childTransform.rotation, onPlacementChange]);

  // Auto-calculate child scale for Provide Width/Height method
  useEffect(() => {
    if (scaleMethod !== 'Provide Width/Height of Image') return;
    if (!parentScale || !parentOriginalWidth || !parentImage || (!widthInput && !heightInput)) return;

    const width = parseFloat(widthInput);
    const height = parseFloat(heightInput);
    const aspectRatio = childWidth / childHeight;

    // Convert to pixels per centimeter
    const conversionToCm: { [key: string]: number } = {
      'μm': 10000,
      'mm': 10,
      'cm': 1,
      'm': 0.01,
      'inches': 0.393701
    };

    let childPixelsPerCm: number | null = null;

    if (!isNaN(width) && width > 0) {
      // Calculate based on width
      const childPixelsPerUnit = childWidth / width;
      childPixelsPerCm = childPixelsPerUnit * (conversionToCm[sizeUnitInput] || 1);

      // Auto-populate height if not already set
      const calculatedHeight = (width / aspectRatio).toFixed(2);
      if (heightInput !== calculatedHeight) {
        setHeightInput(calculatedHeight);
      }
    } else if (!isNaN(height) && height > 0) {
      // Calculate based on height
      const childPixelsPerUnit = childHeight / height;
      childPixelsPerCm = childPixelsPerUnit * (conversionToCm[sizeUnitInput] || 1);

      // Auto-populate width if not already set
      const calculatedWidth = (height * aspectRatio).toFixed(2);
      if (widthInput !== calculatedWidth) {
        setWidthInput(calculatedWidth);
      }
    }

    if (!childPixelsPerCm) return;

    // Account for parent downsampling
    // The parent scale (px/cm) is for the original image, but we're displaying a downsampled version
    const parentDownsampleRatio = parentImage.width / parentOriginalWidth;
    const parentScaleInDisplayedImage = parentScale * parentDownsampleRatio;

    // Calculate scale factor: parent scale / child scale
    // If child is more zoomed in (higher px/cm), it should appear smaller on parent (scale < 1)
    // If child is more zoomed out (lower px/cm), it should appear larger on parent (scale > 1)
    let scaleFactor = parentScaleInDisplayedImage / childPixelsPerCm;

    // Sanity checks: prevent wildly large or small scales
    const MIN_SCALE = 0.01;
    const MAX_SCALE = 10;

    if (scaleFactor > MAX_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too large, clamping to', MAX_SCALE);
      scaleFactor = MAX_SCALE;
    } else if (scaleFactor < MIN_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too small, clamping to', MIN_SCALE);
      scaleFactor = MIN_SCALE;
    }

    console.log('[PlacementCanvas] Width/Height calculation:', {
      width,
      height,
      unit: sizeUnitInput,
      childPixelsPerCm,
      parentScale,
      parentDownsampleRatio,
      parentScaleInDisplayedImage,
      scaleFactor,
      clamped: scaleFactor !== parentScaleInDisplayedImage / childPixelsPerCm,
    });

    // Update child scale (without calling onPlacementChange during render)
    setChildTransform(prev => ({
      ...prev,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
    }));
  }, [scaleMethod, widthInput, heightInput, sizeUnitInput, parentScale, childWidth, childHeight]);

  // Auto-calculate child scale for Trace Scale Bar method
  useEffect(() => {
    if (scaleMethod !== 'Trace Scale Bar and Drag') return;
    if (!parentScale || !parentOriginalWidth || !parentImage || !scaleBarPixelInput || !scaleBarPhysicalInput) return;

    const pixels = parseFloat(scaleBarPixelInput);
    const physicalLength = parseFloat(scaleBarPhysicalInput);

    if (isNaN(pixels) || isNaN(physicalLength) || physicalLength === 0) return;

    // Calculate child's pixels per unit from the traced scale bar
    const childPixelsPerUnit = pixels / physicalLength;

    // Convert to pixels per centimeter
    const conversionToCm: { [key: string]: number } = {
      'μm': 10000,
      'mm': 10,
      'cm': 1,
      'm': 0.01,
      'inches': 0.393701
    };
    const childPixelsPerCm = childPixelsPerUnit * (conversionToCm[scaleBarUnitInput] || 1);

    // Account for parent downsampling
    // The parent scale (px/cm) is for the original image, but we're displaying a downsampled version
    const parentDownsampleRatio = parentImage.width / parentOriginalWidth;
    const parentScaleInDisplayedImage = parentScale * parentDownsampleRatio;

    // Calculate scale factor: parent scale / child scale
    // If child is more zoomed in (higher px/cm), it should appear smaller on parent (scale < 1)
    // If child is more zoomed out (lower px/cm), it should appear larger on parent (scale > 1)
    let scaleFactor = parentScaleInDisplayedImage / childPixelsPerCm;

    // Sanity checks: prevent wildly large or small scales
    const MIN_SCALE = 0.01;
    const MAX_SCALE = 10;

    if (scaleFactor > MAX_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too large, clamping to', MAX_SCALE);
      scaleFactor = MAX_SCALE;
    } else if (scaleFactor < MIN_SCALE) {
      console.warn('[PlacementCanvas] Scale factor too small, clamping to', MIN_SCALE);
      scaleFactor = MIN_SCALE;
    }

    console.log('[PlacementCanvas] Trace Scale Bar calculation:', {
      pixels,
      physicalLength,
      unit: scaleBarUnitInput,
      childPixelsPerCm,
      parentScale,
      parentOriginalWidth,
      parentDisplayedWidth: parentImage.width,
      parentDownsampleRatio,
      parentScaleInDisplayedImage,
      scaleFactor,
      oldFormula: parentScale / childPixelsPerCm,
      newFormula: parentScaleInDisplayedImage / childPixelsPerCm,
      clamped: scaleFactor !== parentScaleInDisplayedImage / childPixelsPerCm,
    });

    // Update child scale (without calling onPlacementChange during render)
    setChildTransform(prev => ({
      ...prev,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
    }));
  }, [scaleMethod, scaleBarPixelInput, scaleBarPhysicalInput, scaleBarUnitInput, parentScale, parentOriginalWidth, parentImage]);

  // Auto-populate pixel count from line length
  useEffect(() => {
    if (scaleMethod !== 'Trace Scale Bar and Drag') return;
    if (!currentLine || !childImage) return;

    // The line is drawn in parent image coordinate space
    // But we need the length in the child's ORIGINAL image pixel space

    // Calculate line length in parent image space
    const dx = currentLine.x2 - currentLine.x1;
    const dy = currentLine.y2 - currentLine.y1;
    const lineLengthInParentSpace = Math.sqrt(dx * dx + dy * dy);

    // The child Group is rendered at original dimensions (childWidth x childHeight)
    // but the actual loaded image might be downsampled (childImage.width x childImage.height)
    // Konva stretches the loaded image to fit childWidth x childHeight

    // Step 1: Convert from parent space to child's rendered space
    // The child is scaled by childTransform.scaleX in parent space
    const lengthInChildRenderedSpace = lineLengthInParentSpace / childTransform.scaleX;

    // Step 2: The child is rendered at childWidth (original size),
    // but we drew on the actual pixels of the loaded image (childImage.width)
    // We need to scale DOWN by the ratio to get the actual pixels in the loaded image
    const loadedToOriginalRatio = childImage.width / childWidth;
    const lengthInLoadedImagePixels = lengthInChildRenderedSpace * loadedToOriginalRatio;

    // Step 3: Now scale back UP to original image dimensions
    const lengthInOriginalChildPixels = lengthInLoadedImagePixels * (childWidth / childImage.width);

    console.log('[PlacementCanvas] Trace Scale Bar calculation:', {
      'Line coords': { x1: currentLine.x1, y1: currentLine.y1, x2: currentLine.x2, y2: currentLine.y2 },
      'Line length in parent space': lineLengthInParentSpace,
      'Child transform scale': childTransform.scaleX,
      'Division result': lineLengthInParentSpace / childTransform.scaleX,
      'Loaded child image size': { width: childImage.width, height: childImage.height },
      'Original child size': { width: childWidth, height: childHeight },
      'Final length in original child pixels': lengthInOriginalChildPixels
    });

    // Round to 1 decimal place
    setScaleBarPixelInput(lengthInOriginalChildPixels.toFixed(1));
  }, [scaleMethod, currentLine, childTransform.scaleX, childImage, childWidth]);

  // Notify parent of scale data changes for "Trace Scale Bar and Drag"
  useEffect(() => {
    if (scaleMethod !== 'Trace Scale Bar and Drag' || !onScaleDataChange) return;
    if (!scaleBarPixelInput || !scaleBarPhysicalInput) return;

    onScaleDataChange({
      scaleBarLineLengthPixels: parseFloat(scaleBarPixelInput),
      scaleBarPhysicalLength: parseFloat(scaleBarPhysicalInput),
      scaleBarUnits: scaleBarUnitInput,
    });
  }, [scaleMethod, scaleBarPixelInput, scaleBarPhysicalInput, scaleBarUnitInput, onScaleDataChange]);

  // Notify parent of scale data changes for "Pixel Conversion Factor"
  useEffect(() => {
    if (scaleMethod !== 'Pixel Conversion Factor' || !onScaleDataChange) return;
    if (!pixelInput || !physicalLengthInput) return;

    onScaleDataChange({
      pixels: parseFloat(pixelInput),
      physicalLength: parseFloat(physicalLengthInput),
      pixelUnits: unitInput,
    });
  }, [scaleMethod, pixelInput, physicalLengthInput, unitInput, onScaleDataChange]);

  // Notify parent of scale data changes for "Provide Width/Height"
  useEffect(() => {
    if (scaleMethod !== 'Provide Width/Height of Image' || !onScaleDataChange) return;
    if (!widthInput) return;

    onScaleDataChange({
      imageWidthPhysical: parseFloat(widthInput),
      imageHeightPhysical: heightInput ? parseFloat(heightInput) : undefined,
      sizeUnits: sizeUnitInput,
    });
  }, [scaleMethod, widthInput, heightInput, sizeUnitInput, onScaleDataChange]);

  // Pan/Zoom handlers
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // If line tool is active, start drawing a line
    if (activeTool === 'line' && scaleMethod === 'Trace Scale Bar and Drag') {
      const clickedOnEmpty = e.target === e.target.getStage();
      const clickedOnParent = e.target.attrs?.image === parentImage;
      const clickedOnChild = e.target.attrs?.image === childImage;

      // Allow line drawing on empty space, parent image, OR child overlay
      if (clickedOnEmpty || clickedOnParent || clickedOnChild) {
        // Convert screen coordinates to image coordinates
        const x = (pointerPos.x - stagePos.x) / scale;
        const y = (pointerPos.y - stagePos.y) / scale;

        setIsDrawingLine(true);
        setCurrentLine({ x1: x, y1: y, x2: x, y2: y });
      }
      return;
    }

    // Allow panning when clicking on empty space OR the parent image (but not the child overlay)
    const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnParent = e.target.attrs?.image === parentImage;

    if (clickedOnEmpty || clickedOnParent) {
      setIsPanning(true);
      setLastPanPos(pointerPos);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // If drawing a line, update the end point
    if (isDrawingLine && currentLine && activeTool === 'line') {
      const x = (pointerPos.x - stagePos.x) / scale;
      const y = (pointerPos.y - stagePos.y) / scale;
      setCurrentLine({ ...currentLine, x2: x, y2: y });
      return;
    }

    // Otherwise, handle panning
    if (!isPanning || !lastPanPos) return;

    const dx = pointerPos.x - lastPanPos.x;
    const dy = pointerPos.y - lastPanPos.y;

    setStagePos({
      x: stagePos.x + dx,
      y: stagePos.y + dy,
    });

    setLastPanPos(pointerPos);
  };

  const handleMouseUp = () => {
    // Finish drawing line
    if (isDrawingLine) {
      setIsDrawingLine(false);
      // Clear the line after it's been used to calculate pixel count
      setTimeout(() => {
        setCurrentLine(null);
        // Switch back to pan tool automatically
        setActiveTool('pan');
      }, 100);
    }

    // Stop panning
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

  // Zoom functions - currently unused but may be needed for toolbar buttons
  // const handleZoomIn = () => {
  //   const newScale = Math.min(scale * 1.2, 20);
  //   setScale(newScale);
  // };

  // const handleZoomOut = () => {
  //   const newScale = Math.max(scale / 1.2, 0.1);
  //   setScale(newScale);
  // };

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

    // Convert center position to top-left for legacy compatibility
    const topLeft = convertCenterToTopLeft(newTransform.x, newTransform.y, newTransform.rotation, newTransform.scaleX, newTransform.scaleY);

    // Convert from displayed image coordinates to original image coordinates
    if (!parentOriginalWidth || !parentImage?.width) return;
    const scaleRatio = parentOriginalWidth / parentImage.width;
    const originalX = topLeft.x * scaleRatio;
    const originalY = topLeft.y * scaleRatio;

    // For Stretch and Drag, report the DISPLAYED scale (not converted)
    // The scale calculation should happen at save time using: childScale = parentScale / displayedScale
    onPlacementChange(originalX, originalY, newTransform.rotation, newTransform.scaleX, newTransform.scaleY);
  };

  const handleChildTransformEnd = () => {
    const node = childGroupRef.current;
    if (!node) return;

    // Get the scale in displayed coordinate space
    const displayedScaleX = node.scaleX();
    const displayedScaleY = node.scaleY();

    const newTransform = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: displayedScaleX,
      scaleY: displayedScaleY,
    };

    setChildTransform(newTransform);

    // Convert center position to top-left for legacy compatibility
    const topLeft = convertCenterToTopLeft(newTransform.x, newTransform.y, newTransform.rotation, displayedScaleX, displayedScaleY);

    // Convert from displayed image coordinates to original image coordinates
    if (!parentOriginalWidth || !parentImage?.width) return;
    const scaleRatio = parentOriginalWidth / parentImage.width;
    const originalX = topLeft.x * scaleRatio;
    const originalY = topLeft.y * scaleRatio;

    // For Stretch and Drag, report the DISPLAYED scale (not converted)
    // The scale calculation should happen at save time using: childScale = parentScale / displayedScale
    onPlacementChange(originalX, originalY, newTransform.rotation, displayedScaleX, displayedScaleY);
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

    // Convert center to top-left for legacy compatibility
    const topLeft = convertCenterToTopLeft(resetTransform.x, resetTransform.y, resetTransform.rotation, resetTransform.scaleX, resetTransform.scaleY);
    onPlacementChange(topLeft.x, topLeft.y, resetTransform.rotation, resetTransform.scaleX, resetTransform.scaleY);

    if (childGroupRef.current) {
      childGroupRef.current.position({ x: resetTransform.x, y: resetTransform.y });
      childGroupRef.current.rotation(0);
      childGroupRef.current.scale({ x: 1, y: 1 });
      childGroupRef.current.getLayer()?.batchDraw();
    }
  };

  const handleResetAll = () => {
    // Reset the view (parent background zoom/pan)
    handleResetView();
    // Reset the child overlay position/rotation/scale
    handleResetChild();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: '100%', textAlign: 'center' }}>
        Pan and zoom the parent micrograph. Drag, resize, and rotate the overlay to position it.
      </Typography>

      {/* Input fields for Pixel Conversion Factor method */}
      {scaleMethod === 'Pixel Conversion Factor' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH }}>
          <Typography variant="subtitle2" gutterBottom>
            Pixel Conversion Factor
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-end">
            {/* Tool buttons on the left */}
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Pan Tool">
                <IconButton size="small" color="primary">
                  <PanTool />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reset View">
                <IconButton size="small" onClick={handleResetAll}>
                  <RestartAlt />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Input fields on the right */}
            <Box sx={{ flexGrow: 1 }}>
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
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter how many pixels correspond to a known physical length. The overlay will resize automatically.
          </Typography>
        </Paper>
      )}

      {/* Input fields for Provide Width/Height method */}
      {scaleMethod === 'Provide Width/Height of Image' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH }}>
          <Typography variant="subtitle2" gutterBottom>
            Image Physical Dimensions
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-end">
            {/* Tool buttons on the left */}
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Pan Tool">
                <IconButton size="small" color="primary">
                  <PanTool />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reset View">
                <IconButton size="small" onClick={handleResetAll}>
                  <RestartAlt />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Input fields on the right */}
            <Box sx={{ flexGrow: 1 }}>
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
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter width or height - the other dimension will auto-populate. The overlay will resize automatically.
          </Typography>
        </Paper>
      )}

      {/* Input fields for Trace Scale Bar method */}
      {scaleMethod === 'Trace Scale Bar and Drag' && (
        <Paper elevation={2} sx={{ p: 2, width: CANVAS_WIDTH }}>
          <Typography variant="subtitle2" gutterBottom>
            Trace Scale Bar
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-end">
            {/* Tool buttons on the left */}
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Pan Tool">
                <IconButton
                  size="small"
                  color={activeTool === 'pan' ? 'primary' : 'default'}
                  onClick={() => setActiveTool('pan')}
                >
                  <PanTool />
                </IconButton>
              </Tooltip>
              <Tooltip title="Line Tool">
                <IconButton
                  size="small"
                  color={activeTool === 'line' ? 'primary' : 'default'}
                  onClick={() => setActiveTool('line')}
                >
                  <Timeline />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reset View">
                <IconButton size="small" onClick={handleResetAll}>
                  <RestartAlt />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Input fields on the right */}
            <Box sx={{ flexGrow: 1 }}>
              <Grid container spacing={2} alignItems="flex-end">
                <Grid size={4}>
                  <TextField
                    label="Pixel Count"
                    type="number"
                    value={scaleBarPixelInput}
                    onChange={(e) => setScaleBarPixelInput(e.target.value)}
                    fullWidth
                    size="small"
                    InputProps={{ readOnly: true }}
                    helperText="Auto-filled from line"
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
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Use the line tool to trace a scale bar on the child micrograph. Enter the physical length it represents.
          </Typography>
        </Paper>
      )}

      {/* Toolbar for Stretch and Drag method */}
      {scaleMethod === 'Stretch and Drag' && (
        <Paper elevation={2} sx={{ p: 1, width: CANVAS_WIDTH }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title="Pan Tool">
              <IconButton size="small" color="primary">
                <PanTool />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset View">
              <IconButton size="small" onClick={handleResetAll}>
                <RestartAlt />
              </IconButton>
            </Tooltip>
          </Stack>
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
          cursor: activeTool === 'line' ? 'crosshair' : (isPanning ? 'grabbing' : 'grab'),
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
                draggable={enableDrag}
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

            {/* Traced scale bar line for Trace Scale Bar method */}
            {scaleMethod === 'Trace Scale Bar and Drag' && currentLine && (
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

          {/* Transformer layer - NOT scaled, stays at constant screen size */}
          <Layer>
            {childImage && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={enableRotate}
                borderStroke="#e44c65"
                anchorStroke="#e44c65"
                anchorFill="#e44c65"
                anchorSize={8}
                anchorCornerRadius={4}
                anchorStrokeWidth={2}
                borderStrokeWidth={2}
                enabledAnchors={enableResizeHandles ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
                keepRatio={true}
                rotateAnchorOffset={30}
                ignoreStroke={true}
              />
            )}
          </Layer>
        </Stage>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ width: CANVAS_WIDTH, textAlign: 'center' }}>
        Overlay Position: ({childTransform.x.toFixed(1)}, {childTransform.y.toFixed(1)}) |
        Rotation: {childTransform.rotation.toFixed(1)}° |
        Scale: {childTransform.scaleX.toFixed(2)}x |
        Zoom: {(scale * 100).toFixed(0)}%
      </Typography>
    </Box>
  );
};

export default PlacementCanvas;
