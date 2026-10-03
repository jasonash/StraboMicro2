/**
 * After a synced copy became a separate copy (collaboration spec v3, 17j,
 * 17k, 17ac): the person left the project, the owner removed them, or the
 * owner deleted the project from StraboSpot (also seen by the owner on
 * their other computers, and on the computer they deleted it from when they
 * kept a copy). The copy keeps its name and stays open; it no longer syncs.
 * It may be deleted right away (the Close Project dialog).
 */

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

export interface SeparateCopyNotice {
  kind: 'removed' | 'left' | 'deleted';
  name: string;
  /** Who removed me, or who deleted the project (null: not known) */
  removedBy: string | null;
  /** My last unsynced changes were sent to the owner for review */
  parked: boolean;
  /** Deleted: I deleted it (here or on another computer) */
  deletedByMe?: boolean;
  /** Deleted: changes that had not synced stay in this copy */
  keptChanges?: boolean;
  /** Deleted by me: the StraboSpot project can be restored until then (ISO time; null: no longer) */
  restorableUntil?: string | null;
}

const TITLE = { left: 'You Left the Project', removed: 'Removed From the Project', deleted: 'Deleted From StraboSpot' };

/** "November 2, 2026" */
function dayText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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
      <DialogTitle>{TITLE[notice.kind]}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {notice.kind === 'left' && `You left "${name}".`}
          {notice.kind === 'removed' && `${notice.removedBy || 'The project owner'} removed you from "${name}".`}
          {notice.kind === 'deleted' && (notice.deletedByMe
            ? `You deleted "${name}" from StraboSpot.`
            : `${notice.removedBy || 'The project owner'} deleted "${name}" from StraboSpot.`)}{' '}
          This is now your own copy on this computer; it no longer syncs with StraboSpot.
        </Typography>
        {notice.parked && (
          <Alert severity="info">Your unsynced changes were sent to the project owner for review.</Alert>
        )}
        {notice.kind === 'deleted' && notice.keptChanges && (
          <Alert severity="info" sx={{ mb: 1.5 }}>Your changes that had not synced are kept in this copy.</Alert>
        )}
        {notice.kind === 'deleted' && notice.deletedByMe && notice.restorableUntil && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            You can restore the StraboSpot project from My StraboMicro Data on the StraboSpot website until{' '}
            {dayText(notice.restorableUntil)}. This copy stays separate either way.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {notice.kind !== 'left' && (
          <Button color="error" onClick={onDelete} sx={{ mr: 'auto' }}>Delete This Copy</Button>
        )}
        <Button variant="contained" onClick={onClose}>OK</Button>
      </DialogActions>
    </Dialog>
  );
}
