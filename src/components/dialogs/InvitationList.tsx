/**
 * Collaboration invitations waiting for me (spec v3 Phase 2, 17f), shared by
 * the Invitations dialog shown after login and the top of Open Remote
 * Project. Accept joins the project on the server, then downloads it as a
 * synced copy (Sync automatically, 16ag) and offers to open it; Decline
 * removes the row. The same accept/decline endpoints serve the website.
 */

import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText } from '@mui/material';
import { getRestServerUrl } from './PreferencesDialog';
import { downloadRemote } from '@/services/remoteProjects';
import { withArticle } from '@/utils/collaboratorRoles';

type RowState =
  | { kind: 'busy'; status: string }
  | { kind: 'downloaded'; projectId: string; existing: boolean }
  | { kind: 'error'; message: string; joined: boolean };

interface InvitationListProps {
  invitations: SyncInvitation[];
  /** An invitation was declined (or is gone): drop it from the list */
  onAnswered: (pid: number) => void;
  /** An invitation was accepted (its row stays, to download and open) */
  onAccepted?: (pid: number) => void;
  /** Open a downloaded project (the caller closes its dialog first) */
  onOpenProject: (projectId: string) => void;
  /** Something is running (callers keep their dialog open meanwhile) */
  onBusyChange?: (busy: boolean) => void;
}

export function InvitationList({ invitations, onAnswered, onAccepted, onOpenProject, onBusyChange }: InvitationListProps) {
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const setRow = (pid: number, state: RowState | null) =>
    setRows((prev) => {
      const next = { ...prev };
      if (state === null) delete next[pid];
      else next[pid] = state;
      return next;
    });
  const anyBusy = Object.values(rows).some((r) => r.kind === 'busy');

  const run = async (fn: () => Promise<void>) => {
    onBusyChange?.(true);
    try {
      await fn();
    } finally {
      onBusyChange?.(false);
    }
  };

  const accept = (inv: SyncInvitation) => run(async () => {
    const api = window.api;
    if (!api) return;
    setRow(inv.pid, { kind: 'busy', status: 'Joining the project…' });
    const r = await api.sync.answerInvite(getRestServerUrl(), inv.pid, true);
    if (!r.ok) {
      // Answered already (here, on the website or on another computer): nothing left to do
      if (r.kind === 'not_found') {
        setRow(inv.pid, null);
        onAnswered(inv.pid);
        return;
      }
      setRow(inv.pid, { kind: 'error', message: r.message, joined: false });
      return;
    }
    onAccepted?.(inv.pid);
    const d = await downloadRemote(
      { pid: inv.pid, straboId: inv.straboId, name: inv.name, role: inv.role, syncFormat: 'entity', syncState: 'ready',
        updatedAt: null, owner: inv.owner, here: null },
      'automatic',
      (status) => setRow(inv.pid, { kind: 'busy', status })
    );
    setRow(inv.pid, d.ok
      ? { kind: 'downloaded', projectId: d.projectId, existing: d.existing }
      : { kind: 'error', message: `You joined the project, but the download failed: ${d.message} You can download it from File > Open Remote Project.`, joined: true });
  });

  const decline = (inv: SyncInvitation) => run(async () => {
    const api = window.api;
    if (!api) return;
    setRow(inv.pid, { kind: 'busy', status: 'Declining…' });
    const r = await api.sync.answerInvite(getRestServerUrl(), inv.pid, false);
    if (!r.ok && r.kind !== 'not_found') {
      setRow(inv.pid, { kind: 'error', message: r.message, joined: false });
      return;
    }
    setRow(inv.pid, null);
    onAnswered(inv.pid);
  });

  return (
    <List dense disablePadding>
      {invitations.map((inv) => {
        const row = rows[inv.pid];
        const from = inv.invitedBy?.name || inv.owner?.name || 'Someone';
        return (
          <ListItem key={inv.pid} divider sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ListItemText
              primary={inv.name || 'Untitled Project'}
              secondary={
                row?.kind === 'busy' ? row.status
                  : row?.kind === 'downloaded'
                    ? (row.existing ? 'Already on this computer. Opening it brings it up to date.' : 'Downloaded. It stays synced with the other collaborators.')
                    : `${from} invited you as ${withArticle(inv.role)}.`
              }
              sx={{ flex: '1 1 220px', minWidth: 0 }}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {row?.kind === 'busy' && <CircularProgress size={18} />}
              {row?.kind === 'downloaded' && (
                <Button size="small" variant="contained" onClick={() => onOpenProject(row.projectId)}>Open</Button>
              )}
              {(!row || (row.kind === 'error' && !row.joined)) && (
                <>
                  <Button size="small" disabled={anyBusy} onClick={() => void decline(inv)}>Decline</Button>
                  <Button size="small" variant="contained" disabled={anyBusy} onClick={() => void accept(inv)}>Accept</Button>
                </>
              )}
            </Box>
            {row?.kind === 'error' && <Alert severity="error" sx={{ width: '100%' }}>{row.message}</Alert>}
          </ListItem>
        );
      })}
    </List>
  );
}
