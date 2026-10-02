/**
 * Deep Link Open Dialog Component
 *
 * Handles "Open in StraboMicro" deep links (strabomicro://open?p=<pkey>)
 * from the strabospot.org viewer pages. The main process validates the URI
 * and hands the renderer a numeric pkey; this dialog does the rest:
 *
 * 1. Resolve the project name and download size (HEAD request via IPC)
 * 2. Confirm with the user before downloading anything (any website can
 *    trigger the protocol, so nothing happens without explicit consent)
 * 3. Download the .smz to a temp file with progress
 * 4. Inspect the archive; if the project exists locally, show the same
 *    replace warning as the other import flows (my synced copy is never
 *    replaced: open it or import a separate copy)
 * 5. Import and hand the project data to the app
 *
 * One of my own projects (logged in, app set to strabospot.org) skips the
 * download and opens like Open Remote Project: my copy here, else a synced
 * copy is downloaded (spec v3 16ao).
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
  Chip,
  CircularProgress,
} from '@mui/material';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { useAppStore } from '../../store/useAppStore';
import { unloadIfReplacingOpenProject, dedupeImportedPresets } from '../../utils/importUtils';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { useAuthStore } from '@/store/useAuthStore';
import { ImportTargetNotice, ImportTargetActions, importNeedsAnswer } from './ImportTargetNotice';
import { findMyRemoteProject, openRemoteHere, downloadRemote, type RemoteProject } from '@/services/remoteProjects';

interface RemoteInspectResult {
  success: boolean;
  found?: boolean;
  name?: string;
  bytes?: number;
  bytesFormatted?: string;
  error?: string;
}

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
  projectData?: any;
  error?: string;
}

type DialogState =
  | 'inspecting'        // Resolving project name/size from the server
  | 'confirm'           // Ask before downloading
  | 'mine'              // One of my StraboSpot projects: open or download a synced copy
  | 'opening-mine'      // Downloading my project as a synced copy
  | 'not-found'         // Server has no downloadable project with this pkey
  | 'downloading'       // Download in progress
  | 'inspecting-file'   // Inspecting the downloaded archive
  | 'confirm-replace'   // Project exists locally; confirm overwrite
  | 'importing'         // Import in progress
  | 'success'           // Import complete
  | 'error';            // Error occurred

interface DeepLinkOpenDialogProps {
  open: boolean;
  /** Numeric project pkey from the validated deep link */
  pkey: string;
  onClose: () => void;
  onImportComplete: (projectData: any) => void;
  /** Open a project that is on disk */
  onOpenProject: (projectId: string) => Promise<void> | void;
}

