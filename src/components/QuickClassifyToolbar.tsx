/**
 * Quick Classify Toolbar - Draggable floating toolbar for rapid classification
 *
 * Provides keyboard shortcuts for classifying:
 * - Spots (when NOT in point count mode)
 * - Point Count session points (when IN point count mode)
 *
 * Can be dragged anywhere in the window.
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  LinearProgress,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  BarChart as StatsIcon,
  Close as CloseIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  DragIndicator as DragIcon,
  Save as SaveIcon,
  Gesture as LassoIcon,
} from '@mui/icons-material';
import { useAppStore } from '../store';
import { findMicrographById, findSpotById } from '../store/helpers';
import type { MineralogyType, MineralType } from '../types/project-types';

// Navigation keys that are not configurable
const NAVIGATION_KEYS: Record<string, string> = {
  ' ': 'skip',           // Space - next without classifying
  'Backspace': 'back',   // Go to previous spot/point
  'Escape': 'exit',      // Exit Quick Classify mode
  'Enter': 'confirm',    // Confirm and advance (same as skip for now)
  'Tab': 'nextUnclassified', // Jump to next unclassified
  'Delete': 'clear',     // Clear mineralogy from current spot/point
};

const TOOLBAR_WIDTH = 700;
const TOOLBAR_DEFAULT_Y_OFFSET = 160; // From bottom of screen

interface QuickClassifyToolbarProps {
  onOpenSettings?: () => void;
}

export const QuickClassifyToolbar: React.FC<QuickClassifyToolbarProps> = ({
  onOpenSettings,
}) => {
  // Store - common
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const quickClassifyVisible = useAppStore((state) => state.quickClassifyVisible);
  const shortcuts = useAppStore((state) => state.quickClassifyShortcuts);
  const setQuickClassifyVisible = useAppStore((state) => state.setQuickClassifyVisible);
  const setStatisticsPanelVisible = useAppStore((state) => state.setStatisticsPanelVisible);
  const activeTool = useAppStore((state) => state.activeTool);
  const viewerRef = useAppStore((state) => state.viewerRef);

  // Store - spot mode (when not in point count mode)
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Store - point count mode
  const pointCountMode = useAppStore((state) => state.pointCountMode);
  const activePointCountSession = useAppStore((state) => state.activePointCountSession);
  const currentPointIndex = useAppStore((state) => state.currentPointIndex);
  const setCurrentPointIndex = useAppStore((state) => state.setCurrentPointIndex);
  const classifyPoint = useAppStore((state) => state.classifyPoint);
  const clearPointClassification = useAppStore((state) => state.clearPointClassification);
  const goToNextUnclassifiedPoint = useAppStore((state) => state.goToNextUnclassifiedPoint);
  const goToPreviousPoint = useAppStore((state) => state.goToPreviousPoint);
  const exitPointCountMode = useAppStore((state) => state.exitPointCountMode);
  const savePointCountSession = useAppStore((state) => state.savePointCountSession);

  // Store - lasso selection (point count mode only)
  const lassoToolActive = useAppStore((state) => state.lassoToolActive);
  const setLassoToolActive = useAppStore((state) => state.setLassoToolActive);
  const selectedPointIndices = useAppStore((state) => state.selectedPointIndices);
  const classifySelectedPoints = useAppStore((state) => state.classifySelectedPoints);
  const clearSelectedPoints = useAppStore((state) => state.clearSelectedPoints);

  // Flash state for visual feedback
  const [flashId, setFlashId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Scroll state for shortcut chips
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Dragging state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Initialize position when toolbar becomes visible
  useEffect(() => {
    if (quickClassifyVisible && position === null) {
      setPosition({
        x: (window.innerWidth - TOOLBAR_WIDTH) / 2,
        y: window.innerHeight - TOOLBAR_DEFAULT_Y_OFFSET,
      });
    }
  }, [quickClassifyVisible, position]);

  // Reset position when toolbar is hidden
  useEffect(() => {
    if (!quickClassifyVisible) {
      setPosition(null);
    }
  }, [quickClassifyVisible]);

  // Update scroll button visibility
  const updateScrollState = useCallback(() => {
    const container = chipsContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  }, []);

  // Scroll chips left/right
  const scrollChips = useCallback((direction: 'left' | 'right') => {
    const container = chipsContainerRef.current;
    if (container) {
      const scrollAmount = 200;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!position) return;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      let newX = dragStartRef.current.panelX + deltaX;
      let newY = dragStartRef.current.panelY + deltaY;

      newX = Math.max(0, Math.min(newX, window.innerWidth - TOOLBAR_WIDTH));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 80));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // ============================================================================
  // SPOT MODE DATA (when not in point count mode)
  // ============================================================================

  const activeMicrograph = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    return findMicrographById(project, activeMicrographId);
  }, [project, activeMicrographId]);

  const spots = useMemo(() => {
    return activeMicrograph?.spots || [];
  }, [activeMicrograph]);

  const activeSpot = useMemo(() => {
    if (!activeSpotId || !project) return null;
    return findSpotById(project, activeSpotId);
  }, [project, activeSpotId]);

  const spotStats = useMemo(() => {
    const total = spots.length;
    const classified = spots.filter((s) => {
      const minerals = s.mineralogy?.minerals;
      return minerals && minerals.length > 0 && minerals[0].name;
    }).length;
    const unclassified = total - classified;
    const percentage = total > 0 ? Math.round((classified / total) * 100) : 0;
    return { total, classified, unclassified, percentage };
  }, [spots]);

  const currentSpotIndex = useMemo(() => {
    if (!activeSpotId) return -1;
    return spots.findIndex((s) => s.id === activeSpotId);
  }, [spots, activeSpotId]);

  // ============================================================================
  // POINT COUNT MODE DATA
  // ============================================================================

  const pointCountStats = useMemo(() => {
    if (!activePointCountSession) {
      return { total: 0, classified: 0, unclassified: 0, percentage: 0 };
    }
    const total = activePointCountSession.points.length;
    const classified = activePointCountSession.points.filter(p => p.mineral).length;
    const unclassified = total - classified;
    const percentage = total > 0 ? Math.round((classified / total) * 100) : 0;
    return { total, classified, unclassified, percentage };
  }, [activePointCountSession]);

  const currentPoint = useMemo(() => {
    if (!activePointCountSession || currentPointIndex < 0) return null;
    return activePointCountSession.points[currentPointIndex] || null;
  }, [activePointCountSession, currentPointIndex]);

  // ============================================================================
  // UNIFIED STATISTICS (switch based on mode)
  // ============================================================================

  const stats = pointCountMode ? pointCountStats : spotStats;
  const currentName = pointCountMode
    ? (currentPoint ? `Point ${currentPointIndex + 1}` : 'No point selected')
    : (activeSpot?.name || `Spot ${currentSpotIndex + 1}`);
  const currentMineral = pointCountMode
    ? currentPoint?.mineral
    : activeSpot?.mineralogy?.minerals?.[0]?.name;

  // ============================================================================
  // SPOT MODE NAVIGATION
  // ============================================================================

  const selectNextUnclassifiedSpot = useCallback(
    (direction: 'forward' | 'backward' = 'forward') => {
      const unclassified = spots.filter((s) => {
        const minerals = s.mineralogy?.minerals;
        return !minerals || minerals.length === 0 || !minerals[0].name;
      });

      if (unclassified.length === 0) return;

      if (!activeSpotId) {
        selectActiveSpot(unclassified[0].id);
        return;
      }

      const currentIdx = spots.findIndex((s) => s.id === activeSpotId);

      if (direction === 'forward') {
        for (let i = currentIdx + 1; i < spots.length; i++) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
        for (let i = 0; i < currentIdx; i++) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
      } else {
        for (let i = currentIdx - 1; i >= 0; i--) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
        for (let i = spots.length - 1; i > currentIdx; i--) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
      }
    },
    [spots, activeSpotId, selectActiveSpot]
  );

  const advanceToNextSpot = useCallback(() => {
    if (spots.length === 0) return;
    const nextIdx = currentSpotIndex >= spots.length - 1 ? 0 : currentSpotIndex + 1;
    selectActiveSpot(spots[nextIdx].id);
  }, [spots, currentSpotIndex, selectActiveSpot]);

  const goToPreviousSpot = useCallback(() => {
    if (spots.length === 0) return;
    const prevIdx = currentSpotIndex <= 0 ? spots.length - 1 : currentSpotIndex - 1;
    selectActiveSpot(spots[prevIdx].id);
  }, [spots, currentSpotIndex, selectActiveSpot]);

  // ============================================================================
  // POINT COUNT MODE NAVIGATION
  // ============================================================================

  const advanceToNextPoint = useCallback(() => {
    if (!activePointCountSession) return;
    const total = activePointCountSession.points.length;
    if (total === 0) return;
    const nextIdx = currentPointIndex >= total - 1 ? 0 : currentPointIndex + 1;
    setCurrentPointIndex(nextIdx);
  }, [activePointCountSession, currentPointIndex, setCurrentPointIndex]);

  // ============================================================================
  // UNIFIED CLASSIFICATION
  // ============================================================================

  const classifyCurrentItem = useCallback(
    (mineralName: string) => {
      if (pointCountMode) {
        // Point Count mode - check for batch selection first
        if (selectedPointIndices.length > 0) {
          // Batch classify all selected points
          classifySelectedPoints(mineralName);
          // classifySelectedPoints handles clearing selection and advancing
          return;
        }

        // Single point classification
        if (!currentPoint) return;

        classifyPoint(currentPoint.id, mineralName);

        // Flash visual feedback
        setFlashId(currentPoint.id);
        setTimeout(() => setFlashId(null), 300);

        // Auto-advance to next unclassified point
        setTimeout(() => {
          goToNextUnclassifiedPoint();
        }, 50);
      } else {
        // Spot mode
        if (!activeSpotId) return;

        const mineralogy: MineralogyType = {
          minerals: [{ name: mineralName } as MineralType],
        };

        updateSpotData(activeSpotId, { mineralogy });

        setFlashId(activeSpotId);
        setTimeout(() => setFlashId(null), 300);

        setTimeout(() => {
          selectNextUnclassifiedSpot('forward');
        }, 50);
      }
    },
    [
      pointCountMode,
      currentPoint,
      activeSpotId,
      selectedPointIndices,
      classifyPoint,
      classifySelectedPoints,
      updateSpotData,
      goToNextUnclassifiedPoint,
      selectNextUnclassifiedSpot,
    ]
  );

  const clearCurrentItem = useCallback(() => {
    if (pointCountMode) {
      if (!currentPoint) return;
      clearPointClassification(currentPoint.id);
      setFlashId(currentPoint.id);
      setTimeout(() => setFlashId(null), 300);
    } else {
      if (!activeSpotId) return;
      updateSpotData(activeSpotId, { mineralogy: undefined });
      setFlashId(activeSpotId);
      setTimeout(() => setFlashId(null), 300);
    }
  }, [pointCountMode, currentPoint, activeSpotId, clearPointClassification, updateSpotData]);

  // ============================================================================
  // UNIFIED NAVIGATION
  // ============================================================================

  const advanceToNext = useCallback(() => {
    if (pointCountMode) {
      advanceToNextPoint();
    } else {
      advanceToNextSpot();
    }
  }, [pointCountMode, advanceToNextPoint, advanceToNextSpot]);

  const goToPrevious = useCallback(() => {
    if (pointCountMode) {
      goToPreviousPoint();
    } else {
      goToPreviousSpot();
    }
  }, [pointCountMode, goToPreviousPoint, goToPreviousSpot]);

  const selectNextUnclassified = useCallback(() => {
    if (pointCountMode) {
      goToNextUnclassifiedPoint();
    } else {
      selectNextUnclassifiedSpot('forward');
    }
  }, [pointCountMode, goToNextUnclassifiedPoint, selectNextUnclassifiedSpot]);

  // ============================================================================
  // SPATIAL NAVIGATION (Point Count mode only - arrow keys)
  // ============================================================================

  /**
   * Navigate spatially in the point grid using arrow keys.
   * For regular/stratified grids, uses row/col structure.
   * For random grids, falls back to sequential navigation.
   */
  const navigateSpatially = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!pointCountMode || !activePointCountSession) return;

    const { points, gridSettings, gridType } = activePointCountSession;
    const { rows, cols } = gridSettings;

    if (currentPointIndex < 0 || currentPointIndex >= points.length) return;

    // For random grids without spatial structure, use sequential navigation
    if (gridType === 'random') {
      if (direction === 'right' || direction === 'down') {
        if (currentPointIndex < points.length - 1) {
          setCurrentPointIndex(currentPointIndex + 1);
        }
      } else {
        if (currentPointIndex > 0) {
          setCurrentPointIndex(currentPointIndex - 1);
        }
      }
      return;
    }

    // For regular/stratified grids, calculate spatial neighbor
    // Points are stored in row-major order: index = row * cols + col
    const currentRow = Math.floor(currentPointIndex / cols);
    const currentCol = currentPointIndex % cols;

    let newRow = currentRow;
    let newCol = currentCol;

    switch (direction) {
      case 'up':
        newRow = Math.max(0, currentRow - 1);
        break;
      case 'down':
        newRow = Math.min(rows - 1, currentRow + 1);
        break;
      case 'left':
        newCol = Math.max(0, currentCol - 1);
        break;
      case 'right':
        newCol = Math.min(cols - 1, currentCol + 1);
        break;
    }

    const newIndex = newRow * cols + newCol;
    if (newIndex !== currentPointIndex && newIndex >= 0 && newIndex < points.length) {
      setCurrentPointIndex(newIndex);
    }
  }, [pointCountMode, activePointCountSession, currentPointIndex, setCurrentPointIndex]);

  // ============================================================================
  // EXIT HANDLING
  // ============================================================================

  const handleClose = useCallback(async () => {
    if (pointCountMode) {
      // Exit point count mode (auto-saves session)
      await exitPointCountMode();
    } else {
      setQuickClassifyVisible(false);
    }
  }, [pointCountMode, exitPointCountMode, setQuickClassifyVisible]);

  const handleManualSave = useCallback(async () => {
    if (pointCountMode) {
      setIsSaving(true);
      await savePointCountSession();
      setIsSaving(false);
    }
  }, [pointCountMode, savePointCountSession]);

  // ============================================================================
  // KEYBOARD HANDLING
  // ============================================================================

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!quickClassifyVisible) return;

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (activeTool && activeTool !== 'select') {
        return;
      }

      const key = e.key.toLowerCase();

      // Check navigation keys first
      if (NAVIGATION_KEYS[e.key]) {
        e.preventDefault();
        const action = NAVIGATION_KEYS[e.key];
        switch (action) {
          case 'skip':
          case 'confirm':
            advanceToNext();
            break;
          case 'back':
            goToPrevious();
            break;
          case 'exit':
            // If points are selected, clear selection first; otherwise close
            if (selectedPointIndices.length > 0) {
              clearSelectedPoints();
              setLassoToolActive(false);
            } else {
              handleClose();
            }
            break;
          case 'nextUnclassified':
            selectNextUnclassified();
            break;
          case 'clear':
            clearCurrentItem();
            break;
        }
        return;
      }

      // Arrow keys for spatial navigation (point count mode only)
      if (pointCountMode) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            navigateSpatially('up');
            return;
          case 'ArrowDown':
            e.preventDefault();
            navigateSpatially('down');
            return;
          case 'ArrowLeft':
            e.preventDefault();
            navigateSpatially('left');
            return;
          case 'ArrowRight':
            e.preventDefault();
            navigateSpatially('right');
            return;
        }
      }

      // Check mineral shortcuts
      if (shortcuts[key]) {
        e.preventDefault();
        classifyCurrentItem(shortcuts[key]);
        return;
      }
    },
    [
      quickClassifyVisible,
      activeTool,
      shortcuts,
      advanceToNext,
      goToPrevious,
      handleClose,
      selectNextUnclassified,
      clearCurrentItem,
      classifyCurrentItem,
      selectedPointIndices,
      clearSelectedPoints,
      setLassoToolActive,
      pointCountMode,
      navigateSpatially,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // ============================================================================
  // AUTO-SELECT FIRST ITEM
  // ============================================================================

  useEffect(() => {
    if (quickClassifyVisible && !pointCountMode && spots.length > 0 && !activeSpotId) {
      const firstUnclassified = spots.find((s) => {
        const minerals = s.mineralogy?.minerals;
        return !minerals || minerals.length === 0 || !minerals[0].name;
      });
      if (firstUnclassified) {
        selectActiveSpot(firstUnclassified.id);
      } else if (spots.length > 0) {
        selectActiveSpot(spots[0].id);
      }
    }
  }, [quickClassifyVisible, pointCountMode, spots, activeSpotId, selectActiveSpot]);

  // ============================================================================
  // PAN TO CURRENT ITEM
  // ============================================================================

  useEffect(() => {
    if (!quickClassifyVisible || !viewerRef?.current) return;

    let x = 0;
    let y = 0;

    if (pointCountMode && currentPoint) {
      x = currentPoint.x;
      y = currentPoint.y;
    } else if (!pointCountMode && activeSpotId) {
      const spot = spots.find((s) => s.id === activeSpotId);
      if (!spot) return;

      const geometryType = spot.geometryType || spot.geometry?.type;

      if (geometryType === 'point' || geometryType === 'Point') {
        if (Array.isArray(spot.geometry?.coordinates)) {
          const coords = spot.geometry.coordinates as number[];
          x = coords[0];
          y = coords[1];
        } else if (spot.points?.[0]) {
          x = spot.points[0].X ?? 0;
          y = spot.points[0].Y ?? 0;
        }
      } else if (geometryType === 'line' || geometryType === 'LineString') {
        const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
          ? (spot.geometry.coordinates as number[][])
          : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];
        if (coords.length > 0) {
          const xs = coords.map((c) => c[0]);
          const ys = coords.map((c) => c[1]);
          x = (Math.min(...xs) + Math.max(...xs)) / 2;
          y = (Math.min(...ys) + Math.max(...ys)) / 2;
        }
      } else if (geometryType === 'polygon' || geometryType === 'Polygon') {
        const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
          ? ((spot.geometry.coordinates as number[][][])[0] || [])
          : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];
        if (coords.length > 0) {
          const xs = coords.map((c) => c[0]);
          const ys = coords.map((c) => c[1]);
          x = (Math.min(...xs) + Math.max(...xs)) / 2;
          y = (Math.min(...ys) + Math.max(...ys)) / 2;
        }
      }
    }

    if (x !== 0 || y !== 0) {
      viewerRef.current.panToPoint(x, y);
    }
  }, [quickClassifyVisible, pointCountMode, currentPoint, currentPointIndex, activeSpotId, spots, viewerRef]);

  // ============================================================================
  // INITIALIZE SCROLL STATE
  // ============================================================================

  useEffect(() => {
    if (quickClassifyVisible) {
      setTimeout(updateScrollState, 100);
    }
  }, [quickClassifyVisible, updateScrollState]);

  // ============================================================================
  // TOGGLE STATISTICS PANEL
  // ============================================================================

  const toggleStatistics = useCallback(() => {
    const current = useAppStore.getState().statisticsPanelVisible;
    setStatisticsPanelVisible(!current);
  }, [setStatisticsPanelVisible]);

  // ============================================================================
  // RENDER CONDITIONS
  // ============================================================================

  // Don't render if not visible
  if (!quickClassifyVisible) {
    return null;
  }

  // In point count mode, check for session
  if (pointCountMode && !activePointCountSession) {
    return null;
  }

  // In spot mode, check for micrograph and spots
  if (!pointCountMode && (!activeMicrographId || spots.length === 0)) {
    return null;
  }

  // Sort shortcuts by key for consistent display
  const sortedShortcuts = Object.entries(shortcuts).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const formatMineralName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <Paper
      ref={toolbarRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: position?.x ?? (window.innerWidth - TOOLBAR_WIDTH) / 2,
        top: position?.y ?? window.innerHeight - TOOLBAR_DEFAULT_Y_OFFSET,
        width: TOOLBAR_WIDTH,
        zIndex: 1500,
        bgcolor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: isDragging ? 12 : 6,
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
      }}
    >
      {/* Header - Drag Handle */}
      <Box
        onMouseDown={handleDragStart}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.800',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DragIcon fontSize="small" sx={{ color: 'grey.500', fontSize: 16 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'grey.100' }}>
            {pointCountMode ? 'Point Count' : 'Quick Classify'}
          </Typography>
          {pointCountMode && activePointCountSession && (
            <Typography variant="caption" sx={{ color: 'grey.400', ml: 1 }}>
              {activePointCountSession.name}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {pointCountMode && (
            <Tooltip title="Save Session">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); handleManualSave(); }}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={isSaving}
                sx={{ color: 'grey.400', p: 0.5 }}
              >
                <SaveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {pointCountMode && (
            <Tooltip title={lassoToolActive ? "Exit Lasso Selection" : "Lasso Select Multiple Points"}>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setLassoToolActive(!lassoToolActive); }}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{
                  color: lassoToolActive ? 'primary.main' : 'grey.400',
                  bgcolor: lassoToolActive ? 'action.selected' : 'transparent',
                  p: 0.5,
                  '&:hover': {
                    bgcolor: lassoToolActive ? 'action.selected' : 'action.hover',
                  },
                }}
              >
                <LassoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Statistics">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); toggleStatistics(); }}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{ color: 'grey.400', p: 0.5 }}
            >
              <StatsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {onOpenSettings && (
            <Tooltip title="Configure Shortcuts">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{ color: 'grey.400', p: 0.5 }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close (Esc)">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{ color: 'grey.400', p: 0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ p: 1.5, bgcolor: 'grey.900' }}>
        {/* Shortcut chips row */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {canScrollLeft && (
            <IconButton
              size="small"
              onClick={() => scrollChips('left')}
              sx={{ p: 0.25, mr: 0.5 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          )}

          <Box
            ref={chipsContainerRef}
            onScroll={updateScrollState}
            sx={{
              flex: 1,
              display: 'flex',
              gap: 0.5,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {sortedShortcuts.map(([key, mineral]) => (
              <Tooltip key={key} title={`${key.toUpperCase()} = ${formatMineralName(mineral)}`} arrow>
                <Chip
                  label={`${key.toUpperCase()} ${formatMineralName(mineral).slice(0, 3)}`}
                  size="small"
                  onClick={() => classifyCurrentItem(mineral)}
                  sx={{
                    cursor: 'pointer',
                    flexShrink: 0,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              </Tooltip>
            ))}
          </Box>

          {canScrollRight && (
            <IconButton
              size="small"
              onClick={() => scrollChips('right')}
              sx={{ p: 0.25, ml: 0.5 }}
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        {/* Progress bar */}
        <Box sx={{ mb: 1 }}>
          <LinearProgress
            variant="determinate"
            value={stats.percentage}
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: 'grey.700',
              '& .MuiLinearProgress-bar': {
                bgcolor: stats.percentage === 100 ? 'success.main' : 'primary.main',
              },
            }}
          />
        </Box>

        {/* Status row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Progress text */}
          <Typography variant="body2" color="text.secondary">
            {stats.classified}/{stats.total} classified ({stats.percentage}%)
          </Typography>

          {/* Current item indicator */}
          <Typography
            variant="body2"
            color="text.primary"
            sx={{
              fontWeight: 500,
              transition: 'background-color 0.3s ease',
              bgcolor: flashId ? 'success.light' : (selectedPointIndices.length > 0 ? 'info.dark' : 'transparent'),
              px: 1,
              borderRadius: 1,
            }}
          >
            {selectedPointIndices.length > 0 ? (
              `${selectedPointIndices.length} points selected`
            ) : (
              <>
                {currentName}
                {currentMineral && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    ({formatMineralName(currentMineral)})
                  </Typography>
                )}
              </>
            )}
          </Typography>

          {/* Navigation hints */}
          <Typography variant="caption" color="text.secondary">
            Space=Skip ⌫=Back Del=Clear Esc=Exit
          </Typography>

          {/* Done button */}
          <Button
            variant="contained"
            size="small"
            onClick={handleClose}
            sx={{ ml: 1 }}
          >
            Done
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default QuickClassifyToolbar;
