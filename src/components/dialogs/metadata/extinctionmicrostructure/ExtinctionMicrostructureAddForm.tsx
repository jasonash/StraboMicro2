/**
 * Extinction Microstructure Add/Edit Form
 *
 * Form for adding or editing extinction microstructures.
 * Contains 7 nested sub-type arrays.
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

export interface ExtinctionDislocationData {
  type: string;
}

export interface ExtinctionDislocationSubData {
  type: string;
}

export interface ExtinctionHeteroData {
  type: string;
}

export interface ExtinctionSubgrainData {
  type: string;
}

export interface ExtinctionBandsData {
  type: string;
}

export interface ExtinctionWideBandsData {
  type: string;
}

export interface ExtinctionFineBandsData {
  type: string;
}

export interface ExtinctionMicrostructureData {
  phase: string;
  dislocations: ExtinctionDislocationData[];
  subDislocations: ExtinctionDislocationSubData[];
  heterogeneousExtinctions: ExtinctionHeteroData[];
  subGrainStructures: ExtinctionSubgrainData[];
  extinctionBands: ExtinctionBandsData[];
  subWideExtinctionBands: ExtinctionWideBandsData[];
  subFineExtinctionBands: ExtinctionFineBandsData[];
}

interface ExtinctionMicrostructureAddFormProps {
  onAdd: (data: ExtinctionMicrostructureData) => void;
  onCancel?: () => void;
  initialData?: ExtinctionMicrostructureData;
}

const DISLOCATION_TYPES = [
  'Free Dislocations',
  'Tangles',
  'Walls',
];

const DISLOCATION_SUB_TYPES = [
  'Edge',
  'Screw',
  'Mixed',
];

const HETEROGENEOUS_EXTINCTION_TYPES = [
  'Patchy',
  'Sweeping',
  'Irregular',
];

const SUBGRAIN_TYPES = [
  'Core-and-Mantle',
  'Ribbon Grains',
  'Chessboard',
  'Subgrains',
];

const EXTINCTION_BAND_TYPES = [
  'Deformation Bands',
  'Kink Bands',
];

const WIDE_BAND_TYPES = [
  'Type A',
  'Type B',
];

const FINE_BAND_TYPES = [
  'Type I',
  'Type II',
];

const DEFAULT_EXTINCTION: ExtinctionMicrostructureData = {
  phase: '',
  dislocations: [],
  subDislocations: [],
  heterogeneousExtinctions: [],
  subGrainStructures: [],
  extinctionBands: [],
  subWideExtinctionBands: [],
  subFineExtinctionBands: [],
};

export function ExtinctionMicrostructureAddForm({ onAdd, onCancel, initialData }: ExtinctionMicrostructureAddFormProps) {
  const [formData, setFormData] = useState<ExtinctionMicrostructureData>(initialData || DEFAULT_EXTINCTION);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleAddItem = (field: keyof ExtinctionMicrostructureData, type: string) => {
    if (!type) return;
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] as any[]), { type }],
    }));
  };

  const handleDeleteItem = (field: keyof ExtinctionMicrostructureData, index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] as any[]).filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    onAdd(formData);
    if (!initialData) {
      setFormData(DEFAULT_EXTINCTION);
    }
  };

  const isValid = formData.phase !== '';

  const renderArraySection = (
    title: string,
    field: keyof ExtinctionMicrostructureData,
    types: string[]
  ) => {
    const items = formData[field] as any[];
    return (
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>{title} ({items.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Add {title}</InputLabel>
              <Select
                label={`Add ${title}`}
                value=""
                onChange={(e) => handleAddItem(field, e.target.value)}
              >
                {types.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <List dense>
              {items.map((item, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleDeleteItem(field, index)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={item.type} />
                </ListItem>
              ))}
            </List>
          </Box>
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Phase */}
      <TextField
        fullWidth
        required
        label="Phase"
        value={formData.phase}
        onChange={(e) => setFormData(prev => ({ ...prev, phase: e.target.value }))}
      />

      {/* 7 nested sub-type arrays */}
      {renderArraySection('Dislocations', 'dislocations', DISLOCATION_TYPES)}
      {renderArraySection('Sub-Dislocations', 'subDislocations', DISLOCATION_SUB_TYPES)}
      {renderArraySection('Heterogeneous Extinctions', 'heterogeneousExtinctions', HETEROGENEOUS_EXTINCTION_TYPES)}
      {renderArraySection('Sub-Grain Structures', 'subGrainStructures', SUBGRAIN_TYPES)}
      {renderArraySection('Extinction Bands', 'extinctionBands', EXTINCTION_BAND_TYPES)}
      {renderArraySection('Wide Extinction Bands', 'subWideExtinctionBands', WIDE_BAND_TYPES)}
      {renderArraySection('Fine Extinction Bands', 'subFineExtinctionBands', FINE_BAND_TYPES)}

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