export function DeepLinkOpenDialog({
  open,
  pkey,
  onClose,
  onImportComplete,
  onOpenProject,
}: DeepLinkOpenDialogProps) {
  const globalPresets = useAppStore((state) => state.globalPresets);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [myProject, setMyProject] = useState<RemoteProject | null>(null);
  const [mineStatus, setMineStatus] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<DialogState>('inspecting');
  const [remoteInfo, setRemoteInfo] = useState<RemoteInspectResult | null>(null);
  const [downloadedZipPath, setDownloadedZipPath] = useState<string | null>(null);
  const [fileInspect, setFileInspect] = useState<SmzInspectResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Progress listeners
  useEffect(() => {
    if (!open) return;

    const unsubscribeDownload = window.api?.deepLink?.onDownloadProgress?.((prog: DownloadProgress) => {
      setDownloadProgress(prog);
    });
    const unsubscribeImport = window.api?.smzImport?.onImportProgress?.((prog: ImportProgress) => {
      setImportProgress(prog);
    });

    return () => {
      unsubscribeDownload?.();
      unsubscribeImport?.();
    };
  }, [open]);

  const inspectRemote = useCallback(async () => {
    if (!window.api?.deepLink?.inspect) {
      setErrorMessage('Deep link API not available');
      setDialogState('error');
      return;
    }

    setDialogState('inspecting');
    setErrorMessage(null);

    try {
      const result = await window.api.deepLink.inspect(pkey);

      if (!result.success) {
        setErrorMessage(result.error || 'Could not reach the server');
        setDialogState('error');
        return;
      }

      if (!result.found) {
        setDialogState('not-found');
        return;
      }

      setRemoteInfo(result);
      // One of mine: open it the way Open Remote Project does
      const mine = isAuthenticated ? await findMyRemoteProject(pkey).catch(() => null) : null;
      setMyProject(mine);
      setDialogState(mine ? 'mine' : 'confirm');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not reach the server');
      setDialogState('error');
    }
  }, [pkey, isAuthenticated]);

  // Start resolving as soon as the dialog opens
  useEffect(() => {
    if (open && dialogState === 'inspecting' && !remoteInfo && !errorMessage) {
      inspectRemote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state when dialog closes; clean up any downloaded file that
  // wasn't imported
  useEffect(() => {
    if (!open) {
      if (downloadedZipPath) {
        window.api?.server?.cleanupDownload?.(downloadedZipPath);
      }

      setDialogState('inspecting');
      setRemoteInfo(null);
      setDownloadedZipPath(null);
      setFileInspect(null);
      setDownloadProgress(null);
      setImportProgress(null);
      setImportResult(null);
      setErrorMessage(null);
      setMyProject(null);
      setMineStatus(null);
    }
  }, [open, downloadedZipPath]);

  const openMine = useCallback(async () => {
    if (!myProject) return;
    if (myProject.here) {
      onClose();
      await openRemoteHere(myProject, onOpenProject);
      return;
    }
    setDialogState('opening-mine');
    setMineStatus('Starting the download…');
    const r = await downloadRemote(myProject, 'automatic', setMineStatus);
    if (!r.ok) {
      setErrorMessage(r.message);
      setDialogState('error');
      return;
    }
    onClose();
    await onOpenProject(r.projectId);
  }, [myProject, onClose, onOpenProject]);

  const startImport = useCallback(async (zipPath: string, inspect: SmzInspectResult, asCopy: boolean) => {
    if (!window.api?.smzImport?.import) {
      setErrorMessage('SMZ import API not available');
      setDialogState('error');
      return;
    }

    setDialogState('importing');
    setImportProgress(null);

    // If we're replacing the currently open project, unload it first so the
    // viewer doesn't read files the import is deleting (shared with the
    // other import flows).
    if (inspect.projectExists && !asCopy) {
      unloadIfReplacingOpenProject(inspect.projectId);
    }

    try {
      const result = await window.api.smzImport.import(zipPath, { asCopy });

      if (result.success) {
        setImportResult(result);
        setDialogState('success');

        // Clean up the temp file
        await window.api.server.cleanupDownload(zipPath);
        setDownloadedZipPath(null);
      } else {
        setErrorMessage(result.error || 'Import failed');
        setDialogState('error');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
      setDialogState('error');
    }
  }, []);

  const startDownload = useCallback(async () => {
    if (!window.api?.deepLink?.download) {
      setErrorMessage('Deep link API not available');
      setDialogState('error');
      return;
    }

    setDialogState('downloading');
    setDownloadProgress(null);

    try {
      const result = await window.api.deepLink.download(pkey);

      if (!result.success || !result.zipPath) {
        setErrorMessage(result.error || 'Download failed');
        setDialogState('error');
        return;
      }

      setDownloadedZipPath(result.zipPath);

      // Inspect the downloaded archive to learn the internal project id
      // and whether it already exists locally
      setDialogState('inspecting-file');
      const inspect = await window.api.smzImport.inspect(result.zipPath);

      if (!inspect.success) {
        setErrorMessage(inspect.error || 'Failed to read downloaded file');
        setDialogState('error');
        return;
      }

      setFileInspect(inspect);

      if (importNeedsAnswer(inspect)) {
        setDialogState('confirm-replace');
      } else {
        await startImport(result.zipPath, inspect, false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Download failed');
      setDialogState('error');
    }
  }, [pkey, startImport]);

  const handleClose = () => {
    // Don't allow closing during download or import
    if (dialogState === 'downloading' || dialogState === 'importing' || dialogState === 'opening-mine') return;
    onClose();
  };

  const handleComplete = () => {
    if (importResult?.projectData) {
      const projectData = dedupeImportedPresets(importResult.projectData, globalPresets);
      onImportComplete(projectData);
    }
    onClose();
  };

  const projectName = remoteInfo?.name || fileInspect?.projectName || 'Unknown Project';

  const renderContent = () => {
    switch (dialogState) {
      case 'inspecting':
        return (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Looking up project on strabospot.org...</Typography>
          </Box>
        );

      case 'confirm':
        return (
          <Box sx={{ py: 1 }}>
            <Typography variant="h6" gutterBottom>
              {projectName}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
              <Chip
                label={remoteInfo?.bytesFormatted || 'Unknown size'}
                size="small"
                variant="outlined"
              />
              <Typography variant="caption" sx={{
                color: 'text.secondary'
              }}>
                strabospot.org
              </Typography>
            </Box>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              This link wants to download the project from strabospot.org and
              open it in StraboMicro. Nothing has been downloaded yet.
            </Typography>
          </Box>
        );

      case 'mine':
        return (
          <Box sx={{ py: 1 }}>
            <Typography variant="h6" gutterBottom>
              {myProject?.name || projectName}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {myProject?.here === 'synced'
                ? 'This is your project on StraboSpot, and your synced copy is on this computer.'
                : myProject?.here === 'local'
                  ? 'This is your project on StraboSpot, and a copy of it is on this computer.'
                  : 'This is your project on StraboSpot. Download it as a synced copy: changes sync with StraboSpot automatically.'}
            </Typography>
          </Box>
        );

      case 'opening-mine':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>{mineStatus || 'Downloading…'}</Typography>
          </Box>
        );

      case 'not-found':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <SearchOffIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Project Not Available
            </Typography>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              This project isn't available on strabospot.org (id {pkey}). It may
              have been deleted, its upload may not have finished, or the link
              may be incorrect.
            </Typography>
          </Box>
        );

      case 'downloading':
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Downloading: {projectName}
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

      case 'inspecting-file':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Preparing project for import...</Typography>
          </Box>
        );

      case 'confirm-replace':
        return (
          <Box sx={{ py: 1 }}>
            <Typography variant="h6" gutterBottom>
              {fileInspect?.projectName || projectName}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 2
              }}>
              Project ID: {fileInspect?.projectId}
            </Typography>

            <ImportTargetNotice inspect={fileInspect} source="the version from strabospot.org" />
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
            <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Download Complete!
            </Typography>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              Project "{projectName}" has been downloaded and imported
              successfully.
            </Typography>
          </Box>
        );

      case 'error':
        return (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <ErrorIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" gutterBottom color="error">
              Could Not Open Project
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
      case 'inspecting':
      case 'not-found':
        return (
          <Button onClick={handleClose}>
            {dialogState === 'not-found' ? 'Close' : 'Cancel'}
          </Button>
        );

      case 'confirm':
        return (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              startIcon={<CloudDownloadIcon />}
              onClick={startDownload}
            >
              Download & Open
            </Button>
          </>
        );

      case 'mine':
        return (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="contained" onClick={() => void openMine()}>
              {myProject?.here ? 'Open' : 'Download'}
            </Button>
          </>
        );

      case 'downloading':
      case 'inspecting-file':
      case 'importing':
      case 'opening-mine':
        return null; // No actions during these states

      case 'confirm-replace':
        return (
          <ImportTargetActions
            inspect={fileInspect}
            onCancel={handleClose}
            onImport={(asCopy) => {
              if (downloadedZipPath && fileInspect) {
                void startImport(downloadedZipPath, fileInspect, asCopy);
              }
            }}
            onOpenMine={() => {
              const id = fileInspect?.projectId;
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
            <Button variant="outlined" onClick={inspectRemote}>
              Try Again
            </Button>
          </>
        );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeUnlessEscapeBlocked(handleClose, dialogState === 'downloading' || dialogState === 'importing' || dialogState === 'opening-mine')}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudDownloadIcon color="primary" />
        Open in StraboMicro
      </DialogTitle>
      <DialogContent>{renderContent()}</DialogContent>
      <DialogActions>{renderActions()}</DialogActions>
    </Dialog>
  );
}
