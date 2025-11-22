/**
 * Sample Info Dialog Component
 *
 * Dialog for editing sample metadata including name, location, and basic properties.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { SampleMetadata } from '@/types/project-types';

interface SampleInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string;
}

export function SampleInfoDialog({ isOpen, onClose, sampleId }: SampleInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateSample = useAppStore((state) => state.updateSample);

  const [formData, setFormData] = useState<Partial<SampleMetadata>>({
    name: '',
    label: '',
    sampleID: '',
    longitude: undefined,
    latitude: undefined,
    sampleDescription: '',
  });

  // Find the sample in the project
  const findSample = (): SampleMetadata | undefined => {
    if (!project) return undefined;
    for (const dataset of project.datasets || []) {
      const sample = dataset.samples?.find((s) => s.id === sampleId);
      if (sample) return sample;
    }
    return undefined;
  };

  // Load existing sample data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const sample = findSample();
    if (sample) {
      setFormData({
        name: sample.name,
        label: sample.label || '',
        sampleID: sample.sampleID || '',
        longitude: sample.longitude,
        latitude: sample.latitude,
        sampleDescription: sample.sampleDescription || '',
      });
    }
  }, [isOpen, sampleId, project]);

  const handleSave = () => {
    updateSample(sampleId, formData);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    const sample = findSample();
    if (sample) {
      setFormData({
        name: sample.name,
        label: sample.label || '',
        sampleID: sample.sampleID || '',
        longitude: sample.longitude,
        latitude: sample.latitude,
        sampleDescription: sample.sampleDescription || '',
      });
    }
    onClose();
  };

  const handleChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      [field]:
        field === 'longitude' || field === 'latitude'
          ? value === ''
            ? undefined
            : parseFloat(value)
          : value,
    }));
  };

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>Sample Information</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                autoFocus
                fullWidth
                label="Sample Name"
                value={formData.name || ''}
                onChange={handleChange('name')}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Sample Label"
                value={formData.label || ''}
                onChange={handleChange('label')}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Sample ID"
                value={formData.sampleID || ''}
                onChange={handleChange('sampleID')}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Longitude"
                type="number"
                value={formData.longitude ?? ''}
                onChange={handleChange('longitude')}
                inputProps={{ step: 'any' }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Latitude"
                type="number"
                value={formData.latitude ?? ''}
                onChange={handleChange('latitude')}
                inputProps={{ step: 'any' }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Sample Description"
                value={formData.sampleDescription || ''}
                onChange={handleChange('sampleDescription')}
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!formData.name}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
