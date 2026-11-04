/**
 * SpotContextMenu Component
 *
 * Context menu for spot operations (right-click menu).
 * Supports Edit Geometry, Edit Metadata, Delete, and Batch Edit actions.
 * When more than one spot is under the cursor, Select Spot Here lists them
 * by name, top first, so a spot covered by another can be picked (Peter,
 * 2026-10-29; src/utils/spotStacking.ts).
 */

import { Menu, MenuItem, ListItemIcon, ListItemText, Divider, ListSubheader } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ShapeLineIcon from '@mui/icons-material/Timeline';
import MergeIcon from '@mui/icons-material/CallMerge';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import CheckIcon from '@mui/icons-material/Check';
import { Spot } from '@/types/project-types';

interface SpotContextMenuProps {
  spot: Spot | null;
  anchorPosition: { x: number; y: number } | null;
  onClose: () => void;
  onEditGeometry: (spot: Spot) => void;
  onEditMetadata: (spot: Spot) => void;
  onDelete: (spot: Spot) => void;
  /** Callback for deleting multiple selected spots */
  onDeleteSelected?: () => void;
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
  /** Every spot under the cursor, top first (the list shows when there is more than one) */
  spotsHere?: Spot[];
  /** Select one of spotsHere */
  onSelectSpotHere?: (spot: Spot) => void;
  /** The selected spot's id (checked in the list) */
  activeSpotId?: string | null;
}

export const SpotContextMenu: React.FC<SpotContextMenuProps> = ({
  spot,
  anchorPosition,
  onClose,
  onEditGeometry,
  onEditMetadata,
  onDelete,
  onDeleteSelected,
  isRecursiveSpot = false,
  selectedCount = 0,
  onBatchEdit,
  onMergeSpots,
  onSplitSpot,
  canMerge = false,
  spotsHere = [],
  onSelectSpotHere,
  activeSpotId = null,
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

  const handleDeleteSelected = () => {
    onDeleteSelected?.();
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
      {/* Overlapping spots: pick any spot under the cursor by name */}
      {spotsHere.length > 1 && onSelectSpotHere && [
        <ListSubheader key="here-header" sx={{ lineHeight: '32px' }}>Select Spot Here</ListSubheader>,
        ...spotsHere.map((s) => (
          <MenuItem
            key={`here-${s.id}`}
            onClick={() => {
              onSelectSpotHere(s);
              onClose();
            }}
          >
            <ListItemIcon>{s.id === activeSpotId && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{s.name || 'Unnamed spot'}</ListItemText>
          </MenuItem>
        )),
        <Divider key="here-divider" />,
      ]}

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

      {/* Single-spot operations - hide when multiple spots selected */}
      {selectedCount <= 1 && !isRecursiveSpot && (
        <MenuItem onClick={handleEditGeometry}>
          <ListItemIcon>
            <ShapeLineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Spot Geometry</ListItemText>
        </MenuItem>
      )}
      {selectedCount <= 1 && (
        <MenuItem onClick={handleEditMetadata}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Spot Metadata</ListItemText>
        </MenuItem>
      )}
      <Divider />
      {selectedCount > 1 ? (
        <MenuItem onClick={handleDeleteSelected}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete {selectedCount} Selected Spots</ListItemText>
        </MenuItem>
      ) : (
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete Spot</ListItemText>
        </MenuItem>
      )}
    </Menu>
  );
};
