/**
 * Grain Info Dialog Component
 *
 * Unified dialog with 3 tabs for grain data: Size, Shape, and Orientation/SPO.
 * Matches legacy editGrainInfo.fxml layout with TabPane structure.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  TextField,
  Grid,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PhaseSelector } from './reusable/PhaseSelector';
import { UnitInput } from './reusable/UnitInput';
import { OtherTextField } from './reusable/OtherTextField';

interface GrainInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

interface GrainInfoData {
  // Grain Size data
  sizePhases: string[];
  mean: number | '';
  median: number | '';
  mode: number | '';
  standardDeviation: number | '';
  sizeUnit: string;

  // Grain Shape data
  shapePhases: string[];
  shape: string;

  // Grain Orientation data
  orientationPhases: string[];
  meanOrientation: number | '';
  relativeToReference: string;
  software: string;
  method: string;
  methodOther: string;
}

const SIZE_UNITS = ['μm', 'mm', 'cm', 'm'];
const SHAPE_OPTIONS = ['Equant', 'Elongate', 'Tabular', 'Platy', 'Acicular', 'Prismatic', 'Anhedral', 'Subhedral', 'Euhedral'];
const RELATIVE_TO_OPTIONS = ['North', 'Sample Edge', 'Foliation', 'Lineation'];
const SPO_METHODS = ['Tensor Method', 'Intercept Method', 'Best Fit Ellipse', 'Manual'];

export function GrainInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: GrainInfoDialogProps) {
  const project = useAppStore((state) => state.project);

  const [currentTab, setCurrentTab] = useState(0);
  const [formData, setFormData] = useState<GrainInfoData>({
    // Grain Size
    sizePhases: [],
    mean: '',
    median: '',
    mode: '',
    standardDeviation: '',
    sizeUnit: 'μm',
    // Grain Shape
    shapePhases: [],
    shape: '',
    // Grain Orientation
    orientationPhases: [],
    meanOrientation: '',
    relativeToReference: '',
    software: '',
    method: '',
    methodOther: '',
  });

  // TODO: Get available phases from sample mineralogy
  const availablePhases: string[] = [];

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual grain info data from micrograph or spot
    setFormData({
      sizePhases: [],
      mean: '',
      median: '',
      mode: '',
      standardDeviation: '',
      sizeUnit: 'μm',
      shapePhases: [],
      shape: '',
      orientationPhases: [],
      meanOrientation: '',
      relativeToReference: '',
      software: '',
      method: '',
      methodOther: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleSave = () => {
    // TODO: Save grain info data to store
    console.log('Saving grain info data:', formData);
    onClose();
  };

  const handleCancel = () => {
    setCurrentTab(0);
    onClose();
  };

  const handleMethodChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const method = event.target.value;
    setFormData(prev => ({
      ...prev,
      method,
      methodOther: method === 'Other' ? prev.methodOther : '',
    }));
  };

  const title = micrographId
    ? 'Micrograph Grain Information'
    : spotId
      ? 'Spot Grain Information'
      : 'Grain Information';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange}>
            <Tab label="Grain Size" />
            <Tab label="Shape" />
            <Tab label="Orientation" />
          </Tabs>
        </Box>

        {/* Tab 1: Grain Size */}
        <TabPanel value={currentTab} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <PhaseSelector
              availablePhases={availablePhases}
              selectedPhases={formData.sizePhases}
              onChange={(phases) => setFormData(prev => ({ ...prev, sizePhases: phases }))}
            />

            <Grid container spacing={2}>
              <Grid size={6}>
                <UnitInput
                  value={formData.mean}
                  unit={formData.sizeUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, mean: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Mean"
                  min={0}
                />
              </Grid>
              <Grid size={6}>
                <UnitInput
                  value={formData.median}
                  unit={formData.sizeUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, median: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Median"
                  min={0}
                />
              </Grid>
              <Grid size={6}>
                <UnitInput
                  value={formData.mode}
                  unit={formData.sizeUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, mode: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Mode"
                  min={0}
                />
              </Grid>
              <Grid size={6}>
                <UnitInput
                  value={formData.standardDeviation}
                  unit={formData.sizeUnit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, standardDeviation: value }))}
                  onUnitChange={(unit) => setFormData(prev => ({ ...prev, sizeUnit: unit }))}
                  units={SIZE_UNITS}
                  label="Standard Deviation"
                  min={0}
                />
              </Grid>
            </Grid>
          </Box>
        </TabPanel>

        {/* Tab 2: Shape */}
        <TabPanel value={currentTab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <PhaseSelector
              availablePhases={availablePhases}
              selectedPhases={formData.shapePhases}
              onChange={(phases) => setFormData(prev => ({ ...prev, shapePhases: phases }))}
            />

            <OtherTextField
              options={SHAPE_OPTIONS}
              value={formData.shape}
              onChange={(value) => setFormData(prev => ({ ...prev, shape: value }))}
              label="Shape"
            />
          </Box>
        </TabPanel>

        {/* Tab 3: Orientation */}
        <TabPanel value={currentTab} index={2}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <PhaseSelector
              availablePhases={availablePhases}
              selectedPhases={formData.orientationPhases}
              onChange={(phases) => setFormData(prev => ({ ...prev, orientationPhases: phases }))}
            />

            <TextField
              fullWidth
              type="number"
              label="Mean Orientation (degrees)"
              value={formData.meanOrientation}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                meanOrientation: e.target.value === '' ? '' : parseFloat(e.target.value),
              }))}
              inputProps={{ step: 0.1 }}
            />

            <OtherTextField
              options={RELATIVE_TO_OPTIONS}
              value={formData.relativeToReference}
              onChange={(value) => setFormData(prev => ({ ...prev, relativeToReference: value }))}
              label="Relative to"
            />

            <TextField
              fullWidth
              label="Software"
              value={formData.software}
              onChange={(e) => setFormData(prev => ({ ...prev, software: e.target.value }))}
              helperText="Software used for SPO analysis"
            />

            <FormControl component="fieldset">
              <FormLabel component="legend">SPO Technique / Method</FormLabel>
              <RadioGroup value={formData.method} onChange={handleMethodChange}>
                {SPO_METHODS.map((method) => (
                  <FormControlLabel
                    key={method}
                    value={method}
                    control={<Radio />}
                    label={method}
                  />
                ))}
                <FormControlLabel value="Other" control={<Radio />} label="Other" />
              </RadioGroup>
              {formData.method === 'Other' && (
                <TextField
                  fullWidth
                  label="Please specify"
                  value={formData.methodOther}
                  onChange={(e) => setFormData(prev => ({ ...prev, methodOther: e.target.value }))}
                  sx={{ mt: 1 }}
                />
              )}
            </FormControl>
          </Box>
        </TabPanel>
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
