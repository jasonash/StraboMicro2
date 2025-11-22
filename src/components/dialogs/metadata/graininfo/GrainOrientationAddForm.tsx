/**
 * Grain Orientation Add/Edit Form Component
 *
 * Form for adding or editing a single GrainOrientationType item.
 * Contains phase selector, orientation data, and SPO technique information.
 * CRITICAL: Uses legacy field names - relativeTo, spoTechnique, spoOther
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { PhaseSelector } from '../reusable/PhaseSelector';
import { OtherTextField } from '../reusable/OtherTextField';
import { GrainOrientationType } from '@/types/legacy-types';

interface GrainOrientationAddFormProps {
  availablePhases: string[];
  onAdd: (item: GrainOrientationType) => void;
  onCancel: () => void;
  initialData?: GrainOrientationType;
}

const RELATIVE_TO_OPTIONS = ['North', 'Sample Edge', 'Foliation', 'Lineation'];
const SPO_METHODS = ['Tensor Method', 'Intercept Method', 'Best Fit Ellipse', 'Manual'];

export function GrainOrientationAddForm({
  availablePhases,
  onAdd,
  onCancel,
  initialData,
}: GrainOrientationAddFormProps) {
  const [phases, setPhases] = useState<string[]>(initialData?.phases || []);
  const [meanOrientation, setMeanOrientation] = useState<number | ''>(
    initialData?.meanOrientation ?? ''
  );
  const [relativeTo, setRelativeTo] = useState<string>(initialData?.relativeTo || '');
  const [software, setSoftware] = useState<string>(initialData?.software || '');
  const [spoTechnique, setSpoTechnique] = useState<string>(initialData?.spoTechnique || '');
  const [spoOther, setSpoOther] = useState<string>(initialData?.spoOther || '');

  useEffect(() => {
    if (initialData) {
      setPhases(initialData.phases || []);
      setMeanOrientation(initialData.meanOrientation ?? '');
      setRelativeTo(initialData.relativeTo || '');
      setSoftware(initialData.software || '');
      setSpoTechnique(initialData.spoTechnique || '');
      setSpoOther(initialData.spoOther || '');
    }
  }, [initialData]);

  const handleSpoTechniqueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const technique = event.target.value;
    setSpoTechnique(technique);
    if (technique !== 'Other') {
      setSpoOther('');
    }
  };

  const handleSubmit = () => {
    const item: GrainOrientationType = {
      phases: phases.length > 0 ? phases : null,
      meanOrientation: meanOrientation === '' ? null : meanOrientation,
      relativeTo: relativeTo || null,
      software: software || null,
      spoTechnique: spoTechnique || null,
      spoOther: spoTechnique === 'Other' && spoOther ? spoOther : null,
    };
    onAdd(item);
  };

  return (
    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
      <PhaseSelector
        availablePhases={availablePhases}
        selectedPhases={phases}
        onChange={setPhases}
      />

      <Box sx={{ mt: 3 }}>
        <TextField
          fullWidth
          type="number"
          label="Mean Orientation (degrees)"
          value={meanOrientation}
          onChange={(e) =>
            setMeanOrientation(e.target.value === '' ? '' : parseFloat(e.target.value))
          }
          inputProps={{ step: 0.1 }}
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <OtherTextField
          options={RELATIVE_TO_OPTIONS}
          value={relativeTo}
          onChange={setRelativeTo}
          label="Relative to"
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <TextField
          fullWidth
          label="Software"
          value={software}
          onChange={(e) => setSoftware(e.target.value)}
          helperText="Software used for SPO analysis"
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <FormControl component="fieldset" fullWidth>
          <FormLabel component="legend">SPO Technique / Method</FormLabel>
          <RadioGroup value={spoTechnique} onChange={handleSpoTechniqueChange}>
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
          {spoTechnique === 'Other' && (
            <TextField
              fullWidth
              label="Please specify"
              value={spoOther}
              onChange={(e) => setSpoOther(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </FormControl>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          {initialData ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
