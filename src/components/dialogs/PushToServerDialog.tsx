/**
 * Push to Server Dialog Component
 *
 * Displays progress while uploading project to the StraboSpot server.
 * Handles connectivity checks, overwrite confirmation, and upload progress.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuthStore } from '@/store/useAuthStore';

interface PushProgress {
  phase: string;
  percentage: number;
  message: string;
  itemName?: string;
  bytesUploaded?: number;
  bytesTotal?: number;
}

interface PushResult {
  success: boolean;
  error?: string;
  needsOverwriteConfirm?: boolean;
  sessionExpired?: boolean;
}

interface PushToServerDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectData: any;
}

export function PushToServerDialog({
  open,
  projectId,
  projectData,
  onClose,
}: PushToServerDialogProps) {
  const [progress, setProgress] = useState<PushProgress | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  const { isAuthenticated, logout } = useAuthStore();

  // Set up progress listener
  useEffect(() => {
    if (!window.api?.server?.onPushProgress) return;

    const handleProgress = (prog: PushProgress) => {
      setProgress(prog);
    };

    window.api.server.onPushProgress(handleProgress);

    return () => {
      window.api?.server?.removePushProgressListener?.();
    };
  }, []);

  // Start push when dialog opens (if authenticated)
  useEffect(() => {
    if (open && projectId && projectData && !isPushing && !result && isAuthenticated) {
      startPush(false);
    }
  }, [open, projectId, projectData, isAuthenticated]);

  const startPush = useCallback(async (overwrite: boolean) => {
    if (!projectId || !projectData || !window.api?.server?.pushProject) return;

    setIsPushing(true);
    setProgress(null);
    setResult(null);
    setShowOverwriteConfirm(false);

    try {
      const pushResult: PushResult = await window.api.server.pushProject(
        projectId,
        projectData,
        { overwrite }
      );

      // If session expired, log out the user
      if (pushResult.sessionExpired) {
        console.log('[PushToServerDialog] Session expired, logging out...');
        await logout();
        setResult(pushResult);
        setIsPushing(false);
        return;
      }

      // If server says project exists, prompt for overwrite
      if (pushResult.needsOverwriteConfirm) {
        setIsPushing(false);
        setShowOverwriteConfirm(true);
        return;
      }

      setResult(pushResult);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      setIsPushing(false);
    }
  }, [projectId, projectData, logout]);

  const handleOverwriteConfirm = () => {
    setShowOverwriteConfirm(false);
    startPush(true);
  };

  const handleOverwriteCancel = () => {
    setShowOverwriteConfirm(false);
    handleClose();
  };

  const handleClose = () => {
    // Reset state when closing
    setProgress(null);
    setResult(null);
    setIsPushing(false);
    setShowOverwriteConfirm(false);
    onClose();
  };

  const handleRetry = () => {
    setResult(null);
    startPush(false);
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUploadIcon color="primary" />
          Push to Server
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            You must be logged in to push projects to the server.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1);
  };

  return (
    <>
      <Dialog
        open={open && !showOverwriteConfirm}
        onClose={result ? handleClose : undefined}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={isPushing}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUploadIcon color="primary" />
          Push Project to Server
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            {/* Progress state */}
            {isPushing && progress && (
              <>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {progress.message}
                  </Typography>
                  {progress.itemName && (
                    <Typography variant="body1" fontWeight={500} noWrap>
                      {progress.itemName}
                    </Typography>
                  )}
                  {progress.bytesUploaded !== undefined && progress.bytesTotal !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      {formatBytes(progress.bytesUploaded)} MB / {formatBytes(progress.bytesTotal)} MB
                    </Typography>
                  )}
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress.percentage}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    mb: 1,
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 5,
                    },
                  }}
                />
                <Typography variant="body2" color="text.secondary" align="right">
                  {progress.percentage}%
                </Typography>
              </>
            )}

            {/* Initializing state */}
            {isPushing && !progress && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body1" color="text.secondary">
                  Preparing upload...
                </Typography>
                <LinearProgress sx={{ mt: 2 }} />
              </Box>
            )}

            {/* Success state */}
            {result?.success && (
              <Alert
                severity="success"
                icon={<CheckCircleIcon fontSize="inherit" />}
                sx={{ mb: 2 }}
              >
                <Typography variant="body1" fontWeight={500}>
                  Upload Complete!
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Your project has been pushed to the StraboSpot server.
                </Typography>
              </Alert>
            )}

            {/* Error state */}
            {result && !result.success && (
              <Alert
                severity="error"
                icon={<ErrorIcon fontSize="inherit" />}
                sx={{ mb: 2 }}
              >
                <Typography variant="body1" fontWeight={500}>
                  Upload Failed
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {result.error || 'An unknown error occurred'}
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          {isPushing ? (
            <Button disabled>Uploading...</Button>
          ) : result?.success ? (
            <Button onClick={handleClose} variant="contained">
              Done
            </Button>
          ) : result && !result.success ? (
            <>
              <Button onClick={handleClose}>Close</Button>
              <Button onClick={handleRetry} variant="contained">
                Retry
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Overwrite confirmation dialog */}
      <ConfirmDialog
        open={showOverwriteConfirm}
        title="Project Already Exists"
        message="This project already exists on the server. Do you want to overwrite it with your local version?"
        confirmLabel="Overwrite"
        confirmColor="warning"
        onConfirm={handleOverwriteConfirm}
        onCancel={handleOverwriteCancel}
      />
    </>
  );
}
