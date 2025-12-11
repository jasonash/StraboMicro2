/**
 * Combined Data Type Selector Component
 *
 * A combobox that combines dropdown and search functionality:
 * - When empty: Shows high-level data type categories (like the old dropdown)
 * - When typing: Searches through detailed keywords for specific fields
 *
 * This replaces the separate search box and dropdown in the properties panel.
 */

import { useState, useMemo } from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  useTheme,
} from '@mui/material';
import {
  MODAL_KEYWORDS,
  filterKeywordsByContext,
  type ModalKeyword,
} from '@/data/modal-keywords';

interface CombinedDataTypeSelectorProps {
  context: 'micrograph' | 'spot';
  onSelectModal: (modal: string) => void;
}

/**
 * Category option type for dropdown mode
 */
interface CategoryOption {
  id: string;
  label: string;
  modal: string;
}

/**
 * High-level data type categories for the dropdown mode
 */
const MICROGRAPH_CATEGORIES: CategoryOption[] = [
  { id: 'sample', label: 'Sample Info', modal: 'sample' },
  { id: 'micrograph', label: 'Micrograph Info', modal: 'micrograph' },
  { id: 'mineralogy', label: 'Mineralogy/Lithology', modal: 'mineralogy' },
  { id: 'grain', label: 'Grain Size/Shape/SPO', modal: 'grain' },
  { id: 'fabric', label: 'Fabrics', modal: 'fabric' },
  { id: 'clastic', label: 'Clastic Deformation Bands', modal: 'clastic' },
  { id: 'grainBoundary', label: 'Grain Boundaries / Contacts', modal: 'grainBoundary' },
  { id: 'intraGrain', label: 'Intragranular Structures', modal: 'intraGrain' },
  { id: 'vein', label: 'Veins', modal: 'vein' },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte', modal: 'pseudotachylyte' },
  { id: 'fold', label: 'Folds', modal: 'fold' },
  { id: 'faultsShearZones', label: 'Faults and Shear Zones', modal: 'faultsShearZones' },
  { id: 'extinctionMicrostructures', label: 'Extinction Microstructures', modal: 'extinctionMicrostructures' },
  { id: 'fracture', label: 'Fractures', modal: 'fracture' },
  { id: 'notes', label: 'Notes', modal: 'notes' },
  { id: 'files', label: 'Associated Files', modal: 'files' },
  { id: 'links', label: 'Links', modal: 'links' },
];

const SPOT_CATEGORIES: CategoryOption[] = [
  { id: 'sample', label: 'Sample Info', modal: 'sample' },
  { id: 'spot', label: 'Spot Data', modal: 'spot' },
  { id: 'mineralogy', label: 'Mineralogy/Lithology', modal: 'mineralogy' },
  { id: 'grain', label: 'Grain Size/Shape/SPO', modal: 'grain' },
  { id: 'fabric', label: 'Fabrics', modal: 'fabric' },
  { id: 'clastic', label: 'Clastic Deformation Bands', modal: 'clastic' },
  { id: 'grainBoundary', label: 'Grain Boundaries / Contacts', modal: 'grainBoundary' },
  { id: 'intraGrain', label: 'Intragranular Structures', modal: 'intraGrain' },
  { id: 'vein', label: 'Veins', modal: 'vein' },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte', modal: 'pseudotachylyte' },
  { id: 'fold', label: 'Folds', modal: 'fold' },
  { id: 'faultsShearZones', label: 'Faults and Shear Zones', modal: 'faultsShearZones' },
  { id: 'extinctionMicrostructures', label: 'Extinction Microstructures', modal: 'extinctionMicrostructures' },
  { id: 'fracture', label: 'Fractures', modal: 'fracture' },
  { id: 'notes', label: 'Notes', modal: 'notes' },
  { id: 'files', label: 'Associated Files', modal: 'files' },
  { id: 'links', label: 'Links', modal: 'links' },
];

