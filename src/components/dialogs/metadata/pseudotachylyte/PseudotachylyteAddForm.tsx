/**
 * Pseudotachylyte Add/Edit Form
 *
 * Form for adding or editing pseudotachylyte entries.
 * Contains 43 fields organized into logical sections with accordions.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { UnitInput } from '../reusable/UnitInput';

const SIZE_UNITS = ['um', 'mm', 'cm'];

const CRYSTALLITE_SHAPES = [
  'Acicular',
  'Dendritic',
  'Globular',
  'Skeletal',
  'Other',
];

export interface PseudotachylyteData {
  label: string;
  // Matrix/Groundmass
  hasMatrixGroundmass: boolean;
  matrixGroundmassColor: string;
  matrixGroundmassConstraintsOnComposition: boolean;
  matrixGroundmassConstraintsOnCompositionDetails: string;
  // Crystallites
  hasCrystallites: boolean;
  crystallitesMineralogy: string;
  crystallitesShapes: string[];
  otherShape: string;
  crystallitesLowerSize: number | null;
  crystallitesLowerSizeUnit: string;
  crystallitesUpperSize: number | null;
  crystallitesUpperSizeUnit: string;
  crystallitesZoning: boolean;
  crystallitesZoningDetails: string;
  crystallitesDistribution: string;
  // Survivor Clasts
  hasSurvivorClasts: boolean;
  survivorClastsMineralogy: string;
  survivorClastsMarginDescription: string;
  survivorClastsDistribution: string;
  // Sulphide/Oxide
  hasSulphideOxide: boolean;
  sulphideOxideMineralogy: string;
  sulphideOxideLowerSize: number | null;
  sulphideOxideLowerSizeUnit: string;
  sulphideOxideUpperSize: number | null;
  sulphideOxideUpperSizeUnit: string;
  sulphideOxideDistribution: string;
  // Fabric
  hasFabric: boolean;
  fabricDescription: string;
  // Injection Features
  hasInjectionFeatures: boolean;
  injectionFeaturesAperture: number | null;
  injectionFeaturesApertureUnit: string;
  injectionFeaturesLength: number | null;
  injectionFeaturesLengthUnit: string;
  // Chilled Margins
  hasChilledMargins: boolean;
  chilledMarginsDescription: string;
  // Vesicles/Amygdules
  hasVesciclesAmygdules: boolean;
  vesciclesAmygdulesMineralogy: string;
  vesciclesAmygdulesLowerSize: number | null;
  vesciclesAmygdulesLowerSizeUnit: string;
  vesciclesAmygdulesUpperSize: number | null;
  vesciclesAmygdulesUpperSizeUnit: string;
  vesciclesAmygdulesDistribution: string;
}

interface PseudotachylyteAddFormProps {
  onAdd: (data: PseudotachylyteData) => void;
  onCancel?: () => void;
  initialData?: PseudotachylyteData;
}

const DEFAULT_PSEUDOTACHYLYTE: PseudotachylyteData = {
  label: '',
  hasMatrixGroundmass: false,
  matrixGroundmassColor: '',
  matrixGroundmassConstraintsOnComposition: false,
  matrixGroundmassConstraintsOnCompositionDetails: '',
  hasCrystallites: false,
  crystallitesMineralogy: '',
  crystallitesShapes: [],
  otherShape: '',
  crystallitesLowerSize: null,
  crystallitesLowerSizeUnit: 'um',
  crystallitesUpperSize: null,
  crystallitesUpperSizeUnit: 'um',
  crystallitesZoning: false,
  crystallitesZoningDetails: '',
  crystallitesDistribution: '',
  hasSurvivorClasts: false,
  survivorClastsMineralogy: '',
  survivorClastsMarginDescription: '',
  survivorClastsDistribution: '',
  hasSulphideOxide: false,
  sulphideOxideMineralogy: '',
  sulphideOxideLowerSize: null,
  sulphideOxideLowerSizeUnit: 'um',
  sulphideOxideUpperSize: null,
  sulphideOxideUpperSizeUnit: 'um',
  sulphideOxideDistribution: '',
  hasFabric: false,
  fabricDescription: '',
  hasInjectionFeatures: false,
  injectionFeaturesAperture: null,
  injectionFeaturesApertureUnit: 'um',
  injectionFeaturesLength: null,
  injectionFeaturesLengthUnit: 'um',
  hasChilledMargins: false,
  chilledMarginsDescription: '',
  hasVesciclesAmygdules: false,
  vesciclesAmygdulesMineralogy: '',
  vesciclesAmygdulesLowerSize: null,
  vesciclesAmygdulesLowerSizeUnit: 'um',
  vesciclesAmygdulesUpperSize: null,
  vesciclesAmygdulesUpperSizeUnit: 'um',
  vesciclesAmygdulesDistribution: '',
};

export function PseudotachylyteAddForm({ onAdd, onCancel, initialData }: PseudotachylyteAddFormProps) {
  const [formData, setFormData] = useState<PseudotachylyteData>(initialData || DEFAULT_PSEUDOTACHYLYTE);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_PSEUDOTACHYLYTE);
    }
  };

  const isValid = formData.label !== '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Label */}
      <TextField
        fullWidth
        required
        label="Label"
        value={formData.label}
        onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
      />

      {/* Matrix/Groundmass */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Matrix / Groundmass</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasMatrixGroundmass}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasMatrixGroundmass: e.target.checked }))}
                />
              }
              label="Has Matrix/Groundmass"
            />
            {formData.hasMatrixGroundmass && (
              <>
                <TextField
                  fullWidth
                  label="Color"
                  value={formData.matrixGroundmassColor}
                  onChange={(e) => setFormData(prev => ({ ...prev, matrixGroundmassColor: e.target.value }))}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.matrixGroundmassConstraintsOnComposition}
                      onChange={(e) => setFormData(prev => ({ ...prev, matrixGroundmassConstraintsOnComposition: e.target.checked }))}
                    />
                  }
                  label="Constraints on Composition"
                />
                {formData.matrixGroundmassConstraintsOnComposition && (
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Composition Details"
                    value={formData.matrixGroundmassConstraintsOnCompositionDetails}
                    onChange={(e) => setFormData(prev => ({ ...prev, matrixGroundmassConstraintsOnCompositionDetails: e.target.value }))}
                  />
                )}
              </>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Crystallites */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Crystallites</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasCrystallites}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasCrystallites: e.target.checked }))}
                />
              }
              label="Has Crystallites"
            />
            {formData.hasCrystallites && (
              <>
                <TextField
                  fullWidth
                  label="Mineralogy"
                  value={formData.crystallitesMineralogy}
                  onChange={(e) => setFormData(prev => ({ ...prev, crystallitesMineralogy: e.target.value }))}
                />
                <FormControl fullWidth>
                  <InputLabel>Shapes</InputLabel>
                  <Select
                    multiple
                    value={formData.crystallitesShapes}
                    onChange={(e) => setFormData(prev => ({ ...prev, crystallitesShapes: e.target.value as string[] }))}
                    input={<OutlinedInput label="Shapes" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {CRYSTALLITE_SHAPES.map((shape) => (
                      <MenuItem key={shape} value={shape}>{shape}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {formData.crystallitesShapes.includes('Other') && (
                  <TextField
                    fullWidth
                    label="Other Shape"
                    value={formData.otherShape}
                    onChange={(e) => setFormData(prev => ({ ...prev, otherShape: e.target.value }))}
                  />
                )}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={formData.crystallitesLowerSize || ''}
                    unit={formData.crystallitesLowerSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, crystallitesLowerSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, crystallitesLowerSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Lower Size"
                    min={0}
                  />
                  <UnitInput
                    value={formData.crystallitesUpperSize || ''}
                    unit={formData.crystallitesUpperSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, crystallitesUpperSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, crystallitesUpperSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Upper Size"
                    min={0}
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.crystallitesZoning}
                      onChange={(e) => setFormData(prev => ({ ...prev, crystallitesZoning: e.target.checked }))}
                    />
                  }
                  label="Zoning"
                />
                {formData.crystallitesZoning && (
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Zoning Details"
                    value={formData.crystallitesZoningDetails}
                    onChange={(e) => setFormData(prev => ({ ...prev, crystallitesZoningDetails: e.target.value }))}
                  />
                )}
                <TextField
                  fullWidth
                  label="Distribution"
                  value={formData.crystallitesDistribution}
                  onChange={(e) => setFormData(prev => ({ ...prev, crystallitesDistribution: e.target.value }))}
                />
              </>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Survivor Clasts */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Survivor Clasts</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasSurvivorClasts}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasSurvivorClasts: e.target.checked }))}
                />
              }
              label="Has Survivor Clasts"
            />
            {formData.hasSurvivorClasts && (
              <>
                <TextField
                  fullWidth
                  label="Mineralogy"
                  value={formData.survivorClastsMineralogy}
                  onChange={(e) => setFormData(prev => ({ ...prev, survivorClastsMineralogy: e.target.value }))}
                />
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Margin Description"
                  value={formData.survivorClastsMarginDescription}
                  onChange={(e) => setFormData(prev => ({ ...prev, survivorClastsMarginDescription: e.target.value }))}
                />
                <TextField
                  fullWidth
                  label="Distribution"
                  value={formData.survivorClastsDistribution}
                  onChange={(e) => setFormData(prev => ({ ...prev, survivorClastsDistribution: e.target.value }))}
                />
              </>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Sulphide/Oxide */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Sulphide / Oxide</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasSulphideOxide}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasSulphideOxide: e.target.checked }))}
                />
              }
              label="Has Sulphide/Oxide"
            />
            {formData.hasSulphideOxide && (
              <>
                <TextField
                  fullWidth
                  label="Mineralogy"
                  value={formData.sulphideOxideMineralogy}
                  onChange={(e) => setFormData(prev => ({ ...prev, sulphideOxideMineralogy: e.target.value }))}
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={formData.sulphideOxideLowerSize || ''}
                    unit={formData.sulphideOxideLowerSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, sulphideOxideLowerSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, sulphideOxideLowerSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Lower Size"
                    min={0}
                  />
                  <UnitInput
                    value={formData.sulphideOxideUpperSize || ''}
                    unit={formData.sulphideOxideUpperSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, sulphideOxideUpperSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, sulphideOxideUpperSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Upper Size"
                    min={0}
                  />
                </Box>
                <TextField
                  fullWidth
                  label="Distribution"
                  value={formData.sulphideOxideDistribution}
                  onChange={(e) => setFormData(prev => ({ ...prev, sulphideOxideDistribution: e.target.value }))}
                />
              </>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Fabric, Injection Features, Chilled Margins, Vesicles (simpler sections) */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Additional Features</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Fabric */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasFabric}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasFabric: e.target.checked }))}
                />
              }
              label="Has Fabric"
            />
            {formData.hasFabric && (
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Fabric Description"
                value={formData.fabricDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, fabricDescription: e.target.value }))}
              />
            )}

            {/* Injection Features */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasInjectionFeatures}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasInjectionFeatures: e.target.checked }))}
                />
              }
              label="Has Injection Features"
            />
            {formData.hasInjectionFeatures && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <UnitInput
                  value={formData.injectionFeaturesAperture || ''}
                  unit={formData.injectionFeaturesApertureUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, injectionFeaturesAperture: value === '' ? null : value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, injectionFeaturesApertureUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Aperture"
                  min={0}
                />
                <UnitInput
                  value={formData.injectionFeaturesLength || ''}
                  unit={formData.injectionFeaturesLengthUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, injectionFeaturesLength: value === '' ? null : value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, injectionFeaturesLengthUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Length"
                  min={0}
                />
              </Box>
            )}

            {/* Chilled Margins */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasChilledMargins}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasChilledMargins: e.target.checked }))}
                />
              }
              label="Has Chilled Margins"
            />
            {formData.hasChilledMargins && (
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Chilled Margins Description"
                value={formData.chilledMarginsDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, chilledMarginsDescription: e.target.value }))}
              />
            )}

            {/* Vesicles/Amygdules */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.hasVesciclesAmygdules}
                  onChange={(e) => setFormData(prev => ({ ...prev, hasVesciclesAmygdules: e.target.checked }))}
                />
              }
              label="Has Vesicles/Amygdules"
            />
            {formData.hasVesciclesAmygdules && (
              <>
                <TextField
                  fullWidth
                  label="Mineralogy"
                  value={formData.vesciclesAmygdulesMineralogy}
                  onChange={(e) => setFormData(prev => ({ ...prev, vesciclesAmygdulesMineralogy: e.target.value }))}
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={formData.vesciclesAmygdulesLowerSize || ''}
                    unit={formData.vesciclesAmygdulesLowerSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, vesciclesAmygdulesLowerSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, vesciclesAmygdulesLowerSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Lower Size"
                    min={0}
                  />
                  <UnitInput
                    value={formData.vesciclesAmygdulesUpperSize || ''}
                    unit={formData.vesciclesAmygdulesUpperSizeUnit}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, vesciclesAmygdulesUpperSize: value === '' ? null : value }))}
                    onUnitChange={(unit) => setFormData(prev => ({ ...prev, vesciclesAmygdulesUpperSizeUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Upper Size"
                    min={0}
                  />
                </Box>
                <TextField
                  fullWidth
                  label="Distribution"
                  value={formData.vesciclesAmygdulesDistribution}
                  onChange={(e) => setFormData(prev => ({ ...prev, vesciclesAmygdulesDistribution: e.target.value }))}
                />
              </>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

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
