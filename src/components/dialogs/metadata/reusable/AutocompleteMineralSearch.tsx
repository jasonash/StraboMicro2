/**
 * Autocomplete Mineral Search Component
 *
 * Provides autocomplete search functionality for minerals from the database.
 * Users can search for minerals by name and select them from suggestions.
 */

import { useState } from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  AutocompleteRenderInputParams,
} from '@mui/material';
import { Mineral, searchMinerals } from '@/utils/mineralData';

interface AutocompleteMineralSearchProps {
  selectedMinerals: string[]; // Array of mineral names
  onChange: (minerals: string[]) => void;
  label?: string;
  placeholder?: string;
  multiple?: boolean; // Allow multiple selection (default: true)
  helperText?: string;
}

export function AutocompleteMineralSearch({
  selectedMinerals,
  onChange,
  label = 'Minerals',
  placeholder = 'Search for minerals...',
  multiple = true,
  helperText,
}: AutocompleteMineralSearchProps) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<Mineral[]>(() => searchMinerals(''));

  // Update options when input changes
  const handleInputChange = (_event: React.SyntheticEvent, value: string) => {
    setInputValue(value);
    setOptions(searchMinerals(value));
  };

  // Handle selection change
  const handleChange = (_event: React.SyntheticEvent, value: Mineral[] | Mineral | null) => {
    if (multiple) {
      const minerals = (value as Mineral[]) || [];
      onChange(minerals.map(m => m.mineralname));
    } else {
      const mineral = value as Mineral | null;
      onChange(mineral ? [mineral.mineralname] : []);
    }
  };

  // Get Mineral objects from selected mineral names
  const selectedMineralObjects = options.filter(m =>
    selectedMinerals.includes(m.mineralname)
  );

  return (
    <Autocomplete
      multiple={multiple}
      options={options}
      value={multiple ? selectedMineralObjects : (selectedMineralObjects[0] || null)}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      getOptionLabel={(option) => option.mineralname}
      isOptionEqualToValue={(option, value) => option.mineralname === value.mineralname}
      filterOptions={(x) => x} // We handle filtering ourselves
      renderInput={(params: AutocompleteRenderInputParams) => (
        <TextField
          {...params}
          label={label}
          placeholder={selectedMinerals.length === 0 ? placeholder : undefined}
          helperText={helperText}
        />
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            label={`${option.mineralname} (${option.abbrev})`}
            {...getTagProps({ index })}
            key={option.pkey}
          />
        ))
      }
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.pkey}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>{option.mineralname}</span>
            <span style={{ color: '#666', fontSize: '0.9em', marginLeft: '8px' }}>
              {option.abbrev}
            </span>
          </Box>
        </Box>
      )}
      sx={{
        '& .MuiAutocomplete-inputRoot': {
          flexWrap: 'wrap',
        },
      }}
    />
  );
}
