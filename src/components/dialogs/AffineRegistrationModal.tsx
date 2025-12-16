/**
 * AffineRegistrationModal Component
 *
 * Full-screen modal for 3-point registration (affine transform placement).
 * Users click corresponding points on parent and overlay images to compute
 * an affine transformation matrix that maps the overlay onto the parent.
 *
 * Layout:
 * - Toolbar at top with Pan/Point/Reset tools
 * - Base and Overlay panels side-by-side
 * - Preview pane at bottom showing live composite
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  MenuItem,
} from '@mui/material';
import PanToolIcon from '@mui/icons-material/PanTool';
import AdjustIcon from '@mui/icons-material/Adjust';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Group, Text } from 'react-konva';
import Konva from 'konva';
import { useAppStore } from '@/store';
import {
  computeAffineMatrix,
  arePointsCollinear,
  checkPointDistribution,
  computeTransformedBounds,
  type ControlPoint,
  type AffineMatrix,
} from '@/utils/affineTransform';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1;
const MARKER_RADIUS = 10;
const CROSSHAIR_SIZE = 16;

interface AffineRegistrationModalProps {
  open: boolean;
  onClose: () => void;
  parentMicrographId: string;
  overlayImagePath: string;
  overlayWidth: number;
  overlayHeight: number;
  overlayImageHash?: string;
  existingControlPoints?: ControlPoint[];
  onApply: (
    affineMatrix: AffineMatrix,
    controlPoints: ControlPoint[],
    boundsOffset: { x: number; y: number },
    transformedWidth: number,
    transformedHeight: number,
    tileHash: string
  ) => void;
}

interface ImagePanelState {
  zoom: number;
  position: { x: number; y: number };
}

interface PointMarker {
  id: number;
  parentPoint: { x: number; y: number } | null;
  overlayPoint: { x: number; y: number } | null;
}

type ToolMode = 'pan' | 'point';
type ClickTarget = 'parent' | 'overlay';

export function AffineRegistrationModal({
  open,
  onClose,
  parentMicrographId,
  overlayImagePath,
  overlayWidth: _overlayWidth,
  overlayHeight: _overlayHeight,
  overlayImageHash,
  existingControlPoints,
  onApply,
}: AffineRegistrationModalProps) {
  const project = useAppStore((state) => state.project);

  // Tool mode
  const [toolMode, setToolMode] = useState<ToolMode>('point');

  // Container refs
  const parentContainerRef = useRef<HTMLDivElement>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const parentStageRef = useRef<Konva.Stage>(null);
  const overlayStageRef = useRef<Konva.Stage>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Panel sizes
  const [panelSize, setPanelSize] = useState({ width: 400, height: 300 });
  const [previewSize, setPreviewSize] = useState({ width: 800, height: 300 });

  // Image data
  const [parentImageData, setParentImageData] = useState<{
    hash: string;
    width: number;
    height: number;
  } | null>(null);
  const [overlayImageData, setOverlayImageData] = useState<{
    hash: string;
    width: number;
    height: number;
  } | null>(null);

  // Images for display
  const [parentImage, setParentImage] = useState<HTMLImageElement | null>(null);
  const [overlayImage, setOverlayImage] = useState<HTMLImageElement | null>(null);

  // Panel states (independent pan/zoom)
  const [parentPanel, setParentPanel] = useState<ImagePanelState>({
    zoom: 1,
    position: { x: 0, y: 0 },
  });
  const [overlayPanel, setOverlayPanel] = useState<ImagePanelState>({
    zoom: 1,
    position: { x: 0, y: 0 },
  });

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panningPanel, setPanningPanel] = useState<'parent' | 'overlay' | null>(null);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Control points
  const [markers, setMarkers] = useState<PointMarker[]>([]);
  const [nextClickTarget, setNextClickTarget] = useState<ClickTarget>('parent');
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);
  const [draggingMarker, setDraggingMarker] = useState<{
    id: number;
    panel: 'parent' | 'overlay';
  } | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    markerId: number;
  } | null>(null);

  // Loading/processing state
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingTiles, setIsGeneratingTiles] = useState(false);

  // Track if images have been initially centered
  const [parentCentered, setParentCentered] = useState(false);
  const [overlayCentered, setOverlayCentered] = useState(false);

  // Validation warnings
  const [warning, setWarning] = useState<string | null>(null);

  // Count complete point pairs
  const completePairs = markers.filter(
    (m) => m.parentPoint !== null && m.overlayPoint !== null
  ).length;

  // Get current incomplete marker
  const incompleteMarker = markers.find(
    (m) =>
      (m.parentPoint !== null && m.overlayPoint === null) ||
      (m.parentPoint === null && m.overlayPoint !== null)
  );

  // Determine which panel is active for the next click
  const activePanel: 'parent' | 'overlay' = nextClickTarget;

  // Check if we can apply
  const canApply = completePairs >= 3;

  // Compute affine matrix when we have 3+ points
  const computedMatrix = useMemo((): AffineMatrix | null => {
    if (completePairs < 3) return null;

    const controlPoints = markers
      .filter((m) => m.parentPoint && m.overlayPoint)
      .slice(0, 3)
      .map((m) => ({
        source: [m.overlayPoint!.x, m.overlayPoint!.y] as [number, number],
        target: [m.parentPoint!.x, m.parentPoint!.y] as [number, number],
      }));

    try {
      return computeAffineMatrix(controlPoints);
    } catch {
      return null;
    }
  }, [markers, completePairs]);

  // Get instruction text
  const getInstructionText = (): string => {
    if (markers.length === 0) {
      return 'Click a feature on the BASE image to begin.';
    }
    if (incompleteMarker) {
      if (incompleteMarker.parentPoint !== null) {
        return 'Now click the same feature on the OVERLAY image.';
      } else {
        return 'Now click the same feature on the BASE image.';
      }
    }
    if (completePairs < 3) {
      return `Add ${3 - completePairs} more point pair${3 - completePairs > 1 ? 's' : ''} (minimum 3 required).`;
    }
    return 'Ready to apply. Add more points for better accuracy, or click Apply.';
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (existingControlPoints && existingControlPoints.length > 0) {
        const initialMarkers = existingControlPoints.map((cp, index) => ({
          id: index + 1,
          parentPoint: { x: cp.target[0], y: cp.target[1] },
          overlayPoint: { x: cp.source[0], y: cp.source[1] },
        }));
        setMarkers(initialMarkers);
        setNextClickTarget('parent');
      } else {
        setMarkers([]);
        setNextClickTarget('parent');
      }
      setSelectedMarkerId(null);
      setWarning(null);
      setIsLoading(true);
      setToolMode('point');
      // Reset images so they reload and re-center
      setParentImage(null);
      setOverlayImage(null);
      setParentImageData(null);
      setOverlayImageData(null);
      setParentCentered(false);
      setOverlayCentered(false);
    }
  }, [open, existingControlPoints]);

  // Handle container resize with ResizeObserver
  useEffect(() => {
    if (!open) return;

    const parentObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setPanelSize({ width, height });
        }
      }
    });

    const previewObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setPreviewSize({ width, height });
        }
      }
    });

    if (parentContainerRef.current) {
      parentObserver.observe(parentContainerRef.current);
    }
    if (previewContainerRef.current) {
      previewObserver.observe(previewContainerRef.current);
    }

    return () => {
      parentObserver.disconnect();
      previewObserver.disconnect();
    };
  }, [open]);

  // Load parent image
  useEffect(() => {
    if (!open || !project || !parentMicrographId) return;

    const loadParentImage = async () => {
      try {
        // Find parent micrograph
        let parentMicrograph = null;
        outer: for (const dataset of project.datasets || []) {
          for (const sample of dataset.samples || []) {
            for (const micro of sample.micrographs || []) {
              if (micro.id === parentMicrographId) {
                parentMicrograph = micro;
                break outer;
              }
            }
          }
        }

        if (!parentMicrograph) {
          console.error('[AffineRegistration] Parent micrograph not found');
          return;
        }

        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths) return;

        const parentPath = `${folderPaths.images}/${parentMicrograph.imagePath || parentMicrograph.id}`;
        const tileData = await window.api?.loadImageWithTiles(parentPath);
        if (!tileData) return;

        setParentImageData({
          hash: tileData.hash,
          width: tileData.metadata.width,
          height: tileData.metadata.height,
        });

        // Load medium resolution for display
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (mediumDataUrl) {
          const img = new Image();
          img.onload = () => {
            setParentImage(img);
            setParentCentered(false); // Will be centered by the centering effect
          };
          img.src = mediumDataUrl;
        }
      } catch (err) {
        console.error('[AffineRegistration] Error loading parent image:', err);
      }
    };

    loadParentImage();
  }, [open, project, parentMicrographId]);

  // Center parent image when panel size and image are available
  useEffect(() => {
    if (!parentImageData || !parentImage || parentCentered) return;
    if (panelSize.width < 100 || panelSize.height < 100) return; // Wait for valid size

    const scale = Math.min(
      panelSize.width / parentImageData.width,
      panelSize.height / parentImageData.height
    ) * 0.9;

    setParentPanel({
      zoom: scale,
      position: {
        x: (panelSize.width - parentImageData.width * scale) / 2,
        y: (panelSize.height - parentImageData.height * scale) / 2,
      },
    });
    setParentCentered(true);
  }, [parentImageData, parentImage, panelSize, parentCentered]);

  // Load overlay image
  useEffect(() => {
    if (!open || !overlayImagePath) return;

    const loadOverlayImage = async () => {
      try {
        const tileData = await window.api?.loadImageWithTiles(overlayImagePath);
        if (!tileData) return;

        setOverlayImageData({
          hash: tileData.hash,
          width: tileData.metadata.width,
          height: tileData.metadata.height,
        });

        // Load medium resolution for display
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (mediumDataUrl) {
          const img = new Image();
          img.onload = () => {
            setOverlayImage(img);
            setIsLoading(false);
            setOverlayCentered(false); // Will be centered by the centering effect
          };
          img.src = mediumDataUrl;
        }
      } catch (err) {
        console.error('[AffineRegistration] Error loading overlay image:', err);
        setIsLoading(false);
      }
    };

    loadOverlayImage();
  }, [open, overlayImagePath]);

  // Center overlay image when panel size and image are available
  useEffect(() => {
    if (!overlayImageData || !overlayImage || overlayCentered) return;
    if (panelSize.width < 100 || panelSize.height < 100) return; // Wait for valid size

    const scale = Math.min(
      panelSize.width / overlayImageData.width,
      panelSize.height / overlayImageData.height
    ) * 0.9;

    setOverlayPanel({
      zoom: scale,
      position: {
        x: (panelSize.width - overlayImageData.width * scale) / 2,
        y: (panelSize.height - overlayImageData.height * scale) / 2,
      },
    });
    setOverlayCentered(true);
  }, [overlayImageData, overlayImage, panelSize, overlayCentered]);

  // Draw preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !parentImage || !overlayImage || !parentImageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = previewSize.width;
    canvas.height = previewSize.height;

    // Clear canvas
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate scale to fit parent image in preview
    const scale = Math.min(
      (previewSize.width - 40) / parentImageData.width,
      (previewSize.height - 40) / parentImageData.height
    ) * 0.95;

    const offsetX = (previewSize.width - parentImageData.width * scale) / 2;
    const offsetY = (previewSize.height - parentImageData.height * scale) / 2;

    // Draw parent image
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(parentImage, 0, 0, parentImageData.width, parentImageData.height);
    ctx.restore();

    // Draw transformed overlay if we have a valid matrix
    if (computedMatrix && overlayImageData) {
      const [a, b, tx, c, d, ty] = computedMatrix;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Apply affine transform: x' = a*x + b*y + tx, y' = c*x + d*y + ty
      // Canvas setTransform uses: x' = a*x + c*y + e, y' = b*x + d*y + f
      // So we need to map: canvas(a,b,c,d,e,f) = our(a, c, b, d, tx, ty)
      ctx.transform(a, c, b, d, tx, ty);

      // Draw overlay with transparency
      ctx.globalAlpha = 0.6;
      ctx.drawImage(overlayImage, 0, 0, overlayImageData.width, overlayImageData.height);
      ctx.restore();

      // Draw label
      ctx.fillStyle = '#4caf50';
      ctx.font = '14px sans-serif';
      ctx.fillText('✓ Preview (3+ points)', 10, 24);
    } else {
      // Draw "needs more points" message
      ctx.fillStyle = '#ff9800';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Need ${3 - completePairs} more point${3 - completePairs !== 1 ? 's' : ''} for preview`, 10, 24);
    }

    // Draw control point markers on preview
    markers.forEach((marker) => {
      if (marker.parentPoint) {
        const px = offsetX + marker.parentPoint.x * scale;
        const py = offsetY + marker.parentPoint.y * scale;

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f44336';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(marker.id), px, py);
      }
    });

  }, [parentImage, overlayImage, parentImageData, overlayImageData, computedMatrix, markers, previewSize, completePairs]);

  // Validate points when markers change
  useEffect(() => {
    if (completePairs < 3) {
      setWarning(null);
      return;
    }

    const controlPoints = markers
      .filter((m) => m.parentPoint && m.overlayPoint)
      .map((m) => ({
        source: [m.overlayPoint!.x, m.overlayPoint!.y] as [number, number],
        target: [m.parentPoint!.x, m.parentPoint!.y] as [number, number],
      }));

    if (arePointsCollinear(controlPoints)) {
      setWarning('Warning: Points are nearly collinear. Add points that form a triangle.');
      return;
    }

    if (overlayImageData) {
      const distWarning = checkPointDistribution(
        controlPoints,
        overlayImageData.width,
        overlayImageData.height
      );
      if (distWarning) {
        setWarning(distWarning);
        return;
      }
    }

    setWarning(null);
  }, [markers, completePairs, overlayImageData]);

  // Handle point click
  const handlePointClick = useCallback(
    (panel: 'parent' | 'overlay', x: number, y: number) => {
      if (toolMode !== 'point') return;

      if (panel !== activePanel) {
        // Wrong panel - show hint
        return;
      }

      if (incompleteMarker) {
        // Complete the current marker
        setMarkers((prev) =>
          prev.map((m) => {
            if (m.id !== incompleteMarker.id) return m;
            if (panel === 'parent') {
              return { ...m, parentPoint: { x, y } };
            } else {
              return { ...m, overlayPoint: { x, y } };
            }
          })
        );
        setNextClickTarget(panel === 'parent' ? 'overlay' : 'parent');
      } else {
        // Start a new marker
        const newId = markers.length > 0 ? Math.max(...markers.map((m) => m.id)) + 1 : 1;
        const newMarker: PointMarker = {
          id: newId,
          parentPoint: panel === 'parent' ? { x, y } : null,
          overlayPoint: panel === 'overlay' ? { x, y } : null,
        };
        setMarkers((prev) => [...prev, newMarker]);
        setNextClickTarget(panel === 'parent' ? 'overlay' : 'parent');
        setSelectedMarkerId(newId);
      }
    },
    [toolMode, activePanel, incompleteMarker, markers]
  );

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>, panel: 'parent' | 'overlay') => {
      e.evt.preventDefault();

      const stageRef = panel === 'parent' ? parentStageRef : overlayStageRef;
      const stageNode = stageRef.current;
      if (!stageNode) return;

      const pointer = stageNode.getPointerPosition();
      if (!pointer) return;

      const setPanel = panel === 'parent' ? setParentPanel : setOverlayPanel;
      const currentPanel = panel === 'parent' ? parentPanel : overlayPanel;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newZoom =
        direction > 0
          ? Math.min(currentPanel.zoom * ZOOM_STEP, MAX_ZOOM)
          : Math.max(currentPanel.zoom / ZOOM_STEP, MIN_ZOOM);

      const mousePointTo = {
        x: (pointer.x - currentPanel.position.x) / currentPanel.zoom,
        y: (pointer.y - currentPanel.position.y) / currentPanel.zoom,
      };

      setPanel({
        zoom: newZoom,
        position: {
          x: pointer.x - mousePointTo.x * newZoom,
          y: pointer.y - mousePointTo.y * newZoom,
        },
      });
    },
    [parentPanel, overlayPanel]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, panel: 'parent' | 'overlay') => {
      const stageRef = panel === 'parent' ? parentStageRef : overlayStageRef;
      const stageNode = stageRef.current;
      if (!stageNode) return;

      const pointer = stageNode.getPointerPosition();
      if (!pointer) return;

      // Right-click for context menu
      if (e.evt.button === 2) {
        return;
      }

      // Check if clicking on a marker
      const clickedOnMarker = e.target.name()?.startsWith('marker-');
      if (clickedOnMarker) {
        const markerId = parseInt(e.target.name().replace('marker-', '').split('-')[0], 10);
        setDraggingMarker({ id: markerId, panel });
        setSelectedMarkerId(markerId);
        return;
      }

      if (toolMode === 'pan') {
        // Start panning
        setIsPanning(true);
        setPanningPanel(panel);
        setLastPointerPos(pointer);
      } else if (toolMode === 'point') {
        // Place a point
        const currentPanel = panel === 'parent' ? parentPanel : overlayPanel;
        const imageData = panel === 'parent' ? parentImageData : overlayImageData;

        if (imageData) {
          const imageX = (pointer.x - currentPanel.position.x) / currentPanel.zoom;
          const imageY = (pointer.y - currentPanel.position.y) / currentPanel.zoom;

          if (imageX >= 0 && imageX <= imageData.width && imageY >= 0 && imageY <= imageData.height) {
            handlePointClick(panel, imageX, imageY);
          }
        }
      }
    },
    [toolMode, parentPanel, overlayPanel, parentImageData, overlayImageData, handlePointClick]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>, panel: 'parent' | 'overlay') => {
      const stageRef = panel === 'parent' ? parentStageRef : overlayStageRef;
      const stageNode = stageRef.current;
      if (!stageNode) return;

      const pointer = stageNode.getPointerPosition();
      if (!pointer) return;

      // Handle marker dragging
      if (draggingMarker && draggingMarker.panel === panel) {
        const currentPanel = panel === 'parent' ? parentPanel : overlayPanel;
        const imageX = (pointer.x - currentPanel.position.x) / currentPanel.zoom;
        const imageY = (pointer.y - currentPanel.position.y) / currentPanel.zoom;

        setMarkers((prev) =>
          prev.map((m) => {
            if (m.id !== draggingMarker.id) return m;
            if (panel === 'parent') {
              return { ...m, parentPoint: { x: imageX, y: imageY } };
            } else {
              return { ...m, overlayPoint: { x: imageX, y: imageY } };
            }
          })
        );
        return;
      }

      // Handle panning
      if (isPanning && panningPanel === panel && lastPointerPos) {
        const dx = pointer.x - lastPointerPos.x;
        const dy = pointer.y - lastPointerPos.y;

        const setPanel = panel === 'parent' ? setParentPanel : setOverlayPanel;
        setPanel((prev) => ({
          ...prev,
          position: {
            x: prev.position.x + dx,
            y: prev.position.y + dy,
          },
        }));
        setLastPointerPos(pointer);
      }
    },
    [draggingMarker, isPanning, panningPanel, lastPointerPos, parentPanel, overlayPanel]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanningPanel(null);
    setLastPointerPos(null);
    setDraggingMarker(null);
  }, []);

  // Handle context menu
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, _panel: 'parent' | 'overlay') => {
      e.evt.preventDefault();

      const clickedOnMarker = e.target.name()?.startsWith('marker-');
      if (clickedOnMarker) {
        const markerId = parseInt(e.target.name().replace('marker-', '').split('-')[0], 10);
        setContextMenu({
          mouseX: e.evt.clientX,
          mouseY: e.evt.clientY,
          markerId,
        });
      }
    },
    []
  );

  // Delete a marker
  const handleDeleteMarker = useCallback((markerId: number) => {
    setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    setContextMenu(null);
    if (selectedMarkerId === markerId) {
      setSelectedMarkerId(null);
    }
  }, [selectedMarkerId]);

  // Reset all markers
  const handleResetAll = useCallback(() => {
    setMarkers([]);
    setNextClickTarget('parent');
    setSelectedMarkerId(null);
    setWarning(null);
  }, []);

  // Handle Apply
  const handleApply = useCallback(async () => {
    if (!canApply || !overlayImageData || !computedMatrix) return;

    setIsGeneratingTiles(true);
    setWarning(null);

    try {
      const bounds = computeTransformedBounds(overlayImageData.width, overlayImageData.height, computedMatrix);
      const hashToUse = overlayImageHash || overlayImageData.hash;

      console.log('[AffineRegistration] Generating tiles...');
      console.log('[AffineRegistration] Matrix:', computedMatrix);
      console.log('[AffineRegistration] Bounds:', bounds);

      const result = await window.api?.generateAffineTiles(
        overlayImagePath,
        hashToUse,
        computedMatrix
      );

      if (!result || !result.success) {
        throw new Error(result?.error || 'Tile generation failed');
      }

      const controlPoints = markers
        .filter((m) => m.parentPoint && m.overlayPoint)
        .map((m) => ({
          source: [m.overlayPoint!.x, m.overlayPoint!.y] as [number, number],
          target: [m.parentPoint!.x, m.parentPoint!.y] as [number, number],
        }));

      onApply(
        computedMatrix,
        controlPoints,
        { x: bounds.minX, y: bounds.minY },
        Math.ceil(bounds.width),
        Math.ceil(bounds.height),
        hashToUse
      );
      onClose();
    } catch (error) {
      console.error('[AffineRegistration] Error:', error);
      setWarning(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingTiles(false);
    }
  }, [canApply, overlayImageData, computedMatrix, overlayImagePath, overlayImageHash, markers, onApply, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetAll();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedMarkerId !== null) {
          handleDeleteMarker(selectedMarkerId);
        }
      } else if (e.key === 'Enter' && canApply && !isGeneratingTiles) {
        handleApply();
      } else if (e.key === 'p' || e.key === 'P') {
        setToolMode('pan');
      } else if (e.key === 'v' || e.key === 'V') {
        setToolMode('point');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, handleResetAll, selectedMarkerId, handleDeleteMarker, canApply, isGeneratingTiles, handleApply]);

  // Render markers for a panel
  const renderMarkers = (panel: 'parent' | 'overlay', zoom: number) => {
    return markers.map((marker) => {
      const point = panel === 'parent' ? marker.parentPoint : marker.overlayPoint;
      if (!point) return null;

      const isComplete = marker.parentPoint !== null && marker.overlayPoint !== null;
      const isSelected = marker.id === selectedMarkerId;

      // Scale marker size inversely with zoom
      const markerScale = 1 / zoom;
      const radius = MARKER_RADIUS * markerScale;
      const crosshairSize = CROSSHAIR_SIZE * markerScale;
      const strokeWidth = 2 * markerScale;

      return (
        <Group key={`${panel}-${marker.id}`} x={point.x} y={point.y}>
          {/* Crosshair */}
          <Line
            points={[-crosshairSize, 0, crosshairSize, 0]}
            stroke={isSelected ? '#ffeb3b' : isComplete ? '#4caf50' : '#ff9800'}
            strokeWidth={strokeWidth}
          />
          <Line
            points={[0, -crosshairSize, 0, crosshairSize]}
            stroke={isSelected ? '#ffeb3b' : isComplete ? '#4caf50' : '#ff9800'}
            strokeWidth={strokeWidth}
          />
          {/* Circle */}
          <Circle
            name={`marker-${marker.id}-${panel}`}
            radius={radius}
            fill={isSelected ? '#ffeb3b' : isComplete ? '#4caf50' : '#ff9800'}
            stroke="white"
            strokeWidth={strokeWidth}
            opacity={0.9}
          />
          {/* Number */}
          <Text
            text={String(marker.id)}
            x={-radius * 0.5}
            y={-radius * 0.6}
            fontSize={radius * 1.2}
            fontStyle="bold"
            fill="white"
            align="center"
          />
        </Group>
      );
    });
  };

  // Render an image panel
  const renderPanel = (
    panel: 'parent' | 'overlay',
    containerRef: React.RefObject<HTMLDivElement>,
    stageRef: React.RefObject<Konva.Stage>,
    panelState: ImagePanelState,
    imageData: { width: number; height: number } | null,
    image: HTMLImageElement | null
  ) => {
    const isActive = toolMode === 'point' && activePanel === panel;
    const label = panel === 'parent' ? 'BASE' : 'OVERLAY';

    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          border: 2,
          borderColor: isActive ? 'primary.main' : 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1,
            py: 0.5,
            bgcolor: isActive ? 'primary.main' : 'background.paper',
            color: isActive ? 'primary.contrastText' : 'text.primary',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" fontWeight="bold">
            {label}
            {isActive && ' ← Click here'}
          </Typography>
        </Box>
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            bgcolor: '#1e1e1e',
            cursor: toolMode === 'pan' ? 'grab' : (isActive ? 'crosshair' : 'default'),
            minHeight: 0,
          }}
        >
          <Stage
            ref={stageRef}
            width={panelSize.width}
            height={panelSize.height}
            onWheel={(e) => handleWheel(e, panel)}
            onMouseDown={(e) => handleMouseDown(e, panel)}
            onMouseMove={(e) => handleMouseMove(e, panel)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => handleContextMenu(e, panel)}
          >
            <Layer
              x={panelState.position.x}
              y={panelState.position.y}
              scaleX={panelState.zoom}
              scaleY={panelState.zoom}
            >
              {image && imageData && (
                <KonvaImage
                  image={image}
                  width={imageData.width}
                  height={imageData.height}
                />
              )}
            </Layer>
            <Layer
              x={panelState.position.x}
              y={panelState.position.y}
              scaleX={panelState.zoom}
              scaleY={panelState.zoom}
            >
              {renderMarkers(panel, panelState.zoom)}
            </Layer>
          </Stage>
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: { bgcolor: 'background.default' },
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>

          <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2, ml: 1 }}>
            <ToggleButtonGroup
              value={toolMode}
              exclusive
              onChange={(_, value) => value && setToolMode(value)}
              size="small"
            >
              <ToggleButton value="pan">
                <Tooltip title="Pan Tool (P)">
                  <PanToolIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="point">
                <Tooltip title="Point Tool (V)">
                  <AdjustIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Tooltip title="Reset All Points (R)">
            <IconButton onClick={handleResetAll} disabled={markers.length === 0} size="small">
              <RestartAltIcon />
            </IconButton>
          </Tooltip>

          <Typography variant="subtitle2" color="text.secondary">
            3-Point Registration
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color={warning ? 'warning.main' : 'text.secondary'}>
            {warning || getInstructionText()}
          </Typography>

          <Button
            variant="contained"
            onClick={handleApply}
            disabled={!canApply || isGeneratingTiles}
          >
            {isGeneratingTiles ? 'Generating...' : 'Apply'}
          </Button>
        </Box>
      </Box>

      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 1,
          gap: 1,
          minHeight: 0,
        }}
      >
        {isLoading ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography>Loading images...</Typography>
          </Box>
        ) : (
          <>
            {/* Top row: Base and Overlay */}
            <Box sx={{ flex: 1, display: 'flex', gap: 1, minHeight: 0 }}>
              {renderPanel(
                'parent',
                parentContainerRef,
                parentStageRef,
                parentPanel,
                parentImageData,
                parentImage
              )}
              {renderPanel(
                'overlay',
                overlayContainerRef,
                overlayStageRef,
                overlayPanel,
                overlayImageData,
                overlayImage
              )}
            </Box>

            {/* Bottom row: Preview */}
            <Box
              ref={previewContainerRef}
              sx={{
                height: '35%',
                minHeight: 200,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: '#1e1e1e',
              }}
            >
              <canvas
                ref={previewCanvasRef}
                style={{ width: '100%', height: '100%' }}
              />
            </Box>
          </>
        )}
      </Box>

      {/* Status bar */}
      {isGeneratingTiles && (
        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Generating transformed tiles...</Typography>
            <LinearProgress sx={{ flex: 1 }} />
          </Box>
        </Box>
      )}

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => contextMenu && handleDeleteMarker(contextMenu.markerId)}>
          Delete Point {contextMenu?.markerId}
        </MenuItem>
      </Menu>
    </Dialog>
  );
}
