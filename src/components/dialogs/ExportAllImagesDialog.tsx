/**
 * Export All Images Dialog Component
 *
 * Displays format selection and progress while exporting all micrograph images to a ZIP file.
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
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

type ExportFormat = 'jpeg' | 'svg';

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
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [step, setStep] = useState<'select' | 'exporting'>('select');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    exported?: number;
    error?: string;
  } | null>(null);

  // Reset to format selection when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select');
      setProgress(null);
      setResult(null);
      setIsExporting(false);
    }
  }, [open]);

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

    setStep('exporting');
    setIsExporting(true);
    setProgress(null);
    setResult(null);

    try {
      const exportResult = await window.api.exportAllImages(projectId, projectData, format);

      if (exportResult.canceled) {
        // User canceled the save dialog - go back to format selection
        setStep('select');
        setIsExporting(false);
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
  }, [projectId, projectData, format]);

  const handleClose = () => {
    // Reset state when closing
    setStep('select');
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
      onClose={step === 'select' || result ? handleClose : undefined}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isExporting}
    >
      <DialogTitle>Export All Images</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Format selection step */}
          {step === 'select' && (
            <FormControl component="fieldset">
              <FormLabel component="legend">Export Format</FormLabel>
              <RadioGroup
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                <FormControlLabel
                  value="jpeg"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1">JPEG (Raster)</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Standard image format, smaller file size
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="svg"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1">SVG (Vector)</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Editable spots and labels in Illustrator, Inkscape, etc.
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
          )}

          {/* Progress state */}
          {step === 'exporting' && isExporting && progress && (
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
          {step === 'exporting' && isExporting && !progress && (
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
        {step === 'select' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button onClick={startExport} variant="contained">
              Export
            </Button>
          </>
        )}
        {step === 'exporting' && isExporting && (
          <Button disabled>Exporting...</Button>
        )}
        {step === 'exporting' && !isExporting && result && (
          <Button onClick={handleClose} variant="contained">
            {result?.success ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