// Union type for options - can be either a category or a keyword
type OptionType =
  | { type: 'category'; data: CategoryOption }
  | { type: 'keyword'; data: ModalKeyword };

/**
 * Highlight matching text in search results
 */
function highlightMatch(
  text: string,
  query: string,
  isDarkMode: boolean
): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const highlightColor = isDarkMode ? '#FF6B9D' : '#8B0000';

  return (
    <>
      {text.slice(0, index)}
      <span style={{ color: highlightColor, fontWeight: 'bold' }}>
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

export function CombinedDataTypeSelector({ context, onSelectModal }: CombinedDataTypeSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Get categories based on context
  const categories = context === 'micrograph' ? MICROGRAPH_CATEGORIES : SPOT_CATEGORIES;

  // Get keywords filtered by context
  const contextKeywords = useMemo(
    () => filterKeywordsByContext(MODAL_KEYWORDS, context),
    [context]
  );

  // Build options based on whether user is typing or not
  const options = useMemo((): OptionType[] => {
    const trimmedInput = inputValue.trim().toLowerCase();

    if (!trimmedInput) {
      // No input - show categories as dropdown
      return categories.map(cat => ({ type: 'category' as const, data: cat }));
    } else {
      // Has input - search through keywords
      const matchingKeywords = contextKeywords
        .filter(kw => kw.keyword.toLowerCase().includes(trimmedInput))
        .slice(0, 15); // Limit to 15 results

      return matchingKeywords.map(kw => ({ type: 'keyword' as const, data: kw }));
    }
  }, [inputValue, categories, contextKeywords]);

  const handleChange = (
    _event: React.SyntheticEvent,
    value: OptionType | string | null
  ) => {
    if (value && typeof value !== 'string') {
      const modal = value.type === 'category' ? value.data.modal : value.data.modal;
      onSelectModal(modal);
      // Clear input after selection
      setInputValue('');
    }
  };

  const getOptionLabel = (option: OptionType | string): string => {
    if (typeof option === 'string') return option;
    return option.type === 'category' ? option.data.label : option.data.keyword;
  };

  const renderOption = (
    props: React.HTMLAttributes<HTMLLIElement> & { key?: string },
    option: OptionType
  ) => {
    const { key, ...otherProps } = props;

    if (option.type === 'category') {
      // Category option - simple display
      return (
        <li key={key} {...otherProps}>
          <Typography variant="body2">
            {option.data.label}
          </Typography>
        </li>
      );
    } else {
      // Keyword option - show with path
      return (
        <li key={key} {...otherProps}>
          <Box sx={{ py: 0.5 }}>
            <Typography variant="body2" component="div">
              {highlightMatch(option.data.keyword, inputValue, isDarkMode)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              {option.data.path}
            </Typography>
          </Box>
        </li>
      );
    }
  };

  // Custom filter - we handle filtering ourselves in the options memo
  const filterOptions = (options: OptionType[]) => options;

  return (
    <Autocomplete
      freeSolo
      open={isOpen}
      onOpen={() => setIsOpen(true)}
      onClose={() => setIsOpen(false)}
      options={options}
      filterOptions={filterOptions}
      getOptionLabel={getOptionLabel}
      renderOption={renderOption}
      value={null}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, value, reason) => {
        if (reason === 'input' || reason === 'clear') {
          setInputValue(value);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Select or search data type..."
          size="small"
          sx={{
            '& .MuiInputBase-input::placeholder': {
              fontSize: '0.875rem',
              opacity: 0.7,
            },
          }}
        />
      )}
      ListboxProps={{
        sx: {
          maxHeight: 400,
          '& .MuiAutocomplete-option': {
            py: 1,
          },
        },
      }}
      // Show dropdown arrow to indicate it's also a dropdown
      popupIcon={undefined}
      clearOnBlur
      selectOnFocus
      handleHomeEndKeys
      blurOnSelect
    />
  );
}
