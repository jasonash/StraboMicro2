/**
 * Collaborators dialog (File > Collaborate..., the sync chip's
 * "Collaborators…"; collaboration spec v3 Phase 2, decisions 17a, 17e, 17g).
 *
 * Everyone who is a member sees the list (name, email, role, invited or
 * declined). The owner also invites by email (Contributor preselected),
 * changes roles, removes people and withdraws invitations. Every change goes
 * to the server at once; the list is read back after each one.
 * A local-only project never gets here: App turns sync on first (17d).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { getRestServerUrl } from './PreferencesDialog';
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION, ROLE_FOR_ME, roleLabel, withArticle } from '@/utils/collaboratorRoles';

interface CollaboratorsDialogProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
}

type MemberList = { myRole: SyncRole; members: SyncMember[] };

export function CollaboratorsDialog({ open, projectId, onClose }: CollaboratorsDialogProps) {
  const [list, setList] = useState<MemberList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SyncRole>('contributor');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !window.api) return;
    setLoadError(null);
    const r = await window.api.sync.members(projectId, getRestServerUrl());
    if (r.ok) setList({ myRole: r.myRole, members: r.members });
    else {
      setList(null);
      setLoadError(r.message);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setEmail('');
    setRole('contributor');
    setMessage(null);
    setConfirmRemove(null);
    void load();
  }, [open, load]);

  const isOwner = list?.myRole === 'owner';
  const owner = list?.members.find((m) => m.role === 'owner') ?? null;

  /** Run one change, show its outcome, read the list back */
  const change = async (
    c: Parameters<NonNullable<typeof window.api>['sync']['changeMembers']>[2],
    success: (r: { status?: string; emailed?: boolean }) => string
  ): Promise<boolean> => {
    if (!projectId || !window.api) return false;
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.api.sync.changeMembers(projectId, getRestServerUrl(), c);
      if (!r.ok) {
        setMessage({
          ok: false,
          text: r.kind === 'not_ready'
            ? "The first upload of this project hasn't finished yet. You can invite people as soon as the sync status says Synced."
            : r.message,
        });
        return false;
      }
      setMessage({ ok: true, text: success(r) });
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    const address = email.trim();
    const ok = await change({ action: 'invite', email: address, role }, (r) =>
      r.emailed === false
        ? `${address} is invited. The invitation email could not be sent, so let them know it is waiting in StraboMicro.`
        : r.status === 'reinvited'
          ? `The invitation to ${address} was sent again.`
          : `Invitation sent to ${address}.`
    );
    if (ok) setEmail('');
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Collaborators</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {loadError && <Alert severity="error">{loadError}</Alert>}
          {!list && !loadError && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading the collaborators…</Typography>
            </Box>
          )}

          {list && (
            <List dense disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
              {list.members.map((m) => {
                const editable = isOwner && m.role !== 'owner';
                return (
                  <ListItem key={m.user.pkey} divider sx={{ gap: 1, flexWrap: 'wrap' }}>
                    <ListItemText
                      primary={m.user.name || m.user.email || `User ${m.user.pkey}`}
                      secondary={m.user.email}
                      sx={{ flex: '1 1 180px', minWidth: 0 }}
                    />
                    {m.state === 'invited' && <Chip size="small" label="Invited" />}
                    {m.state === 'declined' && <Chip size="small" label="Declined" />}
                    {editable && m.state !== 'declined' ? (
                      <Select
                        size="small"
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => {
                          const next = e.target.value as SyncRole;
                          void change({ action: 'role', pkey: m.user.pkey, role: next },
                            () => `${m.user.name || m.user.email} is now ${withArticle(next)}.`);
                        }}
                        sx={{ minWidth: 130 }}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <MenuItem key={r} value={r}>{roleLabel(r)}</MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Typography variant="body2" sx={{ minWidth: 90 }}>{roleLabel(m.role)}</Typography>
                    )}
                    {editable && (
                      confirmRemove === m.user.pkey ? (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button
                            size="small"
                            color="error"
                            variant="contained"
                            disabled={busy}
                            onClick={() => {
                              setConfirmRemove(null);
                              void change({ action: 'remove', pkey: m.user.pkey },
                                () => m.state === 'active'
                                  ? `${m.user.name || m.user.email} was removed from the project.`
                                  : m.state === 'invited'
                                    ? `The invitation to ${m.user.name || m.user.email} was withdrawn.`
                                    : `The declined invitation to ${m.user.name || m.user.email} was cleared.`);
                            }}
                          >
                            {m.state === 'active' ? 'Remove' : m.state === 'invited' ? 'Withdraw' : 'Clear'}
                          </Button>
                          <Button size="small" disabled={busy} onClick={() => setConfirmRemove(null)}>Cancel</Button>
                        </Box>
                      ) : (
                        <Button size="small" disabled={busy} onClick={() => setConfirmRemove(m.user.pkey)}>
                          {m.state === 'active' ? 'Remove…' : m.state === 'invited' ? 'Withdraw…' : 'Clear…'}
                        </Button>
                      )
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}

          {list && list.members.some((m) => m.user.pkey === confirmRemove && m.state === 'active') && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              A removed person keeps their own copy. Changes they had not synced yet come to you for review.
            </Typography>
          )}

          {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}

          {list && isOwner && (
            <>
              <Divider />
              <Typography variant="subtitle2">Invite by email</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Email address"
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && emailValid && !busy) void invite();
                  }}
                  sx={{ flex: '1 1 220px' }}
                />
                <Select size="small" value={role} disabled={busy} onChange={(e) => setRole(e.target.value as SyncRole)} sx={{ minWidth: 140 }}>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <MenuItem key={r} value={r}>{roleLabel(r)}</MenuItem>
                  ))}
                </Select>
                <Button variant="contained" disabled={busy || !emailValid} onClick={() => void invite()}>
                  Invite
                </Button>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {roleLabel(role)}: {ROLE_DESCRIPTION[role]} They need a StraboSpot account, and get an email
                with the invitation.
              </Typography>
            </>
          )}

          {list && !isOwner && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Only the owner{owner ? `, ${owner.user.name || owner.user.email},` : ''} can invite people or change roles.
              You are {withArticle(list.myRole)}. {ROLE_FOR_ME[list.myRole]}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {busy && <CircularProgress size={18} sx={{ mr: 'auto', ml: 2 }} />}
        <Button onClick={onClose} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
