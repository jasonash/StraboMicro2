/**
 * Other TextField Component
 *
 * Dropdown with conditional "Other" text field.
 * When user selects "Other", a text field appears for custom input.
 * Matches legacy app's "Other" field pattern used across many dialogs.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  SelectChangeEvent,
} from '@mui/material';

interface OtherTextFieldProps {
  options: string[]; // Predefined options (should not include "Other")
  value: string;
  onChange: (value: string) => void;
  label: string;
  helperText?: string;
  required?: boolean;
  otherLabel?: string; // Label for "Other" text field
}

export function OtherTextField({
  options,
  value,
  onChange,
  label,
  helperText,
  required = false,
  otherLabel = 'Please specify',
}: OtherTextFieldProps) {
  // Determine if current value is "Other" (not in predefined options)
  const isOther = value !== '' && !options.includes(value);

  // Selected option: either a predefined option or "Other"
  const [selectedOption, setSelectedOption] = useState<string>(() => {
    if (value === '') return '';
    return options.includes(value) ? value : 'Other';
  });

  // Custom text when "Other" is selected
  const [otherText, setOtherText] = useState<string>(() => {
    return isOther ? value : '';
  });

  // Sync state when external value changes
  useEffect(() => {
    if (value === '') {
      setSelectedOption('');
      setOtherText('');
    } else if (options.includes(value)) {
      setSelectedOption(value);
      setOtherText('');
    } else {
      setSelectedOption('Other');
      setOtherText(value);
    }
  }, [value, options]);

  const handleSelectChange = (event: SelectChangeEvent<string>) => {
    const selected = event.target.value;
    setSelectedOption(selected);

    if (selected === 'Other') {
      // Switch to "Other" mode
      onChange(otherText); // Use existing otherText or empty string
    } else {
      // Predefined option selected
      setOtherText('');
      onChange(selected);
    }
  };

  const handleOtherTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setOtherText(text);
    onChange(text);
  };

  return (
    <Box>
      <FormControl fullWidth>
        <InputLabel>{label}</InputLabel>
        <Select
          value={selectedOption}
          onChange={handleSelectChange}
          label={label}
          required={required}
        >
          {required ? null : (
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
          )}
          {options.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
          <MenuItem value="Other">Other</MenuItem>
        </Select>
        {helperText && !selectedOption && (
          <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5, ml: 1.75 }}>
            {helperText}
          </Box>
        )}
      </FormControl>

      {selectedOption === 'Other' && (
        <TextField
          fullWidth
          value={otherText}
          onChange={handleOtherTextChange}
          label={otherLabel}
          required={required}
          sx={{ mt: 2 }}
        />
      )}
    </Box>
  );
}
