/**
 * Preset Selector
 *
 * Multi-select autocomplete for choosing Quick Spot Presets to apply to a
 * spot. Used by the New Spot and Edit Spot dialogs. Shows each preset's Quick
 * Edit key binding (1-9) as a badge, and disables presets that are already
 * applied to the target spot (preset application is an additive merge and
 * cannot be undone, so re-applying is blocked — same rule as the store).
 *
 * Renders nothing when no presets exist.
 */

import { Autocomplete, Box, Checkbox, Chip, TextField, Typography } from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useAppStore } from '@/store';
import { getPresetSummary } from '@/types/preset-types';

interface PresetSelectorProps {
  /** IDs of presets selected for application (not yet applied) */
  selectedPresetIds: string[];
  onChange: (presetIds: string[]) => void;
  /** Presets already applied to the spot — shown checked and disabled */
  appliedPresetIds?: string[];
  label?: string;
}

export function PresetSelector({
  selectedPresetIds,
  onChange,
  appliedPresetIds = [],
  label = 'Apply Presets',
}: PresetSelectorProps) {
  const getAllPresetsWithScope = useAppStore((state) => state.getAllPresetsWithScope);
  const presetKeyBindings = useAppStore((state) => state.presetKeyBindings);

  // Sort global before project so Autocomplete's groupBy renders contiguous groups
  const presets = getAllPresetsWithScope().sort((a, b) =>
    a.scope === b.scope ? 0 : a.scope === 'global' ? -1 : 1
  );

  if (presets.length === 0) return null;

  const boundKey = (presetId: string): string | null => {
    for (const [key, id] of Object.entries(presetKeyBindings)) {
      if (id === presetId) return key;
    }
    return null;
  };

  const applied = new Set(appliedPresetIds);
  const value = presets.filter((p) => selectedPresetIds.includes(p.id));

  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      size="small"
      options={presets}
      value={value}
      onChange={(_, newValue) => onChange(newValue.map((p) => p.id))}
      groupBy={(p) => (p.scope === 'global' ? 'Global Presets' : 'Project Presets')}
      getOptionLabel={(p) => p.name}
      getOptionDisabled={(p) => applied.has(p.id)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      renderOption={(props, preset, { selected }) => {
        const key = boundKey(preset.id);
        const isApplied = applied.has(preset.id);
        const summary = getPresetSummary(preset).slice(0, 2).join(', ');
        return (
          <Box component="li" {...props} key={preset.id}>
            <Checkbox
              icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
              checkedIcon={<CheckBoxIcon fontSize="small" />}
              sx={{ mr: 1 }}
              checked={selected || isApplied}
            />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {key && (
                  <Chip label={key} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                )}
                <Typography variant="body2" noWrap>
                  {preset.name}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {isApplied ? 'Already applied' : summary || 'No data'}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((preset, index) => {
          const key = boundKey(preset.id);
          const { key: tagKey, ...tagProps } = getTagProps({ index });
          return (
            <Chip
              key={tagKey}
              size="small"
              label={key ? `${key} · ${preset.name}` : preset.name}
              {...tagProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length === 0 ? 'Select presets to apply…' : undefined}
        />
      )}
    />
  );
}
