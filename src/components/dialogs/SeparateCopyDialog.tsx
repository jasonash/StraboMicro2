/**
 * After a synced copy became a separate copy (collaboration spec v3, 17j
 * and 17k): the person left the project, or the owner removed them. The
 * copy keeps its name and stays open; it no longer syncs. A removed person
 * may delete it right away (the Close Project dialog).
 */

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

export interface SeparateCopyNotice {
  kind: 'removed' | 'left';
  name: string;
  /** Who removed me (null: not known) */
  removedBy: string | null;
  /** My last unsynced changes were sent to the owner for review */
  parked: boolean;
}

interface SeparateCopyDialogProps {
  notice: SeparateCopyNotice | null;
  onClose: () => void;
  /** Opens the Close Project dialog for this copy */
  onDelete: () => void;
}

export function SeparateCopyDialog({ notice, onClose, onDelete }: SeparateCopyDialogProps) {
  if (!notice) return null;
  const name = notice.name || 'this project';
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{notice.kind === 'left' ? 'You Left the Project' : 'Removed From the Project'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {notice.kind === 'left'
            ? `You left "${name}".`
            : `${notice.removedBy || 'The project owner'} removed you from "${name}".`}{' '}
          This is now your own copy on this computer; it no longer syncs with StraboSpot.
        </Typography>
        {notice.parked && (
          <Alert severity="info">Your unsynced changes were sent to the project owner for review.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        {notice.kind === 'removed' && (
          <Button color="error" onClick={onDelete} sx={{ mr: 'auto' }}>Delete This Copy</Button>
        )}
        <Button variant="contained" onClick={onClose}>OK</Button>
      </DialogActions>
    </Dialog>
  );
}
