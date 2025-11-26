/**
 * Export All Images Dialog Component
 *
 * Displays progress while exporting all micrograph images to a ZIP file.
 * Shows current image being processed and overall progress.
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

interface ExportProgress {
  current: number;
  total: number;
  currentName: string;
  status: 'processing' | 'complete' | 'error';
  error?: string;
}

interface ExportAllImagesDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectData: any;
}

export function ExportAllImagesDialog({
  open,
  projectId,
  projectData,
  onClose,
}: ExportAllImagesDialogProps) {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    exported?: number;
    error?: string;
  } | null>(null);

  // Start export when dialog opens
  useEffect(() => {
    if (open && projectId && projectData && !isExporting && !result) {
      startExport();
    }
  }, [open, projectId, projectData]);

  // Set up progress listener
  useEffect(() => {
    if (!window.api?.onExportAllImagesProgress) return;

    const handleProgress = (prog: ExportProgress) => {
      setProgress(prog);
    };

    window.api.onExportAllImagesProgress(handleProgress);

    return () => {
      window.api?.removeExportAllImagesProgressListener?.();
    };
  }, []);

  const startExport = useCallback(async () => {
    if (!projectId || !projectData || !window.api?.exportAllImages) return;

    setIsExporting(true);
    setProgress(null);
    setResult(null);

    try {
      const exportResult = await window.api.exportAllImages(projectId, projectData);

      if (exportResult.canceled) {
        // User canceled the save dialog
        handleClose();
        return;
      }

      setResult(exportResult);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  }, [projectId, projectData]);

  const handleClose = () => {
    // Reset state when closing
    setProgress(null);
    setResult(null);
    setIsExporting(false);
    onClose();
  };

  const percentComplete = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={result ? handleClose : undefined}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isExporting}
    >
      <DialogTitle>Export All Images</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Progress state */}
          {isExporting && progress && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Exporting image {progress.current} of {progress.total}
                </Typography>
                <Typography variant="body1" fontWeight={500} noWrap>
                  {progress.currentName}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={percentComplete}
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
                {percentComplete}%
              </Typography>
            </>
          )}

          {/* Initializing state */}
          {isExporting && !progress && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Preparing export...
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
                Export Complete!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {result.exported} images exported to ZIP file.
              </Typography>
            </Alert>
          )}

          {/* Error state */}
          {result && !result.success && !result.canceled && (
            <Alert
              severity="error"
              icon={<ErrorIcon fontSize="inherit" />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body1" fontWeight={500}>
                Export Failed
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {result.error || 'An unknown error occurred'}
              </Typography>
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {isExporting ? (
          <Button disabled>Exporting...</Button>
        ) : (
          <Button onClick={handleClose} variant="contained">
            {result?.success ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
