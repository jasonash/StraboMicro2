/**
 * Grain Orientation Dialog Component
 *
 * Dialog for editing grain orientation/SPO data including technique and software.
 * Matches legacy editGrainOrientation.fxml layout.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PhaseSelector } from './reusable/PhaseSelector';
import { OtherTextField } from './reusable/OtherTextField';

interface GrainOrientationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface GrainOrientationData {
  selectedPhases: string[];
  meanOrientation: number | '';
  relativeToReference: string;
  software: string;
  method: string;
  methodOther: string;
}

const RELATIVE_TO_OPTIONS = [
  'North',
  'Sample Edge',
  'Foliation',
  'Lineation',
];

const SPO_METHODS = [
  'Tensor Method',
  'Intercept Method',
  'Best Fit Ellipse',
  'Manual',
];

export function GrainOrientationDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: GrainOrientationDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<GrainOrientationData>({
    selectedPhases: [],
    meanOrientation: '',
    relativeToReference: '',
    software: '',
    method: '',
    methodOther: '',
  });

  // TODO: Get available phases from sample mineralogy
  const availablePhases: string[] = [];

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual grain orientation data from micrograph or spot
    setFormData({
      selectedPhases: [],
      meanOrientation: '',
      relativeToReference: '',
      software: '',
      method: '',
      methodOther: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save grain orientation data to store
    console.log('Saving grain orientation data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const handleMethodChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const method = event.target.value;
    setFormData(prev => ({
      ...prev,
      method,
      methodOther: method === 'Other' ? prev.methodOther : '',
    }));
  };

  const title = micrographId
    ? 'Micrograph Grain Orientation'
    : spotId
      ? 'Spot Grain Orientation'
      : 'Grain Orientation';

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

          <TextField
            fullWidth
            type="number"
            label="Mean Orientation (degrees)"
            value={formData.meanOrientation}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              meanOrientation: e.target.value === '' ? '' : parseFloat(e.target.value),
            }))}
            inputProps={{ step: 0.1 }}
          />

          <OtherTextField
            options={RELATIVE_TO_OPTIONS}
            value={formData.relativeToReference}
            onChange={(value) => setFormData(prev => ({ ...prev, relativeToReference: value }))}
            label="Relative to"
          />

          <TextField
            fullWidth
            label="Software"
            value={formData.software}
            onChange={(e) => setFormData(prev => ({ ...prev, software: e.target.value }))}
            helperText="Software used for SPO analysis"
          />

          <FormControl component="fieldset">
            <FormLabel component="legend">SPO Technique / Method</FormLabel>
            <RadioGroup value={formData.method} onChange={handleMethodChange}>
              {SPO_METHODS.map((method) => (
                <FormControlLabel
                  key={method}
                  value={method}
                  control={<Radio />}
                  label={method}
                />
              ))}
              <FormControlLabel value="Other" control={<Radio />} label="Other" />
            </RadioGroup>
            {formData.method === 'Other' && (
              <TextField
                fullWidth
                label="Please specify"
                value={formData.methodOther}
                onChange={(e) => setFormData(prev => ({ ...prev, methodOther: e.target.value }))}
                sx={{ mt: 1 }}
              />
            )}
          </FormControl>
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
