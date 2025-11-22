/**
 * Fold Add/Edit Form
 *
 * Form for adding or editing a single fold.
 * Matches legacy editFold.fxml layout exactly.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControl,
  FormLabel,
  FormGroup,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Button,
} from '@mui/material';
import { UnitInput } from '../reusable/UnitInput';

export interface FoldData {
  label: string;
  interLimbAngle: string[]; // LEGACY: array of selected strings
  interLimbAngleOther: string;
  closure: string;
  closureOther: string;
  orientationAxialTrace: string;
  symmetry: string;
  vergence: string;
  wavelength: number | null;
  wavelengthUnit: string;
  amplitude: number | null;
  amplitudeUnit: string;
  foldStyle: string;
  foldStyleOther: string;
  foldContinuity: string;
  foldContinuityOther: string;
  facing: string;
  facingOther: string;
}

interface FoldAddFormProps {
  onAdd: (fold: FoldData) => void;
  onCancel?: () => void;
  initialData?: FoldData;
}

// LEGACY UNITS: lowercase "um", not "μm"
const SIZE_UNITS = ['um', 'mm', 'cm'];

const INTER_LIMB_ANGLE_OPTIONS = ['Gentle', 'Open', 'Close', 'Tight', 'Isoclinal', 'Fan'];
const CLOSURE_OPTIONS = ['Rounded', 'Angular (Chevron/Kink)'];
const ORIENTATION_OPTIONS = ['Upright', 'Inclined', 'Overturned', 'Recumbent'];
const STYLE_OPTIONS = ['Parallel (Concentric)', 'Similar', 'Ptygmatic', 'Fault-Related', 'Box', 'Kink'];
const CONTINUITY_OPTIONS = ['Harmonic', 'Disharmonic'];
const FACING_OPTIONS = ['Syncline', 'Anticline', 'Antiformal Syncline', 'Synformal Anticline'];

const DEFAULT_FOLD: FoldData = {
  label: '',
  interLimbAngle: [],
  interLimbAngleOther: '',
  closure: 'Rounded',
  closureOther: '',
  orientationAxialTrace: 'Upright',
  symmetry: 'Symmetric',
  vergence: '',
  wavelength: null,
  wavelengthUnit: 'um',
  amplitude: null,
  amplitudeUnit: 'um',
  foldStyle: 'Parallel (Concentric)',
  foldStyleOther: '',
  foldContinuity: 'Harmonic',
  foldContinuityOther: '',
  facing: 'Syncline',
  facingOther: '',
};

export function FoldAddForm({ onAdd, onCancel, initialData }: FoldAddFormProps) {
  const [formData, setFormData] = useState<FoldData>(initialData || DEFAULT_FOLD);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleSubmit = () => {
    onAdd(formData);
    // Reset form if adding (not editing)
    if (!initialData) {
      setFormData(DEFAULT_FOLD);
    }
  };

  // LEGACY VALIDATION RULES (lines 255-282 in editFoldInfo.java)
  const isValid = (() => {
    // Must have label
    if (formData.label === '') return false;

    // Must have at least one inter-limb angle selected
    if (formData.interLimbAngle.length === 0) return false;

    // If "Other" selected, must have text
    if (formData.interLimbAngle.includes('Other') && formData.interLimbAngleOther === '') return false;
    if (formData.closure === 'Other' && formData.closureOther === '') return false;
    if (formData.foldStyle === 'Other' && formData.foldStyleOther === '') return false;
    if (formData.foldContinuity === 'Other' && formData.foldContinuityOther === '') return false;
    if (formData.facing === 'Other' && formData.facingOther === '') return false;

    return true;
  })();

  const handleInterLimbAngleChange = (option: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        interLimbAngle: [...prev.interLimbAngle, option],
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        interLimbAngle: prev.interLimbAngle.filter(a => a !== option),
      }));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Label */}
      <TextField
        fullWidth
        label="Label"
        value={formData.label}
        onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
        placeholder="e.g. Fold 1"
        required
      />

      {/* Geometry Section */}
      <Box>
        <FormLabel component="legend" sx={{ mb: 1, fontSize: '1.1rem', fontWeight: 600 }}>
          Geometry:
        </FormLabel>

        {/* Inter-Limb Angle (checkboxes) */}
        <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Inter-Limb Angle:</FormLabel>
          <FormGroup sx={{ ml: 2 }}>
            {INTER_LIMB_ANGLE_OPTIONS.map(option => (
              <FormControlLabel
                key={option}
                control={
                  <Checkbox
                    checked={formData.interLimbAngle.includes(option)}
                    onChange={(e) => handleInterLimbAngleChange(option, e.target.checked)}
                  />
                }
                label={option}
              />
            ))}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={formData.interLimbAngle.includes('Other')}
                onChange={(e) => handleInterLimbAngleChange('Other', e.target.checked)}
              />
              <span>Other:</span>
              <TextField
                size="small"
                value={formData.interLimbAngleOther}
                onChange={(e) => setFormData(prev => ({ ...prev, interLimbAngleOther: e.target.value }))}
                disabled={!formData.interLimbAngle.includes('Other')}
                sx={{ flex: 1 }}
              />
            </Box>
          </FormGroup>
        </FormControl>

        {/* Closure (radio) */}
        <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Closure:</FormLabel>
          <RadioGroup
            value={formData.closure}
            onChange={(e) => setFormData(prev => ({ ...prev, closure: e.target.value }))}
            sx={{ ml: 2 }}
          >
            {CLOSURE_OPTIONS.map(opt => (
              <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
            ))}
            <FormControlLabel value="Other" control={<Radio />} label="Other" />
            {formData.closure === 'Other' && (
              <TextField
                value={formData.closureOther}
                onChange={(e) => setFormData(prev => ({ ...prev, closureOther: e.target.value }))}
                sx={{ ml: 4, mt: 1 }}
                size="small"
                placeholder="Specify other closure type"
              />
            )}
          </RadioGroup>
        </FormControl>

        {/* Orientation of Axial Trace (radio) */}
        <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Orientation of Axial Trace:</FormLabel>
          <RadioGroup
            value={formData.orientationAxialTrace}
            onChange={(e) => setFormData(prev => ({ ...prev, orientationAxialTrace: e.target.value }))}
            sx={{ ml: 2 }}
          >
            {ORIENTATION_OPTIONS.map(opt => (
              <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
            ))}
          </RadioGroup>
        </FormControl>

        {/* Symmetry (radio) */}
        <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Symmetry:</FormLabel>
          <RadioGroup
            value={formData.symmetry}
            onChange={(e) => setFormData(prev => ({ ...prev, symmetry: e.target.value }))}
            sx={{ ml: 2 }}
          >
            <FormControlLabel value="Symmetric" control={<Radio />} label="Symmetric" />
            <FormControlLabel value="Asymmetric" control={<Radio />} label="Asymmetric" />
            {formData.symmetry === 'Asymmetric' && (
              <TextField
                label="Vergence"
                value={formData.vergence}
                onChange={(e) => setFormData(prev => ({ ...prev, vergence: e.target.value }))}
                sx={{ ml: 4, mt: 1 }}
                size="small"
              />
            )}
          </RadioGroup>
        </FormControl>

        {/* Wavelength and Amplitude */}
        <Box sx={{ ml: 2, display: 'flex', gap: 2 }}>
          <UnitInput
            value={formData.wavelength || ''}
            unit={formData.wavelengthUnit}
            onValueChange={(value) => setFormData(prev => ({ ...prev, wavelength: value === '' ? null : value }))}
            onUnitChange={(unit) => setFormData(prev => ({ ...prev, wavelengthUnit: unit }))}
            units={SIZE_UNITS}
            label="Wavelength"
            min={0}
          />
          <UnitInput
            value={formData.amplitude || ''}
            unit={formData.amplitudeUnit}
            onValueChange={(value) => setFormData(prev => ({ ...prev, amplitude: value === '' ? null : value }))}
            onUnitChange={(unit) => setFormData(prev => ({ ...prev, amplitudeUnit: unit }))}
            units={SIZE_UNITS}
            label="Amplitude"
            min={0}
          />
        </Box>
      </Box>

      {/* Fold Style and Continuity */}
      <Box>
        <FormLabel component="legend" sx={{ mb: 1, fontSize: '1.1rem', fontWeight: 600 }}>
          Fold Style and Continuity:
        </FormLabel>

        <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Style:</FormLabel>
          <RadioGroup
            value={formData.foldStyle}
            onChange={(e) => setFormData(prev => ({ ...prev, foldStyle: e.target.value }))}
            sx={{ ml: 2 }}
          >
            {STYLE_OPTIONS.map(opt => (
              <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
            ))}
            <FormControlLabel value="Other" control={<Radio />} label="Other" />
            {formData.foldStyle === 'Other' && (
              <TextField
                value={formData.foldStyleOther}
                onChange={(e) => setFormData(prev => ({ ...prev, foldStyleOther: e.target.value }))}
                sx={{ ml: 4, mt: 1 }}
                size="small"
                placeholder="Specify other style"
              />
            )}
          </RadioGroup>
        </FormControl>

        <FormControl component="fieldset" sx={{ ml: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Continuity:</FormLabel>
          <RadioGroup
            value={formData.foldContinuity}
            onChange={(e) => setFormData(prev => ({ ...prev, foldContinuity: e.target.value }))}
            sx={{ ml: 2 }}
          >
            {CONTINUITY_OPTIONS.map(opt => (
              <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
            ))}
            <FormControlLabel value="Other" control={<Radio />} label="Other" />
            {formData.foldContinuity === 'Other' && (
              <TextField
                value={formData.foldContinuityOther}
                onChange={(e) => setFormData(prev => ({ ...prev, foldContinuityOther: e.target.value }))}
                sx={{ ml: 4, mt: 1 }}
                size="small"
                placeholder="Specify other continuity"
              />
            )}
          </RadioGroup>
        </FormControl>
      </Box>

      {/* Facing */}
      <FormControl component="fieldset">
        <FormLabel component="legend" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>Facing:</FormLabel>
        <RadioGroup
          value={formData.facing}
          onChange={(e) => setFormData(prev => ({ ...prev, facing: e.target.value }))}
          sx={{ ml: 2 }}
        >
          {FACING_OPTIONS.map(opt => (
            <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
          ))}
          <FormControlLabel value="Other" control={<Radio />} label="Other" />
          {formData.facing === 'Other' && (
            <TextField
              value={formData.facingOther}
              onChange={(e) => setFormData(prev => ({ ...prev, facingOther: e.target.value }))}
              sx={{ ml: 4, mt: 1 }}
              size="small"
              placeholder="Specify other facing"
            />
          )}
        </RadioGroup>
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
