/**
 * Edit Sample Dialog
 *
 * Dialog for editing an existing sample's metadata.
 * Uses the same fields as NewSampleDialog but pre-populates with existing data.
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
  Divider,
} from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { LinkSampleDialog, mapServerSampleToLocal } from './LinkSampleDialog';
import type { SampleMetadata } from '@/types/project-types';

interface EditSampleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sample: SampleMetadata | null;
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

export function EditSampleDialog({ isOpen, onClose, sample }: EditSampleDialogProps) {
  const [formData, setFormData] = useState<SampleFormData>(initialFormData);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkedSampleId, setLinkedSampleId] = useState<string | null>(null);
  const [linkedSampleData, setLinkedSampleData] = useState<Partial<SampleMetadata> | null>(null);
  const [shouldUnlink, setShouldUnlink] = useState(false);

  const updateSample = useAppStore((state) => state.updateSample);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Track if sample is already linked to server (and not being unlinked)
  const isAlreadyLinked = sample?.existsOnServer === true && !shouldUnlink;

  // Load sample data when dialog opens
  useEffect(() => {
    if (isOpen && sample) {
      setFormData({
        sampleID: sample.sampleID || sample.name || '',
        igsn: sample.igsn || '',
        longitude: sample.longitude?.toString() || '',
        latitude: sample.latitude?.toString() || '',
        mainSamplingPurpose: sample.mainSamplingPurpose || '',
        otherSamplingPurpose: sample.otherSamplingPurpose || '',
        sampleDescription: sample.sampleDescription || '',
        materialType: sample.materialType || '',
        otherMaterialType: sample.otherMaterialType || '',
        sampleNotes: sample.sampleNotes || '',
      });
      // Reset linked sample state
      setLinkedSampleId(null);
      setLinkedSampleData(null);
      setShouldUnlink(false);
    }
  }, [isOpen, sample]);

  const handleLinkedSampleSelect = (serverSample: Parameters<typeof mapServerSampleToLocal>[0]) => {
    const mappedData = mapServerSampleToLocal(serverSample);

    // Store the linked sample ID and data
    setLinkedSampleId(mappedData.id);
    setLinkedSampleData(mappedData);
    setShouldUnlink(false); // Clear unlink flag when linking to a new sample

    // Populate form fields with server data
    // Use fallback to "Sample {id}" to match LinkSampleDialog display behavior

    // Handle mainSamplingPurpose - check if it's a known dropdown value
    const validSamplingPurposes = ['fabric___micro', 'petrology', 'geochronology', 'geochemistry', 'active_eruptio'];
    const serverPurpose = mappedData.mainSamplingPurpose || '';
    let mainSamplingPurpose = '';
    let otherSamplingPurpose = '';
    if (validSamplingPurposes.includes(serverPurpose)) {
      mainSamplingPurpose = serverPurpose;
    } else if (serverPurpose && serverPurpose !== 'other') {
      // Server has a custom value not in dropdown - treat as "other"
      mainSamplingPurpose = 'other';
      otherSamplingPurpose = serverPurpose;
    }
    // If serverPurpose is empty or exactly 'other', leave both empty (user must select)

    // Handle materialType - same logic
    const validMaterialTypes = ['intact_rock', 'fragmented_roc', 'sediment', 'tephra', 'carbon_or_animal'];
    const serverMaterial = mappedData.materialType || '';
    let materialType = '';
    let otherMaterialType = '';
    if (validMaterialTypes.includes(serverMaterial)) {
      materialType = serverMaterial;
    } else if (serverMaterial && serverMaterial !== 'other') {
      // Server has a custom value not in dropdown - treat as "other"
      materialType = 'other';
      otherMaterialType = serverMaterial;
    }
    // If serverMaterial is empty or exactly 'other', leave both empty (user must select)

    setFormData({
      sampleID: mappedData.sampleID || mappedData.label || `Sample ${mappedData.id}`,
      igsn: mappedData.igsn || '',
      longitude: mappedData.longitude?.toString() || '',
      latitude: mappedData.latitude?.toString() || '',
      mainSamplingPurpose,
      otherSamplingPurpose,
      sampleDescription: mappedData.sampleDescription || '',
      materialType,
      otherMaterialType,
      sampleNotes: mappedData.sampleNotes || '',
    });
  };

  const handleUnlink = () => {
    setShouldUnlink(true);
    setLinkedSampleId(null);
    setLinkedSampleData(null);
  };

  const updateField = (field: keyof SampleFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLongitudeChange = (value: string) => {
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
    if (!formData.sampleID.trim()) {
      return false;
    }

    if (
      formData.mainSamplingPurpose === 'other' &&
      !formData.otherSamplingPurpose.trim()
    ) {
      return false;
    }

    if (
      formData.materialType === 'other' &&
      !formData.otherMaterialType.trim()
    ) {
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateForm() || !sample) {
      return;
    }

    const updates: Partial<SampleMetadata> = {
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
      // Update the sample ID to the server's ID when linking
      ...(linkedSampleId && {
        id: linkedSampleId,
      }),
      // Handle unlinking - restore a new UUID and clear server flag
      ...(shouldUnlink && {
        id: crypto.randomUUID(),
        existsOnServer: false,
      }),
    };

    updateSample(sample.id, updates);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          return;
        }
        handleCancel();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Edit Sample</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={3}>
            {/* Link/Unlink Sample From StraboField - only visible when logged in */}
            {isAuthenticated && (
              <>
                {/* Show current linked status */}
                {isAlreadyLinked && !linkedSampleId && (
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'success.main',
                      color: 'success.contrastText',
                      borderRadius: 1,
                      textAlign: 'center',
                    }}
                  >
                    Linked to StraboField (ID: {sample?.id})
                  </Box>
                )}

                {/* Show pending link status */}
                {linkedSampleId && (
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      borderRadius: 1,
                      textAlign: 'center',
                    }}
                  >
                    Will link to server sample (ID: {linkedSampleId})
                  </Box>
                )}

                {/* Show pending unlink status */}
                {shouldUnlink && (
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      borderRadius: 1,
                      textAlign: 'center',
                    }}
                  >
                    Will unlink from StraboField (new UUID will be assigned)
                  </Box>
                )}

                {/* Link/Re-link button */}
                <Button
                  variant="outlined"
                  startIcon={<LinkIcon />}
                  onClick={() => setShowLinkDialog(true)}
                  fullWidth
                >
                  {isAlreadyLinked ? 'Link to Different Sample' : 'Link Sample From StraboField'}
                </Button>

                {/* Unlink button - only show if already linked and not already pending unlink */}
                {(isAlreadyLinked || linkedSampleId) && !shouldUnlink && (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={handleUnlink}
                    fullWidth
                  >
                    Unlink from StraboField
                  </Button>
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
          Save Changes
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
