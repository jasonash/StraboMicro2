/**
 * New Sample Dialog
 *
 * Dialog for creating a new sample within a dataset.
 * Requires a dataset ID to know where to add the sample.
 */

import { useState } from 'react';
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
  Divider,
} from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { LinkSampleDialog, mapServerSampleToLocal } from './LinkSampleDialog';
import type { SampleMetadata } from '@/types/project-types';

interface NewSampleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string | null; // Dataset to add sample to
}

interface SampleFormData {
  sampleID: string;
  igsn: string;
  longitude: string;
  latitude: string;
  mainSamplingPurpose: string;
  otherSamplingPurpose: string;
  sampleDescription: string;
  materialType: string;
  otherMaterialType: string;
  sampleNotes: string;
}

const initialFormData: SampleFormData = {
  sampleID: '',
  igsn: '',
  longitude: '',
  latitude: '',
  mainSamplingPurpose: '',
  otherSamplingPurpose: '',
  sampleDescription: '',
  materialType: '',
  otherMaterialType: '',
  sampleNotes: '',
};

export function NewSampleDialog({ isOpen, onClose, datasetId }: NewSampleDialogProps) {
  const [formData, setFormData] = useState<SampleFormData>(initialFormData);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkedSampleId, setLinkedSampleId] = useState<string | null>(null);
  const [linkedSampleData, setLinkedSampleData] = useState<Partial<SampleMetadata> | null>(null);

  const addSample = useAppStore((state) => state.addSample);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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

  const handleLinkedSampleSelect = (serverSample: Parameters<typeof mapServerSampleToLocal>[0]) => {
    const mappedData = mapServerSampleToLocal(serverSample);

    // Store the linked sample ID and data
    setLinkedSampleId(mappedData.id);
    setLinkedSampleData(mappedData);

    // Populate form fields with server data
    setFormData({
      sampleID: mappedData.sampleID || mappedData.label || '',
      igsn: mappedData.igsn || '',
      longitude: mappedData.longitude?.toString() || '',
      latitude: mappedData.latitude?.toString() || '',
      mainSamplingPurpose: mappedData.mainSamplingPurpose || '',
      otherSamplingPurpose: '',
      sampleDescription: mappedData.sampleDescription || '',
      materialType: mappedData.materialType || '',
      otherMaterialType: '',
      sampleNotes: mappedData.sampleNotes || '',
    });
  };

  const handleCreate = () => {
    if (!validateForm() || !datasetId) {
      return;
    }

    // Create sample structure
    // Use linked sample ID if available, otherwise generate new UUID
    const sample: SampleMetadata = {
      id: linkedSampleId || crypto.randomUUID(),
      name: formData.sampleID.trim(),
      label: formData.sampleID.trim(),
      sampleID: formData.sampleID.trim(),
      igsn: formData.igsn.trim() || undefined,
      longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      mainSamplingPurpose: formData.mainSamplingPurpose || undefined,
      otherSamplingPurpose: formData.otherSamplingPurpose || undefined,
      sampleDescription: formData.sampleDescription || undefined,
      materialType: formData.materialType || undefined,
      otherMaterialType: formData.otherMaterialType || undefined,
      sampleNotes: formData.sampleNotes || undefined,
      // Include additional fields from linked sample
      ...(linkedSampleData && {
        existsOnServer: true,
        inplacenessOfSample: linkedSampleData.inplacenessOfSample,
        orientedSample: linkedSampleData.orientedSample,
        sampleOrientationNotes: linkedSampleData.sampleOrientationNotes,
        sampleSize: linkedSampleData.sampleSize,
        degreeOfWeathering: linkedSampleData.degreeOfWeathering,
        color: linkedSampleData.color,
        lithology: linkedSampleData.lithology,
        sampleUnit: linkedSampleData.sampleUnit,
        sampleType: linkedSampleData.sampleType,
      }),
      micrographs: [],
    };

    // Add to dataset
    addSample(datasetId, sample);

    // Reset form and close
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setLinkedSampleId(null);
    setLinkedSampleData(null);
  };

  const handleCancel = () => {
    resetForm();
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
      <DialogTitle>New Sample</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={3}>
            {/* Link Sample From StraboField - only visible when logged in */}
            {isAuthenticated && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<LinkIcon />}
                  onClick={() => setShowLinkDialog(true)}
                  fullWidth
                >
                  Link Sample From StraboField
                </Button>
                {linkedSampleId && (
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'success.main',
                      color: 'success.contrastText',
                      borderRadius: 1,
                      textAlign: 'center',
                    }}
                  >
                    Linked to server sample (ID: {linkedSampleId})
                  </Box>
                )}
                <Divider />
              </>
            )}

            <TextField
              label="Sample ID"
              value={formData.sampleID}
              onChange={(e) => updateField('sampleID', e.target.value)}
              required
              fullWidth
              autoFocus
            />

            <TextField
              label="IGSN"
              value={formData.igsn}
              onChange={(e) => updateField('igsn', e.target.value)}
              placeholder="e.g., IEMEG0001"
              helperText="International Geo Sample Number"
              fullWidth
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
          onClick={handleCreate}
          variant="contained"
          disabled={!validateForm()}
        >
          Create Sample
        </Button>
      </DialogActions>

      {/* Link Sample Dialog */}
      <LinkSampleDialog
        open={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSelectSample={handleLinkedSampleSelect}
      />
    </Dialog>
  );
}
