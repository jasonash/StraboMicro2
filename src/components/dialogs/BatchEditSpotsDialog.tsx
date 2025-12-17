/**
 * BatchEditSpotsDialog Component
 *
 * Dialog for batch editing multiple selected spots.
 * Uses checkbox + field pattern - only checked fields are applied.
 *
 * Editable fields:
 * - Primary Mineral (mineralogy)
 * - Color
 * - Opacity
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
  Slider,
} from '@mui/material';
import { useAppStore } from '@/store';
import { AutocompleteMineralSearch } from './metadata/reusable/AutocompleteMineralSearch';

interface BatchEditSpotsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FieldState<T> {
  enabled: boolean;
  value: T;
}

// Default color and localStorage key for remembering last used color
const DEFAULT_COLOR = '#e53935'; // Nice red
const LAST_COLOR_KEY = 'strabomicro2-batch-edit-last-color';

function getLastUsedColor(): string {
  try {
    return localStorage.getItem(LAST_COLOR_KEY) || DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

function saveLastUsedColor(color: string): void {
  try {
    localStorage.setItem(LAST_COLOR_KEY, color);
  } catch {
    // Ignore localStorage errors
  }
}

export function BatchEditSpotsDialog({ isOpen, onClose }: BatchEditSpotsDialogProps) {
  const selectedSpotIds = useAppStore((state) => state.selectedSpotIds);
  const spotIndex = useAppStore((state) => state.spotIndex);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Field states with checkbox enable/disable
  const [mineral, setMineral] = useState<FieldState<string>>({
    enabled: false,
    value: '',
  });
  const [color, setColor] = useState<FieldState<string>>({
    enabled: false,
    value: DEFAULT_COLOR,
  });
  const [opacity, setOpacity] = useState<FieldState<number>>({
    enabled: false,
    value: 50,
  });

  // Reset form when dialog opens, using last used color
  useEffect(() => {
    if (isOpen) {
      setMineral({ enabled: false, value: '' });
      setColor({ enabled: false, value: getLastUsedColor() });
      setOpacity({ enabled: false, value: 50 });
    }
  }, [isOpen]);

  const handleApply = () => {
    // Build update object with only enabled fields
    const updates: Record<string, unknown> = {};

    if (mineral.enabled && mineral.value) {
      updates.mineralogy = {
        minerals: [
          {
            name: mineral.value,
            operator: 'eq',
            percentage: 100,
          },
        ],
      };
    }

    if (color.enabled) {
      updates.color = color.value;
      saveLastUsedColor(color.value);
    }

    if (opacity.enabled) {
      updates.opacity = opacity.value;
    }

    // Apply updates to all selected spots
    for (const spotId of selectedSpotIds) {
      const spot = spotIndex.get(spotId);
      if (spot) {
        // Merge updates with existing spot data
        const updatedSpot = { ...spot };

        if (updates.mineralogy) {
          updatedSpot.mineralogy = updates.mineralogy as typeof spot.mineralogy;
        }
        if (updates.color !== undefined) {
          updatedSpot.color = updates.color as string;
        }
        if (updates.opacity !== undefined) {
          updatedSpot.opacity = updates.opacity as number;
        }

        updateSpotData(spotId, updatedSpot);
      }
    }

    onClose();
  };

  const hasEnabledFields = mineral.enabled || color.enabled || opacity.enabled;

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit {selectedSpotIds.length} Spots
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check the fields you want to update. Only checked fields will be applied to all selected spots.
        </Typography>

        {/* Primary Mineral */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={mineral.enabled}
                onChange={(e) => setMineral((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Primary Mineral"
          />
          {mineral.enabled && (
            <Box sx={{ ml: 4, mt: 1 }}>
              <AutocompleteMineralSearch
                selectedMinerals={mineral.value ? [mineral.value] : []}
                onChange={(minerals) => setMineral((prev) => ({ ...prev, value: minerals[0] || '' }))}
                label="Mineral"
                multiple={false}
              />
            </Box>
          )}
        </Box>

        {/* Color */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={color.enabled}
                onChange={(e) => setColor((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Color"
          />
          {color.enabled && (
            <Box sx={{ ml: 4, mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input
                type="color"
                value={color.value}
                onChange={(e) => setColor((prev) => ({ ...prev, value: e.target.value }))}
                style={{
                  width: 60,
                  height: 36,
                  padding: 0,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              />
              <TextField
                value={color.value}
                onChange={(e) => setColor((prev) => ({ ...prev, value: e.target.value }))}
                size="small"
                sx={{ width: 100 }}
              />
            </Box>
          )}
        </Box>

        {/* Opacity */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={opacity.enabled}
                onChange={(e) => setOpacity((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Opacity"
          />
          {opacity.enabled && (
            <Box sx={{ ml: 4, mt: 1, pr: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                  value={opacity.value}
                  onChange={(_, value) => setOpacity((prev) => ({ ...prev, value: value as number }))}
                  min={0}
                  max={100}
                  valueLabelDisplay="auto"
                  sx={{ flex: 1 }}
                />
                <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                  {opacity.value}%
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={!hasEnabledFields}
        >
          Apply to {selectedSpotIds.length} Spots
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default BatchEditSpotsDialog;
