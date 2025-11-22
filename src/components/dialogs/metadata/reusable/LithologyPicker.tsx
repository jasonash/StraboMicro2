/**
 * Lithology Picker Component
 *
 * Hierarchical selection for lithology types (Level 1 → Level 2 → Level 3).
 * Matches legacy app's hierarchical dropdown behavior.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getLithologyLevel1Options,
  getLithologyLevel2Options,
  getLithologyLevel3Options,
} from '@/utils/mineralData';

export interface LithologySelection {
  level1: string;
  level2: string;
  level3: string;
}

interface LithologyPickerProps {
  selectedLithologies: LithologySelection[];
  onChange: (lithologies: LithologySelection[]) => void;
  label?: string;
}

export function LithologyPicker({
  selectedLithologies,
  onChange,
  label = 'Lithologies',
}: LithologyPickerProps) {
  // Current selection being built
  const [level1, setLevel1] = useState('');
  const [level2, setLevel2] = useState('');
  const [level3, setLevel3] = useState('');

  // Available options for each level
  const [level1Options] = useState(() => getLithologyLevel1Options());
  const [level2Options, setLevel2Options] = useState<string[]>([]);
  const [level3Options, setLevel3Options] = useState<string[]>([]);

  // Update level2 options when level1 changes
  useEffect(() => {
    if (level1) {
      const options = getLithologyLevel2Options(level1);
      setLevel2Options(options);
      // Reset level2 and level3 if they're no longer valid
      if (!options.includes(level2)) {
        setLevel2('');
        setLevel3('');
      }
    } else {
      setLevel2Options([]);
      setLevel2('');
      setLevel3('');
    }
  }, [level1]);

  // Update level3 options when level1 or level2 changes
  useEffect(() => {
    if (level1 && level2) {
      const options = getLithologyLevel3Options(level1, level2);
      setLevel3Options(options);
      // Reset level3 if it's no longer valid
      if (!options.includes(level3)) {
        setLevel3('');
      }
    } else {
      setLevel3Options([]);
      setLevel3('');
    }
  }, [level1, level2]);

  const handleLevel1Change = (event: SelectChangeEvent<string>) => {
    setLevel1(event.target.value);
  };

  const handleLevel2Change = (event: SelectChangeEvent<string>) => {
    setLevel2(event.target.value);
  };

  const handleLevel3Change = (event: SelectChangeEvent<string>) => {
    setLevel3(event.target.value);
  };

  // Add current selection to list
  const handleAdd = () => {
    if (level1 && level2) {
      const newLithology: LithologySelection = {
        level1,
        level2,
        level3: level3 || '',
      };

      // Check if this combination already exists
      const exists = selectedLithologies.some(
        l => l.level1 === level1 && l.level2 === level2 && l.level3 === level3
      );

      if (!exists) {
        onChange([...selectedLithologies, newLithology]);
        // Reset selections
        setLevel1('');
        setLevel2('');
        setLevel3('');
      }
    }
  };

  // Remove a lithology from the list
  const handleRemove = (index: number) => {
    onChange(selectedLithologies.filter((_, i) => i !== index));
  };

  // Format lithology for display
  const formatLithology = (lith: LithologySelection): string => {
    const parts = [lith.level1, lith.level2, lith.level3].filter(Boolean);
    return parts.join(' → ');
  };

  const canAdd = level1 && level2;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {label}
      </Typography>

      {/* Selected lithologies list */}
      {selectedLithologies.length > 0 && (
        <List sx={{ mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {selectedLithologies.map((lith, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton edge="end" onClick={() => handleRemove(index)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText primary={formatLithology(lith)} />
            </ListItem>
          ))}
        </List>
      )}

      {/* Add new lithology section */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Rock Type (Level 1)</InputLabel>
          <Select
            value={level1}
            onChange={handleLevel1Change}
            label="Rock Type (Level 1)"
          >
            {level1Options.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {level1 && (
          <FormControl fullWidth>
            <InputLabel>Subcategory (Level 2)</InputLabel>
            <Select
              value={level2}
              onChange={handleLevel2Change}
              label="Subcategory (Level 2)"
            >
              {level2Options.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {level1 && level2 && level3Options.length > 0 && (
          <FormControl fullWidth>
            <InputLabel>Specific Type (Level 3)</InputLabel>
            <Select
              value={level3}
              onChange={handleLevel3Change}
              label="Specific Type (Level 3)"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {level3Options.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Button
          variant="outlined"
          onClick={handleAdd}
          disabled={!canAdd}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add Lithology
        </Button>
      </Box>
    </Box>
  );
}
