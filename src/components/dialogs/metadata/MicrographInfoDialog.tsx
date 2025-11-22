/**
 * Micrograph Info Dialog Component
 *
 * Dialog for editing micrograph metadata including name and scale information.
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
import { findMicrographById } from '@/store/helpers';

interface MicrographInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string;
}

export function MicrographInfoDialog({ isOpen, onClose, micrographId }: MicrographInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  const [name, setName] = useState('');

  // Load existing micrograph data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const micrograph = findMicrographById(project, micrographId);
    console.log('[MicrographInfoDialog] Loading data for micrograph:', micrographId, micrograph);

    if (micrograph) {
      setName(micrograph.name);
    }
  }, [isOpen, micrographId, project]);

  const handleSave = () => {
    updateMicrographMetadata(micrographId, { name });
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    const micrograph = findMicrographById(project, micrographId);
    if (micrograph) {
      setName(micrograph.name);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Micrograph Information</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="Micrograph Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
