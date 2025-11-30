/**
 * Import SMZ Dialog Component
 *
 * Handles opening .smz project files with appropriate warnings about
 * destructive operations when importing over existing projects.
 *
 * Flow:
 * 1. User selects .smz file via file dialog
 * 2. System inspects the archive to get project info
 * 3. If project exists locally, show warning about data replacement
 * 4. User confirms import (or cancels)
 * 5. Import proceeds with progress display
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
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';

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
  projectData?: any;
  error?: string;
}

type DialogState =
  | 'selecting'       // User is selecting a file
  | 'inspecting'      // Inspecting the .smz file
  | 'confirm-import'  // Show warning and ask for confirmation
  | 'importing'       // Import in progress
  | 'success'         // Import complete
  | 'error';          // Error occurred

interface ImportSmzDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: (projectData: any) => void;
  /** Optional file path to import directly (skips file selection dialog) */
  initialFilePath?: string | null;
}

export function ImportSmzDialog({
  open,
  onClose,
  onImportComplete,
  initialFilePath,
}: ImportSmzDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>('selecting');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set up progress listener
  useEffect(() => {
    if (!open || !window.api?.smzImport?.onImportProgress) return;

    const unsubscribe = window.api.smzImport.onImportProgress((prog: ImportProgress) => {
      setProgress(prog);
    });

    return () => {
      unsubscribe?.();
    };
  }, [open]);

  // Inspect a file directly (when initialFilePath is provided)
  const inspectFile = useCallback(async (path: string) => {
    if (!window.api?.smzImport?.inspect) {
      setErrorMessage('SMZ import API not available');
      setDialogState('error');
      return;
    }

    try {
      setFilePath(path);
      setDialogState('inspecting');

      const inspect = await window.api.smzImport.inspect(path);

      if (!inspect.success) {
        setErrorMessage(inspect.error || 'Failed to read .smz file');
        setDialogState('error');
        return;
      }

      setInspectResult(inspect);
      setDialogState('confirm-import');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to inspect file');
      setDialogState('error');
    }
  }, []);

  const selectFile = useCallback(async () => {
    if (!window.api?.smzImport?.selectFile) {
      setErrorMessage('SMZ import API not available');
      setDialogState('error');
      return;
    }

    try {
      const result = await window.api.smzImport.selectFile();

      if (result.cancelled) {
        // User cancelled file selection, close dialog
        onClose();
        return;
      }

      setFilePath(result.filePath ?? null);
      setDialogState('inspecting');

      // Inspect the file
      const inspect = await window.api.smzImport.inspect(result.filePath!);

      if (!inspect.success) {
        setErrorMessage(inspect.error || 'Failed to read .smz file');
        setDialogState('error');
        return;
      }

      setInspectResult(inspect);

      // If project exists locally, show confirmation
      // If it doesn't exist, also show confirmation (but different message)
      setDialogState('confirm-import');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to select file');
      setDialogState('error');
    }
  }, [onClose]);

  // Start file selection or inspection when dialog opens
  useEffect(() => {
    if (open && dialogState === 'selecting') {
      if (initialFilePath) {
        // Skip file selection dialog if we have an initial file path
        inspectFile(initialFilePath);
      } else {
        selectFile();
      }
    }
  }, [open, dialogState, initialFilePath, inspectFile, selectFile]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDialogState('selecting');
      setFilePath(null);
      setInspectResult(null);
      setProgress(null);
      setImportResult(null);
      setErrorMessage(null);
    }
  }, [open]);

  const startImport = useCallback(async () => {
    if (!filePath || !window.api?.smzImport?.import) return;

    setDialogState('importing');
    setProgress(null);

    try {
      const result = await window.api.smzImport.import(filePath);

      if (result.success) {
        setImportResult(result);
        setDialogState('success');
      } else {
        setErrorMessage(result.error || 'Import failed');
        setDialogState('error');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
      setDialogState('error');
    }
  }, [filePath]);

  const handleClose = () => {
    // Don't allow closing during import
    if (dialogState === 'importing') return;
    onClose();
  };

  const handleComplete = () => {
    if (importResult?.projectData) {
      onImportComplete(importResult.projectData);
    }
    onClose();
  };

  const handleRetry = () => {
    setDialogState('selecting');
    setErrorMessage(null);
    setInspectResult(null);
    selectFile();
  };

  // Render based on dialog state
  const renderContent = () => {
    switch (dialogState) {
      case 'selecting':
      case 'inspecting':
        return (
          <Box sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <FolderOpenIcon color="primary" sx={{ fontSize: 40 }} />
              <Typography>
                {dialogState === 'selecting'
                  ? 'Select an .smz file to open...'
                  : 'Reading project file...'}
              </Typography>
            </Box>
            {dialogState === 'inspecting' && <LinearProgress />}
          </Box>
        );

      case 'confirm-import':
        return (
          <Box sx={{ py: 1 }}>
            <Typography variant="h6" gutterBottom>
              {inspectResult?.projectName || 'Untitled Project'}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Project ID: {inspectResult?.projectId}
            </Typography>

            {inspectResult?.projectExists ? (
              <Alert
                severity="warning"
                icon={<WarningIcon />}
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  This will replace your local project!
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  A project with this ID already exists on your computer. Importing this file will:
                </Typography>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li><Typography variant="body2">
                    <strong>Delete all local data</strong> for this project
                  </Typography></li>
                  <li><Typography variant="body2">
                    <strong>Clear version history</strong> (all previous versions will be lost)
                  </Typography></li>
                  <li><Typography variant="body2">
                    Replace with the contents of the .smz file
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
                    Pushing to the server (File → Push to Server)
                  </Typography></li>
                </ul>
              </Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  This project will be imported to your local projects folder.
                </Typography>
              </Alert>
            )}
          </Box>
        );

      case 'importing':
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              {progress?.phase || 'Importing...'}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress?.percentage || 0}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                {progress?.detail || ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {progress?.percentage || 0}%
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
              Import Complete!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Project "{inspectResult?.projectName}" has been imported successfully.
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
              Import Failed
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
      case 'selecting':
      case 'inspecting':
        return (
          <Button onClick={handleClose} disabled={dialogState === 'inspecting'}>
            Cancel
          </Button>
        );

      case 'confirm-import':
        return (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              color={inspectResult?.projectExists ? 'warning' : 'primary'}
              onClick={startImport}
            >
              {inspectResult?.projectExists ? 'Replace & Import' : 'Import'}
            </Button>
          </>
        );

      case 'importing':
        return null; // No actions during import

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
      disableEscapeKeyDown={dialogState === 'importing'}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FolderOpenIcon color="primary" />
        Open Project
      </DialogTitle>
      <DialogContent>{renderContent()}</DialogContent>
      <DialogActions>{renderActions()}</DialogActions>
    </Dialog>
  );
}
