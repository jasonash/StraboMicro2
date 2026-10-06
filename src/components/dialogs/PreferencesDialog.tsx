/**
 * Preferences Dialog
 *
 * Application-wide preferences and settings.
 * Currently includes:
 * - REST Server URL configuration (a new server logs out of the old one,
 *   then offers a login for the new one: tokens belong to one server)
 * - Sync: "Sync new projects to StraboSpot when I'm logged in" (spec v3 16al)
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
  FormControlLabel,
  Checkbox,
  Alert,
} from '@mui/material';
import { Refresh as ResetIcon } from '@mui/icons-material';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { sameServer } from '@/utils/syncChipState';

interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_REST_SERVER = 'https://strabospot.org';
export const STORAGE_KEY_REST_SERVER = 'preferences:restServer';
const STORAGE_KEY_SYNC_NEW_PROJECTS = 'preferences:syncNewProjects';

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
  /** The server saved when the dialog opened */
  const [savedServer, setSavedServer] = useState(DEFAULT_REST_SERVER);
  const [saving, setSaving] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [error, setError] = useState<string | null>(null);
  /** null = never chosen (New Project then asks); saved only when changed here */
  const [syncNewProjects, setSyncNewProjects] = useState<boolean | null>(null);
  const [syncNewProjectsChanged, setSyncNewProjectsChanged] = useState(false);
  /** "Chat notifications" (17bh b), kept by the main process; null until read */
  const [chatNotifications, setChatNotifications] = useState<boolean | null>(null);
  const [chatNotificationsChanged, setChatNotificationsChanged] = useState(false);

  // Load saved preferences when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const saved = localStorage.getItem(STORAGE_KEY_REST_SERVER);
    if (saved) {
      setRestServer(saved);
    } else {
      setRestServer(DEFAULT_REST_SERVER);
    }
    setSavedServer(getRestServerUrl());
    setSaving(false);
    setError(null);
    setSyncNewProjects(getSyncNewProjectsPreference());
    setSyncNewProjectsChanged(false);
    setChatNotificationsChanged(false);
    setChatNotifications(null);
    void window.api?.chat?.notifications().then(setChatNotifications).catch(() => setChatNotifications(true));
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

  const serverChanges = isValidUrl(restServer) && !sameServer(savedServer, restServer);

  const handleSave = async () => {
    // Final validation
    if (!isValidUrl(restServer)) {
      setError('Please enter a valid URL (http:// or https://)');
      return;
    }

    // A login belongs to one server: log out of the old one first (it is
    // still the saved server, so the logout goes there)
    const loggedOut = serverChanges && useAuthStore.getState().isAuthenticated;
    if (loggedOut) {
      setSaving(true);
      await useAuthStore.getState().logout();
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY_REST_SERVER, restServer);
    if (syncNewProjectsChanged && syncNewProjects !== null) setSyncNewProjectsPreference(syncNewProjects);
    if (chatNotificationsChanged && chatNotifications !== null) await window.api?.chat?.setNotifications(chatNotifications);
    // Main learns the server (which account's copies a project id means, 16d)
    if (serverChanges) window.api?.auth?.notifyStateChanged(false, restServer);

    console.log('[Preferences] Saved REST server:', restServer);
    setSaving(false);
    onClose();
    if (loggedOut) void promptLogin(`Log in to ${restServer}.`);
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
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mb: 2
                }}>
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
                slotProps={{
                  input: {
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
                  }
                }}
              />
              {isModified && (
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    mt: 0.5,
                    display: 'block'
                  }}>
                  Default: {DEFAULT_REST_SERVER}
                </Typography>
              )}
              {serverChanges && isAuthenticated && (
                <Alert severity="info" sx={{ mt: 1.5 }}>
                  Saving logs you out of {savedServer}. You can then log in to {restServer}.
                </Alert>
              )}
            </Box>

            {/* Sync Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Sync
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={syncNewProjects === true}
                    onChange={(e) => {
                      setSyncNewProjects(e.target.checked);
                      setSyncNewProjectsChanged(true);
                    }}
                  />
                }
                label="Sync new projects to StraboSpot when I'm logged in"
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4 }}>
                New Project preselects this choice. Each project's sync can be changed from the sync status in the header.
              </Typography>
            </Box>

            {/* Chat Section (17bh b) */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Chat
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={chatNotifications !== false}
                    disabled={chatNotifications === null}
                    onChange={(e) => {
                      setChatNotifications(e.target.checked);
                      setChatNotificationsChanged(true);
                    }}
                  />
                }
                label="Chat notifications"
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4 }}>
                Show a notification when someone writes in the chat of the open project while StraboMicro is in the background.
              </Typography>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={saving}>Cancel</Button>
        <Button onClick={() => void handleSave()} variant="contained" disabled={!!error || saving}>
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

/**
 * "Sync new projects to StraboSpot when I'm logged in" (spec v3 16al):
 * null until chosen once (the first New Project choice sets it).
 */
export function getSyncNewProjectsPreference(): boolean | null {
  const saved = localStorage.getItem(STORAGE_KEY_SYNC_NEW_PROJECTS);
  return saved === 'true' ? true : saved === 'false' ? false : null;
}

export function setSyncNewProjectsPreference(value: boolean): void {
  localStorage.setItem(STORAGE_KEY_SYNC_NEW_PROJECTS, value ? 'true' : 'false');
}
