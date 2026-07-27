/**
 * Edit Spot Dialog
 *
 * Allows editing of spot properties including name, colors, opacity, and label visibility.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Slider,
} from '@mui/material';
import { MuiColorInput } from 'mui-color-input';
import { useAppStore } from '@/store';
import { findSpotById } from '@/store/helpers';
import { legacyColorToHex, hexToLegacyColor } from '@/utils/colorUtils';
import { PresetSelector } from '../../PresetSelector';

interface EditSpotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  spotId: string;
}

export function EditSpotDialog({ isOpen, onClose, spotId }: EditSpotDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateSpotData = useAppStore((state) => state.updateSpotData);
  const applyPresetToSpot = useAppStore((state) => state.applyPresetToSpot);
  const getPresetById = useAppStore((state) => state.getPresetById);

  const spot = project ? findSpotById(project, spotId) : null;

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [labelColor, setLabelColor] = useState('#ffffff'); // Default to white for better readability with background box
  const [spotColor, setSpotColor] = useState('#00ff00');
  const [opacity, setOpacity] = useState(50);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

  // Load spot data when dialog opens
  useEffect(() => {
    if (spot) {
      setName(spot.name || '');
      setNotes(spot.notes || '');
      setLabelColor(legacyColorToHex(spot.labelColor, '#ffffff'));
      setSpotColor(legacyColorToHex(spot.color));
      setOpacity(spot.opacity ?? 50);
    }
  }, [spot]);

  // Reset preset selection each time the dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPresetIds([]);
    }
  }, [isOpen]);

  // Selecting a preset prefills the appearance controls (which the user can
  // still override — whatever is in the controls at save time wins)
  const handlePresetSelectionChange = (presetIds: string[]) => {
    const newlyAdded = presetIds.filter((id) => !selectedPresetIds.includes(id));
    for (const id of newlyAdded) {
      const preset = getPresetById(id);
      if (preset?.data.color) {
        setSpotColor(legacyColorToHex(preset.data.color));
      }
      if (preset?.data.opacity != null) {
        setOpacity(preset.data.opacity);
      }
    }
    setSelectedPresetIds(presetIds);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Spot name is required');
      return;
    }

    // Apply newly selected presets first (additive merge, store dedups),
    // then write the control values — controls win over preset appearance
    for (const presetId of selectedPresetIds) {
      applyPresetToSpot(presetId, spotId);
    }

    updateSpotData(spotId, {
      name: name.trim(),
      notes: notes.trim() || '',
      labelColor: hexToLegacyColor(labelColor),
      color: hexToLegacyColor(spotColor),
      opacity,
      modifiedTimestamp: Date.now(),
    });

    onClose();
  };

  if (!spot) return null;

  const isValid = name.trim().length > 0;

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Spot</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Name */}
          <TextField
            label="Spot Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoFocus
          />

          {/* Notes */}
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />

          {/* Quick Spot Presets (hidden when none exist) */}
          <PresetSelector
            selectedPresetIds={selectedPresetIds}
            onChange={handlePresetSelectionChange}
            appliedPresetIds={spot.appliedPresetIds ?? undefined}
          />

          {/* Label Color - Commented out for now, defaulting to white for better readability */}
          {/* <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Label Color
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map(
                (color) => (
                  <Box
                    key={color}
                    onClick={() => setLabelColor(color)}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: color,
                      border: labelColor === color ? '3px solid #1976d2' : '1px solid #ccc',
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { opacity: 0.8 },
                    }}
                  />
                )
              )}
            </Box>
          </Box> */}

          {/* Spot Color */}
          <MuiColorInput
            label="Spot Color"
            value={spotColor}
            onChange={(newColor) => setSpotColor(newColor)}
            format="hex"
            fullWidth
            sx={{ '& input': { caretColor: 'transparent', cursor: 'pointer' } }}
            onKeyDown={(e) => e.preventDefault()}
          />

          {/* Opacity */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Opacity: {opacity}%
            </Typography>
            <Slider
              value={opacity}
              onChange={(_, value) => setOpacity(value as number)}
              min={0}
              max={100}
              step={5}
              marks={[
                { value: 0, label: '0%' },
                { value: 50, label: '50%' },
                { value: 100, label: '100%' },
              ]}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!isValid}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
