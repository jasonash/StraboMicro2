/**
 * Choose any of the project's tags (type to search, chips with the tag's
 * colored dot). Used by Create New Spot, the spot's Tags dialog and the Quick
 * Spot Preset editor (Peter, 2026-10-29).
 *
 * The last line of the list is always "+ New Tag...", which opens Create Tag
 * (with the typed text as its name) and selects the new tag on save, so a
 * missing tag no longer means closing the dialog (Claire, 2026-11-23).
 */

import { useState } from 'react';
import { Autocomplete, Box, Chip, TextField, createFilterOptions } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Tag } from '@/types/project-types';
import { tagSwatchStyle } from '@/utils/tagSwatch';
import { CreateTagDialog } from './dialogs/CreateTagDialog';

const NO_TAGS_YET = 'No tags yet: open the list and choose + New Tag...';

/** A list line: one of the project's tags, or the "+ New Tag..." line (newName = the typed text) */
type TagOption = { kind: 'tag'; tag: Tag } | { kind: 'new'; newName: string };

const filterTags = createFilterOptions<TagOption>({
  stringify: (option) => (option.kind === 'tag' ? option.tag.name : ''),
});

/** The "+ New Tag..." line's text: names the typed text unless a tag already has that name */
export function newTagLabel(typed: string, tags: Tag[]): string {
  const name = typed.trim();
  if (!name || tags.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) return '+ New Tag...';
  return `+ New Tag "${name}"...`;
}

interface TagPickerProps {
  /** The project's tags */
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  label?: string;
}

export function TagPicker({ tags, selectedTagIds, onChange, label = 'Tags' }: TagPickerProps) {
  const [createName, setCreateName] = useState<string | null>(null);

  const options: TagOption[] = tags.map((tag) => ({ kind: 'tag', tag }));
  const value: TagOption[] = options.filter((o) => o.kind === 'tag' && selectedTagIds.includes(o.tag.id));

  return (
    <>
      <Autocomplete<TagOption, true>
        multiple
        options={options}
        value={value}
        filterOptions={(opts, state) => [
          ...filterTags(opts, state),
          { kind: 'new', newName: state.inputValue.trim() },
        ]}
        onChange={(_event, newValue, _reason, details) => {
          const picked = details?.option;
          if (picked?.kind === 'new') {
            // Typed text that names an existing tag is not offered as the new name
            setCreateName(newTagLabel(picked.newName, tags) === '+ New Tag...' ? '' : picked.newName);
            return;
          }
          const ids: string[] = [];
          for (const o of newValue) if (o.kind === 'tag') ids.push(o.tag.id);
          onChange(ids);
        }}
        getOptionLabel={(o) => (o.kind === 'tag' ? o.tag.name : newTagLabel(o.newName, tags))}
        getOptionKey={(o) => (o.kind === 'tag' ? o.tag.id : '__new_tag__')}
        isOptionEqualToValue={(option, val) =>
          option.kind === 'tag' && val.kind === 'tag' ? option.tag.id === val.tag.id : option.kind === val.kind
        }
        renderOption={(props, option) => {
          const { key: _key, ...liProps } = props;
          if (option.kind === 'new') {
            return (
              <Box
                component="li"
                {...liProps}
                key="__new_tag__"
                data-testid="tag-picker-new"
                sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', borderTop: tags.length > 0 ? '1px solid' : 'none', borderColor: 'divider' }}
              >
                <AddIcon fontSize="small" />
                {newTagLabel(option.newName, tags).replace(/^\+ /, '')}
              </Box>
            );
          }
          return (
            <Box component="li" {...liProps} key={option.tag.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={tagSwatchStyle(option.tag, 12)} />
              {option.tag.name}
            </Box>
          );
        }}
        renderValue={(selected, getItemProps) =>
          selected.map((option, index) => {
            if (option.kind !== 'tag') return null;
            const { key: _key, ...chipProps } = getItemProps({ index });
            return (
              <Chip
                label={option.tag.name}
                size="small"
                icon={<Box sx={{ ...tagSwatchStyle(option.tag, 12), ml: 1 }} />}
                {...chipProps}
                key={option.tag.id}
              />
            );
          })
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
      <CreateTagDialog
        open={createName !== null}
        initialName={createName ?? ''}
        onClose={() => setCreateName(null)}
        onCreated={(tag) => {
          setCreateName(null);
          if (!selectedTagIds.includes(tag.id)) onChange([...selectedTagIds, tag.id]);
        }}
      />
    </>
  );
}
