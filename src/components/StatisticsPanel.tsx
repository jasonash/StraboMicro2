/**
 * Statistics Panel - Floating collapsible panel for point counting statistics
 *
 * Displays live modal analysis statistics while the user is classifying spots.
 * Can be toggled via View menu (Cmd+Shift+S) or Quick Classify toolbar button.
 */

import React, { useState, useCallback } from 'react';
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
} from '@mui/icons-material';
import { useAppStore } from '../store';
import { PointCountingStatistics } from './PointCountingStatistics';

export const StatisticsPanel: React.FC = () => {
  const statisticsPanelVisible = useAppStore((s) => s.statisticsPanelVisible);
  const setStatisticsPanelVisible = useAppStore((s) => s.setStatisticsPanelVisible);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const quickClassifyVisible = useAppStore((s) => s.quickClassifyVisible);

  // Expanded/collapsed state for the panel content
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClose = useCallback(() => {
    setStatisticsPanelVisible(false);
  }, [setStatisticsPanelVisible]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Don't render if not visible or no micrograph
  if (!statisticsPanelVisible || !activeMicrographId) {
    return null;
  }

  // Adjust bottom position based on whether Quick Classify toolbar is visible
  // Quick Classify toolbar is ~120px tall, plus 8px margin
  const bottomOffset = quickClassifyVisible ? 140 : 16;

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        right: 16,
        bottom: bottomOffset,
        width: 320,
        maxHeight: 'calc(100% - 180px)', // Leave room for toolbar
        zIndex: 99, // Below Quick Classify toolbar (100)
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'bottom 0.3s ease',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
          cursor: 'pointer',
        }}
        onClick={toggleExpanded}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Point Count Statistics
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={isExpanded ? 'Collapse' : 'Expand'}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}>
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleClose(); }}>
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
            maxHeight: 400,
            overflowY: 'auto',
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
