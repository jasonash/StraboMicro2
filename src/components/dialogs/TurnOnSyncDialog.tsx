/**
 * Turn-on dialog, "Sync this project to StraboSpot" (collaboration spec v3,
 * 16aj): what sync gives, the upload size, the mode (Sync automatically
 * preselected, 16ag), and a login when needed. Opened from the header chip
 * and File > Upload to Strabo Server... for a local-only project.
 *
 * Start Syncing closes the dialog at once; App turns sync on (the folder
 * moves, the project reopens) and the first upload shows on the chip.
 * A project the server already has needs linking (step 8 stage 4), so it
 * cannot be started here yet.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { getRestServerUrl } from './PreferencesDialog';
import { formatBytes } from '@/utils/formatBytes';

interface TurnOnSyncDialogProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  onStart: (mode: SyncMode) => void;
}

type Preflight = Extract<SyncPreflightResult, { ok: true }>;

/** What keeps Start Syncing disabled, in words; null when it can start */
function blocker(p: Preflight): string | null {
  if (p.onServer) {
    return "This project is already on StraboSpot. Connecting this copy to it isn't available yet.";
  }
  if (!p.problem) return null;
  switch (p.problem.kind) {
    case 'disabled':
    case 'old_server':
      return "StraboSpot sync isn't available yet.";
    case 'offline':
      return "Can't reach StraboSpot. Check your connection and try again.";
    default:
      return p.problem.message;
  }
}

export function TurnOnSyncDialog({ open, projectId, onClose, onStart }: TurnOnSyncDialogProps) {
  const loggedIn = useAuthStore((s) => s.isAuthenticated);
  const [mode, setMode] = useState<SyncMode>('automatic');
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!projectId || !window.api) return;
    setChecking(true);
    setError(null);
    try {
      const r = await window.api.sync.preflight(projectId, getRestServerUrl());
      if (r.ok) setPreflight(r);
      else {
        setPreflight(null);
        setError(r.message);
      }
    } finally {
      setChecking(false);
    }
  }, [projectId]);

  // Check when opened, and again after a login
  useEffect(() => {
    if (!open) return;
    void check();
  }, [open, loggedIn, check]);

  useEffect(() => {
    if (open) setMode('automatic');
    else setPreflight(null);
  }, [open]);

  const why = preflight ? blocker(preflight) : null;
  const canStart = !checking && preflight !== null && preflight.loggedIn && why === null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sync this project to StraboSpot</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2">
            Syncing keeps a backup of this project on StraboSpot, puts it on your other computers,
            and lets you share it with collaborators later.
          </Typography>

          <Typography variant="body2" sx={{ color: 'text.secondary', minHeight: 20 }}>
            {preflight
              ? `About ${formatBytes(preflight.bytes)} to upload. You can keep working while it uploads.`
              : checking ? 'Working out the upload size…' : ''}
          </Typography>

          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value === 'manual' ? 'manual' : 'automatic')}>
            <FormControlLabel
              value="automatic"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Sync automatically</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Changes go up a few seconds after you stop editing.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.25 } }}
            />
            <FormControlLabel
              value="manual"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Sync when I click</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    After the first upload, nothing leaves this computer until you click Sync Now.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', mt: 0.5, '& .MuiRadio-root': { pt: 0.25 } }}
            />
          </RadioGroup>

          {preflight && !preflight.loggedIn && (
            <Alert
              severity="info"
              action={
                <Button color="inherit" size="small" onClick={() => void promptLogin('Log in to sync this project to StraboSpot.')}>
                  Log in
                </Button>
              }
            >
              Log in to StraboSpot to sync this project.
            </Alert>
          )}
          {why && (
            <Alert
              severity="warning"
              action={preflight?.problem ? (
                <Button color="inherit" size="small" onClick={() => void check()} disabled={checking}>
                  Try Again
                </Button>
              ) : undefined}
            >
              {why}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        {checking && <CircularProgress size={18} sx={{ mr: 'auto', ml: 2 }} />}
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canStart}
          onClick={() => {
            onClose();
            onStart(mode);
          }}
        >
          Start Syncing
        </Button>
      </DialogActions>
    </Dialog>
  );
}
