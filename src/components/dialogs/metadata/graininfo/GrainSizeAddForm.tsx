/**
 * Grain Size Add/Edit Form Component
 *
 * Form for adding or editing a single GrainSizeType item.
 * Contains phase selector and statistical measurements.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { PhaseSelector } from '../reusable/PhaseSelector';
import { GrainSizeType } from '@/types/legacy-types';

interface GrainSizeAddFormProps {
  availablePhases: string[];
  onAdd: (item: GrainSizeType) => void;
  onCancel: () => void;
  initialData?: GrainSizeType;
}

const SIZE_UNITS = ['um', 'mm', 'cm', 'm'];

export function GrainSizeAddForm({
  availablePhases,
  onAdd,
  onCancel,
  initialData,
}: GrainSizeAddFormProps) {
  const [phases, setPhases] = useState<string[]>(initialData?.phases || []);
  const [mean, setMean] = useState<number | ''>(initialData?.mean ?? '');
  const [median, setMedian] = useState<number | ''>(initialData?.median ?? '');
  const [mode, setMode] = useState<number | ''>(initialData?.mode ?? '');
  const [standardDeviation, setStandardDeviation] = useState<number | ''>(
    initialData?.standardDeviation ?? ''
  );
  const [sizeUnit, setSizeUnit] = useState<string>(initialData?.sizeUnit || 'um');

  useEffect(() => {
    if (initialData) {
      setPhases(initialData.phases || []);
      setMean(initialData.mean ?? '');
      setMedian(initialData.median ?? '');
      setMode(initialData.mode ?? '');
      setStandardDeviation(initialData.standardDeviation ?? '');
      setSizeUnit(initialData.sizeUnit || 'um');
    }
  }, [initialData]);

  const handleSubmit = () => {
    const item: GrainSizeType = {
      phases: phases.length > 0 ? phases : null,
      mean: mean === '' ? null : mean,
      median: median === '' ? null : median,
      mode: mode === '' ? null : mode,
      standardDeviation: standardDeviation === '' ? null : standardDeviation,
      sizeUnit,
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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              type="number"
              value={mean}
              onChange={(e) => setMean(e.target.value === '' ? '' : parseFloat(e.target.value))}
              label="Mean"
              inputProps={{ min: 0, step: 'any' }}
              sx={{ flex: 1 }}
            />
            <FormControl sx={{ minWidth: 100 }}>
              <InputLabel>Unit</InputLabel>
              <Select
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value)}
                label="Unit"
              >
                {SIZE_UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              type="number"
              value={median}
              onChange={(e) => setMedian(e.target.value === '' ? '' : parseFloat(e.target.value))}
              label="Median"
              inputProps={{ min: 0, step: 'any' }}
              sx={{ flex: 1 }}
            />
            <FormControl sx={{ minWidth: 100 }}>
              <InputLabel>Unit</InputLabel>
              <Select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} label="Unit">
                {SIZE_UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              type="number"
              value={mode}
              onChange={(e) => setMode(e.target.value === '' ? '' : parseFloat(e.target.value))}
              label="Mode"
              inputProps={{ min: 0, step: 'any' }}
              sx={{ flex: 1 }}
            />
            <FormControl sx={{ minWidth: 100 }}>
              <InputLabel>Unit</InputLabel>
              <Select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} label="Unit">
                {SIZE_UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              type="number"
              value={standardDeviation}
              onChange={(e) =>
                setStandardDeviation(e.target.value === '' ? '' : parseFloat(e.target.value))
              }
              label="Standard Deviation"
              inputProps={{ min: 0, step: 'any' }}
              sx={{ flex: 1 }}
            />
            <FormControl sx={{ minWidth: 100 }}>
              <InputLabel>Unit</InputLabel>
              <Select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} label="Unit">
                {SIZE_UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>
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
