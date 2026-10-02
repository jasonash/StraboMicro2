/**
 * Invitations dialog (spec v3 Phase 2, 17f): shown once per login when
 * collaboration invitations wait for this account. The same list sits at the
 * top of File > Open Remote Project, so "Later" loses nothing.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { InvitationList } from './InvitationList';

interface InvitationsDialogProps {
  invitations: SyncInvitation[] | null;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

export function InvitationsDialog({ invitations, onClose, onOpenProject }: InvitationsDialogProps) {
  const [declined, setDeclined] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const left = (invitations ?? []).filter((i) => !declined.includes(i.pid));

  // A new list starts fresh; once every invitation is declined the dialog is done
  useEffect(() => setDeclined([]), [invitations]);
  useEffect(() => {
    if (invitations !== null && invitations.length > 0 && left.length === 0) onClose();
  }, [invitations, left.length, onClose]);

  return (
    <Dialog open={invitations !== null && left.length > 0} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{left.length === 1 ? 'You have an invitation' : 'You have invitations'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Accepting downloads the project to this computer and keeps it in sync with the other collaborators.
          </Typography>
          <InvitationList
            invitations={left}
            onAnswered={(pid) => setDeclined((d) => [...d, pid])}
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
