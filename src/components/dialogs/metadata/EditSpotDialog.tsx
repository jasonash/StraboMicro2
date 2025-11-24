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
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { MuiColorInput } from 'mui-color-input';
import { useAppStore } from '@/store';
import { findSpotById } from '@/store/helpers';

interface EditSpotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  spotId: string;
}

export function EditSpotDialog({ isOpen, onClose, spotId }: EditSpotDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const spot = project ? findSpotById(project, spotId) : null;

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [labelColor, setLabelColor] = useState('#ffffff'); // Default to white for better readability with background box
  const [spotColor, setSpotColor] = useState('#00ff00');
  const [opacity, setOpacity] = useState(50);
  const [showLabel, setShowLabel] = useState(true);

  // Convert legacy color format (0xRRGGBBAA) to web format (#RRGGBB)
  const convertLegacyColorToWeb = (color: string | null | undefined): string => {
    if (!color) return '#00ff00';
    if (color.startsWith('#')) return color;
    if (color.startsWith('0x')) {
      const hex = color.slice(2, 8); // Take RRGGBB, ignore AA
      return '#' + hex;
    }
    return color;
  };

  // Convert web color format (#RRGGBB) to legacy format (0xRRGGBBFF)
  const convertWebColorToLegacy = (hexColor: string): string => {
    return '0x' + hexColor.slice(1) + 'ff';
  };

  // Load spot data when dialog opens
  useEffect(() => {
    if (spot) {
      setName(spot.name || '');
      setNotes(spot.notes || '');
      setLabelColor(convertLegacyColorToWeb(spot.labelColor));
      setSpotColor(convertLegacyColorToWeb(spot.color));
      setOpacity(spot.opacity ?? 50);
      setShowLabel(spot.showLabel ?? true);
    }
  }, [spot]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Spot name is required');
      return;
    }

    updateSpotData(spotId, {
      name: name.trim(),
      notes: notes.trim() || '',
      labelColor: convertWebColorToLegacy(labelColor),
      color: convertWebColorToLegacy(spotColor),
      opacity,
      showLabel,
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

          {/* Show Label */}
          <FormControlLabel
            control={<Checkbox checked={showLabel} onChange={(e) => setShowLabel(e.target.checked)} />}
            label="Show label on image"
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
