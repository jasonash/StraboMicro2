/**
 * Dynamic Field Set Component
 *
 * Checkbox or Radio button that shows/hides child fields when selected.
 * Matches legacy app's pattern of expanding forms with conditional sub-fields.
 */

import { ReactNode } from 'react';
import {
  Box,
  FormControlLabel,
  Checkbox,
  Radio,
  Collapse,
} from '@mui/material';

interface DynamicFieldSetProps {
  type: 'checkbox' | 'radio';
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode; // Sub-fields to show when checked
  value?: string; // For radio buttons
  name?: string; // For radio button groups
}

export function DynamicFieldSet({
  type,
  label,
  checked,
  onChange,
  children,
  value,
  name,
}: DynamicFieldSetProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const control = type === 'checkbox' ? (
    <Checkbox checked={checked} onChange={handleChange} />
  ) : (
    <Radio checked={checked} onChange={handleChange} value={value} name={name} />
  );

  return (
    <Box>
      <FormControlLabel control={control} label={label} />
      {children && (
        <Collapse in={checked}>
          <Box sx={{ ml: 4, mt: 1, mb: 2 }}>
            {children}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
