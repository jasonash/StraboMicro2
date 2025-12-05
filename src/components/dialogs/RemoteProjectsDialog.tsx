/**
 * Remote Projects Dialog Component
 *
 * Lists user's projects from the StraboSpot server and allows downloading
 * and importing them. Uses the same import flow as local .smz files once
 * the download is complete.
 *
 * Flow:
 * 1. Fetch list of user's projects from server
 * 2. Display projects with name, upload date, and size
 * 3. User clicks a project to download
 * 4. Download with progress bar
 * 5. Inspect downloaded file (check if exists locally)
 * 6. Show confirmation if project exists locally (same as ImportSmzDialog)
 * 7. Import the project
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
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  CircularProgress,
  IconButton,
} from '@mui/material';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import { useAuthStore } from '@/store/useAuthStore';

interface RemoteProject {
  id: string;
  name: string;
  uploadDate: string;
  modifiedTimestamp: number;
  bytes: number;
  bytesFormatted: string;
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

interface InspectResult {
  success: boolean;
  projectId?: string;
  projectName?: string;
  projectExists?: boolean;
  error?: string;
}

interface ImportResult {
  success: boolean;
  projectId?: string;
  projectData?: unknown;
  error?: string;
}

type DialogState =
  | 'loading'           // Loading project list
  | 'list'              // Showing project list
  | 'downloading'       // Downloading project file
  | 'inspecting'        // Inspecting downloaded file
  | 'confirm-import'    // Confirm import (if project exists locally)
  | 'importing'         // Import in progress
  | 'success'           // Import complete
  | 'error';            // Error occurred

interface RemoteProjectsDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: (projectData: unknown) => void;
}

export function RemoteProjectsDialog({
  open,
  onClose,
  onImportComplete,
}: RemoteProjectsDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>('loading');
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<RemoteProject | null>(null);
  const [downloadedZipPath, setDownloadedZipPath] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
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

  // Load project list when dialog opens
  useEffect(() => {
    if (open && dialogState === 'loading') {
      loadProjectList();
    }
  }, [open, dialogState]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Clean up any downloaded file that wasn't imported
      if (downloadedZipPath) {
        window.api?.server?.cleanupDownload?.(downloadedZipPath);
      }

      setDialogState('loading');
      setProjects([]);
      setSelectedProject(null);
      setDownloadedZipPath(null);
      setInspectResult(null);
      setDownloadProgress(null);
      setImportProgress(null);
      setImportResult(null);
      setErrorMessage(null);
    }
  }, [open, downloadedZipPath]);

  const loadProjectList = useCallback(async () => {
    if (!window.api?.server?.listProjects) {
      setErrorMessage('Server API not available');
      setDialogState('error');
      return;
    }

    setDialogState('loading');
    setErrorMessage(null);

    try {
      const result = await window.api.server.listProjects();

      if (!result.success) {
        // If session expired, log out the user
        if (result.sessionExpired) {
          console.log('[RemoteProjectsDialog] Session expired, logging out...');
          await logout();
        }
        setErrorMessage(result.error || 'Failed to load projects');
        setDialogState('error');
        return;
      }

      setProjects(result.projects || []);
      setDialogState('list');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load projects');
      setDialogState('error');
    }
  }, [logout]);

  const startDownload = useCallback(async (project: RemoteProject) => {
    if (!window.api?.server?.downloadProject) return;

    setSelectedProject(project);
    setDialogState('downloading');
    setDownloadProgress(null);

    try {
      const result = await window.api.server.downloadProject(project.id);

      if (!result.success) {
        // If session expired, log out the user
        if (result.sessionExpired) {
          console.log('[RemoteProjectsDialog] Session expired, logging out...');
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

      // If project exists locally, show confirmation
      // Otherwise, start import directly
      if (inspect.projectExists) {
        setDialogState('confirm-import');
      } else {
        // No conflict, proceed with import
        await startImport(result.zipPath);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Download failed');
      setDialogState('error');
    }
  }, [logout]);

  const startImport = useCallback(async (zipPath?: string) => {
    const pathToImport = zipPath || downloadedZipPath;
    if (!pathToImport || !window.api?.smzImport?.import) return;

    setDialogState('importing');
    setImportProgress(null);

    try {
      const result = await window.api.smzImport.import(pathToImport);

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
  }, [downloadedZipPath]);

  const handleClose = () => {
    // Don't allow closing during download or import
    if (dialogState === 'downloading' || dialogState === 'importing') return;
    onClose();
  };

  const handleComplete = () => {
    if (importResult?.projectData) {
      onImportComplete(importResult.projectData);
    }
    onClose();
  };

  const handleBackToList = () => {
    // Clean up any downloaded file
    if (downloadedZipPath) {
      window.api?.server?.cleanupDownload?.(downloadedZipPath);
      setDownloadedZipPath(null);
    }

    setSelectedProject(null);
    setInspectResult(null);
    setDownloadProgress(null);
    setErrorMessage(null);
    setDialogState('list');
  };

  const handleRetry = () => {
    // If we have a selected project, retry the download
    if (selectedProject && dialogState === 'error') {
      startDownload(selectedProject);
    } else {
      // Otherwise reload the project list
      loadProjectList();
    }
  };

  // Render project list
  const renderProjectList = () => (
    <Box sx={{ py: 1 }}>
      {projects.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <StorageIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No projects found on the server.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Push a project to the server first using File → Push to Server.
          </Typography>
        </Box>
      ) : (
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {projects.map((project) => (
            <ListItem
              key={project.id}
              disablePadding
              sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ListItemButton onClick={() => startDownload(project)}>
                <ListItemText
                  primary={project.name}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {project.uploadDate}
                      </Typography>
                      <Chip
                        label={project.bytesFormatted}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={(e) => {
                      e.stopPropagation();
                      startDownload(project);
                    }}
                  >
                    <CloudDownloadIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );

  // Render based on dialog state
  const renderContent = () => {
    switch (dialogState) {
      case 'loading':
        return (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Loading projects from server...</Typography>
          </Box>
        );

      case 'list':
        return renderProjectList();

      case 'downloading':
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Downloading: {selectedProject?.name}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={downloadProgress?.percentage || 0}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                {downloadProgress?.message || 'Starting download...'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
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
              {inspectResult?.projectName || selectedProject?.name}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Project ID: {inspectResult?.projectId}
            </Typography>

            <Alert
              severity="warning"
              icon={<WarningIcon />}
              sx={{ mb: 2 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                This will replace your local project!
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                A project with this ID already exists on your computer. Downloading this project will:
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li><Typography variant="body2">
                  <strong>Delete all local data</strong> for this project
                </Typography></li>
                <li><Typography variant="body2">
                  <strong>Clear version history</strong> (all previous versions will be lost)
                </Typography></li>
                <li><Typography variant="body2">
                  Replace with the server version
                </Typography></li>
              </ul>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
                Before continuing, consider:
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li><Typography variant="body2">
                  Exporting your local project as .smz (File → Export as .smz)
                </Typography></li>
                <li><Typography variant="body2">
                  Pushing local changes to server first (File → Push to Server)
                </Typography></li>
              </ul>
            </Alert>
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
              <Typography variant="body2" color="text.secondary">
                {importProgress?.detail || ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
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
            <Typography variant="body2" color="text.secondary">
              Project "{selectedProject?.name}" has been downloaded and imported successfully.
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
              {dialogState === 'error' && selectedProject ? 'Download Failed' : 'Error'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {errorMessage || 'An unknown error occurred.'}
            </Typography>
          </Box>
        );
    }
  };

  const renderActions = () => {
    switch (dialogState) {
      case 'loading':
        return (
          <Button onClick={handleClose}>
            Cancel
          </Button>
        );

      case 'list':
        return (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <IconButton onClick={loadProjectList} title="Refresh">
              <RefreshIcon />
            </IconButton>
          </>
        );

      case 'downloading':
      case 'inspecting':
      case 'importing':
        return null; // No actions during these states

      case 'confirm-import':
        return (
          <>
            <Button onClick={handleBackToList}>Back</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => startImport()}
            >
              Replace & Import
            </Button>
          </>
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
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={dialogState === 'downloading' || dialogState === 'importing'}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudDownloadIcon color="primary" />
        Open Remote Project
      </DialogTitle>
      <DialogContent>{renderContent()}</DialogContent>
      <DialogActions>{renderActions()}</DialogActions>
    </Dialog>
  );
}
