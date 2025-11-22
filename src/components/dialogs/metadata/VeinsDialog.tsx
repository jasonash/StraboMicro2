/**
 * Veins Dialog Component
 *
 * Dialog for editing vein data including mineralogy, crystal shape, growth morphology,
 * inclusion trails, and kinematics.
 * Matches legacy editVein.fxml layout with dynamic sub-fields.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  FormControl,
  FormLabel,
  FormGroup,
  Checkbox,
} from '@mui/material';
import { useAppStore } from '@/store';
import { AutocompleteMineralSearch } from './reusable/AutocompleteMineralSearch';
import { DynamicFieldSet } from './reusable/DynamicFieldSet';
import { UnitInput } from './reusable/UnitInput';

interface VeinsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface VeinData {
  // Mineralogy
  minerals: string[];
  // Crystal Shape
  equantBlocky: boolean;
  elongateBlocky: boolean;
  fibrous: boolean;
  stretched: boolean;
  // Growth Morphology
  syntaxial: boolean;
  antitaxial: boolean;
  atataxial: boolean;
  // Inclusion Trails
  fluid: boolean;
  fluidMeanSpacing: number | '';
  fluidMeanSpacingUnit: string;
  solid: boolean;
  // Kinematics
  opening: boolean;
  openingAperture: number | '';
  openingApertureUnit: string;
  shear: boolean;
  hybrid: boolean;
}

const SIZE_UNITS = ['μm', 'mm', 'cm'];

export function VeinsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: VeinsDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<VeinData>({
    minerals: [],
    equantBlocky: false,
    elongateBlocky: false,
    fibrous: false,
    stretched: false,
    syntaxial: false,
    antitaxial: false,
    atataxial: false,
    fluid: false,
    fluidMeanSpacing: '',
    fluidMeanSpacingUnit: 'μm',
    solid: false,
    opening: false,
    openingAperture: '',
    openingApertureUnit: 'μm',
    shear: false,
    hybrid: false,
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual vein data from micrograph or spot
    setFormData({
      minerals: [],
      equantBlocky: false,
      elongateBlocky: false,
      fibrous: false,
      stretched: false,
      syntaxial: false,
      antitaxial: false,
      atataxial: false,
      fluid: false,
      fluidMeanSpacing: '',
      fluidMeanSpacingUnit: 'μm',
      solid: false,
      opening: false,
      openingAperture: '',
      openingApertureUnit: 'μm',
      shear: false,
      hybrid: false,
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save vein data to store
    console.log('Saving vein data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Vein'
    : spotId
      ? 'Spot Vein'
      : 'Edit Vein';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Mineralogy */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Mineralogy:
            </FormLabel>
            <AutocompleteMineralSearch
              selectedMinerals={formData.minerals}
              onChange={(minerals) => setFormData(prev => ({ ...prev, minerals }))}
              multiple
            />
          </Box>

          {/* Crystal Shape */}
          <FormControl component="fieldset">
            <FormLabel component="legend">Crystal Shape:</FormLabel>
            <FormGroup sx={{ ml: 2 }}>
              <label>
                <Checkbox
                  checked={formData.equantBlocky}
                  onChange={(e) => setFormData(prev => ({ ...prev, equantBlocky: e.target.checked }))}
                />
                Equant Blocky
              </label>
              <label>
                <Checkbox
                  checked={formData.elongateBlocky}
                  onChange={(e) => setFormData(prev => ({ ...prev, elongateBlocky: e.target.checked }))}
                />
                Elongate Blocky
              </label>
              <label>
                <Checkbox
                  checked={formData.fibrous}
                  onChange={(e) => setFormData(prev => ({ ...prev, fibrous: e.target.checked }))}
                />
                Fibrous
              </label>
              <label>
                <Checkbox
                  checked={formData.stretched}
                  onChange={(e) => setFormData(prev => ({ ...prev, stretched: e.target.checked }))}
                />
                Stretched
              </label>
            </FormGroup>
          </FormControl>

          {/* Growth Morphology */}
          <FormControl component="fieldset">
            <FormLabel component="legend">Growth Morphology:</FormLabel>
            <FormGroup sx={{ ml: 2 }}>
              <label>
                <Checkbox
                  checked={formData.syntaxial}
                  onChange={(e) => setFormData(prev => ({ ...prev, syntaxial: e.target.checked }))}
                />
                Syntaxial
              </label>
              <label>
                <Checkbox
                  checked={formData.antitaxial}
                  onChange={(e) => setFormData(prev => ({ ...prev, antitaxial: e.target.checked }))}
                />
                Antitaxial
              </label>
              <label>
                <Checkbox
                  checked={formData.atataxial}
                  onChange={(e) => setFormData(prev => ({ ...prev, atataxial: e.target.checked }))}
                />
                Atataxial
              </label>
            </FormGroup>
          </FormControl>

          {/* Inclusion Trails */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>Inclusion Trails:</FormLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
              <DynamicFieldSet
                type="checkbox"
                label="Fluid"
                checked={formData.fluid}
                onChange={(checked) => setFormData(prev => ({ ...prev, fluid: checked }))}
              >
                <UnitInput
                  value={formData.fluidMeanSpacing}
                  unit={formData.fluidMeanSpacingUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, fluidMeanSpacing: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, fluidMeanSpacingUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Mean Spacing"
                  min={0}
                />
              </DynamicFieldSet>

              <label>
                <Checkbox
                  checked={formData.solid}
                  onChange={(e) => setFormData(prev => ({ ...prev, solid: e.target.checked }))}
                />
                Solid
              </label>
            </Box>
          </Box>

          {/* Kinematics */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>Kinematics:</FormLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
              <DynamicFieldSet
                type="checkbox"
                label="Opening (mode I)"
                checked={formData.opening}
                onChange={(checked) => setFormData(prev => ({ ...prev, opening: checked }))}
              >
                <UnitInput
                  value={formData.openingAperture}
                  unit={formData.openingApertureUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, openingAperture: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, openingApertureUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Aperture"
                  min={0}
                />
              </DynamicFieldSet>

              <label>
                <Checkbox
                  checked={formData.shear}
                  onChange={(e) => setFormData(prev => ({ ...prev, shear: e.target.checked }))}
                />
                Shear (Modes II and III)
              </label>

              <label>
                <Checkbox
                  checked={formData.hybrid}
                  onChange={(e) => setFormData(prev => ({ ...prev, hybrid: e.target.checked }))}
                />
                Hybrid
              </label>
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
