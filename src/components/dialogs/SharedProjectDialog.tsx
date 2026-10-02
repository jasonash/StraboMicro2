/**
 * Shared Project Dialog Component
 *
 * Allows users to download a project shared by another user via a share code.
 * The share code is a 6-character alphanumeric string that resolves to a
 * download key on the server.
 *
 * Flow:
 * 1. User enters share code
 * 2. Validate share code with server
 * 3. Download project file with progress bar
 * 4. Inspect downloaded file (check if exists locally)
 * 5. Show confirmation if project exists locally
 * 6. Import the project
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
  TextField,
  CircularProgress,
} from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useAuthStore } from '@/store/useAuthStore';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { unloadIfReplacingOpenProject } from '../../utils/importUtils';
import { ImportTargetNotice, ImportTargetActions, importNeedsAnswer } from './ImportTargetNotice';

interface DownloadProgress {
  phase: string;
  percentage: number;
  message: string;
  bytesDownloaded?: number;
  bytesTotal?: number;
}

interface ImportProgress {
  phase: string;
  percentage: number;
  detail: string;
}

interface ImportResult {
  success: boolean;
  projectId?: string;
  projectData?: unknown;
  error?: string;
}

type DialogState =
  | 'input'             // Entering share code
  | 'validating'        // Validating share code
  | 'downloading'       // Downloading project file
  | 'inspecting'        // Inspecting downloaded file
  | 'confirm-import'    // Confirm import (if project exists locally)
  | 'importing'         // Import in progress
  | 'success'           // Import complete
  | 'error';            // Error occurred

interface SharedProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: (projectData: unknown) => void;
  /** Open a project that is on disk (my synced copy) */
  onOpenProject: (projectId: string) => Promise<void> | void;
}

