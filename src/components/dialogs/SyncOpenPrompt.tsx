/**
 * Sync on open, Manual mode (collaboration spec v3 §6.4, 16ah): the project
 * just opened and changes are waiting on StraboSpot. [Sync Now] runs the
 * Sync click; [Work Offline] leaves them waiting (the chip keeps counting).
 * Automatic mode pulls on open by itself and never shows this.
 */

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { useSyncStore } from '@/store/useSyncStore';
import { incomingText } from '@/utils/syncChipState';
import { syncNowFromUser } from '@/services/syncActions';

export function SyncOpenPrompt() {
  const prompt = useSyncStore((s) => s.openPrompt);
  const projectName = useAppStore((s) => s.project?.name ?? 'This project');
  const close = () => useSyncStore.getState().update({ openPrompt: null });

  return (
    <Dialog open={prompt !== null} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>Changes waiting on StraboSpot</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <strong>{projectName}</strong> was changed elsewhere since this copy last synced.
        </Typography>
        {prompt && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {incomingText(prompt.incoming, prompt.others)} Your own changes stay as they are either way.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Work Offline</Button>
        <Button
          variant="contained"
          onClick={() => {
            close();
            void syncNowFromUser();
          }}
        >
          Sync Now
        </Button>
      </DialogActions>
    </Dialog>
  );
}
