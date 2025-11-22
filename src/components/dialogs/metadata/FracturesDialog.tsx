/**
 * Fractures Dialog Component
 *
 * Dialog for editing fracture data including granularity, mineralogy, kinematics, and sealed/healed status.
 * Matches legacy editFracture.fxml layout with dynamic sub-fields based on kinematics selection.
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
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
} from '@mui/material';
import { useAppStore } from '@/store';
import { AutocompleteMineralSearch } from './reusable/AutocompleteMineralSearch';
import { UnitInput } from './reusable/UnitInput';

interface FracturesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface FractureData {
  // Granularity
  granularity: string;
  // Mineralogy
  minerals: string[];
  // Kinematics
  kinematicType: string;
  // Opening (Mode I)
  openingAperture: number | '';
  openingApertureUnit: string;
  // Shear (Modes II and III)
  shearOffset: number | '';
  shearOffsetUnit: string;
  // Hybrid
  hybridAperture: number | '';
  hybridApertureUnit: string;
  hybridOffset: number | '';
  hybridOffsetUnit: string;
  // Sealed/Healed
  sealedHealed: boolean;
}

const SIZE_UNITS = ['μm', 'mm', 'cm'];

export function FracturesDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FracturesDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<FractureData>({
    granularity: '',
    minerals: [],
    kinematicType: '',
    openingAperture: '',
    openingApertureUnit: 'μm',
    shearOffset: '',
    shearOffsetUnit: 'μm',
    hybridAperture: '',
    hybridApertureUnit: 'μm',
    hybridOffset: '',
    hybridOffsetUnit: 'μm',
    sealedHealed: false,
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual fracture data from micrograph or spot
    setFormData({
      granularity: '',
      minerals: [],
      kinematicType: '',
      openingAperture: '',
      openingApertureUnit: 'μm',
      shearOffset: '',
      shearOffsetUnit: 'μm',
      hybridAperture: '',
      hybridApertureUnit: 'μm',
      hybridOffset: '',
      hybridOffsetUnit: 'μm',
      sealedHealed: false,
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save fracture data to store
    console.log('Saving fracture data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const handleKinematicTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const kinematicType = event.target.value;
    setFormData(prev => ({
      ...prev,
      kinematicType,
      // Clear fields from other modes when switching
      openingAperture: kinematicType === 'Opening' ? prev.openingAperture : '',
      shearOffset: kinematicType === 'Shear' ? prev.shearOffset : '',
      hybridAperture: kinematicType === 'Hybrid' ? prev.hybridAperture : '',
      hybridOffset: kinematicType === 'Hybrid' ? prev.hybridOffset : '',
    }));
  };

  const title = micrographId
    ? 'Micrograph Fracture'
    : spotId
      ? 'Spot Fracture'
      : 'Edit Fracture';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Granularity */}
          <FormControl component="fieldset">
            <RadioGroup
              row
              value={formData.granularity}
              onChange={(e) => setFormData(prev => ({ ...prev, granularity: e.target.value }))}
            >
              <FormControlLabel value="Multigranular" control={<Radio />} label="Multigranular" />
              <FormControlLabel
                value="Intragranular/Single Crystal"
                control={<Radio />}
                label="Intragranular / Single Crystal"
              />
            </RadioGroup>
          </FormControl>

          {/* Mineralogy of Fractured Phase(s) */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Mineralogy of Fractured Phase(s):
            </FormLabel>
            <AutocompleteMineralSearch
              selectedMinerals={formData.minerals}
              onChange={(minerals) => setFormData(prev => ({ ...prev, minerals }))}
              multiple
            />
          </Box>

          {/* Kinematics */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>Kinematics:</FormLabel>
            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                value={formData.kinematicType}
                onChange={handleKinematicTypeChange}
              >
                {/* Opening (Mode I) */}
                <FormControlLabel
                  value="Opening"
                  control={<Radio />}
                  label="Opening (Mode I)"
                />
                {formData.kinematicType === 'Opening' && (
                  <Box sx={{ ml: 4, mt: 1, mb: 2 }}>
                    <UnitInput
                      value={formData.openingAperture}
                      unit={formData.openingApertureUnit}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, openingAperture: value }))}
                      onUnitChange={(unit) => setFormData(prev => ({ ...prev, openingApertureUnit: unit }))}
                      units={SIZE_UNITS}
                      label="Aperture"
                      min={0}
                    />
                  </Box>
                )}

                {/* Shear (Modes II and III) */}
                <FormControlLabel
                  value="Shear"
                  control={<Radio />}
                  label="Shear (Modes II and III)"
                />
                {formData.kinematicType === 'Shear' && (
                  <Box sx={{ ml: 4, mt: 1, mb: 2 }}>
                    <UnitInput
                      value={formData.shearOffset}
                      unit={formData.shearOffsetUnit}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, shearOffset: value }))}
                      onUnitChange={(unit) => setFormData(prev => ({ ...prev, shearOffsetUnit: unit }))}
                      units={SIZE_UNITS}
                      label="Offset"
                      min={0}
                    />
                  </Box>
                )}

                {/* Hybrid */}
                <FormControlLabel
                  value="Hybrid"
                  control={<Radio />}
                  label="Hybrid"
                />
                {formData.kinematicType === 'Hybrid' && (
                  <Box sx={{ ml: 4, mt: 1, mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <UnitInput
                      value={formData.hybridAperture}
                      unit={formData.hybridApertureUnit}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, hybridAperture: value }))}
                      onUnitChange={(unit) => setFormData(prev => ({ ...prev, hybridApertureUnit: unit }))}
                      units={SIZE_UNITS}
                      label="Aperture"
                      min={0}
                    />
                    <UnitInput
                      value={formData.hybridOffset}
                      unit={formData.hybridOffsetUnit}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, hybridOffset: value }))}
                      onUnitChange={(unit) => setFormData(prev => ({ ...prev, hybridOffsetUnit: unit }))}
                      units={SIZE_UNITS}
                      label="Offset"
                      min={0}
                    />
                  </Box>
                )}
              </RadioGroup>
            </FormControl>
          </Box>

          {/* Sealed/Healed */}
          <FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.sealedHealed}
                  onChange={(e) => setFormData(prev => ({ ...prev, sealedHealed: e.target.checked }))}
                />
              }
              label="Sealed / Healed?"
            />
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
