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

// Default shortcuts that can be restored
const DEFAULT_SHORTCUTS: Record<string, string> = {
  'q': 'quartz',
  'p': 'plagioclase',
  'k': 'k-feldspar',
  'b': 'biotite',
  'm': 'muscovite',
  'h': 'hornblende',
  'o': 'olivine',
  'x': 'pyroxene',
  'g': 'garnet',
  'c': 'calcite',
  'd': 'dolomite',
  'a': 'amphibole',
  'e': 'epidote',
  't': 'tourmaline',
  'z': 'zircon',
  'u': 'unknown',
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
    const mineral = newMineral.trim().toLowerCase();

    if (!key || !mineral) {
      setError('Please enter both a key and mineral name');
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

  // Handle editing a shortcut's mineral name
  const handleEditMineral = (key: string, newMineral: string) => {
    setLocalShortcuts((prev) => ({
      ...prev,
      [key]: newMineral.toLowerCase(),
    }));
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

  // Format mineral name for display
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
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-end' }}>
          <TextField
            label="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.slice(0, 1))}
            size="small"
            sx={{ width: 60 }}
            inputProps={{ maxLength: 1, style: { textTransform: 'uppercase' } }}
          />
          <TextField
            label="Mineral Name"
            value={newMineral}
            onChange={(e) => setNewMineral(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddShortcut();
              }
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddShortcut}
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
              <ListItemText>
                <TextField
                  value={formatMineralName(mineral)}
                  onChange={(e) => handleEditMineral(key, e.target.value)}
                  size="small"
                  variant="standard"
                  sx={{ width: '100%' }}
                />
              </ListItemText>
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
