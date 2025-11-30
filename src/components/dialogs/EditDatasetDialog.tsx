/**
 * Edit Dataset Dialog
 *
 * Dialog for editing an existing dataset's metadata.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
} from '@mui/material';
import { useAppStore } from '@/store';

interface EditDatasetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
}

export function EditDatasetDialog({ isOpen, onClose, datasetId }: EditDatasetDialogProps) {
  const [datasetName, setDatasetName] = useState('');

  const project = useAppStore((state) => state.project);
  const updateDataset = useAppStore((state) => state.updateDataset);

  // Load current dataset data
  useEffect(() => {
    if (!project || !isOpen) return;

    const dataset = project.datasets?.find(d => d.id === datasetId);
    if (dataset) {
      setDatasetName(dataset.name || '');
    }
  }, [project, datasetId, isOpen]);

  const handleSave = () => {
    if (!datasetName.trim() || !project) {
      return;
    }

    // Find the dataset
    const dataset = project.datasets?.find(d => d.id === datasetId);
    if (!dataset) return;

    // Update dataset with new values
    const updatedDataset = {
      ...dataset,
      name: datasetName.trim(),
    };

    updateDataset(datasetId, updatedDataset);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    const dataset = project?.datasets?.find(d => d.id === datasetId);
    if (dataset) {
      setDatasetName(dataset.name || '');
    }
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
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Edit Dataset</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 2 }}>
          <TextField
            label="Dataset Name"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            required
            fullWidth
            autoFocus
            placeholder="e.g., Field Season 2024"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!datasetName.trim()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
