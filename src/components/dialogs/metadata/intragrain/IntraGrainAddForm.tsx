/**
 * Intra-Grain Add/Edit Form
 *
 * Form for adding or editing intragranular structures.
 * Contains nested texturalFeatures array with kinematic fields.
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
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
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
  mineral: string;
  grainTextures: IntraGrainTexturalFeatureData[];
}

interface IntraGrainAddFormProps {
  onAdd: (grain: IntraGrainData) => void;
  onCancel?: () => void;
  initialData?: IntraGrainData;
}

const TEXTURE_TYPES = [
  'Deformation Twin',
  'Growth Twin',
  'Kink Band',
  'Deformation Lamellae',
  'Fracture',
  'Cleavage',
  'Other',
];

const SIZE_UNITS = ['um', 'mm', 'cm'];

const DEFAULT_TEXTURE: IntraGrainTexturalFeatureData = {
  type: '',
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
};

const DEFAULT_GRAIN: IntraGrainData = {
  mineral: '',
  grainTextures: [],
};

export function IntraGrainAddForm({ onAdd, onCancel, initialData }: IntraGrainAddFormProps) {
  const [formData, setFormData] = useState<IntraGrainData>(initialData || DEFAULT_GRAIN);
  const [editingTextureIndex, setEditingTextureIndex] = useState<number | null>(null);
  const [currentTexture, setCurrentTexture] = useState<IntraGrainTexturalFeatureData>(DEFAULT_TEXTURE);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleAddTexture = () => {
    if (!currentTexture.type) return;

    if (editingTextureIndex !== null) {
      // Update existing
      setFormData(prev => ({
        ...prev,
        grainTextures: prev.grainTextures.map((tex, i) =>
          i === editingTextureIndex ? currentTexture : tex
        ),
      }));
      setEditingTextureIndex(null);
    } else {
      // Add new
      setFormData(prev => ({
        ...prev,
        grainTextures: [...prev.grainTextures, currentTexture],
      }));
    }

    setCurrentTexture(DEFAULT_TEXTURE);
  };

  const handleEditTexture = (index: number) => {
    setCurrentTexture(formData.grainTextures[index]);
    setEditingTextureIndex(index);
  };

  const handleDeleteTexture = (index: number) => {
    setFormData(prev => ({
      ...prev,
      grainTextures: prev.grainTextures.filter((_, i) => i !== index),
    }));
  };

  const handleCancelTextureEdit = () => {
    setCurrentTexture(DEFAULT_TEXTURE);
    setEditingTextureIndex(null);
  };

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_GRAIN);
    }
  };

  const isValid = formData.mineral !== '';
  const isTextureValid = currentTexture.type !== '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Mineral */}
      <TextField
        fullWidth
        required
        label="Mineral"
        value={formData.mineral}
        onChange={(e) => setFormData(prev => ({ ...prev, mineral: e.target.value }))}
      />

      {/* Textural Features */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Textural Features ({formData.grainTextures.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* List of existing textures */}
            <List dense>
              {formData.grainTextures.map((texture, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <Box>
                      <IconButton edge="end" onClick={() => handleEditTexture(index)}>
                        <EditIcon />
                      </IconButton>
                      <IconButton edge="end" onClick={() => handleDeleteTexture(index)}>
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={texture.type === 'Other' ? texture.otherType : texture.type}
                    secondary={texture.sealedHealed ? 'Sealed/Healed' : undefined}
                  />
                </ListItem>
              ))}
            </List>

            {/* Add/Edit Texture Form */}
            <Box sx={{ border: '1px solid #ddd', p: 2, borderRadius: 1, bgcolor: '#f9f9f9' }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                {editingTextureIndex !== null ? 'Edit Texture' : 'Add Texture'}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Type */}
                <FormControl fullWidth size="small" required>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={currentTexture.type}
                    label="Type"
                    onChange={(e) => setCurrentTexture(prev => ({ ...prev, type: e.target.value }))}
                  >
                    {TEXTURE_TYPES.map(type => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Other Type */}
                {currentTexture.type === 'Other' && (
                  <TextField
                    fullWidth
                    size="small"
                    label="Other Type"
                    value={currentTexture.otherType}
                    onChange={(e) => setCurrentTexture(prev => ({ ...prev, otherType: e.target.value }))}
                  />
                )}

                {/* Kinematic fields (similar to Fractures) */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={currentTexture.openingAperture || ''}
                    unit={currentTexture.openingApertureUnit}
                    onValueChange={(value) => setCurrentTexture(prev => ({ ...prev, openingAperture: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentTexture(prev => ({ ...prev, openingApertureUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Opening Aperture"
                    min={0}
                  />
                  <UnitInput
                    value={currentTexture.shearOffset || ''}
                    unit={currentTexture.shearOffsetUnit}
                    onValueChange={(value) => setCurrentTexture(prev => ({ ...prev, shearOffset: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentTexture(prev => ({ ...prev, shearOffsetUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Shear Offset"
                    min={0}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UnitInput
                    value={currentTexture.hybridAperture || ''}
                    unit={currentTexture.hybridApertureUnit}
                    onValueChange={(value) => setCurrentTexture(prev => ({ ...prev, hybridAperture: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentTexture(prev => ({ ...prev, hybridApertureUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Hybrid Aperture"
                    min={0}
                  />
                  <UnitInput
                    value={currentTexture.hybridOffset || ''}
                    unit={currentTexture.hybridOffsetUnit}
                    onValueChange={(value) => setCurrentTexture(prev => ({ ...prev, hybridOffset: value === '' ? null : value }))}
                    onUnitChange={(unit) => setCurrentTexture(prev => ({ ...prev, hybridOffsetUnit: unit }))}
                    units={SIZE_UNITS}
                    label="Hybrid Offset"
                    min={0}
                  />
                </Box>

                {/* Sealed/Healed */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={currentTexture.sealedHealed}
                      onChange={(e) => setCurrentTexture(prev => ({ ...prev, sealedHealed: e.target.checked }))}
                    />
                  }
                  label="Sealed / Healed?"
                />

                {/* Add/Update Texture Button */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {editingTextureIndex !== null && (
                    <Button onClick={handleCancelTextureEdit} variant="outlined" size="small">
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleAddTexture}
                    variant="contained"
                    size="small"
                    disabled={!isTextureValid}
                  >
                    {editingTextureIndex !== null ? 'Update Texture' : 'Add Texture'}
                  </Button>
                </Box>
              </Box>
            </Box>
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
