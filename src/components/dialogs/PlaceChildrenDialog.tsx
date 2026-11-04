/**
 * "Place children automatically...": runs automatic placement (src/services/autoPlace) on every
 * unplaced child of one micrograph, one after another in one worker, and lists the results.
 * Found ones are checked, low-confidence ones are shown unchecked for the user to look at, and
 * ambiguous / no match are left for Edit Micrograph Location. The checked ones are saved in one
 * go (one undo step), exactly as Edit Micrograph Location saves an automatic placement.
 *
 * Opened from the tree (micrograph menu, or clicking an unplaced child) and at the end of
 * Batch Import. Design: docs/drop-to-place-design.md
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import {
  bakeAffineOutcome,
  createPlacer,
  mustPlaceAffine,
  type AutoPlaceResult,
  type Placer,
} from '@/services/autoPlace/autoPlace';
import { placementUpdates, rectangleFields, type AutoPlacementOutcome } from '@/services/autoPlace/placementFields';
import { unplacedChildren } from '@/utils/micrographLocation';
import { regenerateComposites } from '@/utils/compositeRefresh';
import FootprintPreview from './FootprintPreview';

interface PlaceChildrenDialogProps {
  open: boolean;
  parentMicrographId: string;
  /** Only these unplaced children (Finish Importing); default all */
  onlyIds?: string[];
  onClose: () => void;
}

type RowState =
  | { name: 'waiting' }
  | { name: 'matching'; percent: number }
  | { name: 'done'; result: AutoPlaceResult }
  | { name: 'failed'; message: string }
  | { name: 'not tried' };

interface Row {
  id: string;
  label: string;
  path: string;
  width: number;
  height: number;
  state: RowState;
  checked: boolean;
}

type Phase = 'matching' | 'review' | 'saving';

/** A result the user may accept (placed or low confidence, with a matrix) */
function usable(row: Row): row is Row & { state: { name: 'done'; result: AutoPlaceResult & { appMatrix: NonNullable<AutoPlaceResult['appMatrix']> } } } {
  return row.state.name === 'done' && !!row.state.result.appMatrix
    && (row.state.result.status === 'placed' || row.state.result.status === 'low');
}

function statusChip(state: RowState): React.ReactNode {
  switch (state.name) {
    case 'waiting':
      return <Chip size="small" label="Waiting" variant="outlined" />;
    case 'not tried':
      return <Chip size="small" label="Not tried" variant="outlined" />;
    case 'matching':
      return <Chip size="small" label="Looking..." color="info" variant="outlined" />;
    case 'failed':
      return <Chip size="small" label="Stopped" color="error" variant="outlined" />;
    case 'done':
      switch (state.result.status) {
        case 'placed':
          return <Chip size="small" label="Found" color="success" />;
        case 'low':
          return <Chip size="small" label="Low confidence" color="warning" />;
        case 'ambiguous':
          return <Chip size="small" label="Fits more than one place" variant="outlined" />;
        default:
          return <Chip size="small" label="No match found" variant="outlined" />;
      }
  }
}

function statusNote(state: RowState): string | null {
  if (state.name === 'failed') return state.message;
  if (state.name !== 'done') return null;
  switch (state.result.status) {
    case 'placed':
      return `${state.result.inliers} matching features`;
    case 'low':
      return `Only ${state.result.inliers} features matched: please check the outline`;
    case 'ambiguous':
      return 'Place by hand later (Edit Micrograph Location)';
    default:
      return 'Place by hand later (Edit Micrograph Location)';
  }
}

