/**
 * Grain Size List Item Component
 *
 * Displays a single GrainSizeType item in a list with edit/delete actions.
 */

import { Box, IconButton, Typography, Chip } from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
import { GrainSizeType } from '@/types/legacy-types';

interface GrainSizeListItemProps {
  item: GrainSizeType;
  onEdit: () => void;
  onDelete: () => void;
}

export function GrainSizeListItem({ item, onEdit, onDelete }: GrainSizeListItemProps) {
  const stats: string[] = [];
  if (item.mean != null) stats.push(`Mean: ${item.mean}${item.sizeUnit || ''}`);
  if (item.median != null) stats.push(`Median: ${item.median}${item.sizeUnit || ''}`);
  if (item.mode != null) stats.push(`Mode: ${item.mode}${item.sizeUnit || ''}`);
  if (item.standardDeviation != null)
    stats.push(`SD: ${item.standardDeviation}${item.sizeUnit || ''}`);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      <Box sx={{ flex: 1 }}>
        {item.phases && item.phases.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {item.phases.map((phase) => (
              <Chip key={phase} label={phase} size="small" />
            ))}
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {stats.length > 0 ? stats.join(' | ') : 'No statistics provided'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <IconButton size="small" onClick={onEdit} aria-label="Edit">
          <Edit fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onDelete} aria-label="Delete">
          <Delete fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
