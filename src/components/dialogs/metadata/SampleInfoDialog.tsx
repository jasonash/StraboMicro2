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
  MenuItem,
  Box,
  Stack,
} from '@mui/material';
import { useAppStore } from '@/store';
import { SampleMetadata } from '@/types/project-types';

interface SampleInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string;
}

interface SampleFormData {
  sampleID: string;
  longitude: string;
  latitude: string;
  mainSamplingPurpose: string;
  otherSamplingPurpose: string;
  sampleDescription: string;
  materialType: string;
  otherMaterialType: string;
  sampleNotes: string;
}

export function SampleInfoDialog({ isOpen, onClose, sampleId }: SampleInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateSample = useAppStore((state) => state.updateSample);

  const [formData, setFormData] = useState<SampleFormData>({
    sampleID: '',
    longitude: '',
    latitude: '',
    mainSamplingPurpose: '',
    otherSamplingPurpose: '',
    sampleDescription: '',
    materialType: '',
    otherMaterialType: '',
    sampleNotes: '',
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
        sampleID: sample.sampleID || '',
        longitude: sample.longitude !== undefined ? String(sample.longitude) : '',
        latitude: sample.latitude !== undefined ? String(sample.latitude) : '',
        mainSamplingPurpose: sample.mainSamplingPurpose || '',
        otherSamplingPurpose: sample.otherSamplingPurpose || '',
        sampleDescription: sample.sampleDescription || '',
        materialType: sample.materialType || '',
        otherMaterialType: sample.otherMaterialType || '',
        sampleNotes: sample.sampleNotes || '',
      });
    }
  }, [isOpen, sampleId, project]);

  const updateField = (field: keyof SampleFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLongitudeChange = (value: string) => {
    // Allow empty, minus sign, or valid number
    if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
      const num = parseFloat(value);
      if (
        value === '' ||
        value === '-' ||
        (num >= -180 && num <= 180) ||
        isNaN(num)
      ) {
        updateField('longitude', value);
      }
    }
  };

  const handleLatitudeChange = (value: string) => {
    // Allow empty, minus sign, or valid number
    if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
      const num = parseFloat(value);
      if (
        value === '' ||
        value === '-' ||
        (num >= -90 && num <= 90) ||
        isNaN(num)
      ) {
        updateField('latitude', value);
      }
    }
  };

  const validateForm = (): boolean => {
    // Sample ID is required
    if (!formData.sampleID.trim()) {
      return false;
    }

    // If "other" is selected for Main Sampling Purpose, require text
    if (
      formData.mainSamplingPurpose === 'other' &&
      !formData.otherSamplingPurpose.trim()
    ) {
      return false;
    }

    // If "other" is selected for Material Type, require text
    if (
      formData.materialType === 'other' &&
      !formData.otherMaterialType.trim()
    ) {
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    // Build update object with proper types
    const updates: Partial<SampleMetadata> = {
      name: formData.sampleID.trim(),
      label: formData.sampleID.trim(),
      sampleID: formData.sampleID.trim(),
      longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      mainSamplingPurpose: formData.mainSamplingPurpose || undefined,
      otherSamplingPurpose: formData.otherSamplingPurpose || undefined,
      sampleDescription: formData.sampleDescription || undefined,
      materialType: formData.materialType || undefined,
      otherMaterialType: formData.otherMaterialType || undefined,
      sampleNotes: formData.sampleNotes || undefined,
    };

    updateSample(sampleId, updates);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    const sample = findSample();
    if (sample) {
      setFormData({
        sampleID: sample.sampleID || '',
        longitude: sample.longitude !== undefined ? String(sample.longitude) : '',
        latitude: sample.latitude !== undefined ? String(sample.latitude) : '',
        mainSamplingPurpose: sample.mainSamplingPurpose || '',
        otherSamplingPurpose: sample.otherSamplingPurpose || '',
        sampleDescription: sample.sampleDescription || '',
        materialType: sample.materialType || '',
        otherMaterialType: sample.otherMaterialType || '',
        sampleNotes: sample.sampleNotes || '',
      });
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Sample Information</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={3}>
            <TextField
              label="Sample ID"
              value={formData.sampleID}
              onChange={(e) => updateField('sampleID', e.target.value)}
              required
              fullWidth
              autoFocus
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Longitude"
                placeholder="-180 to 180"
                value={formData.longitude}
                onChange={(e) => handleLongitudeChange(e.target.value)}
                helperText="Valid range: -180 to 180"
                fullWidth
              />
              <TextField
                label="Latitude"
                placeholder="-90 to 90"
                value={formData.latitude}
                onChange={(e) => handleLatitudeChange(e.target.value)}
                helperText="Valid range: -90 to 90"
                fullWidth
              />
            </Stack>

            <TextField
              select
              label="Main Sampling Purpose"
              value={formData.mainSamplingPurpose}
              onChange={(e) => {
                updateField('mainSamplingPurpose', e.target.value);
                // Clear "Other Sampling Purpose" if user selects non-"other" option
                if (e.target.value !== 'other') {
                  updateField('otherSamplingPurpose', '');
                }
              }}
              fullWidth
            >
              <MenuItem value="">Select Main Sampling Purpose...</MenuItem>
              <MenuItem value="fabric___micro">Fabric / Microstructure</MenuItem>
              <MenuItem value="petrology">Petrology</MenuItem>
              <MenuItem value="geochronology">Geochronology</MenuItem>
              <MenuItem value="geochemistry">Geochemistry</MenuItem>
              <MenuItem value="active_eruptio">Active Eruption</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>

            {formData.mainSamplingPurpose === 'other' && (
              <TextField
                label="Other Sampling Purpose"
                value={formData.otherSamplingPurpose}
                onChange={(e) => updateField('otherSamplingPurpose', e.target.value)}
                required
                helperText="Required when 'Other' is selected"
                fullWidth
              />
            )}

            <TextField
              label="Sample Description"
              value={formData.sampleDescription}
              onChange={(e) => updateField('sampleDescription', e.target.value)}
              fullWidth
            />

            <TextField
              select
              label="Material Type"
              value={formData.materialType}
              onChange={(e) => {
                updateField('materialType', e.target.value);
                // Clear "Other Material Type" if user selects non-"other" option
                if (e.target.value !== 'other') {
                  updateField('otherMaterialType', '');
                }
              }}
              fullWidth
            >
              <MenuItem value="">Select Material Type...</MenuItem>
              <MenuItem value="intact_rock">Intact Rock</MenuItem>
              <MenuItem value="fragmented_roc">Fragmented Rock</MenuItem>
              <MenuItem value="sediment">Sediment</MenuItem>
              <MenuItem value="tephra">Tephra</MenuItem>
              <MenuItem value="carbon_or_animal">Carbon or Animal</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>

            {formData.materialType === 'other' && (
              <TextField
                label="Other Material Type"
                value={formData.otherMaterialType}
                onChange={(e) => updateField('otherMaterialType', e.target.value)}
                required
                helperText="Required when 'Other' is selected"
                fullWidth
              />
            )}

            <TextField
              label="Sample Notes"
              value={formData.sampleNotes}
              onChange={(e) => updateField('sampleNotes', e.target.value)}
              multiline
              rows={4}
              fullWidth
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!validateForm()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
