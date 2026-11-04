/**
 * Rotate or flip each image of a batch: a preview with its buttons per row,
 * shared by Batch Import (source files) and Finish Importing (project images).
 * The preview turns with the buttons; the pixels change later, in the caller.
 */

import { Box, CircularProgress, IconButton, List, ListItem, ListItemText, Paper } from '@mui/material';
import { Flip, RotateLeft, RotateRight, Warning } from '@mui/icons-material';
import {
  IDENTITY_ORIENTATION,
  orientationCssTransform,
  orientationLabel,
  orientationRotateCCW,
  orientationRotateCW,
  toggleOrientationFlip,
  type Orientation,
} from '@/utils/rotationUtils';

interface RotateFlipListProps {
  rows: Array<{ id: string; name: string }>;
  orientations: Record<string, Orientation>;
  /** Preview by row id: undefined while loading, '' when it failed */
  previews: Record<string, string>;
  onChange: (rowId: string, orientation: Orientation) => void;
}

export function RotateFlipList({ rows, orientations, previews, onChange }: RotateFlipListProps) {
  return (
    <Paper variant="outlined" sx={{ maxHeight: 420, overflow: 'auto' }}>
      <List dense>
        {rows.map((row) => {
          const orientation = orientations[row.id] ?? IDENTITY_ORIENTATION;
          const preview = previews[row.id];
          return (
            <ListItem key={row.id} sx={{ gap: 2 }}>
              {/* Square container: the rotated bounding box never overflows */}
              <Box
                sx={{
                  width: 120,
                  height: 120,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                }}
              >
                {preview === undefined ? (
                  <CircularProgress size={24} />
                ) : preview === '' ? (
                  <Warning color="disabled" />
                ) : (
                  <Box
                    component="img"
                    src={preview}
                    alt={row.name}
                    sx={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      transform: orientationCssTransform(orientation),
                      transition: 'transform 150ms ease',
                    }}
                  />
                )}
              </Box>
              <ListItemText
                primary={row.name}
                secondary={orientationLabel(orientation)}
                slotProps={{ primary: { noWrap: true } }}
              />
              <IconButton size="small" title="Rotate 90° counter-clockwise" onClick={() => onChange(row.id, orientationRotateCCW(orientation))}>
                <RotateLeft />
              </IconButton>
              <IconButton size="small" title="Rotate 90° clockwise" onClick={() => onChange(row.id, orientationRotateCW(orientation))}>
                <RotateRight />
              </IconButton>
              <IconButton
                size="small"
                title="Flip (mirror) left-right"
                color={orientation.flip ? 'primary' : 'default'}
                onClick={() => onChange(row.id, toggleOrientationFlip(orientation))}
              >
                <Flip />
              </IconButton>
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}
