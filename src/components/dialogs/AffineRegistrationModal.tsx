/**
 * AffineRegistrationModal Component
 *
 * Full-screen modal for 3-point registration (affine transform placement).
 * Users click corresponding points on parent and overlay images to compute
 * an affine transformation matrix that maps the overlay onto the parent.
 *
 * Features:
 * - Split-view layout with parent (left) and overlay (right) image panels
 * - Independent pan/zoom controls for each panel
 * - Alternating click workflow (parent → overlay → parent...)
 * - Numbered point markers with visual feedback
 * - Point dragging for adjustment
 * - Point deletion via right-click or keyboard
 * - Tile generation on Apply
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  LinearProgress,
  Menu,
  MenuItem,
} from '@mui/material';
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
const MARKER_RADIUS = 12;
const CROSSHAIR_SIZE = 20;

interface AffineRegistrationModalProps {
  open: boolean;
  onClose: () => void;
  parentMicrographId: string;
  overlayImagePath: string; // Full path to overlay image (in scratch or project images)
  overlayWidth: number;
  overlayHeight: number;
  overlayImageHash?: string; // If known, for cache operations
  existingControlPoints?: ControlPoint[]; // For editing existing registration
  onApply: (
    affineMatrix: AffineMatrix,
    controlPoints: ControlPoint[],
    boundsOffset: { x: number; y: number },
    transformedWidth: number,
    transformedHeight: number,
    tileHash: string // Hash used to store/load the affine tiles
  ) => void;
}

interface ImagePanelState {
  zoom: number;
  position: { x: number; y: number };
  isPanning: boolean;
  lastPointerPos: { x: number; y: number } | null;
}

interface PointMarker {
  id: number;
  parentPoint: { x: number; y: number } | null;
  overlayPoint: { x: number; y: number } | null;
}

type ClickTarget = 'parent' | 'overlay';

export function AffineRegistrationModal({
  open,
  onClose,
  parentMicrographId,
  overlayImagePath,
  overlayWidth,
  overlayHeight,
  overlayImageHash,
  existingControlPoints,
  onApply,
}: AffineRegistrationModalProps) {
  const project = useAppStore((state) => state.project);

  // Container refs
  const parentContainerRef = useRef<HTMLDivElement>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const parentStageRef = useRef<Konva.Stage>(null);
  const overlayStageRef = useRef<Konva.Stage>(null);

  // Panel sizes
  const [panelSize, setPanelSize] = useState({ width: 400, height: 400 });

  // Image data
  const [parentImageData, setParentImageData] = useState<{
    hash: string;
    width: number;
    height: number;
    tilesX: number;
    tilesY: number;
  } | null>(null);
  const [overlayImageData, setOverlayImageData] = useState<{
    hash: string;
    width: number;
    height: number;
    tilesX: number;
    tilesY: number;
  } | null>(null);

  // Thumbnail/medium images for display
  const [parentThumbnail, setParentThumbnail] = useState<HTMLImageElement | null>(null);
  const [overlayThumbnail, setOverlayThumbnail] = useState<HTMLImageElement | null>(null);

  // Panel states (independent pan/zoom)
  const [parentPanel, setParentPanel] = useState<ImagePanelState>({
    zoom: 1,
    position: { x: 0, y: 0 },
    isPanning: false,
    lastPointerPos: null,
  });
  const [overlayPanel, setOverlayPanel] = useState<ImagePanelState>({
    zoom: 1,
    position: { x: 0, y: 0 },
    isPanning: false,
    lastPointerPos: null,
  });

  // Control points
  const [markers, setMarkers] = useState<PointMarker[]>([]);
  const [nextClickTarget, setNextClickTarget] = useState<ClickTarget>('parent');
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);
  const [draggingMarker, setDraggingMarker] = useState<{
    id: number;
    panel: 'parent' | 'overlay';
  } | null>(null);

  // Context menu for point deletion
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    markerId: number;
  } | null>(null);

  // Loading/processing state
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingTiles, setIsGeneratingTiles] = useState(false);

  // Validation warnings
  const [warning, setWarning] = useState<string | null>(null);

  // Count complete point pairs
  const completePairs = markers.filter(
    (m) => m.parentPoint !== null && m.overlayPoint !== null
  ).length;

  // Get current incomplete marker (one that has parent but not overlay, or vice versa)
  const incompleteMarker = markers.find(
    (m) =>
      (m.parentPoint !== null && m.overlayPoint === null) ||
      (m.parentPoint === null && m.overlayPoint !== null)
  );

  // Determine which panel is active for the next click
  const activePanel: 'parent' | 'overlay' = nextClickTarget;

  // Check if we can apply (need at least 3 complete pairs)
  const canApply = completePairs >= 3;

  // Get instruction text based on state
  const getInstructionText = (): string => {
    if (markers.length === 0) {
      return 'Click a feature on the parent image to begin.';
    }
    if (incompleteMarker) {
      if (incompleteMarker.parentPoint !== null) {
        return 'Now click the same feature on the overlay image.';
      } else {
        return 'Now click the same feature on the parent image.';
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
      // Initialize from existing control points if provided
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
    }
  }, [open, existingControlPoints]);

  // Handle container resize
  useEffect(() => {
    if (!open) return;

    const updateSize = () => {
      if (parentContainerRef.current) {
        const rect = parentContainerRef.current.getBoundingClientRect();
        setPanelSize({ width: rect.width, height: rect.height });
      }
    };

    // Initial size after a short delay to ensure layout is complete
    const timer = setTimeout(updateSize, 50);
    window.addEventListener('resize', updateSize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSize);
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
          tilesX: tileData.metadata.tilesX,
          tilesY: tileData.metadata.tilesY,
        });

        // Load medium resolution for display
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (mediumDataUrl) {
          const img = new Image();
          img.onload = () => {
            setParentThumbnail(img);
            // Fit to panel
            if (panelSize.width > 0 && panelSize.height > 0) {
              const scaleX = panelSize.width / tileData.metadata.width;
              const scaleY = panelSize.height / tileData.metadata.height;
              const zoom = Math.min(scaleX, scaleY) * 0.9;
              setParentPanel((prev) => ({
                ...prev,
                zoom,
                position: {
                  x: (panelSize.width - tileData.metadata.width * zoom) / 2,
                  y: (panelSize.height - tileData.metadata.height * zoom) / 2,
                },
              }));
            }
          };
          img.src = mediumDataUrl;
        }
      } catch (err) {
        console.error('[AffineRegistration] Error loading parent image:', err);
      }
    };

    loadParentImage();
  }, [open, project, parentMicrographId, panelSize]);

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
          tilesX: tileData.metadata.tilesX,
          tilesY: tileData.metadata.tilesY,
        });

        // Load medium resolution for display
        const mediumDataUrl = await window.api?.loadMedium(tileData.hash);
        if (mediumDataUrl) {
          const img = new Image();
          img.onload = () => {
            setOverlayThumbnail(img);
            // Fit to panel
            if (panelSize.width > 0 && panelSize.height > 0) {
              const scaleX = panelSize.width / tileData.metadata.width;
              const scaleY = panelSize.height / tileData.metadata.height;
              const zoom = Math.min(scaleX, scaleY) * 0.9;
              setOverlayPanel((prev) => ({
                ...prev,
                zoom,
                position: {
                  x: (panelSize.width - tileData.metadata.width * zoom) / 2,
                  y: (panelSize.height - tileData.metadata.height * zoom) / 2,
                },
              }));
            }
            setIsLoading(false);
          };
          img.src = mediumDataUrl;
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[AffineRegistration] Error loading overlay image:', err);
        setIsLoading(false);
      }
    };

    loadOverlayImage();
  }, [open, overlayImagePath, panelSize]);

  // Validate points when markers change
  useEffect(() => {
    if (completePairs < 3) {
      setWarning(null);
      return;
    }

    // Build control points array
    const controlPoints: ControlPoint[] = markers
      .filter((m) => m.parentPoint && m.overlayPoint)
      .map((m) => ({
        source: [m.overlayPoint!.x, m.overlayPoint!.y] as [number, number],
        target: [m.parentPoint!.x, m.parentPoint!.y] as [number, number],
      }));

    // Check for collinearity
    if (arePointsCollinear(controlPoints)) {
      setWarning('Points are nearly in a line. Add a point away from the line for better results.');
      return;
    }

    // Check for point distribution
    const distributionWarning = checkPointDistribution(
      controlPoints,
      overlayWidth,
      overlayHeight
    );
    if (distributionWarning) {
      setWarning(distributionWarning);
      return;
    }

    setWarning(null);
  }, [markers, completePairs, overlayWidth, overlayHeight]);

  // Handle wheel zoom for a panel
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

      // Zoom toward pointer position
      const mousePointTo = {
        x: (pointer.x - currentPanel.position.x) / currentPanel.zoom,
        y: (pointer.y - currentPanel.position.y) / currentPanel.zoom,
      };

      setPanel((prev) => ({
        ...prev,
        zoom: newZoom,
        position: {
          x: pointer.x - mousePointTo.x * newZoom,
          y: pointer.y - mousePointTo.y * newZoom,
        },
      }));
    },
    [parentPanel, overlayPanel]
  );

  // Handle mouse down on a panel
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, panel: 'parent' | 'overlay') => {
      const stageRef = panel === 'parent' ? parentStageRef : overlayStageRef;
      const stageNode = stageRef.current;
      if (!stageNode) return;

      const pointer = stageNode.getPointerPosition();
      if (!pointer) return;

      // Check if clicking on a marker (for dragging)
      const clickedOnMarker = e.target.name()?.startsWith('marker-');
      if (clickedOnMarker) {
        const markerId = parseInt(e.target.name().replace('marker-', '').split('-')[0], 10);
        setDraggingMarker({ id: markerId, panel });
        setSelectedMarkerId(markerId);
        return;
      }

      // Check for right-click (context menu)
      if (e.evt.button === 2) {
        return; // Handled by context menu
      }

      // Check if this is a click to place a point (not panning)
      const currentPanel = panel === 'parent' ? parentPanel : overlayPanel;
      const imageData = panel === 'parent' ? parentImageData : overlayImageData;

      if (imageData && activePanel === panel) {
        // Convert to image coordinates
        const imageX = (pointer.x - currentPanel.position.x) / currentPanel.zoom;
        const imageY = (pointer.y - currentPanel.position.y) / currentPanel.zoom;

        // Check if within image bounds
        if (imageX >= 0 && imageX <= imageData.width && imageY >= 0 && imageY <= imageData.height) {
          handlePointClick(panel, imageX, imageY);
          return;
        }
      }

      // Start panning
      const setPanel = panel === 'parent' ? setParentPanel : setOverlayPanel;
      setPanel((prev) => ({
        ...prev,
        isPanning: true,
        lastPointerPos: pointer,
      }));
    },
    [parentPanel, overlayPanel, parentImageData, overlayImageData, activePanel]
  );

  // Handle mouse move on a panel
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
      const currentPanel = panel === 'parent' ? parentPanel : overlayPanel;
      if (!currentPanel.isPanning || !currentPanel.lastPointerPos) return;

      const dx = pointer.x - currentPanel.lastPointerPos.x;
      const dy = pointer.y - currentPanel.lastPointerPos.y;

      const setPanel = panel === 'parent' ? setParentPanel : setOverlayPanel;
      setPanel((prev) => ({
        ...prev,
        position: {
          x: prev.position.x + dx,
          y: prev.position.y + dy,
        },
        lastPointerPos: pointer,
      }));
    },
    [parentPanel, overlayPanel, draggingMarker]
  );

  // Handle mouse up on a panel
  const handleMouseUp = useCallback(
    (_panel: 'parent' | 'overlay') => {
      // We don't actually use the panel param, but we need it for the handler signature
      // Both panels need to reset their panning state
      setParentPanel((prev) => ({
        ...prev,
        isPanning: false,
        lastPointerPos: null,
      }));
      setOverlayPanel((prev) => ({
        ...prev,
        isPanning: false,
        lastPointerPos: null,
      }));
      setDraggingMarker(null);
    },
    []
  );

  // Handle point click (place new point)
  const handlePointClick = useCallback(
    (panel: 'parent' | 'overlay', x: number, y: number) => {
      if (panel !== activePanel) {
        // Wrong panel clicked - show feedback
        return;
      }

      setMarkers((prev) => {
        // If there's an incomplete marker waiting for this panel's point
        if (incompleteMarker) {
          return prev.map((m) => {
            if (m.id !== incompleteMarker.id) return m;
            if (panel === 'parent') {
              return { ...m, parentPoint: { x, y } };
            } else {
              return { ...m, overlayPoint: { x, y } };
            }
          });
        }

        // Otherwise, create a new marker
        const newId = prev.length > 0 ? Math.max(...prev.map((m) => m.id)) + 1 : 1;
        const newMarker: PointMarker = {
          id: newId,
          parentPoint: panel === 'parent' ? { x, y } : null,
          overlayPoint: panel === 'overlay' ? { x, y } : null,
        };
        return [...prev, newMarker];
      });

      // Switch to other panel
      setNextClickTarget(panel === 'parent' ? 'overlay' : 'parent');
    },
    [activePanel, incompleteMarker]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, markerId: number) => {
      e.evt.preventDefault();
      const stageNode = e.target.getStage();
      if (!stageNode) return;

      const container = stageNode.container();
      const rect = container.getBoundingClientRect();

      setContextMenu({
        mouseX: e.evt.clientX - rect.left + rect.left,
        mouseY: e.evt.clientY - rect.top + rect.top,
        markerId,
      });
    },
    []
  );

  // Delete a marker
  const handleDeleteMarker = useCallback((markerId: number) => {
    setMarkers((prev) => {
      const filtered = prev.filter((m) => m.id !== markerId);
      // Renumber markers
      return filtered.map((m, index) => ({ ...m, id: index + 1 }));
    });
    setSelectedMarkerId(null);
    setContextMenu(null);
  }, []);

  // Reset all points
  const handleResetAll = useCallback(() => {
    setMarkers([]);
    setNextClickTarget('parent');
    setSelectedMarkerId(null);
    setWarning(null);
  }, []);

  // Handle Apply button
  const handleApply = useCallback(async () => {
    console.log('[AffineRegistration] handleApply called');
    console.log('[AffineRegistration] canApply:', canApply);
    console.log('[AffineRegistration] overlayImageData:', overlayImageData);
    console.log('[AffineRegistration] completePairs:', markers.filter((m) => m.parentPoint && m.overlayPoint).length);
    console.log('[AffineRegistration] markers:', markers);

    if (!canApply) {
      console.warn('[AffineRegistration] Cannot apply - not enough points');
      alert('Please place at least 3 point pairs (click parent, then overlay, for each point)');
      return;
    }
    if (!overlayImageData) {
      console.warn('[AffineRegistration] Cannot apply - overlay image not loaded');
      setWarning('Please wait for images to load');
      alert('Please wait for images to load');
      return;
    }

    // Build control points array
    const controlPoints: ControlPoint[] = markers
      .filter((m) => m.parentPoint && m.overlayPoint)
      .map((m) => ({
        source: [m.overlayPoint!.x, m.overlayPoint!.y] as [number, number],
        target: [m.parentPoint!.x, m.parentPoint!.y] as [number, number],
      }));

    console.log('[AffineRegistration] Built control points:', controlPoints);

    try {
      // Compute affine matrix
      const matrix = computeAffineMatrix(controlPoints.slice(0, 3));
      console.log('[AffineRegistration] Computed matrix:', matrix);

      // Compute transformed bounds
      const bounds = computeTransformedBounds(overlayWidth, overlayHeight, matrix);
      console.log('[AffineRegistration] Computed bounds:', bounds);

      console.log('[AffineRegistration] Setting isGeneratingTiles to true');
      setIsGeneratingTiles(true);
      setWarning(null);

      // Determine which hash to use
      const hashToUse = overlayImageHash || overlayImageData.hash;
      console.log('[AffineRegistration] Generating tiles for hash:', hashToUse);
      console.log('[AffineRegistration] Image path:', overlayImagePath);
      console.log('[AffineRegistration] window.api exists:', !!window.api);

      // Generate affine tiles
      console.log('[AffineRegistration] Calling generateAffineTiles...');
      const result = await window.api?.generateAffineTiles(
        overlayImagePath,
        hashToUse,
        matrix
      );

      console.log('[AffineRegistration] Tile generation result:', result);

      if (!result?.success) {
        const errorMsg = result?.error || 'Unknown error during tile generation';
        console.error('[AffineRegistration] Failed to generate tiles:', errorMsg);
        setWarning(`Tile generation failed: ${errorMsg}`);
        alert(`Tile generation failed: ${errorMsg}`);
        setIsGeneratingTiles(false);
        return;
      }

      console.log('[AffineRegistration] Tiles generated successfully, calling onApply');
      console.log('[AffineRegistration] Tile hash:', hashToUse);

      // Call onApply with the computed data including the tile hash
      onApply(
        matrix,
        controlPoints,
        { x: bounds.minX, y: bounds.minY },
        bounds.width,
        bounds.height,
        hashToUse
      );

      setIsGeneratingTiles(false);
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[AffineRegistration] Error applying transform:', err);
      setWarning(`Transform failed: ${errorMsg}`);
      alert(`Transform failed: ${errorMsg}`);
      setIsGeneratingTiles(false);
    }
  }, [
    canApply,
    markers,
    overlayWidth,
    overlayHeight,
    overlayImagePath,
    overlayImageHash,
    overlayImageData,
    onApply,
    onClose,
  ]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && canApply) {
        handleApply();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId !== null) {
        handleDeleteMarker(selectedMarkerId);
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetAll();
      } else if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        if (num <= markers.length) {
          setSelectedMarkerId(num);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, canApply, selectedMarkerId, markers.length, handleApply, handleDeleteMarker, handleResetAll, onClose]);

  // Render point markers for a panel
  const renderMarkers = (panel: 'parent' | 'overlay', zoom: number) => {
    const elements: React.ReactNode[] = [];

    markers.forEach((marker) => {
      const point = panel === 'parent' ? marker.parentPoint : marker.overlayPoint;
      if (!point) return;

      const isSelected = marker.id === selectedMarkerId;
      const isPaired =
        marker.parentPoint !== null && marker.overlayPoint !== null;
      const isIncomplete = !isPaired;

      // Marker circle
      elements.push(
        <Group
          key={`marker-${marker.id}`}
          x={point.x}
          y={point.y}
          name={`marker-${marker.id}-${panel}`}
          draggable={false} // We handle dragging manually
          onContextMenu={(e) => handleContextMenu(e, marker.id)}
        >
          {/* Crosshair lines */}
          <Line
            points={[-CROSSHAIR_SIZE / zoom, 0, CROSSHAIR_SIZE / zoom, 0]}
            stroke={isSelected ? '#ffeb3b' : '#f44336'}
            strokeWidth={2 / zoom}
          />
          <Line
            points={[0, -CROSSHAIR_SIZE / zoom, 0, CROSSHAIR_SIZE / zoom]}
            stroke={isSelected ? '#ffeb3b' : '#f44336'}
            strokeWidth={2 / zoom}
          />

          {/* Circle */}
          <Circle
            radius={MARKER_RADIUS / zoom}
            fill={isPaired ? '#f44336' : 'transparent'}
            stroke={isSelected ? '#ffeb3b' : '#f44336'}
            strokeWidth={2 / zoom}
            dash={isIncomplete ? [4 / zoom, 4 / zoom] : undefined}
            name={`marker-${marker.id}-circle`}
          />

          {/* Number label */}
          <Text
            text={String(marker.id)}
            fontSize={12 / zoom}
            fill="white"
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
            offsetX={3 / zoom}
            offsetY={5 / zoom}
          />
        </Group>
      );
    });

    return elements;
  };

  // Render an image panel
  const renderPanel = (
    panel: 'parent' | 'overlay',
    containerRef: React.RefObject<HTMLDivElement>,
    stageRef: React.RefObject<Konva.Stage>,
    panelState: ImagePanelState,
    imageData: { width: number; height: number } | null,
    thumbnail: HTMLImageElement | null
  ) => {
    const isActive = activePanel === panel;
    const label = panel === 'parent' ? 'Parent Image' : 'Overlay Image';

    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: isActive ? '2px solid' : '1px solid',
          borderColor: isActive ? 'primary.main' : 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {/* Panel header */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: isActive ? 'action.selected' : 'background.paper',
          }}
        >
          <Typography variant="subtitle2" color={isActive ? 'primary' : 'text.secondary'}>
            {label}
            {isActive && (
              <Typography component="span" variant="caption" sx={{ ml: 1 }}>
                (Click here)
              </Typography>
            )}
          </Typography>
        </Box>

        {/* Canvas container */}
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            position: 'relative',
            cursor: panelState.isPanning
              ? 'grabbing'
              : isActive
                ? 'crosshair'
                : 'grab',
            bgcolor: '#1a1a1a',
          }}
        >
          <Stage
            ref={stageRef}
            width={panelSize.width}
            height={panelSize.height}
            onWheel={(e) => handleWheel(e, panel)}
            onMouseDown={(e) => handleMouseDown(e, panel)}
            onMouseMove={(e) => handleMouseMove(e, panel)}
            onMouseUp={() => handleMouseUp(panel)}
            onMouseLeave={() => handleMouseUp(panel)}
          >
            <Layer>
              {/* Image */}
              {thumbnail && imageData && (
                <KonvaImage
                  image={thumbnail}
                  x={panelState.position.x}
                  y={panelState.position.y}
                  width={imageData.width * panelState.zoom}
                  height={imageData.height * panelState.zoom}
                />
              )}
            </Layer>

            {/* Markers layer */}
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
      {/* Header */}
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
          <Typography variant="h6">3-Point Registration</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title="Reset All Points (R)">
            <IconButton onClick={handleResetAll} disabled={markers.length === 0}>
              <RestartAltIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained"
            onClick={handleApply}
            disabled={!canApply || isGeneratingTiles}
          >
            {isGeneratingTiles ? 'Generating...' : 'Apply'}
          </Button>
        </Box>
      </Box>

      {/* Main content - split view */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          gap: 2,
          p: 2,
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
            {renderPanel(
              'parent',
              parentContainerRef,
              parentStageRef,
              parentPanel,
              parentImageData,
              parentThumbnail
            )}
            {renderPanel(
              'overlay',
              overlayContainerRef,
              overlayStageRef,
              overlayPanel,
              overlayImageData,
              overlayThumbnail
            )}
          </>
        )}
      </Box>

      {/* Status bar */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {isGeneratingTiles ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Generating transformed tiles...</Typography>
            <LinearProgress sx={{ flex: 1 }} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">
              <strong>Points:</strong> {completePairs} of 3 minimum
              {completePairs >= 3 && ` (${completePairs} total)`}
            </Typography>

            <Typography
              variant="body2"
              color={warning ? 'warning.main' : 'text.secondary'}
            >
              {warning || getInstructionText()}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Context menu for point deletion */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
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

export default AffineRegistrationModal;
