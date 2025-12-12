import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  BarChart as StatsIcon,
  Close as CloseIcon,
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
};

interface QuickClassifyToolbarProps {
  onOpenStatistics?: () => void;
  onOpenSettings?: () => void;
}

export const QuickClassifyToolbar: React.FC<QuickClassifyToolbarProps> = ({
  onOpenStatistics,
  onOpenSettings,
}) => {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const quickClassifyVisible = useAppStore((state) => state.quickClassifyVisible);
  const shortcuts = useAppStore((state) => state.quickClassifyShortcuts);
  const setQuickClassifyVisible = useAppStore((state) => state.setQuickClassifyVisible);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);
  const updateSpotData = useAppStore((state) => state.updateSpotData);
  const activeTool = useAppStore((state) => state.activeTool);

  // Flash state for visual feedback
  const [flashSpotId, setFlashSpotId] = useState<string | null>(null);

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
    <Box
      sx={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 3,
        p: 1.5,
        minWidth: 600,
        maxWidth: '90%',
        zIndex: 100,
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, mr: 2, color: 'primary.main' }}
        >
          Quick Classify
        </Typography>

        {/* Shortcut chips - scrollable */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            gap: 0.5,
            overflowX: 'auto',
            '&::-webkit-scrollbar': { height: 4 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'divider',
              borderRadius: 2,
            },
          }}
        >
          {sortedShortcuts.map(([key, mineral]) => (
            <Chip
              key={key}
              label={`${key.toUpperCase()} ${formatMineralName(mineral).slice(0, 4)}`}
              size="small"
              onClick={() => classifySpot(mineral)}
              sx={{
                cursor: 'pointer',
                minWidth: 60,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            />
          ))}
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
          {onOpenStatistics && (
            <Tooltip title="Statistics">
              <IconButton size="small" onClick={onOpenStatistics}>
                <StatsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onOpenSettings && (
            <Tooltip title="Configure Shortcuts">
              <IconButton size="small" onClick={onOpenSettings}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close (Esc)">
            <IconButton
              size="small"
              onClick={() => setQuickClassifyVisible(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Progress bar */}
      <Box sx={{ mb: 1 }}>
        <LinearProgress
          variant="determinate"
          value={stats.percentage}
          sx={{
            height: 8,
            borderRadius: 1,
            bgcolor: 'grey.300',
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
          Space=Skip &nbsp; ⌫=Back &nbsp; Esc=Exit
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
  );
};

export default QuickClassifyToolbar;
