/**
 * Folds Dialog Component
 *
 * Dialog for editing fold data including label, geometry (inter-limb angle, closure,
 * orientation, symmetry, wavelength, amplitude), fold style/continuity, and facing.
 * Matches legacy editFold.fxml layout.
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
  FormGroup,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
} from '@mui/material';
import { useAppStore } from '@/store';
import { UnitInput } from './reusable/UnitInput';

interface FoldsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface FoldData {
  label: string;
  // Geometry - Inter-Limb Angle (checkboxes)
  interLimbGentle: boolean;
  interLimbOpen: boolean;
  interLimbClose: boolean;
  interLimbTight: boolean;
  interLimbIsoclinal: boolean;
  interLimbFan: boolean;
  interLimbOther: boolean;
  interLimbOtherText: string;
  // Geometry - Closure (radio)
  closure: string;
  closureOther: string;
  // Geometry - Orientation of Axial Trace (radio)
  orientationAxial: string;
  // Geometry - Symmetry (radio + text field)
  symmetry: string;
  vergence: string;
  // Geometry - Wavelength/Amplitude
  wavelength: number | '';
  wavelengthUnit: string;
  amplitude: number | '';
  amplitudeUnit: string;
  // Fold Style and Continuity
  style: string;
  styleOther: string;
  continuity: string;
  continuityOther: string;
  // Facing
  facing: string;
  facingOther: string;
}

const SIZE_UNITS = ['μm', 'mm', 'cm'];
const CLOSURE_OPTIONS = ['Rounded', 'Angular (Chevron/Kink)'];
const ORIENTATION_OPTIONS = ['Upright', 'Inclined', 'Overturned', 'Recumbent'];
const STYLE_OPTIONS = ['Parallel (Concentric)', 'Similar', 'Ptygmatic', 'Fault-Related', 'Box', 'Kink'];
const CONTINUITY_OPTIONS = ['Harmonic', 'Disharmonic'];
const FACING_OPTIONS = ['Syncline', 'Anticline', 'Antiformal Syncline', 'Synformal Anticline'];

export function FoldsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FoldsDialogProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<FoldData>({
    label: '',
    interLimbGentle: false,
    interLimbOpen: false,
    interLimbClose: false,
    interLimbTight: false,
    interLimbIsoclinal: false,
    interLimbFan: false,
    interLimbOther: false,
    interLimbOtherText: '',
    closure: 'Rounded',
    closureOther: '',
    orientationAxial: 'Upright',
    symmetry: 'Symmetric',
    vergence: '',
    wavelength: '',
    wavelengthUnit: 'μm',
    amplitude: '',
    amplitudeUnit: 'μm',
    style: 'Parallel (Concentric)',
    styleOther: '',
    continuity: 'Harmonic',
    continuityOther: '',
    facing: '',
    facingOther: '',
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual fold data from micrograph or spot
    setFormData({
      label: '',
      interLimbGentle: false,
      interLimbOpen: false,
      interLimbClose: false,
      interLimbTight: false,
      interLimbIsoclinal: false,
      interLimbFan: false,
      interLimbOther: false,
      interLimbOtherText: '',
      closure: 'Rounded',
      closureOther: '',
      orientationAxial: 'Upright',
      symmetry: 'Symmetric',
      vergence: '',
      wavelength: '',
      wavelengthUnit: 'μm',
      amplitude: '',
      amplitudeUnit: 'μm',
      style: 'Parallel (Concentric)',
      styleOther: '',
      continuity: 'Harmonic',
      continuityOther: '',
      facing: '',
      facingOther: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    // TODO: Save fold data to store
    console.log('Saving fold data:', formData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Fold Data'
    : spotId
      ? 'Spot Fold Data'
      : 'Fold Data';

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
            required
          />

          {/* Geometry Section */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1, fontSize: '1.1rem', fontWeight: 600 }}>
              Geometry:
            </FormLabel>

            {/* Inter-Limb Angle */}
            <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
              <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Inter-Limb Angle:</FormLabel>
              <FormGroup sx={{ ml: 2 }}>
                <label><Checkbox checked={formData.interLimbGentle} onChange={(e) => setFormData(prev => ({ ...prev, interLimbGentle: e.target.checked }))} />Gentle</label>
                <label><Checkbox checked={formData.interLimbOpen} onChange={(e) => setFormData(prev => ({ ...prev, interLimbOpen: e.target.checked }))} />Open</label>
                <label><Checkbox checked={formData.interLimbClose} onChange={(e) => setFormData(prev => ({ ...prev, interLimbClose: e.target.checked }))} />Close</label>
                <label><Checkbox checked={formData.interLimbTight} onChange={(e) => setFormData(prev => ({ ...prev, interLimbTight: e.target.checked }))} />Tight</label>
                <label><Checkbox checked={formData.interLimbIsoclinal} onChange={(e) => setFormData(prev => ({ ...prev, interLimbIsoclinal: e.target.checked }))} />Isoclinal</label>
                <label><Checkbox checked={formData.interLimbFan} onChange={(e) => setFormData(prev => ({ ...prev, interLimbFan: e.target.checked }))} />Fan</label>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox checked={formData.interLimbOther} onChange={(e) => setFormData(prev => ({ ...prev, interLimbOther: e.target.checked }))} />
                  <span>Other:</span>
                  <TextField
                    size="small"
                    value={formData.interLimbOtherText}
                    onChange={(e) => setFormData(prev => ({ ...prev, interLimbOtherText: e.target.value }))}
                    disabled={!formData.interLimbOther}
                    sx={{ flex: 1 }}
                  />
                </Box>
              </FormGroup>
            </FormControl>

            {/* Closure */}
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

            {/* Orientation of Axial Trace */}
            <FormControl component="fieldset" sx={{ ml: 2, mb: 2 }}>
              <FormLabel component="legend" sx={{ fontSize: '0.95rem' }}>Orientation of Axial Trace:</FormLabel>
              <RadioGroup
                value={formData.orientationAxial}
                onChange={(e) => setFormData(prev => ({ ...prev, orientationAxial: e.target.value }))}
                sx={{ ml: 2 }}
              >
                {ORIENTATION_OPTIONS.map(opt => (
                  <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
                ))}
              </RadioGroup>
            </FormControl>

            {/* Symmetry */}
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
                value={formData.wavelength}
                unit={formData.wavelengthUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, wavelength: value }))}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, wavelengthUnit: unit }))}
                units={SIZE_UNITS}
                label="Wavelength"
                min={0}
              />
              <UnitInput
                value={formData.amplitude}
                unit={formData.amplitudeUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, amplitude: value }))}
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
                value={formData.style}
                onChange={(e) => setFormData(prev => ({ ...prev, style: e.target.value }))}
                sx={{ ml: 2 }}
              >
                {STYLE_OPTIONS.map(opt => (
                  <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
                ))}
                <FormControlLabel value="Other" control={<Radio />} label="Other" />
                {formData.style === 'Other' && (
                  <TextField
                    value={formData.styleOther}
                    onChange={(e) => setFormData(prev => ({ ...prev, styleOther: e.target.value }))}
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
                value={formData.continuity}
                onChange={(e) => setFormData(prev => ({ ...prev, continuity: e.target.value }))}
                sx={{ ml: 2 }}
              >
                {CONTINUITY_OPTIONS.map(opt => (
                  <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
                ))}
                <FormControlLabel value="Other" control={<Radio />} label="Other" />
                {formData.continuity === 'Other' && (
                  <TextField
                    value={formData.continuityOther}
                    onChange={(e) => setFormData(prev => ({ ...prev, continuityOther: e.target.value }))}
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
