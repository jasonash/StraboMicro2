/**
 * An image type for each micrograph of a batch, under Instrument & Image Info:
 * each starts with the common Image Type and can have its own (a PPL/XPL mix,
 * element maps). Shown only when several micrographs have a type to choose.
 */

import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { effectiveImageType, imageTypeChoices } from '@/utils/imageTypeChoices';

interface ImageTypeRowsProps {
  instrumentType: string;
  dataType: string;
  commonImageType: string;
  own: Record<string, string>;
  rows: Array<{ id: string; name: string }>;
  onChange: (rowId: string, value: string) => void;
}

export function ImageTypeRows({ instrumentType, dataType, commonImageType, own, rows, onChange }: ImageTypeRowsProps) {
  const choices = imageTypeChoices(instrumentType, dataType);
  if (rows.length < 2 || choices.kind === 'none') return null;
  return (
    <Box>
      <Typography variant="subtitle2">Image type of each micrograph</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
        Each one starts with the Image Type above. Change any that differ.
      </Typography>
      <Stack spacing={1}>
        {rows.map((row) => {
          const value = effectiveImageType(commonImageType, own, row.id);
          const label = choices.kind === 'elements' ? 'Element(s)' : 'Image Type';
          return (
            <Stack key={row.id} direction="row" spacing={2} sx={{ alignItems: 'center' }} data-testid="image-type-row">
              <Typography variant="body2" noWrap title={row.name} sx={{ flex: 1, minWidth: 0 }}>{row.name}</Typography>
              {choices.kind === 'list' ? (
                <TextField
                  select
                  size="small"
                  label={label}
                  value={value}
                  onChange={(e) => onChange(row.id, e.target.value)}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { 'aria-label': `Image type of ${row.name}` } }}
                >
                  <MenuItem value="">Select Image Type...</MenuItem>
                  {choices.options.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                </TextField>
              ) : (
                <TextField
                  size="small"
                  label={label}
                  value={value}
                  onChange={(e) => onChange(row.id, e.target.value)}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { 'aria-label': `Image type of ${row.name}` } }}
                />
              )}
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
