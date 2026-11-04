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

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { remoteRowText } from '@/utils/remoteProjectRow';
import { openRemoteHere, downloadRemote, type RemoteProject } from '@/services/remoteProjects';
import { InvitationList } from './InvitationList';
import { useInvitationsStore } from '@/store/useInvitationsStore';

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
  const [invitations, setInvitations] = useState<SyncInvitation[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  // The download whose end opens its project; closing the window while it
  // runs clears it: the download goes on, but the project does not open by
  // itself later (it is in Recent Projects and in this list)
  const opensWhenDone = useRef<symbol | null>(null);

  const load = useCallback(async () => {
    if (!window.api) return;
    setProjects(null);
    setError(null);
    // Invitations waiting for me (17f); a failure here leaves only the list
    void window.api.sync.invites(getRestServerUrl()).then((i) => setInvitations(i.ok ? i.invitations : []));
    const r = await window.api.sync.serverProjects(getRestServerUrl());
    // Most recently changed first (the server lists them by project number)
    if (r.ok) setProjects([...r.projects].sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0)));
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
    await openRemoteHere(p, onOpenProject);
  };

  const download = async (p: RemoteProject) => {
    setBusy({ pid: p.pid, status: 'Starting the download…' });
    setError(null);
    const me = Symbol('download');
    opensWhenDone.current = me;
    try {
      const r = await downloadRemote(p, mode, (status) => setBusy((b) => (opensWhenDone.current === me ? { pid: p.pid, status } : b)));
      if (opensWhenDone.current !== me) return;
      opensWhenDone.current = null;
      if (!r.ok) {
        setError(r.message);
        return;
      }
      // Also when its files were interrupted: the open project fetches the rest
      onClose();
      await onOpenProject(r.projectId);
    } finally {
      setBusy((b) => (b?.pid === p.pid ? null : b));
    }
  };

  const close = () => {
    opensWhenDone.current = null;
    onClose();
  };

  return (
    <Dialog open={open} onClose={inviteBusy ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>Open Remote Project</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {invitations.length > 0 && (
            <>
              <Typography variant="subtitle2">Invitations</Typography>
              <InvitationList
                invitations={invitations}
                onAnswered={(pid) => {
                  setInvitations((list) => list.filter((i) => i.pid !== pid));
                  useInvitationsStore.getState().remove(pid);
                }}
                onAccepted={(pid) => useInvitationsStore.getState().remove(pid)}
                onOpenProject={(projectId) => {
                  onClose();
                  void onOpenProject(projectId);
                }}
                onBusyChange={setInviteBusy}
              />
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Your projects</Typography>
            </>
          )}
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
                      busy?.pid === p.pid
                        ? (
                          <>
                            {busy.status}
                            <br />
                            You can close this window: the download goes on, and the project will be in Recent Projects.
                          </>
                        )
                        : remoteRowText(p, projects)
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
        <Button onClick={() => void load()} disabled={busy !== null || inviteBusy}>Refresh</Button>
        <Button onClick={close} disabled={inviteBusy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
