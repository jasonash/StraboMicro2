/**
 * Fabric Add/Edit Form
 *
 * Form for adding or editing a single fabric.
 * Matches legacy editFabric.java layout with nested sub-objects.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Button,
  Typography,
  IconButton,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { AutocompleteMineralSearch } from '../reusable/AutocompleteMineralSearch';
import { UnitInput } from '../reusable/UnitInput';

// Export FabricData to match FabricType from project-types
export interface FabricData {
  fabricLabel: string;
  fabricElement: string;
  fabricCategory: string;
  fabricSpacing: string;
  fabricDefinedBy: string[];
  fabricCompositionInfo: FabricCompositionInfo | null;
  fabricGrainSizeInfo: FabricGrainSizeInfo | null;
  fabricGrainShapeInfo: FabricGrainShapeInfo | null;
  fabricCleavageInfo: FabricCleavageInfo | null;
}

// Nested sub-types (matching project-types.ts)
interface FabricCompositionInfo {
  compositionNotes: string;
  layers: FabricCompositionLayer[];
}

interface FabricCompositionLayer {
  composition: string;
  thickness: number | null;
  thicknessUnits: string;
}

interface FabricGrainSizeInfo {
  grainSizeNotes: string;
  layers: FabricGrainSizeLayer[];
}

interface FabricGrainSizeLayer {
  grainSize: string;
  thickness: number | null;
  thicknessUnits: string;
}

interface FabricGrainShapeInfo {
  phases: string[];
  alignment: string;
  shape: string;
  notes: string;
}

interface FabricCleavageInfo {
  spacing: number | null;
  spacingUnit: string;
  styloliticCleavage: boolean;
  geometryOfSeams: string[];
  notes: string;
}

interface FabricAddFormProps {
  onAdd: (fabric: FabricData) => void;
  onCancel?: () => void;
  initialData?: FabricData;
}

// LEGACY UNITS: lowercase "um", not "μm"
const SIZE_UNITS = ['um', 'mm', 'cm'];

const DEFAULT_COMPOSITION_LAYER: FabricCompositionLayer = {
  composition: '',
  thickness: null,
  thicknessUnits: 'um',
};

const DEFAULT_GRAIN_SIZE_LAYER: FabricGrainSizeLayer = {
  grainSize: '',
  thickness: null,
  thicknessUnits: 'um',
};

const DEFAULT_FABRIC: FabricData = {
  fabricLabel: '',
  fabricElement: '',
  fabricCategory: '',
  fabricSpacing: '',
  fabricDefinedBy: [],
  fabricCompositionInfo: null,
  fabricGrainSizeInfo: null,
  fabricGrainShapeInfo: null,
  fabricCleavageInfo: null,
};

export function FabricAddForm({ onAdd, onCancel, initialData }: FabricAddFormProps) {
  const [formData, setFormData] = useState<FabricData>(DEFAULT_FABRIC);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData(DEFAULT_FABRIC);
    }
  }, [initialData]);

  const handleSubmit = () => {
    onAdd(formData);
    // Reset form if adding (not editing)
    if (!initialData) {
      setFormData(DEFAULT_FABRIC);
    }
  };

  // Toggle a value in fabricDefinedBy array
  const toggleDefinedBy = (value: string) => {
    setFormData(prev => {
      const isCurrentlySelected = prev.fabricDefinedBy.includes(value);
      const newDefinedBy = isCurrentlySelected
        ? prev.fabricDefinedBy.filter(v => v !== value)
        : [...prev.fabricDefinedBy, value];

      // Initialize or clear sub-objects based on selection
      const updates: Partial<FabricData> = { fabricDefinedBy: newDefinedBy };

      if (value === 'Composition') {
        updates.fabricCompositionInfo = isCurrentlySelected
          ? null
          : { compositionNotes: '', layers: [] };
      } else if (value === 'Grain Size') {
        updates.fabricGrainSizeInfo = isCurrentlySelected
          ? null
          : { grainSizeNotes: '', layers: [] };
      } else if (value === 'Grain Shape') {
        updates.fabricGrainShapeInfo = isCurrentlySelected
          ? null
          : { phases: [], alignment: '', shape: '', notes: '' };
      } else if (value === 'Cleavage') {
        updates.fabricCleavageInfo = isCurrentlySelected
          ? null
          : { spacing: null, spacingUnit: 'um', styloliticCleavage: false, geometryOfSeams: [], notes: '' };
      }

      return { ...prev, ...updates };
    });
  };

  // Composition layer management
  const addCompositionLayer = () => {
    setFormData(prev => ({
      ...prev,
      fabricCompositionInfo: {
        ...prev.fabricCompositionInfo!,
        layers: [...prev.fabricCompositionInfo!.layers, { ...DEFAULT_COMPOSITION_LAYER }],
      },
    }));
  };

  const removeCompositionLayer = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fabricCompositionInfo: {
        ...prev.fabricCompositionInfo!,
        layers: prev.fabricCompositionInfo!.layers.filter((_, i) => i !== index),
      },
    }));
  };

  const updateCompositionLayer = (index: number, updates: Partial<FabricCompositionLayer>) => {
    setFormData(prev => ({
      ...prev,
      fabricCompositionInfo: {
        ...prev.fabricCompositionInfo!,
        layers: prev.fabricCompositionInfo!.layers.map((layer, i) =>
          i === index ? { ...layer, ...updates } : layer
        ),
      },
    }));
  };

  // Grain size layer management
  const addGrainSizeLayer = () => {
    setFormData(prev => ({
      ...prev,
      fabricGrainSizeInfo: {
        ...prev.fabricGrainSizeInfo!,
        layers: [...prev.fabricGrainSizeInfo!.layers, { ...DEFAULT_GRAIN_SIZE_LAYER }],
      },
    }));
  };

  const removeGrainSizeLayer = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fabricGrainSizeInfo: {
        ...prev.fabricGrainSizeInfo!,
        layers: prev.fabricGrainSizeInfo!.layers.filter((_, i) => i !== index),
      },
    }));
  };

  const updateGrainSizeLayer = (index: number, updates: Partial<FabricGrainSizeLayer>) => {
    setFormData(prev => ({
      ...prev,
      fabricGrainSizeInfo: {
        ...prev.fabricGrainSizeInfo!,
        layers: prev.fabricGrainSizeInfo!.layers.map((layer, i) =>
          i === index ? { ...layer, ...updates } : layer
        ),
      },
    }));
  };

  // Toggle geometry of seams
  const toggleGeometryOfSeams = (value: string) => {
    setFormData(prev => ({
      ...prev,
      fabricCleavageInfo: {
        ...prev.fabricCleavageInfo!,
        geometryOfSeams: prev.fabricCleavageInfo!.geometryOfSeams.includes(value)
          ? prev.fabricCleavageInfo!.geometryOfSeams.filter(v => v !== value)
          : [...prev.fabricCleavageInfo!.geometryOfSeams, value],
      },
    }));
  };

  // Validation: fabricLabel is required
  const isValid = formData.fabricLabel.trim() !== '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Label (Required) */}
      <TextField
        fullWidth
        label="Fabric Label *"
        value={formData.fabricLabel}
        onChange={(e) => setFormData(prev => ({ ...prev, fabricLabel: e.target.value }))}
        placeholder="e.g., S1, L1, Fabric 1"
      />

      {/* Type Grid: Foliation/Lineation/Fabric Trace | Primary/Secondary | Penetrative/Spaced */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Type</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Row 1: Fabric Element */}
          <FormControl component="fieldset">
            <RadioGroup
              row
              value={formData.fabricElement}
              onChange={(e) => setFormData(prev => ({ ...prev, fabricElement: e.target.value }))}
            >
              <FormControlLabel value="foliation" control={<Radio />} label="Foliation" />
              <FormControlLabel value="lineation" control={<Radio />} label="Lineation" />
              <FormControlLabel value="fabricTrace" control={<Radio />} label="Fabric Trace" />
            </RadioGroup>
          </FormControl>

          {/* Row 2: Fabric Category */}
          <FormControl component="fieldset">
            <RadioGroup
              row
              value={formData.fabricCategory}
              onChange={(e) => setFormData(prev => ({ ...prev, fabricCategory: e.target.value }))}
            >
              <FormControlLabel value="primary" control={<Radio />} label="Primary" />
              <FormControlLabel value="secondary" control={<Radio />} label="Secondary" />
            </RadioGroup>
          </FormControl>

          {/* Row 3: Fabric Spacing */}
          <FormControl component="fieldset">
            <RadioGroup
              row
              value={formData.fabricSpacing}
              onChange={(e) => setFormData(prev => ({ ...prev, fabricSpacing: e.target.value }))}
            >
              <FormControlLabel value="penetrative" control={<Radio />} label="Penetrative" />
              <FormControlLabel value="spaced" control={<Radio />} label="Spaced" />
            </RadioGroup>
          </FormControl>
        </Box>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Defined By Section */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Defined By:</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Composition Checkbox */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.fabricDefinedBy.includes('Composition')}
                  onChange={() => toggleDefinedBy('Composition')}
                />
              }
              label="Composition"
            />
            {formData.fabricDefinedBy.includes('Composition') && formData.fabricCompositionInfo && (
              <Box sx={{ ml: 4, mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Composition Layers */}
                  <Typography variant="body2" fontWeight="bold">Layers</Typography>
                  {formData.fabricCompositionInfo.layers.map((layer, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        label="Composition"
                        value={layer.composition}
                        onChange={(e) => updateCompositionLayer(index, { composition: e.target.value })}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <UnitInput
                        value={layer.thickness || ''}
                        unit={layer.thicknessUnits}
                        onValueChange={(value) => updateCompositionLayer(index, { thickness: value === '' ? null : value })}
                        onUnitChange={(unit) => updateCompositionLayer(index, { thicknessUnits: unit })}
                        units={SIZE_UNITS}
                        label="Thickness"
                        min={0}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeCompositionLayer(index)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addCompositionLayer}
                    size="small"
                    variant="outlined"
                  >
                    Add Layer
                  </Button>

                  {/* Composition Notes */}
                  <TextField
                    label="Composition Notes"
                    value={formData.fabricCompositionInfo.compositionNotes}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      fabricCompositionInfo: {
                        ...prev.fabricCompositionInfo!,
                        compositionNotes: e.target.value,
                      },
                    }))}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Box>
              </Box>
            )}
          </Box>

          {/* Grain Size Checkbox */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.fabricDefinedBy.includes('Grain Size')}
                  onChange={() => toggleDefinedBy('Grain Size')}
                />
              }
              label="Grain Size"
            />
            {formData.fabricDefinedBy.includes('Grain Size') && formData.fabricGrainSizeInfo && (
              <Box sx={{ ml: 4, mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Grain Size Layers */}
                  <Typography variant="body2" fontWeight="bold">Layers</Typography>
                  {formData.fabricGrainSizeInfo.layers.map((layer, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        label="Grain Size"
                        value={layer.grainSize}
                        onChange={(e) => updateGrainSizeLayer(index, { grainSize: e.target.value })}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <UnitInput
                        value={layer.thickness || ''}
                        unit={layer.thicknessUnits}
                        onValueChange={(value) => updateGrainSizeLayer(index, { thickness: value === '' ? null : value })}
                        onUnitChange={(unit) => updateGrainSizeLayer(index, { thicknessUnits: unit })}
                        units={SIZE_UNITS}
                        label="Thickness"
                        min={0}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeGrainSizeLayer(index)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addGrainSizeLayer}
                    size="small"
                    variant="outlined"
                  >
                    Add Layer
                  </Button>

                  {/* Grain Size Notes */}
                  <TextField
                    label="Grain Size Notes"
                    value={formData.fabricGrainSizeInfo.grainSizeNotes}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      fabricGrainSizeInfo: {
                        ...prev.fabricGrainSizeInfo!,
                        grainSizeNotes: e.target.value,
                      },
                    }))}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Box>
              </Box>
            )}
          </Box>

          {/* Grain Shape Checkbox */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.fabricDefinedBy.includes('Grain Shape')}
                  onChange={() => toggleDefinedBy('Grain Shape')}
                />
              }
              label="Grain Shape"
            />
            {formData.fabricDefinedBy.includes('Grain Shape') && formData.fabricGrainShapeInfo && (
              <Box sx={{ ml: 4, mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Phases */}
                  <AutocompleteMineralSearch
                    selectedMinerals={formData.fabricGrainShapeInfo.phases}
                    onChange={(minerals) => setFormData(prev => ({
                      ...prev,
                      fabricGrainShapeInfo: {
                        ...prev.fabricGrainShapeInfo!,
                        phases: minerals,
                      },
                    }))}
                    multiple
                    label="Phases"
                  />

                  {/* Alignment */}
                  <FormControl component="fieldset" size="small">
                    <Typography variant="body2" sx={{ mb: 0.5 }}>Alignment</Typography>
                    <RadioGroup
                      row
                      value={formData.fabricGrainShapeInfo.alignment}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        fabricGrainShapeInfo: {
                          ...prev.fabricGrainShapeInfo!,
                          alignment: e.target.value,
                        },
                      }))}
                    >
                      <FormControlLabel value="weak" control={<Radio />} label="Weak" />
                      <FormControlLabel value="moderate" control={<Radio />} label="Moderate" />
                      <FormControlLabel value="strong" control={<Radio />} label="Strong" />
                    </RadioGroup>
                  </FormControl>

                  {/* Shape */}
                  <FormControl component="fieldset" size="small">
                    <Typography variant="body2" sx={{ mb: 0.5 }}>Shape</Typography>
                    <RadioGroup
                      row
                      value={formData.fabricGrainShapeInfo.shape}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        fabricGrainShapeInfo: {
                          ...prev.fabricGrainShapeInfo!,
                          shape: e.target.value,
                        },
                      }))}
                    >
                      <FormControlLabel value="euhedral" control={<Radio />} label="Euhedral" />
                      <FormControlLabel value="deformed" control={<Radio />} label="Deformed" />
                    </RadioGroup>
                  </FormControl>

                  {/* Notes */}
                  <TextField
                    label="Shape Notes"
                    value={formData.fabricGrainShapeInfo.notes}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      fabricGrainShapeInfo: {
                        ...prev.fabricGrainShapeInfo!,
                        notes: e.target.value,
                      },
                    }))}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Box>
              </Box>
            )}
          </Box>

          {/* Cleavage (Solution Seam) Checkbox */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.fabricDefinedBy.includes('Cleavage')}
                  onChange={() => toggleDefinedBy('Cleavage')}
                />
              }
              label="Cleavage (Solution Seam)"
            />
            {formData.fabricDefinedBy.includes('Cleavage') && formData.fabricCleavageInfo && (
              <Box sx={{ ml: 4, mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Spacing */}
                  <UnitInput
                    value={formData.fabricCleavageInfo.spacing || ''}
                    unit={formData.fabricCleavageInfo.spacingUnit}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      fabricCleavageInfo: {
                        ...prev.fabricCleavageInfo!,
                        spacing: value === '' ? null : value,
                      },
                    }))}
                    onUnitChange={(unit) => setFormData(prev => ({
                      ...prev,
                      fabricCleavageInfo: {
                        ...prev.fabricCleavageInfo!,
                        spacingUnit: unit,
                      },
                    }))}
                    units={SIZE_UNITS}
                    label="Spacing"
                    min={0}
                  />

                  {/* Stylolitic Cleavage */}
                  <FormControl component="fieldset" size="small">
                    <Typography variant="body2" sx={{ mb: 0.5 }}>Stylolitic Cleavage?</Typography>
                    <RadioGroup
                      row
                      value={formData.fabricCleavageInfo.styloliticCleavage ? 'yes' : 'no'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        fabricCleavageInfo: {
                          ...prev.fabricCleavageInfo!,
                          styloliticCleavage: e.target.value === 'yes',
                        },
                      }))}
                    >
                      <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                      <FormControlLabel value="no" control={<Radio />} label="No" />
                    </RadioGroup>
                  </FormControl>

                  {/* Geometry of Seams */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>Geometry of Seams</Typography>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.fabricCleavageInfo.geometryOfSeams.includes('planar')}
                          onChange={() => toggleGeometryOfSeams('planar')}
                        />
                      }
                      label="Planar"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.fabricCleavageInfo.geometryOfSeams.includes('anastomosing')}
                          onChange={() => toggleGeometryOfSeams('anastomosing')}
                        />
                      }
                      label="Anastomosing"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.fabricCleavageInfo.geometryOfSeams.includes('discontinuous')}
                          onChange={() => toggleGeometryOfSeams('discontinuous')}
                        />
                      }
                      label="Discontinuous"
                    />
                  </Box>

                  {/* Cleavage Notes */}
                  <TextField
                    label="Cleavage Notes"
                    value={formData.fabricCleavageInfo.notes}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      fabricCleavageInfo: {
                        ...prev.fabricCleavageInfo!,
                        notes: e.target.value,
                      },
                    }))}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Box>
              </Box>
            )}
          </Box>
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
