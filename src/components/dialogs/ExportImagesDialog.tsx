/**
 * Export Images Dialog
 *
 * The single image export dialog for the app, opened from two places:
 * - File > Export Images... (batch mode): export every micrograph, or a chosen
 *   subset, to a ZIP archive with progress.
 * - The export button next to a micrograph's name in the properties panel
 *   (single mode): export that micrograph to a file.
 *
 * Both modes share the same option controls (ImageExportOptionsPanel) and
 * remember the user's last-used options between exports.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useAppStore } from '@/store';
import type { ProjectMetadata, SketchLayer } from '@/types/project-types';
import {
  imageExportHasContent,
  toPersistedSketchSelection,
  type ImageExportOptions,
  type ImageExportProgress,
  type ImageExportResult,
} from '@/types/image-export-types';
import { ImageExportOptionsPanel } from './ImageExportOptionsPanel';

export type ExportImagesDialogMode =
  | { kind: 'batch' }
  | { kind: 'single'; micrographId: string };

interface ExportImagesDialogProps {
  open: boolean;
  onClose: () => void;
  mode: ExportImagesDialogMode;
}

type Step = 'options' | 'exporting' | 'done';
type Scope = 'all' | 'selected';

// ---------------------------------------------------------------------------
// Micrograph selection tree (batch mode)
// ---------------------------------------------------------------------------

interface TreeMicrograph {
  id: string;
  name: string;
  depth: number;
}
interface TreeSample {
  id: string;
  name: string;
  micrographs: TreeMicrograph[];
}
interface TreeDataset {
  id: string;
  name: string;
  samples: TreeSample[];
}

/**
 * Flatten the project into dataset > sample > micrograph rows. Micrographs
 * keep their stored order (the order the export uses) and are indented by
 * their nesting depth under the reference micrograph.
 */
function buildSelectionTree(project: ProjectMetadata | null): TreeDataset[] {
  if (!project?.datasets) return [];
  return project.datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name || 'Unnamed Dataset',
    samples: (dataset.samples || []).map((sample) => {
      const micrographs = sample.micrographs || [];
      const parentOf = new Map(micrographs.map((m) => [m.id, m.parentID || null] as const));
      const depthOf = (id: string): number => {
        let depth = 0;
        let current = parentOf.get(id) ?? null;
        const seen = new Set<string>();
        while (current && parentOf.has(current) && !seen.has(current)) {
          seen.add(current);
          depth++;
          current = parentOf.get(current) ?? null;
        }
        return depth;
      };
      return {
        id: sample.id,
        name: sample.name || 'Unnamed Sample',
        micrographs: micrographs.map((m) => ({
          id: m.id,
          name: m.name || 'Unnamed Micrograph',
          depth: depthOf(m.id),
        })),
      };
    }),
  }));
}

