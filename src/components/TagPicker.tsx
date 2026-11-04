/**
 * Choose any of the project's tags (type to search, chips with the tag's
 * colored dot). Used by Create New Spot and the Quick Spot Preset editor
 * (Peter, 2026-10-29).
 */

import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import type { Tag } from '@/types/project-types';
import { tagSwatchStyle } from '@/utils/tagSwatch';

const NO_TAGS_YET = 'No tags yet: create them in the Tags tab';

interface TagPickerProps {
  /** The project's tags */
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  label?: string;
}

export function TagPicker({ tags, selectedTagIds, onChange, label = 'Tags' }: TagPickerProps) {
  return (
    <Autocomplete
      multiple
      options={tags}
      value={tags.filter((t) => selectedTagIds.includes(t.id))}
      onChange={(_event, value) => onChange(value.map((t) => t.id))}
      getOptionLabel={(tag) => tag.name}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      noOptionsText={tags.length === 0 ? NO_TAGS_YET : 'No matching tags'}
      renderOption={(props, tag) => (
        <Box component="li" {...props} key={tag.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={tagSwatchStyle(tag, 12)} />
          {tag.name}
        </Box>
      )}
      renderValue={(value, getItemProps) =>
        value.map((tag, index) => (
          <Chip
            label={tag.name}
            size="small"
            icon={<Box sx={{ ...tagSwatchStyle(tag, 12), ml: 1 }} />}
            {...getItemProps({ index })}
            key={tag.id}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selectedTagIds.length === 0 ? 'Add tags...' : undefined}
          helperText={tags.length === 0 ? NO_TAGS_YET : undefined}
        />
      )}
    />
  );
}
