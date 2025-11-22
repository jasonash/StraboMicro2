/**
 * Grain Size Dialog Component
 *
 * Dialog for editing grain size data including mean, median, mode, and standard deviation.
 * Matches legacy editGrainSize.fxml layout.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PhaseSelector } from './reusable/PhaseSelector';
import { UnitInput } from './reusable/UnitInput';

interface GrainSizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface GrainSizeData {
  selectedPhases: string[];
  mean: number | '';
  median: number | '';
  mode: number | '';
  standardDeviation: number | '';
  sizeUnit: string;
}

const SIZE_UNITS = ['μm', 'mm', 'cm', 'm'];

export function GrainSizeDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: GrainSizeDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<GrainSizeData>({
    selectedPhases: [],
    mean: '',
    median: '',
    mode: '',
    standardDeviation: '',
    sizeUnit: 'μm',
  });

  // TODO: Get available phases from sample mineralogy
  const availablePhases: string[] = [];

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual grain size data from micrograph or spot
    setFormData({
      selectedPhases: [],
      mean: '',
      median: '',
      mode: '',
      standardDeviation: '',
      sizeUnit: 'μm',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save grain size data to store
    console.log('Saving grain size data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Grain Size'
    : spotId
      ? 'Spot Grain Size'
      : 'Grain Size';

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

          <Grid container spacing={2}>
            <Grid size={6}>
              <UnitInput
                value={formData.mean}
                unit={formData.sizeUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, mean: value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                units={SIZE_UNITS}
                label="Mean"
                min={0}
              />
            </Grid>
            <Grid size={6}>
              <UnitInput
                value={formData.median}
                unit={formData.sizeUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, median: value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                units={SIZE_UNITS}
                label="Median"
                min={0}
              />
            </Grid>
            <Grid size={6}>
              <UnitInput
                value={formData.mode}
                unit={formData.sizeUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, mode: value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                units={SIZE_UNITS}
                label="Mode"
                min={0}
              />
            </Grid>
            <Grid size={6}>
              <UnitInput
                value={formData.standardDeviation}
                unit={formData.sizeUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, standardDeviation: value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                units={SIZE_UNITS}
                label="Standard Deviation"
                min={0}
              />
            </Grid>
          </Grid>
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
