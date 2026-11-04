/**
 * Logging out with the open project not fully synced (collaboration spec v3
 * §11.5, 16as, 16az). Changes not yet synced: [Sync and log out] pushes
 * first and logs out when it worked; when it fails the dialog says why and
 * offers [Log out anyway]. First upload still running: only [Log out anyway]
 * (it continues at the next login). Either way the changes stay on this
 * computer, queued for this account. A plain logout (nothing waiting) uses
 * the header's small confirmation instead.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useSyncStore } from '@/store/useSyncStore';
import { uploadPercent } from '@/utils/syncChipState';
import { firstName } from '@/utils/accountNames';
import { syncBeforeLogout, queuedUploadsText, type LogoutCheck } from '@/services/syncActions';

interface LogoutSyncDialogProps {
  /** What waits (null = closed); never 'plain' */
  check: Exclude<LogoutCheck, { kind: 'plain' }> | null;
  onClose: () => void;
  /** Log out now */
  onLogout: () => Promise<void>;
}

type Step = { kind: 'ask' } | { kind: 'syncing' } | { kind: 'failed'; message: string };

export function LogoutSyncDialog({ check, onClose, onLogout }: LogoutSyncDialogProps) {
  const [step, setStep] = useState<Step>({ kind: 'ask' });
  const user = useAuthStore((s) => s.user);
  const projectName = useAppStore((s) => s.project?.name ?? 'this project');
  const percent = useSyncStore((s) => uploadPercent(s.progress));

  useEffect(() => {
    if (check) setStep({ kind: 'ask' });
  }, [check]);

  const who = firstName(user?.name, user?.email);
  const count = check?.kind === 'changes' ? check.count : 0;
  const changes = `${count} ${count === 1 ? 'change' : 'changes'}`;
  const kept = `stay on this computer and sync the next time you log in as ${who}.`;

  const logOut = async () => {
    onClose();
    await onLogout();
  };

  const syncThenLogOut = async () => {
    setStep({ kind: 'syncing' });
    const result = await syncBeforeLogout();
    if (result.ok) {
      await logOut();
    } else {
      setStep({ kind: 'failed', message: result.message });
    }
  };

  const syncing = step.kind === 'syncing';

  return (
    <Dialog open={check !== null} onClose={syncing ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Log out of StraboSpot?</DialogTitle>
      <DialogContent>
        {check?.kind === 'uploading' && (
          <Typography variant="body2">
            The first upload of <strong>{projectName}</strong> is still running
            {percent !== null ? ` (${percent}%)` : ''}. It continues the next time you log in as {who}.
          </Typography>
        )}
        {check?.kind === 'changes' && step.kind === 'ask' && (
          <>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              You have {changes} in <strong>{projectName}</strong> not yet synced.
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              If you log out anyway, they {kept}
            </Typography>
          </>
        )}
        {syncing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Syncing {changes}…</Typography>
          </Box>
        )}
        {check && queuedUploadsText(check.queued) && !syncing && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {queuedUploadsText(check.queued)}
          </Typography>
        )}
        {step.kind === 'failed' && (
          <>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Could not sync: {step.message}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              If you log out anyway, your {changes} {kept}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={syncing}>Cancel</Button>
        <Button onClick={() => void logOut()} disabled={syncing} color="error">
          Log out anyway
        </Button>
        {check?.kind === 'changes' && step.kind === 'ask' && (
          <Button variant="contained" onClick={() => void syncThenLogOut()}>
            Sync and log out
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
