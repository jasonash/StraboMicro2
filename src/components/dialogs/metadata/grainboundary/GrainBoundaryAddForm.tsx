/**
 * Grain Boundary Add/Edit Form
 *
 * Form for adding or editing a single grain boundary.
 * Contains nested arrays for morphologies and descriptors.
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

export interface GrainBoundaryMorphologyData {
  type: string;
}

export interface GrainBoundaryDescriptorSubTypeData {
  type: string;
  otherType: string;
}

export interface GrainBoundaryDescriptorData {
  type: string;
  subTypes: GrainBoundaryDescriptorSubTypeData[];
}

export interface GrainBoundaryData {
  typeOfBoundary: string;
  phase1: string;
  phase2: string;
  morphologies: GrainBoundaryMorphologyData[];
  descriptors: GrainBoundaryDescriptorData[];
}

interface GrainBoundaryAddFormProps {
  onAdd: (boundary: GrainBoundaryData) => void;
  onCancel?: () => void;
  initialData?: GrainBoundaryData;
}

const BOUNDARY_TYPES = [
  'Grain Boundary',
  'Phase Boundary',
  'Sub-grain Boundary',
  'Twin Boundary',
];

const MORPHOLOGY_TYPES = [
  'Straight',
  'Curved',
  'Irregular',
  'Serrated',
  'Lobate',
  'Interlocking',
];

const DESCRIPTOR_TYPES = [
  'Defect',
  'Fluid Inclusion',
  'Mineral Inclusion',
  'Porosity',
  'Melt',
];

const DEFAULT_BOUNDARY: GrainBoundaryData = {
  typeOfBoundary: '',
  phase1: '',
  phase2: '',
  morphologies: [],
  descriptors: [],
};

export function GrainBoundaryAddForm({ onAdd, onCancel, initialData }: GrainBoundaryAddFormProps) {
  const [formData, setFormData] = useState<GrainBoundaryData>(initialData || DEFAULT_BOUNDARY);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleAddMorphology = (type: string) => {
    if (!type) return;
    setFormData(prev => ({
      ...prev,
      morphologies: [...prev.morphologies, { type }],
    }));
  };

  const handleDeleteMorphology = (index: number) => {
    setFormData(prev => ({
      ...prev,
      morphologies: prev.morphologies.filter((_, i) => i !== index),
    }));
  };

  const handleAddDescriptor = (type: string) => {
    if (!type) return;
    setFormData(prev => ({
      ...prev,
      descriptors: [...prev.descriptors, { type, subTypes: [] }],
    }));
  };

  const handleDeleteDescriptor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      descriptors: prev.descriptors.filter((_, i) => i !== index),
    }));
  };

  const handleAddDescriptorSubType = (descriptorIndex: number, subType: string, otherType: string) => {
    if (!subType) return;
    setFormData(prev => ({
      ...prev,
      descriptors: prev.descriptors.map((desc, i) =>
        i === descriptorIndex
          ? { ...desc, subTypes: [...desc.subTypes, { type: subType, otherType }] }
          : desc
      ),
    }));
  };

  const handleDeleteDescriptorSubType = (descriptorIndex: number, subTypeIndex: number) => {
    setFormData(prev => ({
      ...prev,
      descriptors: prev.descriptors.map((desc, i) =>
        i === descriptorIndex
          ? { ...desc, subTypes: desc.subTypes.filter((_, j) => j !== subTypeIndex) }
          : desc
      ),
    }));
  };

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_BOUNDARY);
    }
  };

  const isValid = formData.typeOfBoundary !== '' && formData.phase1 !== '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Type of Boundary */}
      <FormControl fullWidth required>
        <InputLabel>Type of Boundary</InputLabel>
        <Select
          value={formData.typeOfBoundary}
          label="Type of Boundary"
          onChange={(e) => setFormData(prev => ({ ...prev, typeOfBoundary: e.target.value }))}
        >
          {BOUNDARY_TYPES.map(type => (
            <MenuItem key={type} value={type}>{type}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Phase 1 */}
      <TextField
        fullWidth
        required
        label="Phase 1"
        value={formData.phase1}
        onChange={(e) => setFormData(prev => ({ ...prev, phase1: e.target.value }))}
      />

      {/* Phase 2 */}
      <TextField
        fullWidth
        label="Phase 2"
        value={formData.phase2}
        onChange={(e) => setFormData(prev => ({ ...prev, phase2: e.target.value }))}
      />

      {/* Morphologies */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Morphologies ({formData.morphologies.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Add Morphology</InputLabel>
              <Select
                label="Add Morphology"
                value=""
                onChange={(e) => handleAddMorphology(e.target.value)}
              >
                {MORPHOLOGY_TYPES.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <List dense>
              {formData.morphologies.map((morph, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleDeleteMorphology(index)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={morph.type} />
                </ListItem>
              ))}
            </List>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Descriptors */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Descriptors ({formData.descriptors.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Add Descriptor</InputLabel>
              <Select
                label="Add Descriptor"
                value=""
                onChange={(e) => handleAddDescriptor(e.target.value)}
              >
                {DESCRIPTOR_TYPES.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {formData.descriptors.map((desc, descIndex) => (
              <Box key={descIndex} sx={{ border: '1px solid #ddd', p: 2, borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">{desc.type}</Typography>
                  <IconButton size="small" onClick={() => handleDeleteDescriptor(descIndex)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>

                <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                  Sub-types: {desc.subTypes.length}
                </Typography>

                <List dense>
                  {desc.subTypes.map((subType, subIndex) => (
                    <ListItem
                      key={subIndex}
                      secondaryAction={
                        <IconButton edge="end" onClick={() => handleDeleteDescriptorSubType(descIndex, subIndex)}>
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={subType.type}
                        secondary={subType.otherType || undefined}
                      />
                    </ListItem>
                  ))}
                </List>

                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <TextField
                    size="small"
                    label="Sub-type"
                    placeholder="e.g., Pore type"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        const otherInput = target.parentElement?.nextElementSibling?.querySelector('input') as HTMLInputElement;
                        handleAddDescriptorSubType(descIndex, target.value, otherInput?.value || '');
                        target.value = '';
                        if (otherInput) otherInput.value = '';
                      }
                    }}
                  />
                  <TextField
                    size="small"
                    label="Other Type"
                    placeholder="Optional details"
                  />
                </Box>
              </Box>
            ))}
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