const PlaceChildrenDialog: React.FC<PlaceChildrenDialogProps> = ({ open, parentMicrographId, onlyIds, onClose }) => {
  const placeMicrograph = useAppStore((state) => state.placeMicrograph);
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<Phase>('matching');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const placerRef = useRef<Placer | null>(null);

  const parent = findMicrographById(useAppStore.getState().project, parentMicrographId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const placer = createPlacer();
    placerRef.current = placer;
    setPhase('matching');
    setRows([]);
    setParentPath(null);
    setError(null);
    setSelectedId(null);
    setThumbnails({});

    const setRow = (id: string, change: Partial<Row>) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...change } : r)));

    const run = async () => {
      const { project } = useAppStore.getState();
      const parentMicrograph = findMicrographById(project, parentMicrographId);
      if (!project || !parentMicrograph?.imagePath || !window.api) {
        setError('The parent micrograph or its image was not found.');
        setRows([]);
        setPhase('review');
        return;
      }
      const folders = await window.api.getProjectFolderPaths(project.id);
      if (!folders) {
        setError('The project folder was not found.');
        setPhase('review');
        return;
      }
      if (cancelled) return;
      const fullParentPath = `${folders.images}/${parentMicrograph.imagePath}`;
      setParentPath(fullParentPath);
      const children: Row[] = unplacedChildren(project, parentMicrographId)
        .filter((c) => c.imagePath && (!onlyIds || onlyIds.includes(c.id)))
        .map((c) => ({
          id: c.id,
          label: c.name || c.imageFilename || 'Unnamed',
          path: `${folders.images}/${c.imagePath}`,
          width: c.imageWidth || c.width || 0,
          height: c.imageHeight || c.height || 0,
          state: { name: 'waiting' },
          checked: false,
        }));
      setRows(children);

      // Small pictures of the children for the list (the tree's own thumbnails)
      for (const child of children) {
        window.api.loadCompositeThumbnail(project.id, child.id).then((url) => {
          if (!cancelled && url) setThumbnails((prev) => ({ ...prev, [child.id]: url }));
        }).catch(() => {});
      }

      const parentImage = {
        path: fullParentPath,
        width: parentMicrograph.imageWidth || parentMicrograph.width || 0,
        height: parentMicrograph.imageHeight || parentMicrograph.height || 0,
      };
      for (const child of children) {
        if (cancelled) return;
        setRow(child.id, { state: { name: 'matching', percent: 0 } });
        try {
          const result = await placer.place(child, parentImage, (_step, percent) => {
            if (!cancelled) setRow(child.id, { state: { name: 'matching', percent } });
          });
          if (cancelled) return;
          setRow(child.id, { state: { name: 'done', result }, checked: result.status === 'placed' && !!result.appMatrix });
          if (result.appMatrix && (result.status === 'placed' || result.status === 'low')) {
            setSelectedId((prev) => prev ?? child.id);
          }
        } catch (e) {
          if (cancelled) return;
          if (e instanceof Error && e.message === 'cancelled') {
            // Stop matching: this one and the rest were not tried
            setRows((prev) => prev.map((r) =>
              r.state.name === 'waiting' || r.state.name === 'matching' ? { ...r, state: { name: 'not tried' } } : r));
            break;
          }
          console.error('[PlaceChildren]', child.label, e);
          setRow(child.id, { state: { name: 'failed', message: e instanceof Error ? e.message : String(e) } });
        }
      }
      if (!cancelled) setPhase('review');
    };

    run().catch((e: unknown) => {
      if (cancelled) return;
      console.error('[PlaceChildren]', e);
      setError(e instanceof Error ? e.message : String(e));
      setPhase('review');
    });
    return () => {
      cancelled = true;
      placer.close();
      placerRef.current = null;
    };
  }, [open, parentMicrographId]);

  const checkedRows = rows.filter((r) => r.checked && usable(r));
  const footprints = useMemo(
    () => rows.filter(usable).map((r) => ({
      matrix: r.state.result.appMatrix,
      width: r.width,
      height: r.height,
      highlighted: r.id === selectedId,
      onClick: () => setSelectedId(r.id),
    })),
    [rows, selectedId],
  );

  const handleStop = () => placerRef.current?.close();

  const handleSave = async () => {
    const { project } = useAppStore.getState();
    const parentMicrograph = findMicrographById(project, parentMicrographId);
    if (!project || !parentMicrograph) return;
    setPhase('saving');
    setError(null);
    const forcedAffine = mustPlaceAffine(project, parentMicrographId);
    const outcomes: Array<{ id: string; outcome: AutoPlacementOutcome }> = [];
    const failed: string[] = [];
    setSaving({ done: 0, total: checkedRows.length });
    // Affine tiles are baked first; the fields are written together afterwards (one undo step)
    for (const row of checkedRows) {
      if (!usable(row)) continue;
      const { result } = row.state;
      try {
        const outcome: AutoPlacementOutcome = result.kind === 'rectangle' && !forcedAffine
          ? { kind: 'rectangle', ...rectangleFields(result.appMatrix, row.width, row.height) }
          : await bakeAffineOutcome(result.appMatrix, row);
        outcomes.push({ id: row.id, outcome });
      } catch (e) {
        console.error('[PlaceChildren] tiles for', row.label, e);
        failed.push(row.label);
      }
      setSaving((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    const parentPxPerCm = parentMicrograph.scalePixelsPerCentimeter || 100;
    const latest = useAppStore.getState().project;
    for (const { id, outcome } of outcomes) {
      const child = findMicrographById(latest, id);
      if (!child) continue;
      placeMicrograph(id, placementUpdates(outcome, parentPxPerCm, child.scalePixelsPerCentimeter, child.opacity ?? 1));
    }
    console.log(`[PlaceChildren] placed ${outcomes.length} of ${checkedRows.length} on ${parentMicrograph.name}`);
    if (outcomes.length > 0) {
      regenerateComposites([...outcomes.map((o) => o.id), parentMicrographId], () => useAppStore.getState().project);
    }
    setSaving(null);
    if (failed.length > 0) {
      setError(`These could not be placed (their overlay tiles could not be made): ${failed.join(', ')}`);
      // Leave the placed ones out of the list; the failed ones stay checked for another try
      const placed = new Set(outcomes.map((o) => o.id));
      setRows((prev) => prev.filter((r) => !placed.has(r.id)));
      setPhase('review');
      return;
    }
    onClose();
  };

  const counts = useMemo(() => {
    const c = { found: 0, low: 0, other: 0 };
    for (const r of rows) {
      if (r.state.name !== 'done') continue;
      if (r.state.result.status === 'placed') c.found++;
      else if (r.state.result.status === 'low') c.low++;
      else c.other++;
    }
    return c;
  }, [rows]);

  const matchingIndex = rows.findIndex((r) => r.state.name === 'matching');
  const parentName = parent?.name || 'this micrograph';

  return (
    <Dialog
      open={open}
      // Backdrop clicks would throw the results away; Escape only when nothing is running
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || phase !== 'review') return;
        onClose();
      }}
      maxWidth="lg"
      fullWidth
      aria-labelledby="place-children-title"
    >
      <DialogTitle id="place-children-title">Place children automatically on {parentName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {phase === 'matching' && rows.length > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Looking for {matchingIndex >= 0 ? `${rows[matchingIndex].label} (${matchingIndex + 1} of ${rows.length})` : 'the images'} on {parentName}...
            </Typography>
          )}
          {phase !== 'matching' && rows.length > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {`Of ${rows.length}: ${[
                `${counts.found} found`,
                counts.low > 0 ? `${counts.low} low confidence` : '',
                counts.other > 0 ? `${counts.other} not found` : '',
              ].filter(Boolean).join(', ')}. `}
              Checked micrographs are placed when you click Place. The others stay unplaced; place them later
              with Edit Micrograph Location.
            </Typography>
          )}
          {phase === 'review' && rows.length === 0 && !error && (
            <Alert severity="info">Every child of {parentName} already has a location.</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {saving && (
            <Box>
              <Typography variant="body2">Placing {Math.min(saving.done + 1, saving.total)} of {saving.total}...</Typography>
              <LinearProgress variant="determinate" value={(100 * saving.done) / Math.max(1, saving.total)} />
            </Box>
          )}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
            <List dense sx={{ width: { xs: '100%', md: 420 }, flexShrink: 0, maxHeight: 520, overflow: 'auto' }}>
              {rows.map((row) => {
                const canCheck = usable(row);
                const note = statusNote(row.state);
                return (
                  <ListItemButton
                    key={row.id}
                    selected={row.id === selectedId}
                    onClick={() => setSelectedId(row.id)}
                    sx={{ alignItems: 'flex-start', gap: 1 }}
                    data-testid="place-children-row"
                  >
                    <Checkbox
                      edge="start"
                      size="small"
                      checked={row.checked && canCheck}
                      disabled={!canCheck || phase === 'saving'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, checked } : r)));
                      }}
                      slotProps={{ input: { 'aria-label': `Place ${row.label}` } }}
                      sx={{ visibility: canCheck ? 'visible' : 'hidden' }}
                    />
                    <Box
                      sx={{
                        width: 56, height: 42, flexShrink: 0, bgcolor: 'action.hover', borderRadius: 0.5,
                        backgroundImage: thumbnails[row.id] ? `url(${thumbnails[row.id]})` : undefined,
                        backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                      }}
                    />
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" noWrap title={row.label}>{row.label}</Typography>
                        {statusChip(row.state)}
                      </Stack>
                      {row.state.name === 'matching' && (
                        <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, row.state.percent))} sx={{ mt: 0.75 }} />
                      )}
                      {note && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{note}</Typography>
                      )}
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
            <Box sx={{ flexGrow: 1, minWidth: 0, width: '100%' }}>
              {parentPath && (
                <FootprintPreview parentPath={parentPath} parentMicrographId={parentMicrographId} footprints={footprints} />
              )}
              {footprints.length > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Outlines show where each found micrograph would go. Click a row or an outline to highlight it.
                </Typography>
              )}
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={phase === 'saving'}>
          Cancel
        </Button>
        {phase === 'matching' && (
          <Button onClick={handleStop} variant="outlined">
            Stop
          </Button>
        )}
        <Button onClick={handleSave} variant="contained" disabled={phase !== 'review' || checkedRows.length === 0}>
          {checkedRows.length === 1 ? 'Place 1 micrograph' : `Place ${checkedRows.length} micrographs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PlaceChildrenDialog;
