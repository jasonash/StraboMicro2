/**
 * SpotContextMenu Component
 *
 * Context menu for spot operations (right-click menu).
 * Currently supports Delete action.
 */

import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { Spot } from '@/types/project-types';

interface SpotContextMenuProps {
  spot: Spot | null;
  anchorPosition: { x: number; y: number } | null;
  onClose: () => void;
  onDelete: (spot: Spot) => void;
}

export const SpotContextMenu: React.FC<SpotContextMenuProps> = ({
  spot,
  anchorPosition,
  onClose,
  onDelete,
}) => {
  const handleDelete = () => {
    if (!spot) return;

    if (window.confirm(`Delete spot "${spot.name}"?`)) {
      onDelete(spot);
    }
    onClose();
  };

  return (
    <Menu
      open={Boolean(anchorPosition && spot)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchorPosition ? { top: anchorPosition.y, left: anchorPosition.x } : undefined
      }
    >
      <MenuItem onClick={handleDelete}>
        <ListItemIcon>
          <DeleteIcon fontSize="small" color="error" />
        </ListItemIcon>
        <ListItemText>Delete Spot</ListItemText>
      </MenuItem>
    </Menu>
  );
};
