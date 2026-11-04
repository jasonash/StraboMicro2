/**
 * Sync decisions notice (collaboration spec v3 16x): a bottom-left notice
 * when sync has items waiting for the user's decision, with Review (opens
 * the "Sync needs your decision" dialog) and close. It never hides by
 * itself; once closed it comes back only when more items are waiting than
 * when it was closed. Not shown while the dialog is open. After the last
 * answer's sync it briefly says "All settled and synced." (16ab).
 */

const SETTLED_MS = 4_000;

import { useEffect, useState } from 'react';
import { IconButton, Snackbar, SnackbarContent, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSyncStore, decisionsWaiting, decisionsNoticeVisible } from '@/store/useSyncStore';

export default function SyncDecisionsNotice() {
  const total = useSyncStore((s) => decisionsWaiting(s));
  const dismissed = useSyncStore((s) => s.noticeDismissedTotal);
  const settledAt = useSyncStore((s) => s.decisionsSettledAt);
  const [settledShown, setSettledShown] = useState<number | null>(null);
  useEffect(() => {
    if (settledAt !== null) setSettledShown(settledAt);
  }, [settledAt]);

  // Fewer items than when it was closed: a later rise shows it again
  useEffect(() => {
    if (total < dismissed) useSyncStore.getState().update({ noticeDismissedTotal: total });
  }, [total, dismissed]);

  const open = useSyncStore(decisionsNoticeVisible);
  if (!open && settledShown !== null && total === 0) {
    return (
      <Snackbar
        open
        autoHideDuration={SETTLED_MS}
        onClose={() => setSettledShown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        message="All settled and synced."
      />
    );
  }
  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <SnackbarContent
        message={`${total} sync ${total === 1 ? 'change needs' : 'changes need'} your decision`}
        action={
          <>
            <Button color="primary" size="small" onClick={() => useSyncStore.getState().update({ decisionsOpen: true })}>
              Review
            </Button>
            <IconButton
              size="small"
              aria-label="Close"
              color="inherit"
              onClick={() => useSyncStore.getState().update({ noticeDismissedTotal: total })}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      />
    </Snackbar>
  );
}