interface MicrographSelectionTreeProps {
  tree: TreeDataset[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

function MicrographSelectionTree({ tree, selected, onChange, disabled }: MicrographSelectionTreeProps) {
  const setMany = (ids: string[], checked: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const groupState = (ids: string[]) => {
    const count = ids.filter((id) => selected.has(id)).length;
    return { checked: ids.length > 0 && count === ids.length, indeterminate: count > 0 && count < ids.length };
  };

  const rowSx = { display: 'flex', alignItems: 'center', minHeight: 28 };

  return (
    <Box
      sx={{
        maxHeight: 260,
        overflowY: 'auto',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1,
        py: 0.5,
      }}
    >
      {tree.map((dataset) => {
        const datasetIds = dataset.samples.flatMap((s) => s.micrographs.map((m) => m.id));
        const ds = groupState(datasetIds);
        return (
          <Box key={dataset.id}>
            <Box sx={rowSx}>
              <Checkbox
                size="small"
                disabled={disabled || datasetIds.length === 0}
                checked={ds.checked}
                indeterminate={ds.indeterminate}
                onChange={(e) => setMany(datasetIds, e.target.checked)}
              />
              <Typography variant="body2" fontWeight={600} noWrap>
                {dataset.name}
              </Typography>
            </Box>
            {dataset.samples.map((sample) => {
              const sampleIds = sample.micrographs.map((m) => m.id);
              const ss = groupState(sampleIds);
              return (
                <Box key={sample.id} sx={{ pl: 3 }}>
                  <Box sx={rowSx}>
                    <Checkbox
                      size="small"
                      disabled={disabled || sampleIds.length === 0}
                      checked={ss.checked}
                      indeterminate={ss.indeterminate}
                      onChange={(e) => setMany(sampleIds, e.target.checked)}
                    />
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {sample.name}
                    </Typography>
                  </Box>
                  {sample.micrographs.map((micro) => (
                    <Box key={micro.id} sx={{ ...rowSx, pl: 3 + micro.depth * 2 }}>
                      <Checkbox
                        size="small"
                        disabled={disabled}
                        checked={selected.has(micro.id)}
                        onChange={(e) => setMany([micro.id], e.target.checked)}
                      />
                      <Typography variant="body2" noWrap>
                        {micro.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function ExportImagesDialog({ open, onClose, mode }: ExportImagesDialogProps) {
  const project = useAppStore((state) => state.project);
  const micrographIndex = useAppStore((state) => state.micrographIndex);
  const preferences = useAppStore((state) => state.imageExportOptions);
  const setPreferences = useAppStore((state) => state.setImageExportOptions);

  const single = mode.kind === 'single';
  const micrograph = single ? micrographIndex.get(mode.micrographId) ?? null : null;
  const layers: SketchLayer[] = useMemo(() => micrograph?.sketchLayers ?? [], [micrograph]);

  const tree = useMemo(() => (single ? [] : buildSelectionTree(project)), [project, single]);
  const allIds = useMemo(
    () => tree.flatMap((d) => d.samples.flatMap((s) => s.micrographs.map((m) => m.id))),
    [tree]
  );

  const [options, setOptions] = useState<ImageExportOptions>(preferences);
  const [scope, setScope] = useState<Scope>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>('options');
  const [progress, setProgress] = useState<ImageExportProgress | null>(null);
  const [result, setResult] = useState<ImageExportResult | null>(null);

  // Reset to a fresh options view every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setOptions({
      ...preferences,
      sketchLayers: single
        ? preferences.sketchLayers === 'none'
          ? []
          : layers.filter((l) => l.visible).map((l) => l.id)
        : preferences.sketchLayers,
    });
    setScope('all');
    setSelectedIds(new Set(allIds));
    setStep('options');
    setProgress(null);
    setResult(null);
    // Intentionally only on open: preferences/layers are read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Batch progress listener
  useEffect(() => {
    if (!open || single || !window.api?.onExportImagesProgress) return;
    window.api.onExportImagesProgress((prog) => setProgress(prog));
    return () => {
      window.api?.removeExportImagesProgressListener?.();
    };
  }, [open, single]);

  const exportIds = scope === 'all' ? null : Array.from(selectedIds);
  const imageCount = single ? 1 : exportIds ? exportIds.length : allIds.length;
  const canExport =
    imageExportHasContent(options) && imageCount > 0 && (single ? !!micrograph : allIds.length > 0);

  const startExport = useCallback(async () => {
    if (!project?.id) return;

    // Remember these settings for next time (before the export, so a
    // cancelled save dialog still keeps the user's choices).
    setPreferences({
      format: options.format,
      includeImage: options.includeImage,
      includeOverlays: options.includeOverlays,
      includeSpots: options.includeSpots,
      includeLabels: options.includeLabels,
      sketchLayers: toPersistedSketchSelection(options.sketchLayers),
    });

    setStep('exporting');
    setProgress(null);
    setResult(null);

    try {
      let exportResult: ImageExportResult | undefined;
      if (single) {
        exportResult = await window.api?.exportMicrographImage(project.id, mode.micrographId, project, options);
      } else {
        exportResult = await window.api?.exportImages(project.id, project, { ...options, micrographIds: exportIds });
      }

      if (!exportResult || exportResult.canceled) {
        // Save dialog dismissed: back to the options with nothing lost
        setStep('options');
        return;
      }
      setResult(exportResult);
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : 'Export failed' });
    }
    setStep('done');
  }, [project, single, mode, options, exportIds, setPreferences]);

  const handleClose = () => {
    if (step === 'exporting') return;
    onClose();
  };

  const percentComplete = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const title = single ? 'Export Micrograph' : 'Export Images';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth disableEscapeKeyDown={step === 'exporting'}>
      <DialogTitle>
        {title}
        {single && micrograph && (
          <Typography variant="body2" color="text.secondary" noWrap>
            {micrograph.name || 'Unnamed Micrograph'}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {step === 'options' && (
          <Box sx={{ pt: 1 }}>
            {!single && (
              <>
                <FormControl component="fieldset" sx={{ display: 'block', mb: 1 }}>
                  <FormLabel component="legend">Micrographs</FormLabel>
                  <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                    <FormControlLabel
                      value="all"
                      control={<Radio size="small" />}
                      label={<Typography variant="body2">All ({allIds.length})</Typography>}
                    />
                    <FormControlLabel
                      value="selected"
                      control={<Radio size="small" />}
                      label={<Typography variant="body2">Selected</Typography>}
                    />
                  </RadioGroup>
                </FormControl>
                {scope === 'selected' && (
                  <Box sx={{ mb: 1 }}>
                    <MicrographSelectionTree tree={tree} selected={selectedIds} onChange={setSelectedIds} />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {selectedIds.size} of {allIds.length} selected
                      </Typography>
                      <Box>
                        <Button size="small" onClick={() => setSelectedIds(new Set(allIds))}>
                          All
                        </Button>
                        <Button size="small" onClick={() => setSelectedIds(new Set())}>
                          None
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}
                <Divider sx={{ my: 2 }} />
              </>
            )}

            <ImageExportOptionsPanel
              value={options}
              onChange={setOptions}
              sketchLayers={single ? layers : undefined}
              imageCount={imageCount}
            />
          </Box>
        )}

        {step === 'exporting' && (
          <Box sx={{ py: 2 }}>
            {progress && !single ? (
              <>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Exporting image {progress.current} of {progress.total}
                </Typography>
                <Typography variant="body1" fontWeight={500} noWrap sx={{ mb: 2 }}>
                  {progress.currentName}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={percentComplete}
                  sx={{ height: 10, borderRadius: 5, mb: 1, '& .MuiLinearProgress-bar': { borderRadius: 5 } }}
                />
                <Typography variant="body2" color="text.secondary" align="right">
                  {percentComplete}%
                </Typography>
              </>
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  {single ? 'Rendering full-resolution image...' : 'Preparing export...'}
                </Typography>
                <LinearProgress sx={{ mt: 2 }} />
              </Box>
            )}
          </Box>
        )}

        {step === 'done' && result?.success && (
          <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />} sx={{ my: 2 }}>
            <Typography variant="body1" fontWeight={500}>
              Export Complete
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all' }}>
              {single
                ? `Saved to ${result.filePath ?? 'the chosen location'}.`
                : `${result.exported ?? 0} image${result.exported === 1 ? '' : 's'} exported to ${result.filePath ?? 'ZIP file'}.`}
            </Typography>
            {result.errors && result.errors.length > 0 && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                {result.errors.length} image{result.errors.length === 1 ? '' : 's'} could not be exported:{' '}
                {result.errors.map((e) => e.name).join(', ')}
              </Typography>
            )}
          </Alert>
        )}

        {step === 'done' && result && !result.success && (
          <Alert severity="error" icon={<ErrorIcon fontSize="inherit" />} sx={{ my: 2 }}>
            <Typography variant="body1" fontWeight={500}>
              Export Failed
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {result.error || 'An unknown error occurred'}
            </Typography>
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        {step === 'options' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button onClick={startExport} variant="contained" disabled={!canExport}>
              Export
            </Button>
          </>
        )}
        {step === 'exporting' && <Button disabled>Exporting...</Button>}
        {step === 'done' && (
          <Button onClick={handleClose} variant="contained">
            {result?.success ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ExportImagesDialog;
