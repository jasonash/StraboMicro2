/**
 * Rebuild Tile Cache Dialog
 *
 * Two-step dialog: a warning/confirmation step followed by a progress step.
 * The rebuild wipes each micrograph's tile cache and regenerates with the
 * current tile format (halo padding), so seams introduced by older caches
 * disappear without users having to click through every micrograph.
 */

import { useCallback, useEffect, useState } from 'react';
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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

interface RebuildProgress {
  current: number;
  total: number;
  micrographName: string;
  phase: 'regular' | 'affine';
  tilesGenerated: number;
  totalTiles: number;
  status: 'processing' | 'error';
  error?: string;
}

interface RebuildResult {
  success: boolean;
  total?: number;
  skipped?: number;
  succeeded?: number;
  errors?: Array<{ micrographName: string; error: string }>;
  error?: string;
}

interface RebuildTileCacheDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectData: unknown;
}

export function RebuildTileCacheDialog({
  open,
  onClose,
  projectId,
  projectData,
}: RebuildTileCacheDialogProps) {
  const [step, setStep] = useState<'warn' | 'rebuilding' | 'done'>('warn');
  const [progress, setProgress] = useState<RebuildProgress | null>(null);
  const [result, setResult] = useState<RebuildResult | null>(null);

  useEffect(() => {
    if (open) {
      setStep('warn');
      setProgress(null);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!window.api?.onRebuildTilesProgress) return;
    window.api.onRebuildTilesProgress((p: RebuildProgress) => setProgress(p));
    return () => {
      window.api?.removeRebuildTilesProgressListener?.();
    };
  }, []);

  const startRebuild = useCallback(async () => {
    if (!projectId || !projectData || !window.api?.rebuildProjectTiles) return;

    setStep('rebuilding');
    setProgress(null);
    setResult(null);

    try {
      const r = await window.api.rebuildProjectTiles(projectId, projectData);
      setResult(r);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Rebuild failed',
      });
    } finally {
      setStep('done');
    }
  }, [projectId, projectData]);

  const handleClose = () => {
    setStep('warn');
    setProgress(null);
    setResult(null);
    onClose();
  };

  const overallPercent = progress
    ? Math.round(((progress.current - 1) / progress.total) * 100 +
        (progress.totalTiles > 0 ? (progress.tilesGenerated / progress.totalTiles) * (100 / progress.total) : 0))
    : 0;

  const tilePercent = progress && progress.totalTiles > 0
    ? Math.round((progress.tilesGenerated / progress.totalTiles) * 100)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={step === 'rebuilding' ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={step === 'rebuilding'}
    >
      <DialogTitle>Rebuild Tile Cache</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {step === 'warn' && (
            <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit" />}>
              <Typography variant="body1" fontWeight={500} gutterBottom>
                This will rebuild the tile cache for every micrograph in this project.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Use this if you're seeing visible seams between tiles on existing
                micrographs. New caches use a halo-padded format that eliminates
                subpixel-rendering gaps.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                The operation may take several minutes for large projects. Tile
                files are regenerated from the original images — no annotations or
                metadata are affected. You can keep using the app afterwards as
                normal.
              </Typography>
            </Alert>
          )}

          {step === 'rebuilding' && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Rebuilding micrograph {progress?.current ?? '…'} of {progress?.total ?? '…'}
                  {progress?.phase === 'affine' ? ' (affine overlay)' : ''}
                </Typography>
                <Typography variant="body1" fontWeight={500} noWrap>
                  {progress?.micrographName ?? 'Preparing…'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">Overall</Typography>
              <LinearProgress
                variant="determinate"
                value={overallPercent}
                sx={{ height: 10, borderRadius: 5, mb: 2, '& .MuiLinearProgress-bar': { borderRadius: 5 } }}
              />
              {progress && progress.totalTiles > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Current micrograph — {progress.tilesGenerated} of {progress.totalTiles} tiles
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={tilePercent}
                    sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { borderRadius: 3 } }}
                  />
                </>
              )}
            </>
          )}

          {step === 'done' && result?.success && (
            <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />}>
              <Typography variant="body1" fontWeight={500}>
                Tile cache rebuilt
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Rebuilt {result.succeeded ?? 0} of {result.total ?? 0} micrographs
                {result.skipped ? ` (${result.skipped} skipped — no scale set)` : ''}.
              </Typography>
            </Alert>
          )}

          {step === 'done' && result && !result.success && (
            <Alert severity="error" icon={<ErrorIcon fontSize="inherit" />}>
              <Typography variant="body1" fontWeight={500}>
                Rebuild finished with errors
              </Typography>
              {result.error && (
                <Typography variant="body2" sx={{ mt: 1 }}>{result.error}</Typography>
              )}
              {result.errors && result.errors.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {result.errors.length} micrograph(s) failed.
                  {result.succeeded != null && result.total != null && (
                    <> Succeeded: {result.succeeded} of {result.total}.</>
                  )}
                </Typography>
              )}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {step === 'warn' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button onClick={startRebuild} variant="contained" color="warning">
              Rebuild
            </Button>
          </>
        )}
        {step === 'rebuilding' && <Button disabled>Rebuilding…</Button>}
        {step === 'done' && (
          <Button onClick={handleClose} variant="contained">
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
