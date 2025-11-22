/**
 * Faults/Shear Zones Add/Edit Form
 *
 * Form for adding or editing fault and shear zone data.
 * Contains nested arrays for shear senses and indicators.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import { UnitInput } from '../reusable/UnitInput';

export interface FaultsShearZonesShearSenseData {
  type: string;
}

export interface FaultsShearZonesIndicatorsData {
  type: string;
}

export interface FaultsShearZonesData {
  shearSenses: FaultsShearZonesShearSenseData[];
  indicators: FaultsShearZonesIndicatorsData[];
  offset: number | null;
  offsetUnit: string;
  width: number | null;
  widthUnit: string;
}

interface FaultsShearZonesAddFormProps {
  onAdd: (data: FaultsShearZonesData) => void;
  onCancel?: () => void;
  initialData?: FaultsShearZonesData;
}

const SHEAR_SENSE_TYPES = [
  'Dextral',
  'Sinistral',
  'Normal',
  'Reverse',
  'Top-to-North',
  'Top-to-South',
  'Top-to-East',
  'Top-to-West',
  'Unknown',
];

const INDICATOR_TYPES = [
  'S-C Fabrics',
  'Rotated Porphyroclasts',
  'Mica Fish',
  'Asymmetric Folds',
  'Shear Bands',
  'Stretching Lineation',
  'Mineral Lineation',
  'Slickenlines',
  'Tension Gashes',
];

const SIZE_UNITS = ['um', 'mm', 'cm', 'm'];

const DEFAULT_FAULT: FaultsShearZonesData = {
  shearSenses: [],
  indicators: [],
  offset: null,
  offsetUnit: 'mm',
  width: null,
  widthUnit: 'mm',
};

export function FaultsShearZonesAddForm({ onAdd, onCancel, initialData }: FaultsShearZonesAddFormProps) {
  const [formData, setFormData] = useState<FaultsShearZonesData>(initialData || DEFAULT_FAULT);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleAddShearSense = (type: string) => {
    if (!type) return;
    setFormData(prev => ({
      ...prev,
      shearSenses: [...prev.shearSenses, { type }],
    }));
  };

  const handleDeleteShearSense = (index: number) => {
    setFormData(prev => ({
      ...prev,
      shearSenses: prev.shearSenses.filter((_, i) => i !== index),
    }));
  };

  const handleAddIndicator = (type: string) => {
    if (!type) return;
    setFormData(prev => ({
      ...prev,
      indicators: [...prev.indicators, { type }],
    }));
  };

  const handleDeleteIndicator = (index: number) => {
    setFormData(prev => ({
      ...prev,
      indicators: prev.indicators.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_FAULT);
    }
  };

  const isValid = formData.shearSenses.length > 0 || formData.indicators.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Shear Senses */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Shear Senses ({formData.shearSenses.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Add Shear Sense</InputLabel>
              <Select
                label="Add Shear Sense"
                value=""
                onChange={(e) => handleAddShearSense(e.target.value)}
              >
                {SHEAR_SENSE_TYPES.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <List dense>
              {formData.shearSenses.map((sense, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleDeleteShearSense(index)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={sense.type} />
                </ListItem>
              ))}
            </List>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Indicators */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Indicators ({formData.indicators.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Add Indicator</InputLabel>
              <Select
                label="Add Indicator"
                value=""
                onChange={(e) => handleAddIndicator(e.target.value)}
              >
                {INDICATOR_TYPES.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <List dense>
              {formData.indicators.map((indicator, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleDeleteIndicator(index)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={indicator.type} />
                </ListItem>
              ))}
            </List>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Offset */}
      <UnitInput
        value={formData.offset || ''}
        unit={formData.offsetUnit}
        onValueChange={(value) => setFormData(prev => ({ ...prev, offset: value === '' ? null : value }))}
        onUnitChange={(unit) => setFormData(prev => ({ ...prev, offsetUnit: unit }))}
        units={SIZE_UNITS}
        label="Offset"
        min={0}
      />

      {/* Width */}
      <UnitInput
        value={formData.width || ''}
        unit={formData.widthUnit}
        onValueChange={(value) => setFormData(prev => ({ ...prev, width: value === '' ? null : value }))}
        onUnitChange={(unit) => setFormData(prev => ({ ...prev, widthUnit: unit }))}
        units={SIZE_UNITS}
        label="Width"
        min={0}
      />

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
