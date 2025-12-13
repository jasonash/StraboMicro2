/**
 * SpotContextMenu Component
 *
 * Context menu for spot operations (right-click menu).
 * Supports Edit Geometry, Edit Metadata, Delete, and Batch Edit actions.
 */

import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ShapeLineIcon from '@mui/icons-material/Timeline';
import MergeIcon from '@mui/icons-material/CallMerge';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { Spot } from '@/types/project-types';

interface SpotContextMenuProps {
  spot: Spot | null;
  anchorPosition: { x: number; y: number } | null;
  onClose: () => void;
  onEditGeometry: (spot: Spot) => void;
  onEditMetadata: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
  /** If true, spot belongs to a child micrograph (recursive spot) - hide geometry editing */
  isRecursiveSpot?: boolean;
  /** Number of spots currently selected (for batch edit option) */
  selectedCount?: number;
  /** Callback for batch edit action */
  onBatchEdit?: () => void;
  /** Callback for merge selected spots action */
  onMergeSpots?: () => void;
  /** Callback for split spot with line action */
  onSplitSpot?: (spot: Spot) => void;
  /** Whether the selected spots can be merged (all polygons) */
  canMerge?: boolean;
}

export const SpotContextMenu: React.FC<SpotContextMenuProps> = ({
  spot,
  anchorPosition,
  onClose,
  onEditGeometry,
  onEditMetadata,
  onDelete,
  isRecursiveSpot = false,
  selectedCount = 0,
  onBatchEdit,
  onMergeSpots,
  onSplitSpot,
  canMerge = false,
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

  const handleBatchEdit = () => {
    onBatchEdit?.();
    onClose();
  };

  const handleMergeSpots = () => {
    onMergeSpots?.();
    onClose();
  };

  const handleSplitSpot = () => {
    if (!spot) return;
    onSplitSpot?.(spot);
    onClose();
  };

  const showBatchEdit = selectedCount > 1 && onBatchEdit;
  const showMerge = selectedCount > 1 && onMergeSpots && canMerge;
  // Can only split polygon spots
  const isPolygon = spot && (spot.points?.length ?? 0) >= 3;
  const showSplit = selectedCount <= 1 && onSplitSpot && isPolygon && !isRecursiveSpot;

  return (
    <Menu
      open={Boolean(anchorPosition && spot)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchorPosition ? { top: anchorPosition.y, left: anchorPosition.x } : undefined
      }
    >
      {/* Batch edit option when multiple spots selected */}
      {showBatchEdit && (
        <MenuItem onClick={handleBatchEdit}>
          <ListItemIcon>
            <EditNoteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit {selectedCount} Selected Spots...</ListItemText>
        </MenuItem>
      )}

      {/* Merge selected spots option */}
      {showMerge && (
        <MenuItem onClick={handleMergeSpots}>
          <ListItemIcon>
            <MergeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Merge {selectedCount} Selected Spots</ListItemText>
        </MenuItem>
      )}

      {(showBatchEdit || showMerge) && <Divider />}

      {/* Split spot option (single polygon spot only) */}
      {showSplit && (
        <MenuItem onClick={handleSplitSpot}>
          <ListItemIcon>
            <ContentCutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Split Spot with Line...</ListItemText>
        </MenuItem>
      )}

      {!isRecursiveSpot && (
        <MenuItem onClick={handleEditGeometry}>
          <ListItemIcon>
            <ShapeLineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Spot Geometry</ListItemText>
        </MenuItem>
      )}
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
