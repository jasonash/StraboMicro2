/**
 * Logged-out notice: a bottom-left notice when the session ran out (the
 * server refused the login; the user did not log out) while a synced
 * project is open. Before, nothing said so: the chip stayed "Synced" and
 * others' changes just stopped arriving. Log in opens the login dialog;
 * close hides it until the next time the session ends (the chip keeps
 * saying "Log in to sync"). Sits above the decisions notice when both show.
 */

import { IconButton, Snackbar, SnackbarContent, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { useSyncStore, decisionsNoticeVisible } from '@/store/useSyncStore';

export default function SessionEndedNotice() {
  const ended = useAuthStore((s) => s.sessionEnded);
  const loggedIn = useAuthStore((s) => s.isAuthenticated);
  const synced = useSyncStore((s) => s.synced);
  const copyEmail = useSyncStore((s) => s.email);
  const decisionsShown = useSyncStore(decisionsNoticeVisible);

  const open = ended !== null && !ended.dismissed && !loggedIn && synced;
  const email = copyEmail ?? ended?.email ?? null;
  const who = email ? ` as ${email}` : '';
  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      sx={decisionsShown ? { bottom: { xs: 80, sm: 88 } } : undefined}
    >
      <SnackbarContent
        role="alert"
        message={`You were logged out of StraboSpot. Log in${who} to keep syncing this project; ` +
          'your changes are kept on this computer until then.'}
        sx={{ maxWidth: 520 }}
        action={
          <>
            <Button
              color="primary"
              size="small"
              onClick={() => void promptLogin(`Log in${who} to keep syncing this project.`)}
            >
              Log in
            </Button>
            <IconButton
              size="small"
              aria-label="Close"
              color="inherit"
              onClick={() => useAuthStore.getState().dismissSessionEnded()}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      />
    </Snackbar>
  );
}
