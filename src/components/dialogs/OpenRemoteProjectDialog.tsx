/**
 * Open Remote Project (collaboration spec v3, 16ao): one list of my
 * StraboSpot projects, whatever their format, with what this computer has:
 *   a synced copy here      Open
 *   a local-only copy here  Open, then the one-time prompt connects it (16an),
 *                           never a second copy
 *   nothing here            Download as a synced copy (Sync automatically
 *                           preselected): converted projects are cloned,
 *                           older uploads are imported and adopted (P1-1)
 * There is no "download a copy that does not sync": the website's .smz
 * download and File > Import cover that.
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
  List,
  ListItem,
  ListItemText,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { getRestServerUrl } from './PreferencesDialog';
import { formatSyncDate } from '@/utils/formatSyncDate';
import { describeProgress } from '@/utils/syncChipState';
import { offerLink } from '@/services/syncLinking';
import { requestFirstSync } from '@/services/syncActions';

type RemoteProject = SyncServerProject & { here: 'synced' | 'local' | null };

interface OpenRemoteProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Close the current project and open this one (it is on disk) */
  onOpenProject: (projectId: string) => Promise<void>;
}

export function OpenRemoteProjectDialog({ open, onClose, onOpenProject }: OpenRemoteProjectDialogProps) {
  const [projects, setProjects] = useState<RemoteProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SyncMode>('automatic');
  const [busy, setBusy] = useState<{ pid: number; status: string } | null>(null);

  const load = useCallback(async () => {
    if (!window.api) return;
    setProjects(null);
    setError(null);
    const r = await window.api.sync.serverProjects(getRestServerUrl());
    if (r.ok) setProjects(r.projects);
    else setError(r.message);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode('automatic');
    setBusy(null);
    void load();
  }, [open, load]);

  const openHere = async (p: RemoteProject) => {
    onClose();
    await onOpenProject(p.straboId);
    if (p.here === 'local') offerLink({ projectId: p.straboId, pid: p.pid, syncFormat: p.syncFormat, updatedAt: p.updatedAt });
  };

  const download = async (p: RemoteProject) => {
    const api = window.api;
    if (!api) return;
    setBusy({ pid: p.pid, status: 'Starting the download…' });
    setError(null);
    const off = api.sync.onProgress((progress) => {
      if (progress.projectId !== `remote:${p.pid}`) return;
      setBusy({ pid: p.pid, status: describeProgress(progress) ?? 'Downloading…' });
    });
    try {
      const r = await api.sync.openRemote(p.pid, getRestServerUrl(), mode);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      // An older upload was adopted: its first upload into the same project runs now
      if (r.adopted) requestFirstSync(r.projectId);
      onClose();
      await onOpenProject(r.projectId);
    } finally {
      off();
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Open Remote Project</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Your projects on StraboSpot. A downloaded project stays synced with StraboSpot.
          </Typography>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value === 'manual' ? 'manual' : 'automatic')}>
            <FormControlLabel value="automatic" control={<Radio size="small" />} label="Sync automatically" disabled={busy !== null} />
            <FormControlLabel value="manual" control={<Radio size="small" />} label="Sync when I click" disabled={busy !== null} />
          </RadioGroup>
          {error && <Alert severity="error">{error}</Alert>}
          {projects === null && !error && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading your projects…</Typography>
            </Box>
          )}
          {projects !== null && projects.length === 0 && (
            <Typography variant="body2" sx={{ py: 2 }}>You have no projects on StraboSpot yet.</Typography>
          )}
          {projects !== null && projects.length > 0 && (
            <List dense disablePadding sx={{ maxHeight: 420, overflow: 'auto' }}>
              {projects.map((p) => (
                <ListItem
                  key={p.pid}
                  divider
                  secondaryAction={
                    busy?.pid === p.pid ? (
                      <CircularProgress size={18} />
                    ) : p.here ? (
                      <Button size="small" disabled={busy !== null} onClick={() => void openHere(p)}>Open</Button>
                    ) : (
                      <Button size="small" variant="outlined" disabled={busy !== null} onClick={() => void download(p)}>Download</Button>
                    )
                  }
                >
                  <ListItemText
                    primary={p.name || 'Untitled Project'}
                    secondary={
                      busy?.pid === p.pid ? busy.status
                        : `${p.updatedAt ? `Changed ${formatSyncDate(p.updatedAt)}` : 'On StraboSpot'}` +
                          (p.here === 'synced' ? ' · synced copy on this computer'
                            : p.here === 'local' ? ' · a copy on this computer (it will be connected)' : '') +
                          (p.role !== 'owner' && p.owner?.name ? ` · ${p.owner.name}'s project` : '')
                    }
                    sx={{ pr: 10 }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void load()} disabled={busy !== null}>Refresh</Button>
        <Button onClick={onClose} disabled={busy !== null}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
