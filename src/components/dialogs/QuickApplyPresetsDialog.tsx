/**
 * Quick Spot Presets Dialog
 *
 * Main dialog for managing all Quick Spot Presets.
 * Features:
 * - Tab view for Global vs Project presets
 * - List with drag-to-reorder
 * - Key binding assignment (1-9)
 * - Edit, Delete, Duplicate actions
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { QuickApplyPreset, PresetScope } from '@/types/preset-types';
import { getPresetSummary } from '@/types/preset-types';
import { QuickApplyPresetEditorDialog } from './QuickApplyPresetEditorDialog';

interface QuickApplyPresetsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ height: '100%' }}>
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </div>
  );
}

// Sortable preset item component
interface SortablePresetItemProps {
  preset: QuickApplyPreset;
  boundKey: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBindKey: (key: string | null) => void;
}

function SortablePresetItem({
  preset,
  boundKey,
  onEdit,
  onDelete,
  onDuplicate,
  onBindKey,
}: SortablePresetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preset.id });

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [keyMenuAnchor, setKeyMenuAnchor] = useState<null | HTMLElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const summaryItems = getPresetSummary(preset);

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={{
        bgcolor: 'background.paper',
        borderRadius: 1,
        mb: 0.5,
        border: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Drag handle */}
      <ListItemIcon sx={{ minWidth: 32 }} {...attributes} {...listeners}>
        <DragIndicatorIcon sx={{ cursor: 'grab', color: 'text.disabled' }} />
      </ListItemIcon>

      {/* Color indicator */}
      <Box
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          bgcolor: preset.color,
          mr: 1.5,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body1">{preset.name}</Typography>
            {boundKey && (
              <Chip
                size="small"
                label={boundKey}
                color="primary"
                sx={{ height: 20, fontSize: '0.75rem', fontWeight: 'bold' }}
              />
            )}
          </Box>
        }
        secondary={
          summaryItems.length > 0
            ? summaryItems.join(', ')
            : preset.description || 'No data configured'
        }
      />

      {/* Actions */}
      <ListItemSecondaryAction>
        {/* Key binding button */}
        <Tooltip title="Bind key (1-9)">
          <IconButton size="small" onClick={(e) => setKeyMenuAnchor(e.currentTarget)}>
            <KeyboardIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* More actions menu */}
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>

        {/* Key binding menu */}
        <Menu
          anchorEl={keyMenuAnchor}
          open={Boolean(keyMenuAnchor)}
          onClose={() => setKeyMenuAnchor(null)}
        >
          {boundKey && (
            <MenuItem
              onClick={() => {
                onBindKey(null);
                setKeyMenuAnchor(null);
              }}
            >
              Clear binding
            </MenuItem>
          )}
          {boundKey && <Divider />}
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
            <MenuItem
              key={key}
              onClick={() => {
                onBindKey(key);
                setKeyMenuAnchor(null);
              }}
              selected={boundKey === key}
            >
              Key {key}
            </MenuItem>
          ))}
        </Menu>

        {/* Actions menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              onEdit();
              setMenuAnchor(null);
            }}
          >
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Edit
          </MenuItem>
          <MenuItem
            onClick={() => {
              onDuplicate();
              setMenuAnchor(null);
            }}
          >
            <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
            Duplicate
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              onDelete();
              setMenuAnchor(null);
            }}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        </Menu>
      </ListItemSecondaryAction>
    </ListItem>
  );
}

export function QuickApplyPresetsDialog({ open, onClose }: QuickApplyPresetsDialogProps) {
  const globalPresets = useAppStore((state) => state.globalPresets);
  const project = useAppStore((state) => state.project);
  const presetKeyBindings = useAppStore((state) => state.presetKeyBindings);
  const createPreset = useAppStore((state) => state.createPreset);
  const deletePreset = useAppStore((state) => state.deletePreset);
  const reorderPresets = useAppStore((state) => state.reorderPresets);
  const setPresetKeyBinding = useAppStore((state) => state.setPresetKeyBinding);

  const [currentTab, setCurrentTab] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<QuickApplyPreset | null>(null);
  const [editingScope, setEditingScope] = useState<PresetScope>('global');

  // Get project presets
  const projectPresets = project?.presets || [];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get the key bound to a preset
  const getBoundKey = useCallback(
    (presetId: string): string | null => {
      for (const [key, id] of Object.entries(presetKeyBindings)) {
        if (id === presetId) return key;
      }
      return null;
    },
    [presetKeyBindings]
  );

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleCreateNew = () => {
    setEditingPreset(null);
    setEditingScope(currentTab === 0 ? 'global' : 'project');
    setEditorOpen(true);
  };

  const handleEdit = (preset: QuickApplyPreset, scope: PresetScope) => {
    setEditingPreset(preset);
    setEditingScope(scope);
    setEditorOpen(true);
  };

  const handleDelete = (presetId: string, scope: PresetScope) => {
    deletePreset(presetId, scope);
  };

  const handleDuplicate = (preset: QuickApplyPreset, scope: PresetScope) => {
    const now = new Date().toISOString();
    const duplicated: QuickApplyPreset = {
      ...structuredClone(preset),
      id: uuidv4(),
      name: `${preset.name} (copy)`,
      createdAt: now,
      modifiedAt: now,
    };
    createPreset(duplicated, scope);
  };

  const handleBindKey = (presetId: string, key: string | null) => {
    if (key === null) {
      // Clear binding for this preset
      const currentKey = getBoundKey(presetId);
      if (currentKey) {
        setPresetKeyBinding(currentKey, null);
      }
    } else {
      setPresetKeyBinding(key, presetId);
    }
  };

  const handleDragEnd = (event: DragEndEvent, scope: PresetScope) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const presets = scope === 'global' ? globalPresets : projectPresets;
      const oldIndex = presets.findIndex((p) => p.id === active.id);
      const newIndex = presets.findIndex((p) => p.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(presets, oldIndex, newIndex).map((p) => p.id);
        reorderPresets(newOrder, scope);
      }
    }
  };

  const renderPresetList = (presets: QuickApplyPreset[], scope: PresetScope) => {
    if (presets.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No {scope === 'global' ? 'global' : 'project'} presets yet
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreateNew}>
            Create Preset
          </Button>
        </Box>
      );
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => handleDragEnd(e, scope)}
      >
        <SortableContext items={presets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <List sx={{ p: 0 }}>
            {presets.map((preset) => (
              <SortablePresetItem
                key={preset.id}
                preset={preset}
                boundKey={getBoundKey(preset.id)}
                onEdit={() => handleEdit(preset, scope)}
                onDelete={() => handleDelete(preset.id, scope)}
                onDuplicate={() => handleDuplicate(preset, scope)}
                onBindKey={(key) => handleBindKey(preset.id, key)}
              />
            ))}
          </List>
        </SortableContext>
      </DndContext>
    );
  };

  // Count bound keys
  const boundKeysCount = Object.keys(presetKeyBindings).length;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Quick Spot Presets</DialogTitle>

        <DialogContent sx={{ minHeight: 400 }}>
          {/* Info alert */}
          <Alert severity="info" sx={{ mb: 2 }}>
            Presets can be applied to spots using keys 1-9 in Quick Edit mode.
            {boundKeysCount > 0 && ` (${boundKeysCount} key${boundKeysCount !== 1 ? 's' : ''} bound)`}
          </Alert>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label={`Global (${globalPresets.length})`} />
              <Tab label={`Project (${projectPresets.length})`} disabled={!project} />
            </Tabs>
          </Box>

          {/* Tab panels */}
          <TabPanel value={currentTab} index={0}>
            {renderPresetList(globalPresets, 'global')}
          </TabPanel>

          <TabPanel value={currentTab} index={1}>
            {project ? (
              renderPresetList(projectPresets, 'project')
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  Open a project to manage project presets
                </Typography>
              </Box>
            )}
          </TabPanel>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
          <Button startIcon={<AddIcon />} onClick={handleCreateNew}>
            New Preset
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Editor dialog */}
      <QuickApplyPresetEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editPreset={editingPreset}
        editScope={editingScope}
        defaultScope={editingScope}
      />
    </>
  );
}
