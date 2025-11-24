/**
 * EditingToolbar Component
 *
 * Toolbar shown when editing spot geometry with Save/Cancel buttons.
 * Positioned at the top of the canvas during editing mode.
 */

import { Box, Button, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useAppStore } from '@/store';

interface EditingToolbarProps {
  onSave: () => void;
  onCancel: () => void;
}

export const EditingToolbar: React.FC<EditingToolbarProps> = ({ onSave, onCancel }) => {
  const editingSpotId = useAppStore((state) => state.editingSpotId);

  if (!editingSpotId) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        boxShadow: 3,
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Button
        variant="outlined"
        size="small"
        startIcon={<CloseIcon />}
        onClick={onCancel}
        color="inherit"
      >
        Cancel
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<CheckIcon />}
        onClick={onSave}
        color="primary"
      >
        Save Edits
      </Button>
    </Box>
  );
};
