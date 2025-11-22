/**
 * Unit Input Component
 *
 * TextField + Unit dropdown combo for measurements (e.g., "50 μm", "10 mm", "45 degrees").
 * Matches legacy app's measurement input pattern.
 */

import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
} from '@mui/material';

interface UnitInputProps {
  value: number | '';
  unit: string;
  onValueChange: (value: number | '') => void;
  onUnitChange: (unit: string) => void;
  units: string[]; // Available unit options
  label: string;
  helperText?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
}

export function UnitInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
  units,
  label,
  helperText,
  required = false,
  min,
  max,
  step = 'any',
}: UnitInputProps) {
  const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.value;
    onValueChange(val === '' ? '' : parseFloat(val));
  };

  const handleUnitChange = (event: SelectChangeEvent<string>) => {
    onUnitChange(event.target.value);
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <TextField
        type="number"
        value={value}
        onChange={handleValueChange}
        label={label}
        required={required}
        helperText={helperText}
        inputProps={{ min, max, step }}
        sx={{ flex: 1 }}
      />
      <FormControl sx={{ minWidth: 100 }}>
        <InputLabel>Unit</InputLabel>
        <Select
          value={unit}
          onChange={handleUnitChange}
          label="Unit"
        >
          {units.map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
