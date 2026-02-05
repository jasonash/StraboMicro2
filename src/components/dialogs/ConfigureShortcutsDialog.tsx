import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useAppStore } from '../../store';
import { AutocompleteMineralSearch } from './metadata/reusable/AutocompleteMineralSearch';

// Default shortcuts that can be restored
const DEFAULT_SHORTCUTS: Record<string, string> = {
  'q': 'Quartz',
  'p': 'Plagioclase',
  'k': 'K-Feldspar',
  'b': 'Biotite',
  'm': 'Muscovite',
  'h': 'Hornblende',
  'o': 'Olivine',
  'x': 'Clinopyroxene',
  'g': 'Garnet',
  'c': 'Calcite',
  'd': 'Dolomite',
  'a': 'Amphibole',
  'e': 'Epidote',
  's': 'Serpentine',
  't': 'Tourmaline',
  'z': 'Zircon',
};

// Reserved keys that cannot be used as shortcuts
const RESERVED_KEYS = [' ', 'Backspace', 'Escape', 'Enter', 'Tab'];

interface ConfigureShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ConfigureShortcutsDialog: React.FC<ConfigureShortcutsDialogProps> = ({
  open,
  onClose,
}) => {
  const shortcuts = useAppStore((state) => state.quickClassifyShortcuts);
  const setQuickClassifyShortcuts = useAppStore((state) => state.setQuickClassifyShortcuts);

  // Local state for editing
  const [localShortcuts, setLocalShortcuts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newMineral, setNewMineral] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalShortcuts({ ...shortcuts });
      setNewKey('');
      setNewMineral('');
      setError(null);
    }
  }, [open, shortcuts]);

  // Sort shortcuts by key for display
  const sortedShortcuts = useMemo(() => {
    return Object.entries(localShortcuts).sort(([a], [b]) => a.localeCompare(b));
  }, [localShortcuts]);

  // Check if a key is valid for use as a shortcut
  const isValidKey = (key: string): boolean => {
    if (key.length !== 1) return false;
    if (RESERVED_KEYS.includes(key)) return false;
    if (!/^[a-z0-9]$/i.test(key)) return false;
    return true;
  };

  // Handle adding a new shortcut
  const handleAddShortcut = () => {
    const key = newKey.toLowerCase().trim();
    const mineral = newMineral.trim();

    if (!key || !mineral) {
      setError('Please enter both a key and select a mineral');
      return;
    }

    if (!isValidKey(key)) {
      setError('Key must be a single letter or number');
      return;
    }

    if (localShortcuts[key]) {
      setError(`Key "${key}" is already assigned to "${localShortcuts[key]}"`);
      return;
    }

    setLocalShortcuts((prev) => ({ ...prev, [key]: mineral }));
    setNewKey('');
    setNewMineral('');
    setError(null);
  };

  // Handle removing a shortcut
  const handleRemoveShortcut = (key: string) => {
    setLocalShortcuts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Handle resetting to defaults
  const handleResetToDefaults = () => {
    setLocalShortcuts({ ...DEFAULT_SHORTCUTS });
    setError(null);
  };

  // Handle save
  const handleSave = () => {
    setQuickClassifyShortcuts(localShortcuts);
    onClose();
  };

  // Format mineral name for display (handles legacy lowercase names)
  const formatMineralName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Quick Classify Shortcuts</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Press the corresponding key to classify the selected spot with that mineral.
          Reserved keys: Space (skip), Backspace (back), Escape (exit), Tab (next unclassified).
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Add new shortcut */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
          <TextField
            label="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.slice(0, 1))}
            size="small"
            sx={{ width: 60 }}
            inputProps={{ maxLength: 1, style: { textTransform: 'uppercase' } }}
          />
          <Box sx={{ flex: 1 }}>
            <AutocompleteMineralSearch
              selectedMinerals={newMineral ? [newMineral] : []}
              onChange={(minerals) => setNewMineral(minerals[0] || '')}
              multiple={false}
              label="Mineral"
              placeholder="Search for a mineral..."
            />
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddShortcut}
            sx={{ mt: '4px' }}
          >
            Add
          </Button>
        </Box>

        <Divider sx={{ mb: 1 }} />

        {/* List of shortcuts */}
        <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
          {sortedShortcuts.map(([key, mineral]) => (
            <ListItem
              key={key}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveShortcut(key)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
            >
              <Chip
                label={key.toUpperCase()}
                size="small"
                sx={{ mr: 2, minWidth: 32, fontWeight: 'bold' }}
              />
              <ListItemText
                primary={formatMineralName(mineral)}
              />
            </ListItem>
          ))}
          {sortedShortcuts.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', py: 2 }}
            >
              No shortcuts configured. Add some above.
            </Typography>
          )}
        </List>

        <Divider sx={{ mt: 1 }} />

        {/* Reset to defaults */}
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="text"
            size="small"
            onClick={handleResetToDefaults}
            color="secondary"
          >
            Reset to Defaults
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigureShortcutsDialog;
