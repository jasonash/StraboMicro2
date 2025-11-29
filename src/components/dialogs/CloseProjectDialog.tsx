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
 * backing up the project first.
 */

import { useState } from 'react';
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
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isDeleting}
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

          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 2 }}
          >
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
                  <strong>Upload to Strabo Server</strong> (File → Upload to Strabo Server) to save online
                </Typography>
              </li>
            </ul>
          </Alert>

          <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
            <Typography variant="body2">
              <strong>Tip:</strong> You can have multiple projects on your computer at once.
              Use <strong>File → Open Project</strong> or <strong>Recent Projects</strong> to
              switch between them without deleting anything.
            </Typography>
          </Alert>

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
          {isDeleting ? 'Deleting...' : 'Close & Delete Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
