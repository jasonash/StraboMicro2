/**
 * UpdateNotification.tsx
 *
 * Non-intrusive notification component for app updates.
 * Shows a snackbar when an update is available, with options to download or dismiss.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Snackbar,
  Alert,
  Button,
  LinearProgress,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

interface UpdateNotificationProps {
  /** Whether the check was initiated manually from the menu */
  manualCheck?: boolean;
  /** Callback when manual check is complete */
  onManualCheckComplete?: () => void;
}

export default function UpdateNotification({
  manualCheck = false,
  onManualCheckComplete,
}: UpdateNotificationProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showNoUpdateDialog, setShowNoUpdateDialog] = useState(false);
  const [showDevModeDialog, setShowDevModeDialog] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  // Subscribe to update status events
  useEffect(() => {
    if (!window.api?.autoUpdater) return;

    const unsubscribe = window.api.autoUpdater.onUpdateStatus((data: UpdateStatus) => {
      setStatus(data);

      switch (data.status) {
        case 'available':
          setShowSnackbar(true);
          setDownloadFailed(false);
          onManualCheckComplete?.();
          break;
        case 'not-available':
          // Only show dialog if manual check
          if (manualCheck) {
            setShowNoUpdateDialog(true);
          }
          onManualCheckComplete?.();
          break;
        case 'downloading':
          setDownloadFailed(false);
          break;
        case 'downloaded':
          setShowSnackbar(false);
          setDownloadFailed(false);
          setShowRestartDialog(true);
          break;
        case 'error':
          // Track if this error came from a download attempt
          if (status?.status === 'downloading') {
            setDownloadFailed(true);
          }
          setShowSnackbar(true);
          onManualCheckComplete?.();
          break;
        case 'checking':
          // Don't show anything for checking status
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [manualCheck, onManualCheckComplete]);

  // Trigger manual check when requested
  useEffect(() => {
    if (manualCheck && window.api?.autoUpdater) {
      window.api.autoUpdater.checkForUpdates().then((result) => {
        // If in dev mode, show a message
        if (result?.status === 'dev-mode') {
          setShowDevModeDialog(true);
        }
      });
    }
  }, [manualCheck]);

  const handleDownload = useCallback(() => {
    window.api?.autoUpdater?.downloadUpdate();
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      // Auto-save project if there are unsaved changes
      const { isDirty, saveProject } = useAppStore.getState();
      if (isDirty) {
        await saveProject();
      }
    } catch (error) {
      console.error('[UpdateNotification] Error auto-saving before update:', error);
    }
    window.api?.autoUpdater?.installUpdate();
  }, []);

  const handleRetryDownload = useCallback(() => {
    setDownloadFailed(false);
    window.api?.autoUpdater?.downloadUpdate();
  }, []);

  const handleDismiss = useCallback(() => {
    setShowSnackbar(false);
  }, []);

  const handleCloseRestartDialog = useCallback(() => {
    setShowRestartDialog(false);
  }, []);

  const handleCloseNoUpdateDialog = useCallback(() => {
    setShowNoUpdateDialog(false);
    onManualCheckComplete?.();
  }, [onManualCheckComplete]);

  const handleCloseDevModeDialog = useCallback(() => {
    setShowDevModeDialog(false);
    onManualCheckComplete?.();
  }, [onManualCheckComplete]);

  // Format bytes for display
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Render download progress
  const renderDownloadProgress = () => {
    if (status?.status !== 'downloading') return null;

    const percent = status.percent ?? 0;
    const speed = status.bytesPerSecond ? formatBytes(status.bytesPerSecond) + '/s' : '';
    const transferred = status.transferred ? formatBytes(status.transferred) : '';
    const total = status.total ? formatBytes(status.total) : '';

    return (
      <Box sx={{ width: '100%', mt: 1 }}>
        <LinearProgress variant="determinate" value={percent} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {transferred} / {total} ({speed})
        </Typography>
      </Box>
    );
  };

  // Snackbar content based on status
  const getSnackbarContent = () => {
    if (!status) return null;

    switch (status.status) {
      case 'available':
        return (
          <Alert
            severity="info"
            sx={{ width: '100%' }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button color="inherit" size="small" onClick={handleDownload}>
                  Download
                </Button>
                <IconButton size="small" color="inherit" onClick={handleDismiss}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          >
            Version {status.version} is available
          </Alert>
        );

      case 'downloading':
        return (
          <Alert severity="info" sx={{ width: '100%' }}>
            <Box>
              <Typography variant="body2">
                Downloading version {status.version}...
              </Typography>
              {renderDownloadProgress()}
            </Box>
          </Alert>
        );

      case 'error':
        return (
          <Alert
            severity="error"
            sx={{ width: '100%' }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                {downloadFailed && (
                  <Button color="inherit" size="small" onClick={handleRetryDownload}>
                    Retry
                  </Button>
                )}
                <IconButton size="small" color="inherit" onClick={handleDismiss}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          >
            Update error: {status.message}
          </Alert>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Non-intrusive snackbar for update available / downloading / error */}
      <Snackbar
        open={showSnackbar && status?.status !== 'not-available'}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ maxWidth: 400 }}
      >
        {getSnackbarContent() || <div />}
      </Snackbar>

      {/* Restart dialog when download is complete */}
      <Dialog open={showRestartDialog} onClose={handleCloseRestartDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Update Ready to Install</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Version {status?.version} has been downloaded and is ready to install.
            The application will restart to apply the update.
          </DialogContentText>
          {status?.releaseNotes && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 1,
                maxHeight: 200,
                overflow: 'auto',
                '& h1, & h2, & h3': { fontSize: '0.95rem', fontWeight: 600, mt: 1, mb: 0.5 },
                '& ul': { pl: 2.5, my: 0.5 },
                '& li': { fontSize: '0.85rem', mb: 0.25 },
                '& p': { fontSize: '0.85rem', my: 0.5 },
              }}
              dangerouslySetInnerHTML={{
                __html: typeof status.releaseNotes === 'string'
                  ? status.releaseNotes
                  : '',
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRestartDialog}>Later</Button>
          <Button onClick={handleInstall} variant="contained" color="primary">
            Restart Now
          </Button>
        </DialogActions>
      </Dialog>

      {/* No update available dialog (for manual checks) */}
      <Dialog open={showNoUpdateDialog} onClose={handleCloseNoUpdateDialog}>
        <DialogTitle>No Updates Available</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You&apos;re running the latest version of StraboMicro.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNoUpdateDialog} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dev mode dialog */}
      <Dialog open={showDevModeDialog} onClose={handleCloseDevModeDialog}>
        <DialogTitle>Development Mode</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Auto-updates are disabled in development mode. Build and package the
            app to test auto-updates.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDevModeDialog} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
