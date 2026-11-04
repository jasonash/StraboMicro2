/**
 * The local copy and the StraboSpot copy differ (collaboration spec v3,
 * 16am): which one to keep. There is no common base to merge against.
 * Converted projects show what differs as counts; legacy uploads (P1-1)
 * show the dates only. Nothing is lost either way: "Use the StraboSpot
 * copy" keeps this copy in version history (a legacy import sets the
 * folder aside instead, since importing clears version history).
 */

import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useSyncStore } from '@/store/useSyncStore';
import { requestLink } from '@/services/syncLinking';
import { describeDifferences } from '@/utils/describeDifferences';
import { formatSyncDate } from '@/utils/formatSyncDate';

export function SyncLinkChoiceDialog() {
  const choice = useSyncStore((s) => s.linkChoice);
  const close = () => useSyncStore.getState().update({ linkChoice: null });
  const pick = (use: 'mine' | 'theirs') => {
    if (!choice) return;
    close();
    requestLink({ projectId: choice.projectId, pid: choice.pid, mode: choice.mode, use });
  };
  const legacy = choice?.syncFormat === 'legacy';

  return (
    <Dialog open={choice !== null} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>This copy differs from the one on StraboSpot</DialogTitle>
      {choice && (
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {legacy
              ? `The StraboSpot copy was uploaded ${formatSyncDate(choice.serverChanged)}, after this copy last changed (${formatSyncDate(choice.localChanged)}).`
              : `${choice.total} ${choice.total === 1 ? 'item differs' : 'items differ'}: ${describeDifferences(choice.byType)}. ` +
                `This copy last changed ${formatSyncDate(choice.localChanged)}; the StraboSpot copy ${formatSyncDate(choice.serverChanged)}.`}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>Which one should both places keep?</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}>
            <li>
              <Typography variant="body2">
                <strong>Use my copy:</strong> StraboSpot gets this version, including anything you deleted here.
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Use the StraboSpot copy:</strong> this copy is replaced.{' '}
                {legacy
                  ? 'It is kept in a backup folder (StraboMicro2Data/_replaced).'
                  : 'It is kept in Version History.'}
              </Typography>
            </li>
          </Box>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="outlined" onClick={() => pick('theirs')}>Use the StraboSpot copy</Button>
        <Button variant="contained" onClick={() => pick('mine')}>Use my copy</Button>
      </DialogActions>
    </Dialog>
  );
}
