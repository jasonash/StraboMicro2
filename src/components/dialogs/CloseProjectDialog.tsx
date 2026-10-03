/**
 * Close Project Dialog Component
 *
 * Warns the user before permanently deleting a project from disk.
 * This action:
 * - Removes the project folder from ~/Documents/StraboMicro2Data/
 * - Removes from Recent Projects
 * - Clears version history
 *
 * The dialog explains that the operation is permanent and suggests
 * backing up the project first. For a synced copy it says that only this
 * computer's copy goes (the StraboSpot copy is not affected) and warns
 * about changes not synced yet.
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { useSyncStore } from '@/store/useSyncStore';
import { useAppStore } from '@/store/useAppStore';

interface CloseProjectDialogProps {
  open: boolean;
  projectId: string | null;
  projectName: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function CloseProjectDialog({
  open,
  projectId,
  projectName,
  onClose,
  onConfirm,
}: CloseProjectDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synced = useSyncStore((s) => s.synced && s.projectId === projectId);
  /** Changes on this computer not on StraboSpot (counted when the dialog opens; null = unknown) */
  const [unsynced, setUnsynced] = useState<number | null>(null);

  useEffect(() => {
    setUnsynced(null);
    if (!open || !synced || !projectId) return;
    let live = true;
    const project = useAppStore.getState().project;
    void window.api?.sync.status(projectId, project?.id === projectId ? project : undefined).then((st) => {
      if (live && st.synced) setUnsynced((st.pending ?? 0) + st.refused);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [open, synced, projectId]);

  const handleConfirm = async () => {
    if (!projectId) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await window.api?.projects?.close(projectId);

      if (result?.success) {
        onConfirm();
        onClose();
      } else {
        setError(result?.error || 'Failed to close project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={closeUnlessEscapeBlocked(handleClose, isDeleting)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DeleteForeverIcon color="error" />
        Close Project
      </DialogTitle>
      <DialogContent>
        <Box sx={{ py: 1 }}>
          <Typography variant="h6" gutterBottom>
            {projectName || 'Untitled Project'}
          </Typography>

          {synced ? (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  This removes your copy from this computer
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  The project files, its entry in Recent Projects and this computer&apos;s version history are deleted.
                </Typography>
                <Typography variant="body2">
                  The StraboSpot copy is not affected. You can download it again with
                  {' '}<strong>File → Open Remote Project...</strong>
                </Typography>
              </Alert>
              {unsynced !== null && unsynced > 0 && (
                <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>
                      {unsynced === 1 ? '1 change on this computer has' : `${unsynced} changes on this computer have`} not
                      reached StraboSpot.
                    </strong>{' '}
                    {unsynced === 1 ? 'It is' : 'They are'} lost when this copy is removed. To keep {unsynced === 1 ? 'it' : 'them'},
                    cancel and use <strong>File → Sync to Strabo Server...</strong> first.
                  </Typography>
                </Alert>
              )}
            </>
          ) : (
            <>
              <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  This will permanently delete the project from your computer!
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Closing this project will:
                </Typography>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>
                    <Typography variant="body2">
                      <strong>Delete all project files</strong> from your Documents folder
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Remove from Recent Projects</strong> menu
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Clear all version history</strong>
                    </Typography>
                  </li>
                </ul>
                <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
                  This action cannot be undone.
                </Typography>
              </Alert>

              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Before closing, consider:
                </Typography>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>
                    <Typography variant="body2">
                      <strong>Export as .smz</strong> (File → Export as .smz) to create a backup
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Upload to Strabo Server</strong> (File → Upload to Strabo Server) to save
                      online
                    </Typography>
                  </li>
                </ul>
              </Alert>

              <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>Tip:</strong> You can have multiple projects open on your computer at once.
                  Use <strong>File → Recent Projects</strong> to switch between them without deleting
                  anything.
                </Typography>
              </Alert>
            </>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={isDeleting}
          startIcon={isDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
        >
          {isDeleting ? 'Deleting...' : synced ? 'Remove From This Computer' : 'Close & Delete Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
