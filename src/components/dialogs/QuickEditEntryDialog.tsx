/**
 * Quick Edit Entry Dialog
 *
 * Displayed before entering Quick Edit mode, allowing users to:
 * 1. Choose which spots to include (filter)
 * 2. Choose the navigation order (sort)
 * 3. See a preview of how many spots will be included
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  Divider,
  Alert,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';

// ============================================================================
// TYPES
// ============================================================================

interface QuickEditEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterOption = 'all' | 'unclassified';
type SortOption = 'spatial' | 'size' | 'creation' | 'random';

// ============================================================================
// COMPONENT
// ============================================================================

export function QuickEditEntryDialog({ isOpen, onClose }: QuickEditEntryDialogProps) {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const enterQuickEditMode = useAppStore((state) => state.enterQuickEditMode);

  // Local state for dialog options
  const [filter, setFilter] = useState<FilterOption>('all');
  const [sortOrder, setSortOrder] = useState<SortOption>('spatial');

  // Get the active micrograph's spots
  const activeMicrograph = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    return findMicrographById(project, activeMicrographId);
  }, [project, activeMicrographId]);

  const spots = useMemo(() => {
    return activeMicrograph?.spots || [];
  }, [activeMicrograph]);

  // Calculate filtered spot count for preview
  const filteredSpotCount = useMemo(() => {
    if (filter === 'all') {
      return spots.length;
    }
    // Unclassified: no mineral assigned
    return spots.filter((spot) => {
      const minerals = spot.mineralogy?.minerals;
      return !minerals || minerals.length === 0 || !minerals[0]?.name;
    }).length;
  }, [spots, filter]);

  const classifiedCount = useMemo(() => {
    return spots.filter((spot) => {
      const minerals = spot.mineralogy?.minerals;
      return minerals && minerals.length > 0 && minerals[0]?.name;
    }).length;
  }, [spots]);

  // Handle start
  const handleStart = () => {
    enterQuickEditMode(filter, sortOrder);
    onClose();
  };

  // Reset state when dialog opens
  const handleClose = () => {
    setFilter('all');
    setSortOrder('spatial');
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle>Quick Edit Spots</DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {/* Filter options */}
          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 1, fontWeight: 500 }}>
              Include spots
            </FormLabel>
            <RadioGroup
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterOption)}
            >
              <FormControlLabel
                value="all"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">All spots on this micrograph</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {spots.length} spots total
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="unclassified"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Unclassified spots only</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {spots.length - classifiedCount} of {spots.length} spots
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          <Divider sx={{ my: 2 }} />

          {/* Sort order */}
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <InputLabel>Sort order</InputLabel>
            <Select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOption)}
              label="Sort order"
            >
              <MenuItem value="spatial">
                <Box>
                  <Typography variant="body2">Spatial (left-to-right, top-to-bottom)</Typography>
                </Box>
              </MenuItem>
              <MenuItem value="size">
                <Box>
                  <Typography variant="body2">By size (largest first)</Typography>
                </Box>
              </MenuItem>
              <MenuItem value="creation">
                <Box>
                  <Typography variant="body2">By creation time</Typography>
                </Box>
              </MenuItem>
              <MenuItem value="random">
                <Box>
                  <Typography variant="body2">Random order</Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Preview */}
          {filteredSpotCount === 0 ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              No spots match the selected filter.
              {filter === 'unclassified' && ' All spots have already been classified.'}
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }} icon={false}>
              <Typography variant="body2">
                <strong>{filteredSpotCount}</strong> spots will be included in this session.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Use arrow keys to navigate, letter keys to classify, Delete to remove.
              </Typography>
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleStart}
          variant="contained"
          disabled={filteredSpotCount === 0}
        >
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default QuickEditEntryDialog;
