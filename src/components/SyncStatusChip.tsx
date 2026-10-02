/**
 * Sync status chip (collaboration spec v3, 16ad and 16ae): in the header,
 * left of the account. One state at a time (src/utils/syncChipState.ts);
 * a click opens a popover with the details, Sync Now, the mode choice and
 * Review decisions. For a local-only project it offers to turn sync on.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { useAppStore } from '@/store';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { useSyncStore, decisionsWaiting } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { syncChipState, lastSyncedText, type SyncChipTone } from '@/utils/syncChipState';
import { syncNowFromUser, changeModeFromUser, requestTurnOnSync } from '@/services/syncActions';

const CHIP_COLOR: Record<SyncChipTone, 'warning' | 'info' | 'default' | 'success'> = {
  attention: 'warning',
  active: 'info',
  quiet: 'default',
  ok: 'success',
  muted: 'default',
};

/** Re-render the "Last synced" line while the popover is open */
const CLOCK_MS = 30_000;

export function SyncStatusChip() {
  const projectOpen = useAppStore((s) => s.project !== null);
  const sync = useSyncStore();
  const loggedIn = useAuthStore((s) => s.isAuthenticated);
  const userPkey = useAuthStore((s) => (s.user ? String(s.user.pkey) : null));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!anchor) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, [anchor]);

  if (!projectOpen) return null;

  const state = syncChipState(sync, { loggedIn, pkey: userPkey, restServer: getRestServerUrl() });
  const waiting = decisionsWaiting(sync);
  const syncing = sync.activity === 'syncing';
  const close = () => {
    setAnchor(null);
    setModeError(null);
  };

  const icon = state.busy
    ? <CircularProgress size={12} color="inherit" />
    : state.tone === 'ok' ? <CheckCircleOutlineIcon />
      : state.tone === 'attention' ? <ErrorOutlineIcon />
        : state.tone === 'muted' ? <ComputerOutlinedIcon />
          : <CloudOffOutlinedIcon />;

  const changeMode = async (mode: SyncMode) => {
    setModeError(null);
    const result = await changeModeFromUser(mode);
    if (!result.ok) setModeError(result.message);
  };

  return (
    <>
      <Chip
        size="small"
        variant="outlined"
        color={CHIP_COLOR[state.tone]}
        icon={icon}
        label={state.label}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          maxWidth: 260,
          ...(state.tone === 'muted' ? { color: 'text.secondary', borderColor: 'divider' } : {}),
          '& .MuiChip-icon': { ml: 0.75, fontSize: 16 },
        }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 340, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Typography variant="subtitle2">{state.label}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{state.detail}</Typography>

          {!sync.synced ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => {
                  close();
                  requestTurnOnSync();
                }}
              >
                Sync this project…
              </Button>
            </Box>
          ) : (
            <>
              {sync.notice && state.label !== 'Syncing…' && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{sync.notice}</Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {lastSyncedText(sync.lastSyncedAt, now)}
                {sync.email ? ` · ${sync.email}` : ''}
                {sync.pid !== null ? ` · StraboSpot project ${sync.pid}` : ''}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {state.needsLogin && !loggedIn && (
                  <Button
                    size="small"
                    onClick={() => {
                      close();
                      void promptLogin(`Log in as ${sync.email ?? 'the account this copy belongs to'} to sync this project.`);
                    }}
                  >
                    Log in
                  </Button>
                )}
                {waiting > 0 && (
                  <Button
                    size="small"
                    onClick={() => {
                      close();
                      useSyncStore.getState().update({ decisionsOpen: true });
                    }}
                  >
                    Review decisions…
                  </Button>
                )}
                <Button
                  size="small"
                  variant="contained"
                  disabled={syncing}
                  onClick={() => {
                    close();
                    void syncNowFromUser();
                  }}
                >
                  Sync Now
                </Button>
              </Box>

              <Divider />
              <RadioGroup
                value={sync.mode ?? 'automatic'}
                onChange={(e) => void changeMode(e.target.value === 'manual' ? 'manual' : 'automatic')}
              >
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
                        Nothing leaves this computer until you click Sync Now.
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', mt: 0.5, '& .MuiRadio-root': { pt: 0.25 } }}
                />
              </RadioGroup>
              {modeError && (
                <Typography variant="body2" color="error">{modeError}</Typography>
              )}
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
