/**
 * Fabrics Dialog Component
 *
 * Dialog for editing fabric data including type (foliation/lineation/fabric trace),
 * primary/secondary, penetrative/spaced, and what defines the fabric.
 * Matches legacy editFabric.fxml layout.
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
  Grid,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/store';
import { DynamicFieldSet } from './reusable/DynamicFieldSet';

interface FabricsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface FabricData {
  label: string;
  // Type: Foliation, Lineation, or Fabric Trace
  fabricType: string;
  // Primary or Secondary
  generation: string;
  // Penetrative or Spaced
  distribution: string;
  // Defined by
  definedByComposition: boolean;
  definedByGrainSize: boolean;
  definedByGrainShape: boolean;
  definedByCleavage: boolean;
}

export function FabricsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FabricsDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<FabricData>({
    label: '',
    fabricType: '',
    generation: '',
    distribution: '',
    definedByComposition: false,
    definedByGrainSize: false,
    definedByGrainShape: false,
    definedByCleavage: false,
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual fabric data from micrograph or spot
    setFormData({
      label: '',
      fabricType: '',
      generation: '',
      distribution: '',
      definedByComposition: false,
      definedByGrainSize: false,
      definedByGrainShape: false,
      definedByCleavage: false,
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save fabric data to store
    console.log('Saving fabric data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Fabric'
    : spotId
      ? 'Spot Fabric'
      : 'Edit Fabric';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Label */}
          <TextField
            fullWidth
            label="Label"
            value={formData.label}
            onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
            placeholder="e.g. Fabric 1"
          />

          {/* Type Grid: 3 columns x 3 rows with separators */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Type
            </Typography>
            <Grid container spacing={2}>
              {/* Row 1: Foliation / Lineation / Fabric Trace */}
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.fabricType}
                    onChange={(e) => setFormData(prev => ({ ...prev, fabricType: e.target.value }))}
                  >
                    <FormControlLabel value="Foliation" control={<Radio />} label="Foliation" />
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.fabricType}
                    onChange={(e) => setFormData(prev => ({ ...prev, fabricType: e.target.value }))}
                  >
                    <FormControlLabel value="Lineation" control={<Radio />} label="Lineation" />
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.fabricType}
                    onChange={(e) => setFormData(prev => ({ ...prev, fabricType: e.target.value }))}
                  >
                    <FormControlLabel value="FabricTrace" control={<Radio />} label="Fabric Trace" />
                  </RadioGroup>
                </FormControl>
              </Grid>

              {/* Row 2: Primary / Secondary */}
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.generation}
                    onChange={(e) => setFormData(prev => ({ ...prev, generation: e.target.value }))}
                  >
                    <FormControlLabel value="Primary" control={<Radio />} label="Primary" />
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.generation}
                    onChange={(e) => setFormData(prev => ({ ...prev, generation: e.target.value }))}
                  >
                    <FormControlLabel value="Secondary" control={<Radio />} label="Secondary" />
                  </RadioGroup>
                </FormControl>
              </Grid>

              {/* Row 3: Penetrative / Spaced */}
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.distribution}
                    onChange={(e) => setFormData(prev => ({ ...prev, distribution: e.target.value }))}
                  >
                    <FormControlLabel value="Penetrative" control={<Radio />} label="Penetrative" />
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid size={4}>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={formData.distribution}
                    onChange={(e) => setFormData(prev => ({ ...prev, distribution: e.target.value }))}
                  >
                    <FormControlLabel value="Spaced" control={<Radio />} label="Spaced" />
                  </RadioGroup>
                </FormControl>
              </Grid>
            </Grid>
          </Box>

          {/* Defined By Section */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>Defined By:</FormLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <DynamicFieldSet
                type="checkbox"
                label="Composition"
                checked={formData.definedByComposition}
                onChange={(checked) => setFormData(prev => ({ ...prev, definedByComposition: checked }))}
              >
                {/* TODO: Add sub-fields when needed */}
              </DynamicFieldSet>

              <DynamicFieldSet
                type="checkbox"
                label="Grain Size"
                checked={formData.definedByGrainSize}
                onChange={(checked) => setFormData(prev => ({ ...prev, definedByGrainSize: checked }))}
              >
                {/* TODO: Add sub-fields when needed */}
              </DynamicFieldSet>

              <DynamicFieldSet
                type="checkbox"
                label="Grain Shape"
                checked={formData.definedByGrainShape}
                onChange={(checked) => setFormData(prev => ({ ...prev, definedByGrainShape: checked }))}
              >
                {/* TODO: Add sub-fields when needed */}
              </DynamicFieldSet>

              <DynamicFieldSet
                type="checkbox"
                label="Cleavage (Solution Seam)"
                checked={formData.definedByCleavage}
                onChange={(checked) => setFormData(prev => ({ ...prev, definedByCleavage: checked }))}
              >
                {/* TODO: Add sub-fields when needed */}
              </DynamicFieldSet>
            </Box>
          </Box>
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
