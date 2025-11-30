/**
 * Intra-Grain Add/Edit Form
 *
 * LEGACY MATCH: editIntraGrain.java + editIntraGrain.fxml
 * Simple checkbox-based interface for textural features
 * Uses RADIO BUTTONS for single mineral selection (not text field)
 * Special "Fractures" section with radio button kinematic types
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
  TextField,
  RadioGroup,
  Radio,
} from '@mui/material';
import { SinglePhaseSelector } from '../reusable/SinglePhaseSelector';
import { UnitInput } from '../reusable/UnitInput';

export interface IntraGrainTexturalFeatureData {
  type: string;
  otherType: string;
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

export interface IntraGrainData {
  mineral: string; // LEGACY: Single string (not array), uses radio buttons
  grainTextures: IntraGrainTexturalFeatureData[];
}

interface IntraGrainAddFormProps {
  availablePhases: string[]; // List of minerals from sample mineralogy
  onAdd: (grain: IntraGrainData) => void;
  onCancel?: () => void;
  initialData?: IntraGrainData;
}

const SIZE_UNITS = ['um', 'mm', 'cm'];

// LEGACY MATCH: Lines 116-161 in editIntraGrain.java
export function IntraGrainAddForm({ availablePhases, onAdd, onCancel, initialData }: IntraGrainAddFormProps) {
  // Mineral selection (radio buttons) - LEGACY: lines 444-462
  const [mineral, setMineral] = useState<string>(initialData?.mineral || '');

  // Simple texture checkboxes - LEGACY: lines 39-72 (FXML), 116-161 (Java)
  const [unduloseExtinction, setUnduloseExtinction] = useState(false);
  const [kinkBands, setKinkBands] = useState(false);
  const [deformationLamellae, setDeformationLamellae] = useState(false);
  const [deformationBands, setDeformationBands] = useState(false);
  const [dissolutionFeatures, setDissolutionFeatures] = useState(false);
  const [precipitationFeatures, setPrecipitationFeatures] = useState(false);
  const [twins, setTwins] = useState(false);
  const [alteration, setAlteration] = useState(false);

  // "Other" checkbox with text field - LEGACY: lines 69-84 (FXML), 157-161 (Java)
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState('');

  // "Fractures" checkbox with sub-interface - LEGACY: lines 48-73 (FXML), 120-150 (Java), 330-358 (setup)
  const [fracturesChecked, setFracturesChecked] = useState(false);
  const [fracturesKinematicType, setFracturesKinematicType] = useState<'opening' | 'shear' | 'hybrid' | ''>('');
  const [openingAperture, setOpeningAperture] = useState<number | ''>('');
  const [openingApertureUnit, setOpeningApertureUnit] = useState('um');
  const [shearOffset, setShearOffset] = useState<number | ''>('');
  const [shearOffsetUnit, setShearOffsetUnit] = useState('um');
  const [hybridAperture, setHybridAperture] = useState<number | ''>('');
  const [hybridApertureUnit, setHybridApertureUnit] = useState('um');
  const [hybridOffset, setHybridOffset] = useState<number | ''>('');
  const [hybridOffsetUnit, setHybridOffsetUnit] = useState('um');
  const [sealedHealed, setSealedHealed] = useState(false);

  // Load existing data when editing - LEGACY: lines 390-438
  useEffect(() => {
    if (!initialData) return;

    setMineral(initialData.mineral || '');

    if (initialData.grainTextures) {
      initialData.grainTextures.forEach(texture => {
        if (texture.type === 'Undulose Extinction') setUnduloseExtinction(true);
        if (texture.type === 'Kink Bands') setKinkBands(true);
        if (texture.type === 'Deformation Lamellae') setDeformationLamellae(true);
        if (texture.type === 'Deformation Bands') setDeformationBands(true);
        if (texture.type === 'Dissolution Features') setDissolutionFeatures(true);
        if (texture.type === 'Precipitation Features') setPrecipitationFeatures(true);
        if (texture.type === 'Twins') setTwins(true);
        if (texture.type === 'Alteration') setAlteration(true);

        if (texture.type === 'Fractures') {
          setFracturesChecked(true);
          if (texture.openingAperture !== null) {
            setFracturesKinematicType('opening');
            setOpeningAperture(texture.openingAperture);
            setOpeningApertureUnit(texture.openingApertureUnit || 'um');
          }
          if (texture.shearOffset !== null) {
            setFracturesKinematicType('shear');
            setShearOffset(texture.shearOffset);
            setShearOffsetUnit(texture.shearOffsetUnit || 'um');
          }
          if (texture.hybridAperture !== null) {
            setFracturesKinematicType('hybrid');
            setHybridAperture(texture.hybridAperture);
            setHybridApertureUnit(texture.hybridApertureUnit || 'um');
            setHybridOffset(texture.hybridOffset || '');
            setHybridOffsetUnit(texture.hybridOffsetUnit || 'um');
          }
          if (texture.sealedHealed) setSealedHealed(true);
        }

        if (texture.type === 'Other') {
          setOtherChecked(true);
          setOtherText(texture.otherType || '');
        }
      });
    }
  }, [initialData]);

  // Handle fractures checkbox change - LEGACY: lines 330-339
  const handleFracturesChange = (checked: boolean) => {
    setFracturesChecked(checked);
    if (!checked) {
      // Clear all fractures data when unchecked
      setFracturesKinematicType('');
      setOpeningAperture('');
      setShearOffset('');
      setHybridAperture('');
      setHybridOffset('');
      setSealedHealed(false);
    }
  };

  // Handle "other" checkbox change - LEGACY: lines 374-382
  const handleOtherChange = (checked: boolean) => {
    setOtherChecked(checked);
    if (!checked) {
      setOtherText('');
    }
  };

  // Submit handler - LEGACY: lines 104-170
  const handleSubmit = () => {
    const grainTextures: IntraGrainTexturalFeatureData[] = [];

    // Add simple textural features (lines 116-118)
    if (unduloseExtinction) {
      grainTextures.push({
        type: 'Undulose Extinction',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (kinkBands) {
      grainTextures.push({
        type: 'Kink Bands',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (deformationLamellae) {
      grainTextures.push({
        type: 'Deformation Lamellae',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }

    // Add "Fractures" with kinematic data (lines 120-150)
    if (fracturesChecked) {
      const fractureTexture: IntraGrainTexturalFeatureData = {
        type: 'Fractures',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: sealedHealed,
      };

      if (fracturesKinematicType === 'opening' && openingAperture !== '') {
        fractureTexture.openingAperture = openingAperture;
        fractureTexture.openingApertureUnit = openingApertureUnit;
      }
      if (fracturesKinematicType === 'shear' && shearOffset !== '') {
        fractureTexture.shearOffset = shearOffset;
        fractureTexture.shearOffsetUnit = shearOffsetUnit;
      }
      if (fracturesKinematicType === 'hybrid') {
        if (hybridAperture !== '') {
          fractureTexture.hybridAperture = hybridAperture;
          fractureTexture.hybridApertureUnit = hybridApertureUnit;
        }
        if (hybridOffset !== '') {
          fractureTexture.hybridOffset = hybridOffset;
          fractureTexture.hybridOffsetUnit = hybridOffsetUnit;
        }
      }

      grainTextures.push(fractureTexture);
    }

    // Add remaining simple features (lines 152-156)
    if (deformationBands) {
      grainTextures.push({
        type: 'Deformation Bands',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (dissolutionFeatures) {
      grainTextures.push({
        type: 'Dissolution Features',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (precipitationFeatures) {
      grainTextures.push({
        type: 'Precipitation Features',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (twins) {
      grainTextures.push({
        type: 'Twins',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }
    if (alteration) {
      grainTextures.push({
        type: 'Alteration',
        otherType: '',
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }

    // Add "Other" with custom text (lines 157-161)
    if (otherChecked && otherText) {
      grainTextures.push({
        type: 'Other',
        otherType: otherText,
        openingAperture: null,
        openingApertureUnit: 'um',
        shearOffset: null,
        shearOffsetUnit: 'um',
        hybridAperture: null,
        hybridApertureUnit: 'um',
        hybridOffset: null,
        hybridOffsetUnit: 'um',
        sealedHealed: false,
      });
    }

    onAdd({
      mineral: mineral,
      grainTextures: grainTextures,
    });

    // Reset form if adding new (not editing)
    if (!initialData) {
      setMineral('');
      setUnduloseExtinction(false);
      setKinkBands(false);
      setDeformationLamellae(false);
      setDeformationBands(false);
      setDissolutionFeatures(false);
      setPrecipitationFeatures(false);
      setTwins(false);
      setAlteration(false);
      setOtherChecked(false);
      setOtherText('');
      setFracturesChecked(false);
      setFracturesKinematicType('');
      setOpeningAperture('');
      setShearOffset('');
      setHybridAperture('');
      setHybridOffset('');
      setSealedHealed(false);
    }
  };

  // Validation - LEGACY: lines 464-536
  // Must have mineral AND at least one textural feature selected
  // If fractures checked and kinematic type selected, must have valid numeric values
  const isValid = (() => {
    // Must have mineral selected
    if (!mineral) return false;

    // Must have at least one textural feature
    const hasTexture = unduloseExtinction || kinkBands || deformationLamellae ||
                       fracturesChecked || deformationBands || dissolutionFeatures ||
                       precipitationFeatures || twins || alteration ||
                       (otherChecked && otherText !== '');

    if (!hasTexture) return false;

    // If fractures checked, validate kinematic fields
    if (fracturesChecked) {
      if (fracturesKinematicType === 'opening') {
        return openingAperture !== '';
      }
      if (fracturesKinematicType === 'shear') {
        return shearOffset !== '';
      }
      if (fracturesKinematicType === 'hybrid') {
        return hybridAperture !== '' && hybridOffset !== '';
      }
      // Fractures checked but no kinematic type selected
      return false;
    }

    return true;
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Mineral - LEGACY: lines 45-57 (FXML), 444-462 (Java) */}
      <SinglePhaseSelector
        availablePhases={availablePhases}
        selectedPhase={mineral}
        onChange={setMineral}
        label="Mineral:"
      />

      {/* Textural Features - LEGACY: lines 58-89 (FXML), 116-161 (Java) */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
          Textural Features:
        </Typography>
        <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FormControlLabel
            control={<Checkbox checked={unduloseExtinction} onChange={(e) => setUnduloseExtinction(e.target.checked)} />}
            label="Undulose Extinction"
          />
          <FormControlLabel
            control={<Checkbox checked={kinkBands} onChange={(e) => setKinkBands(e.target.checked)} />}
            label="Kink Bands"
          />
          <FormControlLabel
            control={<Checkbox checked={deformationLamellae} onChange={(e) => setDeformationLamellae(e.target.checked)} />}
            label="Deformation Lamellae"
          />

          {/* Fractures with sub-interface - LEGACY: lines 68-73 (FXML), 120-150 (Java) */}
          <FormControlLabel
            control={<Checkbox checked={fracturesChecked} onChange={(e) => handleFracturesChange(e.target.checked)} />}
            label="Fractures"
          />
          {fracturesChecked && (
            <Box sx={{ ml: 4, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {/* Kinematic type radio buttons - LEGACY: lines 86-88, 341-358 */}
              <RadioGroup
                value={fracturesKinematicType}
                onChange={(e) => setFracturesKinematicType(e.target.value as 'opening' | 'shear' | 'hybrid')}
              >
                <FormControlLabel value="opening" control={<Radio />} label="Opening (mode I)" />
                <FormControlLabel value="shear" control={<Radio />} label="Shear (modes II and III)" />
                <FormControlLabel value="hybrid" control={<Radio />} label="Hybrid" />
              </RadioGroup>

              {/* Conditional kinematic fields - LEGACY: lines 200-245, 343-356 */}
              {fracturesKinematicType === 'opening' && (
                <Box sx={{ ml: 2 }}>
                  <UnitInput
                    value={openingAperture}
                    unit={openingApertureUnit}
                    onValueChange={setOpeningAperture}
                    onUnitChange={setOpeningApertureUnit}
                    units={SIZE_UNITS}
                    label="Aperture"
                    min={0}
                  />
                </Box>
              )}

              {fracturesKinematicType === 'shear' && (
                <Box sx={{ ml: 2 }}>
                  <UnitInput
                    value={shearOffset}
                    unit={shearOffsetUnit}
                    onValueChange={setShearOffset}
                    onUnitChange={setShearOffsetUnit}
                    units={SIZE_UNITS}
                    label="Offset"
                    min={0}
                  />
                </Box>
              )}

              {fracturesKinematicType === 'hybrid' && (
                <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <UnitInput
                    value={hybridAperture}
                    unit={hybridApertureUnit}
                    onValueChange={setHybridAperture}
                    onUnitChange={setHybridApertureUnit}
                    units={SIZE_UNITS}
                    label="Aperture"
                    min={0}
                  />
                  <UnitInput
                    value={hybridOffset}
                    unit={hybridOffsetUnit}
                    onValueChange={setHybridOffset}
                    onUnitChange={setHybridOffsetUnit}
                    units={SIZE_UNITS}
                    label="Offset"
                    min={0}
                  />
                </Box>
              )}

              {/* Sealed/Healed checkbox - LEGACY: line 83 */}
              <FormControlLabel
                control={<Checkbox checked={sealedHealed} onChange={(e) => setSealedHealed(e.target.checked)} />}
                label="Sealed / Healed?"
                sx={{ ml: 2 }}
              />
            </Box>
          )}

          <FormControlLabel
            control={<Checkbox checked={deformationBands} onChange={(e) => setDeformationBands(e.target.checked)} />}
            label="Deformation Bands"
          />
          <FormControlLabel
            control={<Checkbox checked={dissolutionFeatures} onChange={(e) => setDissolutionFeatures(e.target.checked)} />}
            label="Dissolution Features"
          />
          <FormControlLabel
            control={<Checkbox checked={precipitationFeatures} onChange={(e) => setPrecipitationFeatures(e.target.checked)} />}
            label="Precipitation Features"
          />
          <FormControlLabel
            control={<Checkbox checked={twins} onChange={(e) => setTwins(e.target.checked)} />}
            label="Twins"
          />
          <FormControlLabel
            control={<Checkbox checked={alteration} onChange={(e) => setAlteration(e.target.checked)} />}
            label="Alteration"
          />

          {/* Other with text field - LEGACY: lines 79-84 (FXML), 157-161 (Java), 374-388 (setup) */}
          <FormControlLabel
            control={<Checkbox checked={otherChecked} onChange={(e) => handleOtherChange(e.target.checked)} />}
            label="Other"
          />
          {otherChecked && (
            <TextField
              size="small"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Specify other type"
              sx={{ ml: 4, maxWidth: 300 }}
            />
          )}
        </Box>
      </Box>

      {/* Submit Button */}
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
