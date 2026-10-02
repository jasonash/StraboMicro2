/**
 * Another account's copy (collaboration spec v3 16at, 16ax). There is no
 * read-only mode: a synced copy is used only by the account it belongs to
 * (logged out: the last account, 16d), so nobody edits under someone else's
 * name.
 *   opening it:        [Log in as Jason] [Cancel]
 *   it is open (a login changed, or a startup restore):
 *                      [Log in as Jason] [Open my own copy] [Close project]
 * [Open my own copy] shows only when the logged-in account has one. A copy
 * of another server (the app is set to a different one in Preferences) has
 * no [Log in as]: logging in does not help there.
 */

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { firstName } from '@/utils/accountNames';

export interface CopyOwnerPrompt {
  /** open: the project was not opened; opened: it is open now */
  mode: 'open' | 'opened';
  projectId: string;
  projectName: string | null;
  owner: CopyOwner;
  ownCopy: boolean;
}

interface CopyOwnerDialogProps {
  prompt: CopyOwnerPrompt | null;
  onLogInAsOwner: (prompt: CopyOwnerPrompt) => void;
  onOpenOwnCopy: (prompt: CopyOwnerPrompt) => void;
  /** Cancel (open) or Close project (opened) */
  onDismiss: (prompt: CopyOwnerPrompt) => void;
}

export function CopyOwnerDialog({ prompt, onLogInAsOwner, onOpenOwnCopy, onDismiss }: CopyOwnerDialogProps) {
  const owner = prompt?.owner;
  const fullName = owner ? owner.name || owner.email || 'another account' : '';
  const first = owner ? firstName(owner.name, owner.email) : '';
  const opened = prompt?.mode === 'opened';
  const otherServer = owner?.otherServer === true;

  return (
    // While the copy is open, Escape does not dismiss it: Close project or one of the others
    <Dialog open={prompt !== null} onClose={opened || !prompt ? undefined : () => onDismiss(prompt)} maxWidth="xs" fullWidth>
      <DialogTitle>{otherServer ? 'This copy syncs with another server' : `This copy belongs to ${fullName}`}</DialogTitle>
      <DialogContent>
        {otherServer ? (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            This copy{prompt?.projectName ? <> of <strong>{prompt.projectName}</strong></> : ''} is
            synced with {owner?.server} as {fullName}, but the app is set to a different server
            (Preferences). It can be used again when the app is set back to {owner?.server}.
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            This copy{prompt?.projectName ? <> of <strong>{prompt.projectName}</strong></> : ''} is
            synced with StraboSpot as {fullName}
            {owner?.name && owner.email ? ` (${owner.email})` : ''}. Changes made in it are
            sent under that account, so only {first} can use it.
          </Typography>
        )}
        {opened && !otherServer && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {prompt?.ownCopy
              ? 'You have your own copy of this project on this computer.'
              : 'Log in as the owner to keep working in it, or close it.'}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {prompt && (
          <>
            <Button onClick={() => onDismiss(prompt)}>{opened ? 'Close project' : 'Cancel'}</Button>
            {opened && prompt.ownCopy && (
              <Button onClick={() => onOpenOwnCopy(prompt)}>Open my own copy</Button>
            )}
            {!otherServer && (
              <Button variant="contained" onClick={() => onLogInAsOwner(prompt)}>
                Log in as {first}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
