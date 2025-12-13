/**
 * Quick Classify Toolbar - Draggable floating toolbar for rapid spot classification
 *
 * Provides keyboard shortcuts for classifying spots with minerals.
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
} from '@mui/icons-material';
import { useAppStore } from '../store';
import { findMicrographById, findSpotById } from '../store/helpers';
import type { MineralogyType, MineralType } from '../types/project-types';

// Navigation keys that are not configurable
const NAVIGATION_KEYS: Record<string, string> = {
  ' ': 'skip',           // Space - next without classifying
  'Backspace': 'back',   // Go to previous spot
  'Escape': 'exit',      // Exit Quick Classify mode
  'Enter': 'confirm',    // Confirm and advance (same as skip for now)
  'Tab': 'nextUnclassified', // Jump to next unclassified
  'Delete': 'clear',     // Clear mineralogy from current spot
};

const TOOLBAR_WIDTH = 700;
const TOOLBAR_DEFAULT_Y_OFFSET = 120; // From bottom of screen

interface QuickClassifyToolbarProps {
  onOpenSettings?: () => void;
}

export const QuickClassifyToolbar: React.FC<QuickClassifyToolbarProps> = ({
  onOpenSettings,
}) => {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const quickClassifyVisible = useAppStore((state) => state.quickClassifyVisible);
  const shortcuts = useAppStore((state) => state.quickClassifyShortcuts);
  const setQuickClassifyVisible = useAppStore((state) => state.setQuickClassifyVisible);
  const setStatisticsPanelVisible = useAppStore((state) => state.setStatisticsPanelVisible);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);
  const updateSpotData = useAppStore((state) => state.updateSpotData);
  const activeTool = useAppStore((state) => state.activeTool);
  const viewerRef = useAppStore((state) => state.viewerRef);

  // Flash state for visual feedback
  const [flashSpotId, setFlashSpotId] = useState<string | null>(null);

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
      // Center horizontally, near bottom of screen
      setPosition({
        x: (window.innerWidth - TOOLBAR_WIDTH) / 2,
        y: window.innerHeight - TOOLBAR_DEFAULT_Y_OFFSET,
      });
    }
  }, [quickClassifyVisible, position]);

  // Reset position when toolbar is hidden (so it re-centers next time)
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

      // Constrain to window bounds
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

  // Get the active micrograph and its spots
  const activeMicrograph = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    return findMicrographById(project, activeMicrographId);
  }, [project, activeMicrographId]);

  const spots = useMemo(() => {
    return activeMicrograph?.spots || [];
  }, [activeMicrograph]);

  // Get the active spot
  const activeSpot = useMemo(() => {
    if (!activeSpotId || !project) return null;
    return findSpotById(project, activeSpotId);
  }, [project, activeSpotId]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = spots.length;
    const classified = spots.filter((s) => {
      const minerals = s.mineralogy?.minerals;
      return minerals && minerals.length > 0 && minerals[0].name;
    }).length;
    const unclassified = total - classified;
    const percentage = total > 0 ? Math.round((classified / total) * 100) : 0;
    return { total, classified, unclassified, percentage };
  }, [spots]);

  // Find current spot index
  const currentIndex = useMemo(() => {
    if (!activeSpotId) return -1;
    return spots.findIndex((s) => s.id === activeSpotId);
  }, [spots, activeSpotId]);

  // Select next unclassified spot
  const selectNextUnclassified = useCallback(
    (direction: 'forward' | 'backward' = 'forward') => {
      const unclassified = spots.filter((s) => {
        const minerals = s.mineralogy?.minerals;
        return !minerals || minerals.length === 0 || !minerals[0].name;
      });

      if (unclassified.length === 0) {
        return; // All classified
      }

      if (!activeSpotId) {
        selectActiveSpot(unclassified[0].id);
        return;
      }

      const currentIdx = spots.findIndex((s) => s.id === activeSpotId);

      if (direction === 'forward') {
        // Find next unclassified after current
        for (let i = currentIdx + 1; i < spots.length; i++) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
        // Wrap around to beginning
        for (let i = 0; i < currentIdx; i++) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
      } else {
        // Find previous unclassified before current
        for (let i = currentIdx - 1; i >= 0; i--) {
          const minerals = spots[i].mineralogy?.minerals;
          if (!minerals || minerals.length === 0 || !minerals[0].name) {
            selectActiveSpot(spots[i].id);
            return;
          }
        }
        // Wrap around to end
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

  // Advance to next spot (any spot, not just unclassified)
  const advanceToNext = useCallback(() => {
    if (spots.length === 0) return;
    const nextIdx = currentIndex >= spots.length - 1 ? 0 : currentIndex + 1;
    selectActiveSpot(spots[nextIdx].id);
  }, [spots, currentIndex, selectActiveSpot]);

  // Go back to previous spot
  const goToPrevious = useCallback(() => {
    if (spots.length === 0) return;
    const prevIdx = currentIndex <= 0 ? spots.length - 1 : currentIndex - 1;
    selectActiveSpot(spots[prevIdx].id);
  }, [spots, currentIndex, selectActiveSpot]);

  // Classify the current spot with a mineral
  const classifySpot = useCallback(
    (mineralName: string) => {
      if (!activeSpotId) return;

      // Create mineralogy with single mineral entry
      const mineralogy: MineralogyType = {
        minerals: [{ name: mineralName } as MineralType],
      };

      updateSpotData(activeSpotId, { mineralogy });

      // Flash visual feedback
      setFlashSpotId(activeSpotId);
      setTimeout(() => setFlashSpotId(null), 300);

      // Auto-advance to next unclassified spot
      setTimeout(() => {
        selectNextUnclassified('forward');
      }, 50);
    },
    [activeSpotId, updateSpotData, selectNextUnclassified]
  );

  // Clear mineralogy from current spot
  const clearMineralogy = useCallback(() => {
    if (!activeSpotId) return;

    // Clear mineralogy by setting to undefined
    updateSpotData(activeSpotId, { mineralogy: undefined });

    // Flash visual feedback (use null flash to indicate clearing)
    setFlashSpotId(activeSpotId);
    setTimeout(() => setFlashSpotId(null), 300);
  }, [activeSpotId, updateSpotData]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle if toolbar is not visible
      if (!quickClassifyVisible) return;

      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Don't handle if a drawing tool is active
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
            setQuickClassifyVisible(false);
            break;
          case 'nextUnclassified':
            selectNextUnclassified('forward');
            break;
          case 'clear':
            clearMineralogy();
            break;
        }
        return;
      }

      // Check mineral shortcuts
      if (shortcuts[key]) {
        e.preventDefault();
        classifySpot(shortcuts[key]);
        return;
      }
    },
    [
      quickClassifyVisible,
      activeTool,
      shortcuts,
      advanceToNext,
      goToPrevious,
      setQuickClassifyVisible,
      selectNextUnclassified,
      classifySpot,
      clearMineralogy,
    ]
  );

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Auto-select first unclassified spot when toolbar becomes visible
  useEffect(() => {
    if (quickClassifyVisible && spots.length > 0 && !activeSpotId) {
      // Find first unclassified spot
      const firstUnclassified = spots.find((s) => {
        const minerals = s.mineralogy?.minerals;
        return !minerals || minerals.length === 0 || !minerals[0].name;
      });
      if (firstUnclassified) {
        selectActiveSpot(firstUnclassified.id);
      } else if (spots.length > 0) {
        // All classified, select first spot
        selectActiveSpot(spots[0].id);
      }
    }
  }, [quickClassifyVisible, spots, activeSpotId, selectActiveSpot]);

  // Pan canvas to center on current spot when it changes during Quick Classify
  useEffect(() => {
    if (!quickClassifyVisible || !activeSpotId || !viewerRef?.current) return;

    const spot = spots.find((s) => s.id === activeSpotId);
    if (!spot) return;

    // Get spot coordinates based on geometry type
    const geometryType = spot.geometryType || spot.geometry?.type;
    let x = 0;
    let y = 0;

    if (geometryType === 'point' || geometryType === 'Point') {
      // Point: use coordinates directly
      if (Array.isArray(spot.geometry?.coordinates)) {
        const coords = spot.geometry.coordinates as number[];
        x = coords[0];
        y = coords[1];
      } else if (spot.points?.[0]) {
        x = spot.points[0].X ?? 0;
        y = spot.points[0].Y ?? 0;
      }
    } else if (geometryType === 'line' || geometryType === 'LineString') {
      // Line: use center of bounding box
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
      // Polygon: use center of bounding box
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

    // Pan to center on the spot
    if (x !== 0 || y !== 0) {
      viewerRef.current.panToPoint(x, y);
    }
  }, [quickClassifyVisible, activeSpotId, spots, viewerRef]);

  // Initialize scroll state when toolbar becomes visible
  useEffect(() => {
    if (quickClassifyVisible) {
      // Small delay to ensure container is rendered
      setTimeout(updateScrollState, 100);
    }
  }, [quickClassifyVisible, updateScrollState]);

  // Toggle statistics panel
  const toggleStatistics = useCallback(() => {
    const current = useAppStore.getState().statisticsPanelVisible;
    setStatisticsPanelVisible(!current);
  }, [setStatisticsPanelVisible]);

  // Don't render if not visible or no micrograph
  if (!quickClassifyVisible || !activeMicrographId || spots.length === 0) {
    return null;
  }

  // Sort shortcuts by key for consistent display
  const sortedShortcuts = Object.entries(shortcuts).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Format mineral name for display (capitalize first letter)
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
        zIndex: 1500, // Same as Statistics Panel
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
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Quick Classify
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
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
              onClick={(e) => { e.stopPropagation(); setQuickClassifyVisible(false); }}
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
          {/* Scroll left button */}
          {canScrollLeft && (
            <IconButton
              size="small"
              onClick={() => scrollChips('left')}
              sx={{ p: 0.25, mr: 0.5 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          )}

          {/* Shortcut chips - scrollable */}
          <Box
            ref={chipsContainerRef}
            onScroll={updateScrollState}
            sx={{
              flex: 1,
              display: 'flex',
              gap: 0.5,
              overflowX: 'auto',
              scrollbarWidth: 'none', // Firefox
              '&::-webkit-scrollbar': { display: 'none' }, // Chrome/Safari
            }}
          >
            {sortedShortcuts.map(([key, mineral]) => (
              <Tooltip key={key} title={`${key.toUpperCase()} = ${formatMineralName(mineral)}`} arrow>
                <Chip
                  label={`${key.toUpperCase()} ${formatMineralName(mineral).slice(0, 3)}`}
                  size="small"
                  onClick={() => classifySpot(mineral)}
                  sx={{
                    cursor: 'pointer',
                    flexShrink: 0,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              </Tooltip>
            ))}
          </Box>

          {/* Scroll right button */}
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

          {/* Current spot indicator */}
          <Typography
            variant="body2"
            color="text.primary"
            sx={{
              fontWeight: 500,
              transition: 'background-color 0.3s ease',
              bgcolor: flashSpotId === activeSpotId ? 'success.light' : 'transparent',
              px: 1,
              borderRadius: 1,
            }}
          >
            Current: {activeSpot?.name || `Spot ${currentIndex + 1}`}
          </Typography>

          {/* Navigation hints */}
          <Typography variant="caption" color="text.secondary">
            Space=Skip &nbsp; ⌫=Back &nbsp; Del=Clear &nbsp; Esc=Exit
          </Typography>

          {/* Done button */}
          <Button
            variant="contained"
            size="small"
            onClick={() => setQuickClassifyVisible(false)}
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
