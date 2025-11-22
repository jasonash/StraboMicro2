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
  minerals: string[];
  kinematicType: string;
  openingAperture: number | '';
  openingApertureUnit: string;
  shearOffset: number | '';
  shearOffsetUnit: string;
  hybridAperture: number | '';
  hybridApertureUnit: string;
  hybridOffset: number | '';
  hybridOffsetUnit: string;
  sealedHealed: boolean;
}

interface FractureAddFormProps {
  onAdd: (fracture: FractureData) => void;
  onCancel?: () => void;
  initialData?: FractureData;
}

const SIZE_UNITS = ['μm', 'mm', 'cm'];

const DEFAULT_FRACTURE: FractureData = {
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
      openingAperture: kinematicType === 'Opening' ? prev.openingAperture : '',
      shearOffset: kinematicType === 'Shear' ? prev.shearOffset : '',
      hybridAperture: kinematicType === 'Hybrid' ? prev.hybridAperture : '',
      hybridOffset: kinematicType === 'Hybrid' ? prev.hybridOffset : '',
    }));
  };

  const isValid = formData.granularity !== '' && formData.kinematicType !== '';

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
          selectedMinerals={formData.minerals}
          onChange={(minerals) => setFormData(prev => ({ ...prev, minerals }))}
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
