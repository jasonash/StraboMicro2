/**
 * Vein Add/Edit Form
 *
 * Form for adding or editing a single vein.
 * Matches legacy editVein.fxml layout with VeinSubType arrays.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  FormGroup,
  Checkbox,
  Button,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import { AutocompleteMineralSearch } from '../reusable/AutocompleteMineralSearch';
import { DynamicFieldSet } from '../reusable/DynamicFieldSet';
import { UnitInput } from '../reusable/UnitInput';

// LEGACY: VeinSubType from schema
export interface VeinSubType {
  type: string;
  subType?: string;
  numericValue?: number | null;
  unit?: string;
}

export interface VeinData {
  mineralogy: string; // LEGACY: comma-separated string, NOT array
  crystalShapes: VeinSubType[];
  growthMorphologies: VeinSubType[];
  inclusionTrails: VeinSubType[];
  kinematics: VeinSubType[];
}

interface VeinAddFormProps {
  onAdd: (vein: VeinData) => void;
  onCancel?: () => void;
  initialData?: VeinData;
}

// LEGACY UNITS: lowercase "um", not "μm"
const SIZE_UNITS = ['um', 'mm', 'cm'];

export function VeinAddForm({ onAdd, onCancel, initialData }: VeinAddFormProps) {
  // UI state for checkboxes
  const [crystalShapeChecks, setCrystalShapeChecks] = useState({
    equantBlocky: false,
    elongateBlocky: false,
    fibrous: false,
    stretched: false,
  });

  const [growthMorphChecks, setGrowthMorphChecks] = useState({
    syntaxial: false,
    antitaxial: false,
    atataxial: false,
  });

  const [inclusionTrailChecks, setInclusionTrailChecks] = useState({
    fluid: false,
    solid: false,
  });

  const [kinematicsChecks, setKinematicsChecks] = useState({
    opening: false,
    shear: false,
    hybrid: false,
  });

  // Conditional field state
  const [fluidMeanSpacing, setFluidMeanSpacing] = useState<number | null>(null);
  const [fluidMeanSpacingUnit, setFluidMeanSpacingUnit] = useState('um');
  const [openingAperture, setOpeningAperture] = useState<number | null>(null);
  const [openingApertureUnit, setOpeningApertureUnit] = useState('um');

  // Mineralogy state
  const [mineralogy, setMineralogy] = useState('');
  const [mineralSearchKey, setMineralSearchKey] = useState(0); // Used to force reset autocomplete

  useEffect(() => {
    if (initialData) {
      setMineralogy(initialData.mineralogy || '');

      // Populate checkboxes from VeinSubType arrays
      const newCrystalChecks = { ...crystalShapeChecks };
      const newGrowthChecks = { ...growthMorphChecks };
      const newInclusionChecks = { ...inclusionTrailChecks };
      const newKinematicsChecks = { ...kinematicsChecks };

      initialData.crystalShapes?.forEach(shape => {
        if (shape.type === 'Equant Blocky') newCrystalChecks.equantBlocky = true;
        if (shape.type === 'Elongate Blocky') newCrystalChecks.elongateBlocky = true;
        if (shape.type === 'Fibrous') newCrystalChecks.fibrous = true;
        if (shape.type === 'Stretched') newCrystalChecks.stretched = true;
      });

      initialData.growthMorphologies?.forEach(morph => {
        if (morph.type === 'Syntaxial') newGrowthChecks.syntaxial = true;
        if (morph.type === 'Antitaxial') newGrowthChecks.antitaxial = true;
        if (morph.type === 'Atataxial') newGrowthChecks.atataxial = true;
      });

      initialData.inclusionTrails?.forEach(trail => {
        if (trail.type === 'Fluid') {
          newInclusionChecks.fluid = true;
          setFluidMeanSpacing(trail.numericValue || null);
          setFluidMeanSpacingUnit(trail.unit || 'um');
        }
        if (trail.type === 'Solid') newInclusionChecks.solid = true;
      });

      initialData.kinematics?.forEach(kin => {
        if (kin.type === 'Opening (Mode I)') {
          newKinematicsChecks.opening = true;
          setOpeningAperture(kin.numericValue || null);
          setOpeningApertureUnit(kin.unit || 'um');
        }
        if (kin.type === 'Shear (Modes II and III)') newKinematicsChecks.shear = true;
        if (kin.type === 'Hybrid') newKinematicsChecks.hybrid = true;
      });

      setCrystalShapeChecks(newCrystalChecks);
      setGrowthMorphChecks(newGrowthChecks);
      setInclusionTrailChecks(newInclusionChecks);
      setKinematicsChecks(newKinematicsChecks);
    }
  }, [initialData]);

  const handleMineralSelected = (mineralName: string | null) => {
    if (!mineralName) return;

    // Append to mineralogy list (comma-separated)
    if (mineralogy === '') {
      setMineralogy(mineralName);
    } else {
      setMineralogy(mineralogy + ', ' + mineralName);
    }

    // Force reset the autocomplete by changing its key
    setMineralSearchKey(prev => prev + 1);
  };

  const handleSubmit = () => {
    // Build VeinSubType arrays from checkbox state (lines 377-411 in editVein.java)
    const crystalShapes: VeinSubType[] = [];
    if (crystalShapeChecks.equantBlocky) crystalShapes.push({ type: 'Equant Blocky' });
    if (crystalShapeChecks.elongateBlocky) crystalShapes.push({ type: 'Elongate Blocky' });
    if (crystalShapeChecks.fibrous) crystalShapes.push({ type: 'Fibrous' });
    if (crystalShapeChecks.stretched) crystalShapes.push({ type: 'Stretched' });

    const growthMorphologies: VeinSubType[] = [];
    if (growthMorphChecks.syntaxial) growthMorphologies.push({ type: 'Syntaxial' });
    if (growthMorphChecks.antitaxial) growthMorphologies.push({ type: 'Antitaxial' });
    if (growthMorphChecks.atataxial) growthMorphologies.push({ type: 'Atataxial' });

    const inclusionTrails: VeinSubType[] = [];
    if (inclusionTrailChecks.fluid) {
      inclusionTrails.push({
        type: 'Fluid',
        subType: 'Mean Spacing',
        numericValue: fluidMeanSpacing,
        unit: fluidMeanSpacingUnit,
      });
    }
    if (inclusionTrailChecks.solid) inclusionTrails.push({ type: 'Solid' });

    const kinematics: VeinSubType[] = [];
    if (kinematicsChecks.opening) {
      kinematics.push({
        type: 'Opening (Mode I)',
        subType: 'Aperture',
        numericValue: openingAperture,
        unit: openingApertureUnit,
      });
    }
    if (kinematicsChecks.shear) kinematics.push({ type: 'Shear (Modes II and III)' });
    if (kinematicsChecks.hybrid) kinematics.push({ type: 'Hybrid' });

    onAdd({
      mineralogy: mineralogy,
      crystalShapes,
      growthMorphologies,
      inclusionTrails,
      kinematics,
    });

    // Reset form if adding (not editing)
    if (!initialData) {
      setMineralogy('');
      setMineralSearchKey(prev => prev + 1);
      setCrystalShapeChecks({ equantBlocky: false, elongateBlocky: false, fibrous: false, stretched: false });
      setGrowthMorphChecks({ syntaxial: false, antitaxial: false, atataxial: false });
      setInclusionTrailChecks({ fluid: false, solid: false });
      setKinematicsChecks({ opening: false, shear: false, hybrid: false });
      setFluidMeanSpacing(null);
      setFluidMeanSpacingUnit('um');
      setOpeningAperture(null);
      setOpeningApertureUnit('um');
    }
  };

  // LEGACY VALIDATION RULES (lines 245-265 in editVein.java)
  const isValid = (() => {
    // Must have at least one field filled
    if (mineralogy === '' &&
        !crystalShapeChecks.equantBlocky &&
        !crystalShapeChecks.elongateBlocky &&
        !crystalShapeChecks.fibrous &&
        !crystalShapeChecks.stretched &&
        !growthMorphChecks.syntaxial &&
        !growthMorphChecks.antitaxial &&
        !growthMorphChecks.atataxial &&
        !inclusionTrailChecks.fluid &&
        !inclusionTrailChecks.solid &&
        !kinematicsChecks.opening &&
        !kinematicsChecks.shear &&
        !kinematicsChecks.hybrid) {
      return false;
    }

    // If fluid checked, must have mean spacing value
    if (inclusionTrailChecks.fluid && (fluidMeanSpacing === null || fluidMeanSpacing === 0)) {
      return false;
    }

    // If opening checked, must have aperture value
    if (kinematicsChecks.opening && (openingAperture === null || openingAperture === 0)) {
      return false;
    }

    return true;
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Mineralogy - Matches clastic deformation band pattern */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Mineralogy:</Typography>

        {/* Autocomplete field for searching/selecting minerals */}
        <AutocompleteMineralSearch
          key={mineralSearchKey}
          selectedMinerals={[]}
          onChange={(minerals) => {
            if (minerals.length > 0) {
              handleMineralSelected(minerals[minerals.length - 1]);
            }
          }}
          multiple={false}
          label="Search and select mineral to add"
        />

        {/* Display field showing comma-separated list of selected minerals */}
        <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            label="Selected Minerals"
            value={mineralogy}
            multiline
            rows={2}
            InputProps={{
              readOnly: true,
            }}
            helperText="Comma-separated list of selected minerals"
          />
          <Button
            variant="outlined"
            onClick={() => setMineralogy('')}
            disabled={!mineralogy}
            sx={{ minWidth: '80px', height: '56px' }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      {/* Crystal Shape */}
      <FormControl component="fieldset">
        <FormLabel component="legend">Crystal Shape:</FormLabel>
        <FormGroup sx={{ ml: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={crystalShapeChecks.equantBlocky} onChange={(e) => setCrystalShapeChecks(prev => ({ ...prev, equantBlocky: e.target.checked }))} />}
            label="Equant Blocky"
          />
          <FormControlLabel
            control={<Checkbox checked={crystalShapeChecks.elongateBlocky} onChange={(e) => setCrystalShapeChecks(prev => ({ ...prev, elongateBlocky: e.target.checked }))} />}
            label="Elongate Blocky"
          />
          <FormControlLabel
            control={<Checkbox checked={crystalShapeChecks.fibrous} onChange={(e) => setCrystalShapeChecks(prev => ({ ...prev, fibrous: e.target.checked }))} />}
            label="Fibrous"
          />
          <FormControlLabel
            control={<Checkbox checked={crystalShapeChecks.stretched} onChange={(e) => setCrystalShapeChecks(prev => ({ ...prev, stretched: e.target.checked }))} />}
            label="Stretched"
          />
        </FormGroup>
      </FormControl>

      {/* Growth Morphology */}
      <FormControl component="fieldset">
        <FormLabel component="legend">Growth Morphology:</FormLabel>
        <FormGroup sx={{ ml: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={growthMorphChecks.syntaxial} onChange={(e) => setGrowthMorphChecks(prev => ({ ...prev, syntaxial: e.target.checked }))} />}
            label="Syntaxial"
          />
          <FormControlLabel
            control={<Checkbox checked={growthMorphChecks.antitaxial} onChange={(e) => setGrowthMorphChecks(prev => ({ ...prev, antitaxial: e.target.checked }))} />}
            label="Antitaxial"
          />
          <FormControlLabel
            control={<Checkbox checked={growthMorphChecks.atataxial} onChange={(e) => setGrowthMorphChecks(prev => ({ ...prev, atataxial: e.target.checked }))} />}
            label="Atataxial"
          />
        </FormGroup>
      </FormControl>

      {/* Inclusion Trails */}
      <Box>
        <FormLabel component="legend" sx={{ mb: 1 }}>Inclusion Trails:</FormLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
          <DynamicFieldSet
            type="checkbox"
            label="Fluid"
            checked={inclusionTrailChecks.fluid}
            onChange={(checked) => setInclusionTrailChecks(prev => ({ ...prev, fluid: checked }))}
          >
            <UnitInput
              value={fluidMeanSpacing || ''}
              unit={fluidMeanSpacingUnit}
              onValueChange={(value) => setFluidMeanSpacing(value === '' ? null : value)}
              onUnitChange={(unit) => setFluidMeanSpacingUnit(unit)}
              units={SIZE_UNITS}
              label="Mean Spacing"
              min={0}
            />
          </DynamicFieldSet>

          <FormControlLabel
            control={<Checkbox checked={inclusionTrailChecks.solid} onChange={(e) => setInclusionTrailChecks(prev => ({ ...prev, solid: e.target.checked }))} />}
            label="Solid"
          />
        </Box>
      </Box>

      {/* Kinematics */}
      <Box>
        <FormLabel component="legend" sx={{ mb: 1 }}>Kinematics:</FormLabel>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
          <DynamicFieldSet
            type="checkbox"
            label="Opening (mode I)"
            checked={kinematicsChecks.opening}
            onChange={(checked) => setKinematicsChecks(prev => ({ ...prev, opening: checked }))}
          >
            <UnitInput
              value={openingAperture || ''}
              unit={openingApertureUnit}
              onValueChange={(value) => setOpeningAperture(value === '' ? null : value)}
              onUnitChange={(unit) => setOpeningApertureUnit(unit)}
              units={SIZE_UNITS}
              label="Aperture"
              min={0}
            />
          </DynamicFieldSet>

          <FormControlLabel
            control={<Checkbox checked={kinematicsChecks.shear} onChange={(e) => setKinematicsChecks(prev => ({ ...prev, shear: e.target.checked }))} />}
            label="Shear (Modes II and III)"
          />

          <FormControlLabel
            control={<Checkbox checked={kinematicsChecks.hybrid} onChange={(e) => setKinematicsChecks(prev => ({ ...prev, hybrid: e.target.checked }))} />}
            label="Hybrid"
          />
        </Box>
      </Box>

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
