/**
 * Notes Dialog Component
 *
 * Simple text area dialog for capturing general notes about micrographs or spots.
 * This serves as the base pattern for other metadata dialogs.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById } from '@/store/helpers';

interface NotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function NotesDialog({ isOpen, onClose, micrographId, spotId }: NotesDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [notes, setNotes] = useState('');

  // Load existing notes when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      setNotes(micrograph?.notes || '');
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      setNotes(spot?.notes || '');
    }
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    if (micrographId) {
      updateMicrographMetadata(micrographId, { notes });
    } else if (spotId) {
      updateSpotData(spotId, { notes });
    }
    onClose();
  };

  const handleCancel = () => {
    // Reset to original value
    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      setNotes(micrograph?.notes || '');
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      setNotes(spot?.notes || '');
    }
    onClose();
  };

  const title = micrographId ? 'Micrograph Notes' : spotId ? 'Spot Notes' : 'Notes';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            autoFocus
            multiline
            rows={10}
            fullWidth
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter general notes or observations..."
            variant="outlined"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
