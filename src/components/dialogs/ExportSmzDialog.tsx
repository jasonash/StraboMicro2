/**
 * Export SMZ Dialog Component
 *
 * Displays progress while exporting the project as a .smz archive.
 * Shows current phase, item being processed, and overall progress.
 *
 * Before export, this dialog merges any referenced global presets into the
 * project data to ensure the .smz file is self-contained and shareable.
 *
 * Micrographs without an image file here are named first, with Export
 * Anyway (Sentry ELECTRON-39: the export used to leave them out unseen, so
 * a copy that had lost its images passed that on).
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
  AlertTitle,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import { useAppStore } from '../../store/useAppStore';
import type { QuickApplyPreset } from '../../types/preset-types';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { micrographRefs, missingImagesWarning, type MicrographRef } from '@/utils/missingImages';

interface ExportProgress {
  phase: string;
  current: number;
  total: number;
  itemName: string;
  percentage: number;
  error?: string;
}

interface ExportSmzDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectData: any;
}

/**
 * Collect all appliedPresetIds from all spots in a project.
 * Traverses datasets → samples → micrographs → spots.
 */
function collectAllAppliedPresetIds(project: any): Set<string> {
  const ids = new Set<string>();
  if (!project?.datasets) return ids;

  for (const dataset of project.datasets) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        for (const spot of micrograph.spots || []) {
          if (spot.appliedPresetIds && Array.isArray(spot.appliedPresetIds)) {
            for (const presetId of spot.appliedPresetIds) {
              ids.add(presetId);
            }
          }
        }
      }
    }
  }
  return ids;
}

/**
 * Merge referenced global presets into project data for export.
 * This ensures the exported .smz file is self-contained and shareable.
 */
function mergeGlobalPresetsForExport(
  projectData: any,
  globalPresets: QuickApplyPreset[]
): any {
  // Collect all preset IDs referenced by spots
  const referencedIds = collectAllAppliedPresetIds(projectData);
  if (referencedIds.size === 0 && globalPresets.length === 0) {
    return projectData;
  }

  // Build a set of preset IDs already in the project
  const existingProjectPresetIds = new Set<string>(
    (projectData.presets || []).map((p: QuickApplyPreset) => p.id)
  );

  // Find global presets that are referenced but not already in project.presets
  const presetsToAdd: QuickApplyPreset[] = [];
  for (const preset of globalPresets) {
    if (referencedIds.has(preset.id) && !existingProjectPresetIds.has(preset.id)) {
      presetsToAdd.push(preset);
    }
  }

  // If no presets need to be added, return original data
  if (presetsToAdd.length === 0) {
    return projectData;
  }

  // Create a copy with merged presets
  const mergedPresets = [...(projectData.presets || []), ...presetsToAdd];

  console.log(
    `[ExportSmzDialog] Merged ${presetsToAdd.length} global preset(s) into export:`,
    presetsToAdd.map((p) => p.name)
  );

  return {
    ...projectData,
    presets: mergedPresets,
  };
}

export function ExportSmzDialog({
  open,
  projectId,
  projectData,
  onClose,
}: ExportSmzDialogProps) {
  // Get global presets from store for merging into export
  const globalPresets = useAppStore((state) => state.globalPresets);

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    error?: string;
  } | null>(null);
  /** Micrographs without an image file here: asked about before exporting */
  const [missing, setMissing] = useState<MicrographRef[] | null>(null);

  // When the dialog opens: check the images, then export (or ask first)
  useEffect(() => {
    if (!open || !projectId || !projectData || isExporting || result || missing) return;
    let cancelled = false;
    void (async () => {
      const found = window.api?.missingImages
        ? await window.api.missingImages(projectId, micrographRefs(projectData)).catch(() => [])
        : [];
      if (cancelled) return;
      if (found.length > 0) setMissing(found);
      else void startExport();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, projectData]);
  const missingWarning = missing && !isExporting && !result ? missingImagesWarning(missing, 'export') : null;

  // Set up progress listener
  useEffect(() => {
    if (!window.api?.onExportSmzProgress) return;

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

    window.api.onExportSmzProgress(handleProgress);

    return () => {
      window.api?.removeExportSmzProgressListener?.();
    };
  }, []);

  const startExport = useCallback(async () => {
    if (!projectId || !projectData || !window.api?.exportSmz) return;

    setIsExporting(true);
    setProgress(null);
    setResult(null);

    try {
      // Merge referenced global presets into project data for self-contained export
      const exportData = mergeGlobalPresetsForExport(projectData, globalPresets);

      const exportResult = await window.api.exportSmz(projectId, exportData);

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
  }, [projectId, projectData, globalPresets]);

  const handleClose = () => {
    // Reset state when closing
    setProgress(null);
    setResult(null);
    setMissing(null);
    setIsExporting(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={closeUnlessEscapeBlocked(result || missingWarning ? handleClose : undefined, isExporting)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FolderZipIcon color="primary" />
        Export Project as .smz
      </DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Images missing here: asked first */}
          {missingWarning && (
            <Alert severity="warning">
              <AlertTitle sx={{ fontSize: '0.875rem' }}>{missingWarning.title}</AlertTitle>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {missingWarning.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
                {missingWarning.more && <li>{missingWarning.more}</li>}
              </Box>
              <Box sx={{ mt: 1 }}>{missingWarning.note}</Box>
            </Alert>
          )}

          {/* Progress state */}
          {isExporting && progress && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom sx={{
                  color: 'text.secondary'
                }}>
                  {progress.phase}
                </Typography>
                <Typography variant="body1" noWrap sx={{
                  fontWeight: 500
                }}>
                  {progress.itemName}
                </Typography>
                <Typography variant="caption" sx={{
                  color: 'text.secondary'
                }}>
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
              <Typography variant="body2" align="right" sx={{
                color: 'text.secondary'
              }}>
                {progress.percentage}%
              </Typography>
            </>
          )}

          {/* Initializing state (also while the images are checked) */}
          {((isExporting && !progress) || (!isExporting && !result && !missingWarning)) && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body1" sx={{
                color: 'text.secondary'
              }}>
                Preparing .smz export...
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
              <Typography variant="body1" sx={{
                fontWeight: 500
              }}>
                Export Complete!
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mt: 1
                }}>
                Your project has been saved as a .smz archive.
              </Typography>
              {result.filePath && (
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    display: 'block',
                    mt: 1,
                    wordBreak: 'break-all'
                  }}>
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
              <Typography variant="body1" sx={{
                fontWeight: 500
              }}>
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
        ) : missingWarning ? (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={() => void startExport()}>Export Anyway</Button>
          </>
        ) : (
          <Button onClick={handleClose} variant="contained">
            {result?.success ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
