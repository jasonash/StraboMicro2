/**
 * Clastic Deformation Band Add/Edit Form
 *
 * Form for adding or editing clastic deformation bands.
 * Contains nested types array with aperture and offset fields.
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
import EditIcon from '@mui/icons-material/Edit';
import { UnitInput } from '../reusable/UnitInput';

export interface ClasticDeformationBandTypeData {
  type: string;
  aperture: number | null;
  apertureUnit: string;
  offset: number | null;
  offsetUnit: string;
}

export interface ClasticDeformationBandData {
  types: ClasticDeformationBandTypeData[];
  thickness: number | null;
  thicknessUnit: string;
  cements: string;
}

interface ClasticDeformationBandAddFormProps {
  onAdd: (band: ClasticDeformationBandData) => void;
  onCancel?: () => void;
  initialData?: ClasticDeformationBandData;
}

const BAND_TYPES = [
  'Cataclastic Band',
  'Disaggregation Band',
  'Phyllosilicate Band',
  'Solution Band',
  'Compaction Band',
  'Shear Band',
];

const SIZE_UNITS = ['um', 'mm', 'cm'];

const DEFAULT_BAND_TYPE: ClasticDeformationBandTypeData = {
  type: '',
  aperture: null,
  apertureUnit: 'um',
  offset: null,
  offsetUnit: 'um',
};

const DEFAULT_BAND: ClasticDeformationBandData = {
  types: [],
  thickness: null,
  thicknessUnit: 'um',
  cements: '',
};

export function ClasticDeformationBandAddForm({ onAdd, onCancel, initialData }: ClasticDeformationBandAddFormProps) {
  const [formData, setFormData] = useState<ClasticDeformationBandData>(initialData || DEFAULT_BAND);
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null);
  const [currentBandType, setCurrentBandType] = useState<ClasticDeformationBandTypeData>(DEFAULT_BAND_TYPE);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleAddBandType = () => {
    if (!currentBandType.type) return;

    if (editingTypeIndex !== null) {
      // Update existing
      setFormData(prev => ({
        ...prev,
        types: prev.types.map((t, i) =>
          i === editingTypeIndex ? currentBandType : t
        ),
      }));
      setEditingTypeIndex(null);
    } else {
      // Add new
      setFormData(prev => ({
        ...prev,
        types: [...prev.types, currentBandType],
      }));
    }

    setCurrentBandType(DEFAULT_BAND_TYPE);
  };

  const handleEditBandType = (index: number) => {
    setCurrentBandType(formData.types[index]);
    setEditingTypeIndex(index);
  };

  const handleDeleteBandType = (index: number) => {
    setFormData(prev => ({
      ...prev,
      types: prev.types.filter((_, i) => i !== index),
    }));
  };

  const handleCancelBandTypeEdit = () => {
    setCurrentBandType(DEFAULT_BAND_TYPE);
    setEditingTypeIndex(null);
  };

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_BAND);
    }
  };

  const isValid = formData.types.length > 0;
  const isBandTypeValid = currentBandType.type !== '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Band Types */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Band Types ({formData.types.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* List of existing band types */}
            <List dense>
              {formData.types.map((bandType, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <Box>
                      <IconButton edge="end" onClick={() => handleEditBandType(index)}>
                        <EditIcon />
                      </IconButton>
                      <IconButton edge="end" onClick={() => handleDeleteBandType(index)}>
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={bandType.type}
                    secondary={
                      `${bandType.aperture ? `Aperture: ${bandType.aperture} ${bandType.apertureUnit}` : ''}${
                        bandType.aperture && bandType.offset ? ', ' : ''
                      }${bandType.offset ? `Offset: ${bandType.offset} ${bandType.offsetUnit}` : ''}`
                    }
                  />
                </ListItem>
              ))}
            </List>

            {/* Add/Edit Band Type Form */}
            <Box sx={{ border: '1px solid #ddd', p: 2, borderRadius: 1, bgcolor: '#f9f9f9' }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                {editingTypeIndex !== null ? 'Edit Band Type' : 'Add Band Type'}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Type */}
                <FormControl fullWidth size="small" required>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={currentBandType.type}
                    label="Type"
                    onChange={(e) => setCurrentBandType(prev => ({ ...prev, type: e.target.value }))}
                  >
                    {BAND_TYPES.map(type => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Aperture and Offset */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={currentBandType.aperture || ''}
                    unit={currentBandType.apertureUnit}
                    onValueChange={(value) => setCurrentBandType(prev => ({ ...prev, aperture: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentBandType(prev => ({ ...prev, apertureUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Aperture"
                    min={0}
                  />
                  <UnitInput
                    value={currentBandType.offset || ''}
                    unit={currentBandType.offsetUnit}
                    onValueChange={(value) => setCurrentBandType(prev => ({ ...prev, offset: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentBandType(prev => ({ ...prev, offsetUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Offset"
                    min={0}
                  />
                </Box>

                {/* Add/Update Band Type Button */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {editingTypeIndex !== null && (
                    <Button onClick={handleCancelBandTypeEdit} variant="outlined" size="small">
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleAddBandType}
                    variant="contained"
                    size="small"
                    disabled={!isBandTypeValid}
                  >
                    {editingTypeIndex !== null ? 'Update Type' : 'Add Type'}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Thickness */}
      <UnitInput
        value={formData.thickness || ''}
        unit={formData.thicknessUnit}
        onValueChange={(value) => setFormData(prev => ({ ...prev, thickness: value === '' ? null : value }))}
        onUnitChange={(unit) => setFormData(prev => ({ ...prev, thicknessUnit: unit }))}
        units={SIZE_UNITS}
        label="Thickness"
        min={0}
      />

      {/* Cements */}
      <TextField
        fullWidth
        label="Cements"
        value={formData.cements}
        onChange={(e) => setFormData(prev => ({ ...prev, cements: e.target.value }))}
        multiline
        rows={2}
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
