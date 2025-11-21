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
  Grid,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { MicrographMetadata } from '@/types/project-types';
import { findMicrographById } from '@/store/helpers';

interface MicrographInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string;
}

export function MicrographInfoDialog({ isOpen, onClose, micrographId }: MicrographInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  const [formData, setFormData] = useState<Partial<MicrographMetadata>>({
    name: '',
    micronPerPixel: undefined,
    scalePixelsPerCentimeter: undefined,
  });

  // Load existing micrograph data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const micrograph = findMicrographById(project, micrographId);
    console.log('[MicrographInfoDialog] Loading data for micrograph:', micrographId, micrograph);

    if (micrograph) {
      setFormData({
        name: micrograph.name,
        micronPerPixel: micrograph.micronPerPixel,
        scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter,
      });
    }
  }, [isOpen, micrographId, project]);

  const handleSave = () => {
    updateMicrographMetadata(micrographId, formData);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    const micrograph = findMicrographById(project, micrographId);
    if (micrograph) {
      setFormData({
        name: micrograph.name,
        micronPerPixel: micrograph.micronPerPixel,
        scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter,
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
        field === 'micronPerPixel' || field === 'scalePixelsPerCentimeter'
          ? value === ''
            ? undefined
            : parseFloat(value)
          : value,
    }));
  };

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Micrograph Information</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                autoFocus
                fullWidth
                label="Micrograph Name"
                value={formData.name || ''}
                onChange={handleChange('name')}
                required
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Microns per Pixel"
                type="number"
                value={formData.micronPerPixel ?? ''}
                onChange={handleChange('micronPerPixel')}
                inputProps={{ step: 'any', min: 0 }}
                helperText="Scale calibration (μm/pixel)"
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Pixels per Centimeter"
                type="number"
                value={formData.scalePixelsPerCentimeter ?? ''}
                onChange={handleChange('scalePixelsPerCentimeter')}
                inputProps={{ step: 'any', min: 0 }}
                helperText="Alternative scale measurement (pixels/cm)"
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
