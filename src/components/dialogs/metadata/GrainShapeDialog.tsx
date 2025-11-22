/**
 * Grain Shape Dialog Component
 *
 * Dialog for editing grain shape data with phase selection.
 * Matches legacy editGrainShape.fxml layout.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PhaseSelector } from './reusable/PhaseSelector';
import { OtherTextField } from './reusable/OtherTextField';

interface GrainShapeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface GrainShapeData {
  selectedPhases: string[];
  shape: string;
}

const SHAPE_OPTIONS = [
  'Equant',
  'Elongate',
  'Tabular',
  'Platy',
  'Acicular',
  'Prismatic',
  'Anhedral',
  'Subhedral',
  'Euhedral',
];

export function GrainShapeDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: GrainShapeDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<GrainShapeData>({
    selectedPhases: [],
    shape: '',
  });

  // TODO: Get available phases from sample mineralogy
  const availablePhases: string[] = [];

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual grain shape data from micrograph or spot
    setFormData({
      selectedPhases: [],
      shape: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save grain shape data to store
    console.log('Saving grain shape data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Grain Shape'
    : spotId
      ? 'Spot Grain Shape'
      : 'Grain Shape';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <PhaseSelector
            availablePhases={availablePhases}
            selectedPhases={formData.selectedPhases}
            onChange={(phases) => setFormData(prev => ({ ...prev, selectedPhases: phases }))}
          />

          <OtherTextField
            options={SHAPE_OPTIONS}
            value={formData.shape}
            onChange={(value) => setFormData(prev => ({ ...prev, shape: value }))}
            label="Shape"
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
