/**
 * Fracture Add/Edit Form
 *
 * Form for adding or editing a single fracture.
 * Matches legacy editFracture.fxml layout.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Button,
} from '@mui/material';
import { AutocompleteMineralSearch } from '../reusable/AutocompleteMineralSearch';
import { UnitInput } from '../reusable/UnitInput';

export interface FractureData {
  granularity: string;
  mineralogy: string; // LEGACY: comma-separated string, NOT array
  kinematicType: string;
  openingAperture: number | null;
  openingApertureUnit: string;
  shearOffset: number | null;
  shearOffsetUnit: string;
  hybridAperture: number | null;
  hybridApertureUnit: string;
  hybridOffset: number | null;
  hybridOffsetUnit: string;
  sealedHealed: boolean;
}

interface FractureAddFormProps {
  onAdd: (fracture: FractureData) => void;
  onCancel?: () => void;
  initialData?: FractureData;
}

// LEGACY UNITS: lowercase "um", not "μm"
const SIZE_UNITS = ['um', 'mm', 'cm'];

const DEFAULT_FRACTURE: FractureData = {
  granularity: '',
  mineralogy: '',
  kinematicType: '',
  openingAperture: null,
  openingApertureUnit: 'um',
  shearOffset: null,
  shearOffsetUnit: 'um',
  hybridAperture: null,
  hybridApertureUnit: 'um',
  hybridOffset: null,
  hybridOffsetUnit: 'um',
  sealedHealed: false,
};

export function FractureAddForm({ onAdd, onCancel, initialData }: FractureAddFormProps) {
  const [formData, setFormData] = useState<FractureData>(initialData || DEFAULT_FRACTURE);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleSubmit = () => {
    onAdd(formData);
    // Reset form if adding (not editing)
    if (!initialData) {
      setFormData(DEFAULT_FRACTURE);
    }
  };

  const handleKinematicTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const kinematicType = event.target.value;
    setFormData(prev => ({
      ...prev,
      kinematicType,
      // Clear fields from other modes when switching
      openingAperture: kinematicType === 'Opening' ? prev.openingAperture : null,
      shearOffset: kinematicType === 'Shear' ? prev.shearOffset : null,
      hybridAperture: kinematicType === 'Hybrid' ? prev.hybridAperture : null,
      hybridOffset: kinematicType === 'Hybrid' ? prev.hybridOffset : null,
    }));
  };

  // LEGACY VALIDATION RULES (lines 473-486 in editFractureInfo.java)
  const isValid = (() => {
    // Must have granularity
    if (formData.granularity === '') return false;

    // Must have mineralogy
    if (formData.mineralogy === '') return false;

    // Must have kinematic type
    if (formData.kinematicType === '') return false;

    // If Opening: must have aperture value
    if (formData.kinematicType === 'Opening' && (formData.openingAperture === null || formData.openingAperture === 0)) {
      return false;
    }

    // If Shear: must have offset value
    if (formData.kinematicType === 'Shear' && (formData.shearOffset === null || formData.shearOffset === 0)) {
      return false;
    }

    // If Hybrid: must have at least ONE of (aperture OR offset)
    if (formData.kinematicType === 'Hybrid') {
      const hasAperture = formData.hybridAperture !== null && formData.hybridAperture !== 0;
      const hasOffset = formData.hybridOffset !== null && formData.hybridOffset !== 0;
      if (!hasAperture && !hasOffset) return false;
    }

    return true;
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        <AutocompleteMineralSearch
          selectedMinerals={formData.mineralogy ? formData.mineralogy.split(', ').filter(m => m) : []}
          onChange={(minerals) => setFormData(prev => ({ ...prev, mineralogy: minerals.join(', ') }))}
          multiple
          label="Mineralogy of Fractured Phase(s)"
        />
      </Box>

      {/* Kinematics */}
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
                value={formData.openingAperture || ''}
                unit={formData.openingApertureUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, openingAperture: value === '' ? null : value }))}
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
                value={formData.shearOffset || ''}
                unit={formData.shearOffsetUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, shearOffset: value === '' ? null : value }))}
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
                value={formData.hybridAperture || ''}
                unit={formData.hybridApertureUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, hybridAperture: value === '' ? null : value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, hybridApertureUnit: unit }))}
                units={SIZE_UNITS}
                label="Aperture"
                min={0}
              />
              <UnitInput
                value={formData.hybridOffset || ''}
                unit={formData.hybridOffsetUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, hybridOffset: value === '' ? null : value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, hybridOffsetUnit: unit }))}
                units={SIZE_UNITS}
                label="Offset"
                min={0}
              />
            </Box>
          )}
        </RadioGroup>
      </FormControl>

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

      {/* Add/Update Button */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
        {onCancel && (
          <Button onClick={onCancel} variant="outlined">
            Cancel Edit
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid}
        >
          {initialData ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
