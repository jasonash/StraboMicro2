/**
 * New Dataset Dialog
 *
 * Simple dialog for creating a new dataset within a project.
 * Requires a project to be loaded.
 */

import { useState } from 'react';
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
import type { DatasetMetadata } from '@/types/project-types';

interface NewDatasetDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewDatasetDialog({ isOpen, onClose }: NewDatasetDialogProps) {
  const [datasetName, setDatasetName] = useState('');
  const project = useAppStore((state) => state.project);
  const addDataset = useAppStore((state) => state.addDataset);

  const handleCreate = () => {
    if (!datasetName.trim() || !project) {
      return;
    }

    // Create dataset structure
    const dataset: DatasetMetadata = {
      id: crypto.randomUUID(),
      name: datasetName.trim(),
      samples: [],
    };

    // Add to project
    addDataset(dataset);

    // Reset form and close
    setDatasetName('');
    onClose();
  };

  const handleCancel = () => {
    setDatasetName('');
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={(_event, reason) => {
        // Prevent closing via backdrop or ESC
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          return;
        }
        handleCancel();
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>New Dataset</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <TextField
            label="Dataset Name"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            required
            fullWidth
            autoFocus
            placeholder="e.g., Field Season 2024"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!datasetName.trim()}
        >
          Create Dataset
        </Button>
      </DialogActions>
    </Dialog>
  );
}
