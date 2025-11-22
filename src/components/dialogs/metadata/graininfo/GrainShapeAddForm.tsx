/**
 * Grain Shape Add/Edit Form Component
 *
 * Form for adding or editing a single GrainShapeType item.
 * Contains phase selector and shape description.
 */

import { useState, useEffect } from 'react';
import { Box, Button } from '@mui/material';
import { PhaseSelector } from '../reusable/PhaseSelector';
import { OtherTextField } from '../reusable/OtherTextField';
import { GrainShapeType } from '@/types/legacy-types';

interface GrainShapeAddFormProps {
  availablePhases: string[];
  onAdd: (item: GrainShapeType) => void;
  onCancel: () => void;
  initialData?: GrainShapeType;
}

const SHAPE_OPTIONS = [
  'Equant',
  'Elongate',
  'Tabular',
  'Platy',
  'Acicular',
  'Prismatic',
  'Anhedral',
  'Subhedral',
  'Euhedral',
];

export function GrainShapeAddForm({
  availablePhases,
  onAdd,
  onCancel,
  initialData,
}: GrainShapeAddFormProps) {
  const [phases, setPhases] = useState<string[]>(initialData?.phases || []);
  const [shape, setShape] = useState<string>(initialData?.shape || '');

  useEffect(() => {
    if (initialData) {
      setPhases(initialData.phases || []);
      setShape(initialData.shape || '');
    }
  }, [initialData]);

  const handleSubmit = () => {
    const item: GrainShapeType = {
      phases: phases.length > 0 ? phases : null,
      shape: shape || null,
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
        <OtherTextField
          options={SHAPE_OPTIONS}
          value={shape}
          onChange={setShape}
          label="Shape"
        />
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
