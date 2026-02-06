/**
 * MineralColorDialog Component
 *
 * Allows users to configure mineral-to-color assignments at global and project levels.
 * Global colors are persisted in app preferences; project overrides are saved in the .smz file.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useAppStore } from '../../store';
import { AutocompleteMineralSearch } from './metadata/reusable/AutocompleteMineralSearch';
import type { MineralColorEntry } from '@/types/mineral-color-types';
import { DEFAULT_MINERAL_COLORS } from '@/constants/mineralColorDefaults';

interface MineralColorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MineralColorDialog({ isOpen, onClose }: MineralColorDialogProps) {
  const project = useAppStore((state) => state.project);
  const globalMineralColors = useAppStore((state) => state.globalMineralColors);
  const setGlobalMineralColors = useAppStore((state) => state.setGlobalMineralColors);
  const setProjectMineralColors = useAppStore((state) => state.setProjectMineralColors);

  // Local state for editing (saved to store on close)
  const [localGlobalColors, setLocalGlobalColors] = useState<MineralColorEntry[]>([]);
  const [localProjectColors, setLocalProjectColors] = useState<MineralColorEntry[] | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // State for adding new mineral
  const [newMineral, setNewMineral] = useState<string>('');
  const [newColor, setNewColor] = useState('#ff6b6b');

  // Initialize local state from store when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalGlobalColors([...globalMineralColors]);
      setLocalProjectColors(project?.mineralColors ? [...project.mineralColors] : null);
      setActiveTab(0);
      setNewMineral('');
      setNewColor('#ff6b6b');
    }
  }, [isOpen, globalMineralColors, project?.mineralColors]);

  const handleSaveAndClose = () => {
    setGlobalMineralColors(localGlobalColors);
    if (project) {
      setProjectMineralColors(localProjectColors);
    }
    onClose();
  };

  const handleResetGlobalDefaults = () => {
    setLocalGlobalColors([...DEFAULT_MINERAL_COLORS]);
  };

  const handleClearProjectOverrides = () => {
    setLocalProjectColors(null);
  };

  // Get the active color list based on current tab
  const activeColors = activeTab === 0 ? localGlobalColors : (localProjectColors ?? []);

  const handleColorChange = (mineral: string, color: string) => {
    if (activeTab === 0) {
      setLocalGlobalColors((prev) =>
        prev.map((e) => (e.mineral === mineral ? { ...e, color } : e))
      );
    } else {
      setLocalProjectColors((prev) =>
        (prev ?? []).map((e) => (e.mineral === mineral ? { ...e, color } : e))
      );
    }
  };

  const handleRemoveMineral = (mineral: string) => {
    if (activeTab === 0) {
      setLocalGlobalColors((prev) => prev.filter((e) => e.mineral !== mineral));
    } else {
      setLocalProjectColors((prev) =>
        (prev ?? []).filter((e) => e.mineral !== mineral)
      );
    }
  };

  const handleAddMineral = () => {
    if (!newMineral) return;

    const entry: MineralColorEntry = { mineral: newMineral, color: newColor };

    if (activeTab === 0) {
      // Don't add duplicates
      if (localGlobalColors.some((e) => e.mineral === newMineral)) return;
      setLocalGlobalColors((prev) => [...prev, entry]);
    } else {
      const projColors = localProjectColors ?? [];
      if (projColors.some((e) => e.mineral === newMineral)) return;
      setLocalProjectColors([...projColors, entry]);
    }

    setNewMineral('');
    setNewColor('#ff6b6b');
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleSaveAndClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { maxHeight: '80vh' } }}
    >
      <DialogTitle>Configure Mineral Colors</DialogTitle>
      <DialogContent dividers>
        {/* Tab bar - only show Project tab if a project is loaded */}
        {project && (
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            sx={{ mb: 2 }}
          >
            <Tab label="Global Colors" />
            <Tab label="Project Overrides" />
          </Tabs>
        )}

        {/* Info alert */}
        {activeTab === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Global colors apply to all projects unless overridden.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Project overrides take priority over global colors for this project only.
            {!localProjectColors && ' No project overrides set.'}
          </Alert>
        )}

        {/* Mineral color list */}
        <List dense sx={{ maxHeight: 350, overflow: 'auto' }}>
          {activeColors.map((entry) => (
            <ListItem
              key={entry.mineral}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveMineral(entry.mineral)}
                  aria-label={`Remove ${entry.mineral}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
              sx={{ py: 0.5 }}
            >
              <Box
                component="input"
                type="color"
                value={entry.color}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleColorChange(entry.mineral, e.target.value)
                }
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  mr: 1.5,
                  p: 0,
                  '&::-webkit-color-swatch-wrapper': { padding: 0 },
                  '&::-webkit-color-swatch': { border: 'none', borderRadius: 3 },
                }}
              />
              <ListItemText primary={entry.mineral} />
            </ListItem>
          ))}
          {activeColors.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              {activeTab === 0 ? 'No global colors configured.' : 'No project overrides. Global colors will be used.'}
            </Typography>
          )}
        </List>

        {/* Add new mineral row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <Box
            component="input"
            type="color"
            value={newColor}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColor(e.target.value)}
            sx={{
              width: 32,
              height: 32,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              cursor: 'pointer',
              p: 0,
              flexShrink: 0,
              '&::-webkit-color-swatch-wrapper': { padding: 0 },
              '&::-webkit-color-swatch': { border: 'none', borderRadius: 3 },
            }}
          />
          <Box sx={{ flex: 1 }}>
            <AutocompleteMineralSearch
              selectedMinerals={newMineral ? [newMineral] : []}
              onChange={(minerals) => setNewMineral(minerals[0] || '')}
              multiple={false}
              label="Add mineral"
              placeholder="Search..."
            />
          </Box>
          <IconButton
            onClick={handleAddMineral}
            disabled={!newMineral}
            color="primary"
            aria-label="Add mineral"
          >
            <AddIcon />
          </IconButton>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box>
          {activeTab === 0 ? (
            <Button onClick={handleResetGlobalDefaults} size="small">
              Reset to Defaults
            </Button>
          ) : (
            <Button
              onClick={handleClearProjectOverrides}
              size="small"
              disabled={!localProjectColors}
            >
              Clear All Overrides
            </Button>
          )}
        </Box>
        <Button onClick={handleSaveAndClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