export function SharedProjectDialog({
  open,
  onClose,
  onImportComplete,
  onOpenProject,
}: SharedProjectDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>('input');
  const [shareCode, setShareCode] = useState('');
  const [downloadedZipPath, setDownloadedZipPath] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<SmzInspectResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { logout } = useAuthStore();

  // Set up progress listeners
  useEffect(() => {
    if (!open) return;

    // Download progress listener
    const unsubscribeDownload = window.api?.server?.onDownloadProgress?.((prog: DownloadProgress) => {
      setDownloadProgress(prog);
    });

    // Import progress listener
    const unsubscribeImport = window.api?.smzImport?.onImportProgress?.((prog: ImportProgress) => {
      setImportProgress(prog);
    });

    return () => {
      unsubscribeDownload?.();
      unsubscribeImport?.();
    };
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Clean up any downloaded file that wasn't imported
      if (downloadedZipPath) {
        window.api?.server?.cleanupDownload?.(downloadedZipPath);
      }

      setDialogState('input');
      setShareCode('');
      setDownloadedZipPath(null);
      setInspectResult(null);
      setDownloadProgress(null);
      setImportProgress(null);
      setImportResult(null);
      setErrorMessage(null);
    }
  }, [open, downloadedZipPath]);

  const handleShareCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric characters, limit to 6 characters
    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase();
    setShareCode(value);
    setErrorMessage(null);
  };

  const startDownload = useCallback(async () => {
    if (!window.api?.server?.downloadSharedProject) {
      setErrorMessage('Server API not available');
      setDialogState('error');
      return;
    }

    if (shareCode.length !== 6) {
      setErrorMessage('Share code must be 6 characters');
      return;
    }

    setDialogState('validating');
    setDownloadProgress(null);
    setErrorMessage(null);

    try {
      const result = await window.api.server.downloadSharedProject(shareCode);

      if (!result.success) {
        // If session expired, log out the user
        if (result.sessionExpired) {
          console.log('[SharedProjectDialog] Session expired, logging out...');
          await logout();
        }
        setErrorMessage(result.error || 'Download failed');
        setDialogState('error');
        return;
      }

      setDownloadedZipPath(result.zipPath ?? null);

      // Inspect the downloaded file
      setDialogState('inspecting');
      const inspect = await window.api.smzImport.inspect(result.zipPath!);

      if (!inspect.success) {
        setErrorMessage(inspect.error || 'Failed to read downloaded file');
        setDialogState('error');
        return;
      }

      setInspectResult(inspect);

      // A local copy to replace or my synced copy: ask first
      // Otherwise, start import directly
      if (importNeedsAnswer(inspect)) {
        setDialogState('confirm-import');
      } else {
        // No conflict, proceed with import
        await startImport(false, result.zipPath, inspect);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Download failed');
      setDialogState('error');
    }
  }, [shareCode, logout]);

  const startImport = useCallback(async (asCopy: boolean, zipPath?: string, inspect?: SmzInspectResult | null) => {
    const pathToImport = zipPath || downloadedZipPath;
    if (!pathToImport || !window.api?.smzImport?.import) return;

    setDialogState('importing');
    setImportProgress(null);

    // Replacing the open project: unload it first (as the other import flows do)
    const target = inspect ?? inspectResult;
    if (target?.projectExists && !asCopy) {
      unloadIfReplacingOpenProject(target.projectId);
    }

    try {
      const result = await window.api.smzImport.import(pathToImport, { asCopy });

      if (result.success) {
        setImportResult(result);
        setDialogState('success');

        // Clean up temp file
        if (downloadedZipPath) {
          await window.api.server.cleanupDownload(downloadedZipPath);
          setDownloadedZipPath(null);
        }
      } else {
        setErrorMessage(result.error || 'Import failed');
        setDialogState('error');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
      setDialogState('error');
    }
  }, [downloadedZipPath, inspectResult]);

  const handleClose = () => {
    // Don't allow closing during download or import
    if (dialogState === 'validating' || dialogState === 'downloading' || dialogState === 'importing') return;
    onClose();
  };

  const handleComplete = () => {
    if (importResult?.projectData) {
      onImportComplete(importResult.projectData);
    }
    onClose();
  };

  const handleBackToInput = () => {
    // Clean up any downloaded file
    if (downloadedZipPath) {
      window.api?.server?.cleanupDownload?.(downloadedZipPath);
      setDownloadedZipPath(null);
    }

    setInspectResult(null);
    setDownloadProgress(null);
    setErrorMessage(null);
    setDialogState('input');
  };

  const handleRetry = () => {
    setErrorMessage(null);
    setDialogState('input');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && shareCode.length === 6 && dialogState === 'input') {
      startDownload();
    }
  };

  // Render based on dialog state
  const renderContent = () => {
    switch (dialogState) {
      case 'input':
        return (
          <Box sx={{ py: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 3
              }}>
              Enter the 6-character share code to download a project shared by another user.
              This is your own copy. Changes you make won't reach the owner.
            </Typography>
            <TextField
              label="Share Code"
              value={shareCode}
              onChange={handleShareCodeChange}
              onKeyPress={handleKeyPress}
              fullWidth
              autoFocus
              placeholder="e.g., et6ppj"
              error={!!errorMessage}
              helperText={errorMessage || `${shareCode.length}/6 characters`}
              slotProps={{
                htmlInput: {
                  maxLength: 6,
                  style: {
                    fontFamily: 'monospace',
                    fontSize: '1.5rem',
                    letterSpacing: '0.25rem',
                    textAlign: 'center',
                  },
                }
              }}
            />
          </Box>
        );

      case 'validating':
        return (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Validating share code...</Typography>
          </Box>
        );

      case 'downloading':
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Downloading shared project...
            </Typography>
            <LinearProgress
              variant="determinate"
              value={downloadProgress?.percentage || 0}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                {downloadProgress?.message || 'Starting download...'}
              </Typography>
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                {downloadProgress?.percentage || 0}%
              </Typography>
            </Box>
          </Box>
        );

      case 'inspecting':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Preparing project for import...</Typography>
          </Box>
        );

      case 'confirm-import':
        return (
          <Box sx={{ py: 1 }}>
            <Typography variant="h6" gutterBottom>
              {inspectResult?.projectName || 'Shared Project'}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 2
              }}>
              Project ID: {inspectResult?.projectId}
            </Typography>

            <ImportTargetNotice inspect={inspectResult} source="the shared version" />
          </Box>
        );

      case 'importing':
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              {importProgress?.phase || 'Importing...'}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={importProgress?.percentage || 0}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                {importProgress?.detail || ''}
              </Typography>
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                {importProgress?.percentage || 0}%
              </Typography>
            </Box>
          </Box>
        );

      case 'success':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <CheckCircleIcon
              color="success"
              sx={{ fontSize: 60, mb: 2 }}
            />
            <Typography variant="h6" gutterBottom>
              Download Complete!
            </Typography>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              The shared project has been downloaded and imported successfully.
              This is your own copy. Changes you make won't reach the owner.
            </Typography>
          </Box>
        );

      case 'error':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <ErrorIcon
              color="error"
              sx={{ fontSize: 60, mb: 2 }}
            />
            <Typography variant="h6" gutterBottom color="error">
              Error
            </Typography>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              {errorMessage || 'An unknown error occurred.'}
            </Typography>
          </Box>
        );
    }
  };

  const renderActions = () => {
    switch (dialogState) {
      case 'input':
        return (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={startDownload}
              disabled={shareCode.length !== 6}
            >
              Download
            </Button>
          </>
        );

      case 'validating':
      case 'downloading':
      case 'inspecting':
      case 'importing':
        return null; // No actions during these states

      case 'confirm-import':
        return (
          <ImportTargetActions
            inspect={inspectResult}
            onCancel={handleBackToInput}
            onImport={(asCopy) => void startImport(asCopy)}
            onOpenMine={() => {
              const id = inspectResult?.projectId;
              onClose();
              if (id) void onOpenProject(id);
            }}
          />
        );

      case 'success':
        return (
          <Button variant="contained" onClick={handleComplete}>
            Open Project
          </Button>
        );

      case 'error':
        return (
          <>
            <Button onClick={handleClose}>Close</Button>
            <Button variant="outlined" onClick={handleRetry}>
              Try Again
            </Button>
          </>
        );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeUnlessEscapeBlocked(handleClose, dialogState === 'validating' || dialogState === 'downloading' || dialogState === 'importing')}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShareIcon color="primary" />
        Open Shared Project
      </DialogTitle>
      <DialogContent>{renderContent()}</DialogContent>
      <DialogActions>{renderActions()}</DialogActions>
    </Dialog>
  );
}
