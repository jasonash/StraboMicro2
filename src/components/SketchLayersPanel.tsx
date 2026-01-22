/**
 * SketchLayersPanel - Sidebar panel for managing sketch layers
 *
 * Provides UI for creating, renaming, deleting, and toggling visibility
 * of sketch layers on the active micrograph.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Button,
  Tooltip,
  Menu,
  MenuItem,
  TextField,
  Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useAppStore } from '@/store';
import type { SketchLayer } from '@/types/project-types';

// Stable empty array to prevent unnecessary re-renders
const EMPTY_LAYERS: SketchLayer[] = [];

export const SketchLayersPanel: React.FC = () => {
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSketchLayerId = useAppStore((state) => state.activeSketchLayerId);
  const addSketchLayer = useAppStore((state) => state.addSketchLayer);
  const removeSketchLayer = useAppStore((state) => state.removeSketchLayer);
  const renameSketchLayer = useAppStore((state) => state.renameSketchLayer);
  const setSketchLayerVisible = useAppStore((state) => state.setSketchLayerVisible);
  const setActiveSketchLayerId = useAppStore((state) => state.setActiveSketchLayerId);
  const sketchModeActive = useAppStore((state) => state.sketchModeActive);
  const setSketchModeActive = useAppStore((state) => state.setSketchModeActive);

  // Subscribe directly to the project to ensure we re-render when sketch layers change
  const layers = useAppStore((state) => {
    if (!activeMicrographId || !state.project) {
      console.log('[SketchLayersPanel] No active micrograph or project');
      return EMPTY_LAYERS;
    }
    // Find the micrograph in the project hierarchy
    for (const dataset of state.project.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find(m => m.id === activeMicrographId);
        if (micro) {
          console.log('[SketchLayersPanel] Found micrograph, sketchLayers:', micro.sketchLayers);
          return micro.sketchLayers ?? EMPTY_LAYERS;
        }
      }
    }
    console.log('[SketchLayersPanel] Micrograph not found in hierarchy');
    return EMPTY_LAYERS;
  });

  console.log('[SketchLayersPanel] Render - layers.length:', layers.length);

  // Context menu state
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextMenuLayerId, setContextMenuLayerId] = useState<string | null>(null);

  // Inline rename state
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when renaming starts
  useEffect(() => {
    if (renamingLayerId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingLayerId]);

  // Handle creating a new layer
  const handleCreateLayer = () => {
    console.log('[SketchLayersPanel] handleCreateLayer called, activeMicrographId:', activeMicrographId);
    if (!activeMicrographId) {
      console.log('[SketchLayersPanel] No active micrograph ID, returning');
      return;
    }

    console.log('[SketchLayersPanel] Calling addSketchLayer...');
    const layerId = addSketchLayer(activeMicrographId);
    console.log('[SketchLayersPanel] Layer created with ID:', layerId);
    setActiveSketchLayerId(layerId);
    console.log('[SketchLayersPanel] Active layer ID set to:', layerId);

    // Automatically enter sketch mode when creating a layer
    if (!sketchModeActive) {
      console.log('[SketchLayersPanel] Entering sketch mode');
      setSketchModeActive(true);
    }
  };

  // Handle layer click - select and optionally enter sketch mode
  const handleLayerClick = (layerId: string) => {
    setActiveSketchLayerId(layerId);

    // Enter sketch mode if not already active
    if (!sketchModeActive) {
      setSketchModeActive(true);
    }
  };

  // Handle visibility toggle
  const handleToggleVisibility = (e: React.MouseEvent, layerId: string, currentVisible: boolean) => {
    e.stopPropagation();
    if (!activeMicrographId) return;
    setSketchLayerVisible(activeMicrographId, layerId, !currentVisible);
  };

  // Handle context menu open
  const handleContextMenuOpen = (e: React.MouseEvent<HTMLElement>, layerId: string) => {
    e.stopPropagation();
    setContextMenuAnchor(e.currentTarget);
    setContextMenuLayerId(layerId);
  };

  // Handle context menu close
  const handleContextMenuClose = () => {
    setContextMenuAnchor(null);
    setContextMenuLayerId(null);
  };

  // Handle rename start
  const handleRenameStart = () => {
    if (!contextMenuLayerId) return;
    const layer = layers.find((l) => l.id === contextMenuLayerId);
    if (layer) {
      setRenameValue(layer.name);
      setRenamingLayerId(contextMenuLayerId);
    }
    handleContextMenuClose();
  };

  // Handle rename confirm
  const handleRenameConfirm = () => {
    if (!activeMicrographId || !renamingLayerId || !renameValue.trim()) {
      setRenamingLayerId(null);
      return;
    }
    renameSketchLayer(activeMicrographId, renamingLayerId, renameValue.trim());
    setRenamingLayerId(null);
  };

  // Handle rename cancel
  const handleRenameCancel = () => {
    setRenamingLayerId(null);
    setRenameValue('');
  };

  // Handle rename key press
  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameConfirm();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  // Handle delete layer
  const handleDeleteLayer = () => {
    if (!activeMicrographId || !contextMenuLayerId) return;

    // If deleting the active layer, switch to another or clear
    if (activeSketchLayerId === contextMenuLayerId) {
      const otherLayer = layers.find((l) => l.id !== contextMenuLayerId);
      setActiveSketchLayerId(otherLayer?.id || null);
    }

    removeSketchLayer(activeMicrographId, contextMenuLayerId);
    handleContextMenuClose();
  };

  // Handle show all layers
  const handleShowAll = () => {
    if (!activeMicrographId) return;
    layers.forEach((layer) => {
      if (!layer.visible) {
        setSketchLayerVisible(activeMicrographId, layer.id, true);
      }
    });
  };

  // Handle hide all layers
  const handleHideAll = () => {
    if (!activeMicrographId) return;
    layers.forEach((layer) => {
      if (layer.visible) {
        setSketchLayerVisible(activeMicrographId, layer.id, false);
      }
    });
  };

  // Empty state - no micrograph selected
  if (!activeMicrographId) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Select a micrograph to view or create sketch layers.
        </Typography>
      </Box>
    );
  }

  // Empty state - no layers yet
  if (layers.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No sketch layers yet.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleCreateLayer}
        >
          Create First Layer
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Layer list */}
      <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {layers.map((layer) => {
          const isActive = layer.id === activeSketchLayerId;
          const isRenaming = layer.id === renamingLayerId;

          return (
            <ListItem
              key={layer.id}
              disablePadding
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Tooltip title={layer.visible ? 'Hide layer' : 'Show layer'}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleToggleVisibility(e, layer.id, layer.visible)}
                    >
                      {layer.visible ? (
                        <VisibilityIcon fontSize="small" />
                      ) : (
                        <VisibilityOffIcon fontSize="small" sx={{ opacity: 0.5 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    size="small"
                    onClick={(e) => handleContextMenuOpen(e, layer.id)}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemButton
                selected={isActive}
                onClick={() => handleLayerClick(layer.id)}
                onDoubleClick={() => {
                  setRenameValue(layer.name);
                  setRenamingLayerId(layer.id);
                }}
                sx={{
                  py: 0.5,
                  opacity: layer.visible ? 1 : 0.5,
                }}
              >
                {isRenaming ? (
                  <TextField
                    inputRef={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={handleRenameConfirm}
                    size="small"
                    variant="standard"
                    autoComplete="off"
                    sx={{
                      '& .MuiInputBase-input': {
                        py: 0,
                        fontSize: '0.875rem',
                      },
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <ListItemText
                    primary={layer.name}
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: {
                        fontWeight: isActive ? 600 : 400,
                      },
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Actions bar */}
      <Divider />
      <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleCreateLayer}
          sx={{ flex: 1 }}
        >
          New Layer
        </Button>
      </Box>
      <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 1 }}>
        <Button size="small" variant="text" onClick={handleShowAll} sx={{ flex: 1 }}>
          Show All
        </Button>
        <Button size="small" variant="text" onClick={handleHideAll} sx={{ flex: 1 }}>
          Hide All
        </Button>
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={contextMenuAnchor}
        open={Boolean(contextMenuAnchor)}
        onClose={handleContextMenuClose}
      >
        <MenuItem onClick={handleRenameStart}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDeleteLayer} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SketchLayersPanel;
