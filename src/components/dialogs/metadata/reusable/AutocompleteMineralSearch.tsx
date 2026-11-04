/**
 * Autocomplete Mineral Search Component
 *
 * Provides autocomplete search functionality for minerals from the database.
 * Users can search for minerals by name and select them from suggestions.
 * A name that is not in the database (e.g. "lithic fragments") can be used
 * too: 'Use "..."' ends the list when the typed text matches no mineral, and
 * custom names already used in the project are offered again
 * (src/utils/customMinerals.ts; Peter, 2026-10-29).
 */

import { useMemo, useState } from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  AutocompleteRenderInputParams,
} from '@mui/material';
import { findMineral, searchMinerals } from '@/utils/mineralData';
import { matchCustomNames, projectMineralNames, typedNameToOffer } from '@/utils/customMinerals';
import { useAppStore } from '@/store';

interface AutocompleteMineralSearchProps {
  selectedMinerals: string[]; // Array of mineral names
  onChange: (minerals: string[]) => void;
  label?: string;
  placeholder?: string;
  multiple?: boolean; // Allow multiple selection (default: true)
  helperText?: string;
}

/** A database mineral, a custom name, or the typed text offered as 'Use "..."' */
interface MineralOption {
  name: string;
  abbrev: string | null;
  custom: boolean;
  typed: boolean;
}

const NOT_IN_LIST = 'not in mineral list';

/** The option for a saved name: keeps the name as saved (legacy lowercase names too) */
function optionForName(name: string): MineralOption {
  const mineral = findMineral(name);
  return { name, abbrev: mineral?.abbrev ?? null, custom: !mineral, typed: false };
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
  const project = useAppStore((state) => state.project);

  // Custom names used anywhere in the project, offered again when typing
  const customNames = useMemo(
    () => matchCustomNames('', projectMineralNames(project), (n) => !!findMineral(n)),
    [project]
  );

  const options = useMemo((): MineralOption[] => {
    const fromDatabase = searchMinerals(inputValue).map((m): MineralOption => (
      { name: m.mineralname, abbrev: m.abbrev, custom: false, typed: false }
    ));
    const fromProject = matchCustomNames(inputValue, customNames, () => false).map(optionForName);
    const offered = [...fromProject, ...fromDatabase];
    const typed = typedNameToOffer(inputValue, offered.map((o) => o.name));
    // With nothing typed the common minerals come first, then the project's custom names
    const list = inputValue.trim() ? offered : [...fromDatabase, ...fromProject];
    return typed ? [...list, { name: typed, abbrev: null, custom: true, typed: true }] : list;
  }, [inputValue, customNames]);

  // Handle selection change
  const handleChange = (_event: React.SyntheticEvent, value: MineralOption[] | MineralOption | null) => {
    if (Array.isArray(value)) {
      onChange(value.map(m => m.name));
    } else {
      onChange(value ? [value.name] : []);
    }
  };

  // Options for the selected mineral names (database minerals and custom names).
  // Memoized: a new value array on every render made the Autocomplete (multiple) take it
  // as a new selection and clear the typed text at each keystroke (Fabric Phases; Peter,
  // 2026-10-29)
  const selectedMineralObjects = useMemo(
    () => selectedMinerals.filter((name) => name.trim() !== '').map(optionForName),
    [selectedMinerals]
  );

  return (
    <Autocomplete
      multiple={multiple}
      options={options}
      value={multiple ? selectedMineralObjects : (selectedMineralObjects[0] || null)}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, value) => setInputValue(value)}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, value) => option.name.toLowerCase() === value.name.toLowerCase()}
      filterOptions={(x) => x} // We handle filtering ourselves
      renderInput={(params: AutocompleteRenderInputParams) => (
        <TextField
          {...params}
          label={label}
          placeholder={selectedMinerals.length === 0 ? placeholder : undefined}
          helperText={helperText}
        />
      )}
      // Chips only in multiple mode; single mode keeps the plain input text
      // (renderValue, unlike the old renderTags, is also called for single values)
      renderValue={multiple ? (value, getItemProps) =>
        Array.isArray(value)
          ? value.map((option, index) => (
              <Chip
                label={option.custom ? `${option.name} (${NOT_IN_LIST})` : `${option.name} (${option.abbrev})`}
                variant={option.custom ? 'outlined' : 'filled'}
                {...getItemProps({ index })}
                key={option.name}
              />
            ))
          : null
      : undefined}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={`${option.typed ? 'typed' : 'name'}:${option.name}`}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>{option.typed ? `Use "${option.name}"` : option.name}</span>
            <span style={{ color: '#666', fontSize: '0.9em', marginLeft: '8px', fontStyle: option.custom ? 'italic' : undefined }}>
              {option.custom ? NOT_IN_LIST : option.abbrev}
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
