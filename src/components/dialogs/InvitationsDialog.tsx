/**
 * Invitations dialog (spec v3 Phase 2, 17f): opens by itself at launch and
 * after a login when collaboration invitations wait for this account, and
 * from the header indicator ("1 invitation") any time. The same list sits at
 * the top of File > Open Remote Project, so "Later" loses nothing.
 *
 * The rows shown are kept while the dialog is open: an accepted invitation
 * leaves the pending list (the indicator count drops) but its row stays,
 * with Open, until the dialog closes.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { InvitationList } from './InvitationList';

interface InvitationsDialogProps {
  /** The pending invitations while the dialog should show, else null */
  invitations: SyncInvitation[] | null;
  onClose: () => void;
  /** Answered (accepted or declined): no longer pending */
  onAnswered: (pid: number) => void;
  onOpenProject: (projectId: string) => void;
}

export function InvitationsDialog({ invitations, onClose, onAnswered, onOpenProject }: InvitationsDialogProps) {
  const [shown, setShown] = useState<SyncInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const open = invitations !== null;

  // Rows are taken when the dialog opens; invitations that arrive while it is
  // open are added, answered ones stay until it closes (declined ones go)
  useEffect(() => {
    if (!open) {
      setShown([]);
      return;
    }
    setShown((prev) => [...prev, ...(invitations ?? []).filter((i) => !prev.some((p) => p.pid === i.pid))]);
  }, [open, invitations]);

  return (
    <Dialog open={open && shown.length > 0} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{shown.length === 1 ? 'You have an invitation' : 'You have invitations'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Accepting downloads the project to this computer and keeps it in sync with the other collaborators.
          </Typography>
          <InvitationList
            invitations={shown}
            onAccepted={onAnswered}
            onAnswered={(pid) => {
              onAnswered(pid);
              const left = shown.filter((i) => i.pid !== pid);
              setShown(left);
              if (left.length === 0) onClose();
            }}
            onOpenProject={(projectId) => {
              onClose();
              onOpenProject(projectId);
            }}
            onBusyChange={setBusy}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 'auto', ml: 2 }}>
          They also wait in File &gt; Open Remote Project.
        </Typography>
        <Button onClick={onClose} disabled={busy}>Later</Button>
      </DialogActions>
    </Dialog>
  );
}
