/**
 * Export PDF Dialog Component
 *
 * Displays progress while exporting the project as a PDF report.
 * Shows current phase, item being processed, and overall progress.
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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

interface ExportProgress {
  phase: string;
  current: number;
  total: number;
  itemName: string;
  percentage: number;
  error?: string;
}

interface ExportPDFDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectData: any;
}

export function ExportPDFDialog({
  open,
  projectId,
  projectData,
  onClose,
}: ExportPDFDialogProps) {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    canceled?: boolean;
    filePath?: string;
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
    if (!window.api?.onExportPdfProgress) return;

    const handleProgress = (prog: ExportProgress) => {
      setProgress(prog);
      if (prog.error) {
        setResult({
          success: false,
          error: prog.error,
        });
        setIsExporting(false);
      }
    };

    window.api.onExportPdfProgress(handleProgress);

    return () => {
      window.api?.removeExportPdfProgressListener?.();
    };
  }, []);

  const startExport = useCallback(async () => {
    if (!projectId || !projectData || !window.api?.exportProjectPdf) return;

    setIsExporting(true);
    setProgress(null);
    setResult(null);

    try {
      const exportResult = await window.api.exportProjectPdf(projectId, projectData);

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

  return (
    <Dialog
      open={open}
      onClose={result ? handleClose : undefined}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isExporting}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PictureAsPdfIcon color="error" />
        Export Project as PDF
      </DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Progress state */}
          {isExporting && progress && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {progress.phase}
                </Typography>
                <Typography variant="body1" fontWeight={500} noWrap>
                  {progress.itemName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Step {progress.current} of {progress.total}
                </Typography>
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
          {isExporting && !progress && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Preparing PDF export...
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
                PDF Export Complete!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your project report has been saved successfully.
              </Typography>
              {result.filePath && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    mt: 1,
                    wordBreak: 'break-all',
                  }}
                >
                  {result.filePath}
                </Typography>
              )}
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
          <Button disabled>Generating PDF...</Button>
        ) : (
          <Button onClick={handleClose} variant="contained">
            {result?.success ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
