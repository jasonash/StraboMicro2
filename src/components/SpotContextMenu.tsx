/**
 * SpotContextMenu Component
 *
 * Context menu for spot operations (right-click menu).
 * Supports Edit Geometry, Edit Metadata, and Delete actions.
 */

import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ShapeLineIcon from '@mui/icons-material/Timeline';
import { Spot } from '@/types/project-types';

interface SpotContextMenuProps {
  spot: Spot | null;
  anchorPosition: { x: number; y: number } | null;
  onClose: () => void;
  onEditGeometry: (spot: Spot) => void;
  onEditMetadata: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
}

export const SpotContextMenu: React.FC<SpotContextMenuProps> = ({
  spot,
  anchorPosition,
  onClose,
  onEditGeometry,
  onEditMetadata,
  onDelete,
}) => {
  const handleEditGeometry = () => {
    if (!spot) return;
    onEditGeometry(spot);
    onClose();
  };

  const handleEditMetadata = () => {
    if (!spot) return;
    onEditMetadata(spot);
    onClose();
  };

  const handleDelete = () => {
    if (!spot) return;
    onDelete(spot);
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
      <MenuItem onClick={handleEditGeometry}>
        <ListItemIcon>
          <ShapeLineIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Edit Spot Geometry</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleEditMetadata}>
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Edit Spot Metadata</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={handleDelete}>
        <ListItemIcon>
          <DeleteIcon fontSize="small" color="error" />
        </ListItemIcon>
        <ListItemText>Delete Spot</ListItemText>
      </MenuItem>
    </Menu>
  );
};
