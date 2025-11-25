/**
 * Preferences Dialog
 *
 * Application-wide preferences and settings.
 * Currently includes:
 * - REST Server URL configuration
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Stack,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Refresh as ResetIcon } from '@mui/icons-material';

interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_REST_SERVER = 'https://strabospot.org';
const STORAGE_KEY_REST_SERVER = 'preferences:restServer';

/**
 * Validate URL - must be http or https
 */
function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PreferencesDialog({ isOpen, onClose }: PreferencesDialogProps) {
  const [restServer, setRestServer] = useState(DEFAULT_REST_SERVER);
  const [error, setError] = useState<string | null>(null);

  // Load saved preferences when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const saved = localStorage.getItem(STORAGE_KEY_REST_SERVER);
    if (saved) {
      setRestServer(saved);
    } else {
      setRestServer(DEFAULT_REST_SERVER);
    }
    setError(null);
  }, [isOpen]);

  const handleRestServerChange = (value: string) => {
    setRestServer(value);

    // Validate on change
    if (value && !isValidUrl(value)) {
      setError('Please enter a valid URL (http:// or https://)');
    } else {
      setError(null);
    }
  };

  const handleReset = () => {
    setRestServer(DEFAULT_REST_SERVER);
    setError(null);
  };

  const handleSave = () => {
    // Final validation
    if (!isValidUrl(restServer)) {
      setError('Please enter a valid URL (http:// or https://)');
      return;
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY_REST_SERVER, restServer);

    console.log('[Preferences] Saved REST server:', restServer);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const isModified = restServer !== DEFAULT_REST_SERVER;

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Preferences</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={3}>
            {/* REST Server Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                REST Server
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The StraboSpot server URL for syncing projects and data.
              </Typography>
              <TextField
                fullWidth
                label="Server URL"
                value={restServer}
                onChange={(e) => handleRestServerChange(e.target.value)}
                error={!!error}
                helperText={error || 'Must be a valid http:// or https:// URL'}
                placeholder={DEFAULT_REST_SERVER}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleReset}
                        disabled={!isModified}
                        title="Reset to default"
                        size="small"
                      >
                        <ResetIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {isModified && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Default: {DEFAULT_REST_SERVER}
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!!error}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Helper function to get the current REST server URL
 * Can be used throughout the app
 */
export function getRestServerUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY_REST_SERVER);
  return saved || DEFAULT_REST_SERVER;
}
