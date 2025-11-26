/**
 * Data Type Autocomplete Component
 *
 * Provides a type-ahead search interface for quickly finding and opening
 * geological data type dialogs. Users can type keywords like "grain size",
 * "mineralogy", etc. to filter and select the appropriate modal.
 *
 * Matches legacy JavaFX modalMicrographAutoCompleteTextField behavior.
 */

import { useState, useCallback } from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import {
  MODAL_KEYWORDS,
  filterKeywordsByContext,
  type ModalKeyword,
} from '@/data/modal-keywords';

interface DataTypeAutocompleteProps {
  context: 'micrograph' | 'spot';
  onSelectModal: (modal: string) => void;
}

/**
 * Highlight matching text in search results
 * Matches legacy dark red (#8B0000) bold highlight style
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span style={{ color: '#8B0000', fontWeight: 'bold' }}>
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

export function DataTypeAutocomplete({ context, onSelectModal }: DataTypeAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');

  // Get keywords filtered by context (micrograph or spot)
  const contextKeywords = filterKeywordsByContext(MODAL_KEYWORDS, context);

  // Filter keywords based on current input
  const getFilteredOptions = useCallback(
    (options: ModalKeyword[], state: { inputValue: string }) => {
      if (!state.inputValue.trim()) return [];

      const lowerQuery = state.inputValue.toLowerCase();
      return options
        .filter((kw) => kw.keyword.toLowerCase().includes(lowerQuery))
        .slice(0, 10); // Max 10 results like legacy
    },
    []
  );

  const handleChange = (
    _event: React.SyntheticEvent,
    value: ModalKeyword | string | null
  ) => {
    if (value && typeof value !== 'string') {
      onSelectModal(value.modal);
      // Clear input after selection
      setInputValue('');
    }
  };

  return (
    <Autocomplete
      freeSolo
      options={contextKeywords}
      filterOptions={getFilteredOptions}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : option.keyword
      }
      renderOption={(props, option) => {
        const { key, ...otherProps } = props;
        return (
          <li key={key} {...otherProps}>
            <Box sx={{ py: 0.5 }}>
              <Typography variant="body2" component="div">
                {highlightMatch(option.keyword, inputValue)}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {option.path}
              </Typography>
            </Box>
          </li>
        );
      }}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, value, reason) => {
        // Only update on user input, not on selection clear
        if (reason === 'input' || reason === 'clear') {
          setInputValue(value);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="e.g. mineral name, grain size, etc..."
          size="small"
          sx={{
            '& .MuiInputBase-input::placeholder': {
              fontSize: '0.875rem',
              opacity: 0.7,
            },
          }}
        />
      )}
      sx={{
        '& .MuiAutocomplete-listbox': {
          maxHeight: 400,
        },
      }}
      clearOnBlur
      selectOnFocus
      handleHomeEndKeys
    />
  );
}
