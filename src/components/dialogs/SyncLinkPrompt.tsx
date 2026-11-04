/**
 * One-time prompt (collaboration spec v3, 16an): the owner opened a
 * local-only project that is also on StraboSpot. The answer is recorded
 * (userData, never the project folder); the chip changes it afterwards.
 */

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { useSyncStore } from '@/store/useSyncStore';
import { answerLinkOffer } from '@/services/syncLinking';
import { formatSyncDate } from '@/utils/formatSyncDate';

export function SyncLinkPrompt() {
  const offer = useSyncStore((s) => s.linkOffer);
  const projectName = useAppStore((s) => s.project?.name ?? 'This project');

  return (
    <Dialog open={offer !== null} maxWidth="sm" fullWidth>
      <DialogTitle>This project is also on StraboSpot</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <strong>{projectName}</strong> is on StraboSpot{offer?.updatedAt ? ` (last uploaded ${formatSyncDate(offer.updatedAt)})` : ''}.
          Keep this copy in sync with it?
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Syncing connects this copy to the one on StraboSpot. If the two differ, you choose which one to keep.
          You can change this later from the sync status in the header.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => void answerLinkOffer('local')}>Keep on this computer only</Button>
        <Button variant="outlined" onClick={() => void answerLinkOffer('manual')}>Sync when I click</Button>
        <Button variant="contained" onClick={() => void answerLinkOffer('automatic')}>Sync automatically</Button>
      </DialogActions>
    </Dialog>
  );
}
