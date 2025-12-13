/**
 * Statistics Panel - Draggable floating window for point counting statistics
 *
 * Displays live modal analysis statistics while the user is classifying spots.
 * Can be toggled via View menu (Cmd+Shift+S) or Quick Classify toolbar button.
 * Can be dragged anywhere on the canvas.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
  Paper,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';
import { useAppStore } from '../store';
import { PointCountingStatistics } from './PointCountingStatistics';

const PANEL_WIDTH = 340;
const PANEL_DEFAULT_X_OFFSET = 20; // From right edge
const PANEL_DEFAULT_Y_OFFSET = 180; // From bottom (room for Quick Classify toolbar)

export const StatisticsPanel: React.FC = () => {
  const statisticsPanelVisible = useAppStore((s) => s.statisticsPanelVisible);
  const setStatisticsPanelVisible = useAppStore((s) => s.setStatisticsPanelVisible);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);

  // Expanded/collapsed state for the panel content
  const [isExpanded, setIsExpanded] = useState(true);

  // Dragging state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Initialize position on first render (use window dimensions)
  // Position at bottom-right, above the Quick Classify toolbar
  useEffect(() => {
    if (statisticsPanelVisible && position === null) {
      setPosition({
        x: window.innerWidth - PANEL_WIDTH - PANEL_DEFAULT_X_OFFSET,
        y: window.innerHeight - PANEL_DEFAULT_Y_OFFSET - 350, // Panel is ~350px tall
      });
    }
  }, [statisticsPanelVisible, position]);

  // Reset position when panel is hidden (so it re-positions next time)
  useEffect(() => {
    if (!statisticsPanelVisible) {
      setPosition(null);
    }
  }, [statisticsPanelVisible]);

  const handleClose = useCallback(() => {
    setStatisticsPanelVisible(false);
  }, [setStatisticsPanelVisible]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
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
      newX = Math.max(0, Math.min(newX, window.innerWidth - PANEL_WIDTH));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 100)); // Leave room for panel

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

  // Don't render if not visible or no micrograph
  if (!statisticsPanelVisible || !activeMicrographId) {
    return null;
  }

  return (
    <Paper
      ref={panelRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: position?.x ?? window.innerWidth - PANEL_WIDTH - PANEL_DEFAULT_X_OFFSET,
        top: position?.y ?? window.innerHeight - PANEL_DEFAULT_Y_OFFSET - 350,
        width: PANEL_WIDTH,
        maxHeight: 'calc(100vh - 150px)',
        zIndex: 1500, // Above everything (MUI dialogs are 1300)
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
          py: 0.75,
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
            Point Count Statistics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Tooltip title={isExpanded ? 'Collapse' : 'Expand'}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{ color: 'grey.400', p: 0.5 }}
            >
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
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
      <Collapse in={isExpanded}>
        <Box
          sx={{
            p: 1.5,
            maxHeight: 450,
            overflowY: 'auto',
            bgcolor: 'grey.900',
          }}
        >
          <PointCountingStatistics
            micrographId={activeMicrographId}
            showExport={true}
            compact={false}
          />
        </Box>
      </Collapse>
    </Paper>
  );
};

export default StatisticsPanel;
