/**
 * Image Stitcher (Tools > Image Stitcher...): overlapping images of one area become one mosaic.
 *
 * Steps: choose the images; "Fitting the images together" (automatic, in workers); review the
 * result on a canvas with the list of images beside it; build the mosaic; save it as an image file.
 *
 * This first version reviews as a viewer: images can be left out or put back, not yet moved by
 * hand, and the mosaic is saved as a file (adding it to the project comes next).
 *
 * Design: docs/image-stitcher-design.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { CheckCircle, Close, ErrorOutlined, RadioButtonUnchecked, RemoveCircleOutlined, Undo } from '@mui/icons-material';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { mosaicName } from '@/utils/mosaicName';
import {
  estimateText, groupText, overlapsText, placedText, progressLines, sizeText, skippedText, tooManyText,
  type ProgressStage,
} from '@/utils/stitchText';
import { coveredRectangle, hasEmptyAreas, type StitchLayout } from '@/services/stitch/stitchLayout';
import { ESTIMATE_FROM, MAX_IMAGES, estimateSeconds } from '@/services/stitch/stitch';
import { workerCount, type StitchRun } from '@/services/stitch/stitchPool';
import { buildGroup, fitImagesTogether, frameOf, newSession, prepareImages, type PreparedImage } from '@/services/stitch/stitchApp';
import { StitchReviewCanvas } from './StitchReviewCanvas';

interface ImageStitcherDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'choose' | 'fitting' | 'review' | 'building' | 'done';

interface ChosenRow {
  path: string;
  name: string;
  state: 'reading' | 'ready' | 'bad';
  image?: PreparedImage;
  error?: string;
}

interface Progress {
  stage: ProgressStage;
  done: number;
  total: number;
  overlaps: number;
  unplaced?: number;
}

const UNITS = ['μm', 'mm', 'cm', 'm', 'inches'];

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export const ImageStitcherDialog: React.FC<ImageStitcherDialogProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<Step>('choose');
  const [session, setSession] = useState('');
  const [rows, setRows] = useState<ChosenRow[]>([]);
  const [scaleValue, setScaleValue] = useState('');
  const [scaleUnit, setScaleUnit] = useState('mm');
  const [workers, setWorkers] = useState(4);
  const [progress, setProgress] = useState<Progress>({ stage: 'reading', done: 0, total: 0, overlaps: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  /** Tile n of the layout is fitted[n] */
  const [fitted, setFitted] = useState<PreparedImage[]>([]);
  const [layout, setLayout] = useState<StitchLayout | null>(null);
  const [leftOut, setLeftOut] = useState<ReadonlySet<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [fill, setFill] = useState<'black' | 'white'>('black');
  const [cropOn, setCropOn] = useState(false);
  const [buildRows, setBuildRows] = useState({ done: 0, total: 0 });
  const [built, setBuilt] = useState<{ width: number; height: number; scale: number } | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const run = useRef<StitchRun | null>(null);
  const nextIndex = useRef(0);
  const reading = useRef<Promise<unknown>>(Promise.resolve());
  /** Counts up on every open and close, so late answers of an earlier session are dropped */
  const life = useRef(0);
  /** Counts up on every "Fit Images Together" and every cancel of one, for the same reason */
  const attempt = useRef(0);
  /** The rows, changed here first and then shown: handlers always see the latest list */
  const rowsNow = useRef<ChosenRow[]>([]);
  const changeRows = useCallback((change: (rows: ChosenRow[]) => ChosenRow[]) => {
    rowsNow.current = change(rowsNow.current);
    setRows(rowsNow.current);
  }, []);

  // A new session each time the dialog opens; everything of the session is removed when it closes
  useEffect(() => {
    if (!open) return undefined;
    const mine = ++life.current;
    const id = newSession();
    setSession(id);
    setStep('choose');
    changeRows(() => []);
    setProblem(null);
    setLayout(null);
    setFitted([]);
    setLeftOut(new Set());
    setSelected(null);
    setFill('black');
    setCropOn(false);
    setBuilt(null);
    setSavedTo(null);
    setConfirmDiscard(false);
    nextIndex.current = 0;
    reading.current = Promise.resolve();
    window.api?.stitch.machine().then(
      (m) => {
        if (life.current === mine) setWorkers(workerCount(m.processors, m.memoryGb));
      },
      () => undefined,
    );
    return () => {
      life.current++;
      attempt.current++;
      run.current?.close();
      run.current = null;
      void window.api?.stitch.cancelBuild(id);
      void window.api?.stitch.cleanup(id);
    };
  }, [open, changeRows]);

  // ---------------------------------------------------------------- step 1: choose

  const addPaths = useCallback((paths: string[]) => {
    const mine = life.current;
    const have = new Set(rowsNow.current.map((r) => r.path));
    const fresh = paths.filter((p, k) => !have.has(p) && paths.indexOf(p) === k);
    if (fresh.length === 0) return;
    setProblem(null);
    const firstIndex = nextIndex.current;
    nextIndex.current += fresh.length;
    changeRows((old) => [...old, ...fresh.map((path): ChosenRow => ({ path, name: fileName(path), state: 'reading' }))]);
    const work = prepareImages(session, fresh, {
      firstIndex,
      cancelled: () => life.current !== mine,
      onOne: (outcome, position) => {
        if (life.current !== mine) return;
        const path = fresh[position];
        changeRows((now) => now.map((r) => {
          if (r.path !== path) return r;
          return outcome.ok ? { ...r, state: 'ready', image: outcome.image } : { ...r, state: 'bad', error: outcome.error };
        }));
      },
    });
    // Reads queue up one behind the other, so "Fit Images Together" can wait for all of them
    reading.current = Promise.all([reading.current, work.catch(() => undefined)]);
  }, [session, changeRows]);

  const handleAddImages = async () => {
    const paths = await window.api?.openMultipleTiffDialog();
    if (paths) addPaths(paths);
  };

  const handleAddFolder = async () => {
    const result = await window.api?.stitch.chooseFolder();
    if (!result || result.canceled) return;
    if (result.paths.length === 0) setProblem('That folder has no images (TIFF, JPEG, PNG or BMP).');
    else addPaths(result.paths);
  };

  const usable = rows.filter((r) => r.state !== 'bad');
  const bad = rows.filter((r) => r.state === 'bad');
  const tooMany = usable.length > MAX_IMAGES;

  // ---------------------------------------------------------------- step 2: fitting

  const handleFit = async () => {
    const mine = ++attempt.current;
    const current = () => attempt.current === mine;
    setProblem(null);
    setStep('fitting');
    setProgress({ stage: 'reading', done: rowsNow.current.filter((r) => r.state !== 'reading').length, total: rowsNow.current.length, overlaps: 0 });
    try {
      await reading.current;
      if (!current()) return;
      const ready = rowsNow.current.flatMap((r) => (r.state === 'ready' && r.image ? [r.image] : []));
      if (ready.length < 2) {
        setProblem('At least two usable images are needed.');
        setStep('choose');
        return;
      }
      const started = await fitImagesTogether(ready, {
        onProgress: (p) => {
          if (current()) setProgress(p);
        },
      });
      if (!current()) {
        started.close();
        return;
      }
      run.current = started;
      const result = await started.done;
      if (!current()) return;
      if (!result.layout) {
        // Cancelled
        run.current = null;
        setStep('choose');
        return;
      }
      setFitted(ready);
      setLayout(result.layout);
      setLeftOut(new Set());
      setSelected(null);
      setCropOn(false);
      setStep('review');
    } catch (error) {
      if (!current()) return;
      console.error('[Stitch] Fitting failed:', error);
      run.current?.close();
      run.current = null;
      setProblem(`The images could not be fitted together: ${error instanceof Error ? error.message : String(error)}`);
      setStep('choose');
    }
  };

  const handleCancelFit = () => {
    if (run.current) {
      // done resolves with no layout, and handleFit goes back to the list
      run.current.cancel();
      return;
    }
    // Still reading the images, or the workers are starting: leave this attempt
    attempt.current++;
    setStep('choose');
  };

  // ---------------------------------------------------------------- step 3: review

  const main = layout ? layout.groups[0] : null;
  const frame = useMemo(() => (layout && main ? frameOf(layout, main, leftOut) : null), [layout, main, leftOut]);
  const empty = useMemo(() => (layout && frame ? hasEmptyAreas(layout, frame) : false), [layout, frame]);
  const cropRect = useMemo(() => (layout && frame && empty ? coveredRectangle(layout, frame) : null), [layout, frame, empty]);
  const crop = cropOn && cropRect ? cropRect : null;
  const included = main ? main.tiles.filter((t) => !leftOut.has(t)) : [];
  const placedCount = main && main.tiles.length > 1 ? main.tiles.length : 0;
  const otherGroups = layout ? layout.groups.slice(1) : [];

  const toggleLeftOut = (tile: number) => {
    setLeftOut((old) => {
      const next = new Set(old);
      if (next.has(tile)) next.delete(tile);
      else next.add(tile);
      return next;
    });
  };

  const handleBack = () => {
    run.current?.close();
    run.current = null;
    setLayout(null);
    setStep('choose');
  };

  // ---------------------------------------------------------------- step 4: build

  const handleBuild = async () => {
    if (!layout || !main || !frame) return;
    const mine = life.current;
    setProblem(null);
    setBuildRows({ done: 0, total: crop ? crop.height : frame.height });
    setStep('building');
    const result = await buildGroup(
      session,
      fitted,
      layout,
      main,
      { leftOut, fill: fill === 'white' ? [255, 255, 255] : [0, 0, 0], crop: crop ?? undefined },
      (done, total) => {
        if (life.current === mine) setBuildRows({ done, total });
      },
    ).catch((error: unknown) => ({ success: false, cancelled: false, error: error instanceof Error ? error.message : String(error), width: undefined, height: undefined }));
    if (life.current !== mine) return;
    if (result.success && result.width && result.height) {
      setBuilt({ width: result.width, height: result.height, scale: frame.scale });
      setSavedTo(null);
      setStep('done');
    } else {
      if (!result.cancelled) setProblem(`The mosaic could not be built: ${result.error ?? 'unknown error'}`);
      setStep('review');
    }
  };

  // ---------------------------------------------------------------- step 5: done

  const handleSave = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const result = await window.api?.stitch.saveWithDialog(session, mosaicName(included.map((t) => fitted[t].path)));
      if (result?.success && result.path) setSavedTo(result.path);
      else if (result && !result.canceled) setProblem(`The mosaic could not be saved: ${result.error ?? 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const scaleNumber = Number(scaleValue);
  const mosaicScale = built && scaleValue.trim() !== '' && Number.isFinite(scaleNumber) && scaleNumber > 0 ? scaleNumber * built.scale : null;

  // ---------------------------------------------------------------- closing

  const busy = step === 'fitting' || step === 'building' || saving;
  const requestClose = () => {
    if (busy) return;
    // A fitted layout (and later, placements made by hand) is work worth a question
    if ((step === 'review' || (step === 'done' && !savedTo)) && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const lines = progressLines(progress);
  const title = step === 'choose' ? 'Image Stitcher'
    : step === 'fitting' ? 'Fitting the images together'
    : step === 'review' ? 'Review the mosaic'
    : step === 'building' ? 'Building the mosaic'
    : 'The mosaic is ready';

  const tileRow = (tile: number, action: 'leave-out' | 'put-back' | null) => {
    const image = fitted[tile];
    if (!image) return null;
    return (
      <ListItem
        key={tile}
        disablePadding
        data-testid="stitch-tile-row"
        secondaryAction={action && (
          <Tooltip title={action === 'leave-out' ? 'Leave out of the mosaic' : 'Put back into the mosaic'}>
            <IconButton edge="end" size="small" aria-label={action === 'leave-out' ? `Leave out ${fileName(image.path)}` : `Put back ${fileName(image.path)}`} onClick={() => toggleLeftOut(tile)}>
              {action === 'leave-out' ? <RemoveCircleOutlined fontSize="small" /> : <Undo fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      >
        <ListItemButton dense selected={selected === tile} onClick={() => setSelected(selected === tile ? null : tile)} sx={{ gap: 1, pr: 5 }}>
          <Box component="img" src={image.thumbnail} alt="" sx={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
          <Typography variant="body2" noWrap title={image.path}>{fileName(image.path)}</Typography>
        </ListItemButton>
      </ListItem>
    );
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={closeUnlessEscapeBlocked(requestClose, busy)}
        maxWidth={step === 'review' ? 'xl' : 'md'}
        fullWidth
        aria-labelledby="image-stitcher-title"
      >
        <DialogTitle id="image-stitcher-title">{title}</DialogTitle>

        {step === 'choose' && (
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose the overlapping images of one area. They are fitted together automatically; you check the result before the mosaic is built.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Button variant="outlined" onClick={handleAddImages}>Add Images...</Button>
              <Button variant="outlined" onClick={handleAddFolder}>Add Folder...</Button>
              <Box sx={{ flex: 1 }} />
              {rows.length > 0 && (
                <>
                  <Typography variant="body2" color="text.secondary" data-testid="stitch-count">
                    {rows.length === 1 ? '1 image' : `${rows.length.toLocaleString('en-US')} images`}
                  </Typography>
                  <Button size="small" onClick={() => changeRows(() => [])}>Remove All</Button>
                </>
              )}
            </Stack>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, height: 320, overflow: 'auto' }}>
              {rows.length === 0 ? (
                <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No images chosen yet</Typography>
                </Stack>
              ) : (
                <List dense disablePadding>
                  {rows.map((row) => (
                    <ListItem
                      key={row.path}
                      data-testid="stitch-row"
                      divider
                      secondaryAction={(
                        <IconButton edge="end" size="small" aria-label={`Remove ${row.name}`} onClick={() => changeRows((old) => old.filter((r) => r.path !== row.path))}>
                          <Close fontSize="small" />
                        </IconButton>
                      )}
                      sx={{ gap: 1.5 }}
                    >
                      {row.image ? (
                        <Box component="img" src={row.image.thumbnail} alt="" sx={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
                      ) : (
                        <Stack sx={{ width: 48, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {row.state === 'bad' ? <ErrorOutlined color="warning" /> : <Typography variant="caption" color="text.secondary">...</Typography>}
                        </Stack>
                      )}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap title={row.path}>{row.name}</Typography>
                        {row.state === 'bad' && <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>{row.error}</Typography>}
                      </Box>
                      {row.image && (
                        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, mr: 3 }}>
                          {row.image.width.toLocaleString('en-US')} x {row.image.height.toLocaleString('en-US')}
                        </Typography>
                      )}
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2 }}>
              <Typography variant="body2">Scale of the original images, if known:</Typography>
              <TextField
                size="small"
                value={scaleValue}
                onChange={(event) => setScaleValue(event.target.value)}
                error={scaleValue.trim() !== '' && !(Number(scaleValue) > 0)}
                sx={{ width: 120 }}
                slotProps={{ htmlInput: { 'aria-label': 'Pixels per unit of the original images', inputMode: 'decimal' } }}
              />
              <Typography variant="body2">pixels per</Typography>
              <TextField select size="small" value={scaleUnit} onChange={(event) => setScaleUnit(event.target.value)} sx={{ width: 110 }} slotProps={{ htmlInput: { 'aria-label': 'Unit' } }}>
                {UNITS.map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
              </TextField>
            </Stack>
            {tooMany && <Alert severity="error" sx={{ mt: 2 }}>{tooManyText(usable.length, MAX_IMAGES)}</Alert>}
            {!tooMany && usable.length >= ESTIMATE_FROM && (
              <Alert severity="info" sx={{ mt: 2 }}>{estimateText(usable.length, estimateSeconds(usable.length, workers))}</Alert>
            )}
            {bad.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>{skippedText(bad.length)}</Alert>}
            {problem && <Alert severity="error" sx={{ mt: 2 }}>{problem}</Alert>}
          </DialogContent>
        )}

        {step === 'fitting' && (
          <DialogContent>
            <Stack spacing={1.5} sx={{ py: 1 }}>
              {lines.map((line) => (
                <Box key={line.label}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {line.state === 'done' ? <CheckCircle color="success" fontSize="small" /> : <RadioButtonUnchecked color={line.state === 'now' ? 'primary' : 'disabled'} fontSize="small" />}
                    <Typography variant="body1" color={line.state === 'waiting' ? 'text.disabled' : 'text.primary'} sx={{ flex: 1 }}>{line.label}</Typography>
                    <Typography variant="body2" color="text.secondary">{line.count}</Typography>
                  </Stack>
                  {line.state === 'now' && (
                    <LinearProgress
                      variant={line.percent === null ? 'indeterminate' : 'determinate'}
                      value={line.percent ?? undefined}
                      sx={{ mt: 0.5, ml: 3.5 }}
                    />
                  )}
                </Box>
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
                {progress.stage === 'reading' || progress.stage === 'features' ? ' ' : overlapsText(progress.overlaps)}
              </Typography>
            </Stack>
          </DialogContent>
        )}

        {step === 'review' && layout && (
          <DialogContent sx={{ pt: 0 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }} data-testid="stitch-placed">{placedText(placedCount, layout.tiles.length)}</Typography>
            <Stack direction="row" spacing={2} sx={{ height: '62vh', minHeight: 360 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StitchReviewCanvas session={session} images={fitted} frame={placedCount > 0 ? frame : null} selected={selected} onSelect={setSelected} crop={crop} />
              </Box>
              <Box sx={{ width: 300, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
                <List dense disablePadding>
                  <ListSubheader sx={{ lineHeight: '32px' }}>Placed ({placedCount > 0 ? included.length : 0})</ListSubheader>
                  {placedCount > 0 && included.map((tile) => tileRow(tile, 'leave-out'))}
                  <ListSubheader sx={{ lineHeight: '32px' }}>
                    Not placed ({placedCount > 0 ? otherGroups.reduce((sum, g) => sum + g.tiles.length, 0) : layout.tiles.length})
                  </ListSubheader>
                  {(placedCount > 0 ? otherGroups : layout.groups).map((group) => (
                    <React.Fragment key={group.tiles[0]}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 0.5 }}>{groupText(group.tiles.length)}</Typography>
                      {group.tiles.map((tile) => tileRow(tile, null))}
                    </React.Fragment>
                  ))}
                  <ListSubheader sx={{ lineHeight: '32px' }}>Left out ({placedCount > 0 ? main!.tiles.length - included.length : 0})</ListSubheader>
                  {placedCount > 0 && main!.tiles.filter((t) => leftOut.has(t)).map((tile) => tileRow(tile, 'put-back'))}
                </List>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 1.5, minHeight: 40, flexWrap: 'wrap' }}>
              {placedCount > 0 && frame && included.length > 0 && (
                <Typography variant="body2" data-testid="stitch-size">
                  {crop
                    ? sizeText({ fullWidth: crop.width / frame.scale, fullHeight: crop.height / frame.scale, width: crop.width, height: crop.height, scale: frame.scale })
                    : sizeText(frame)}
                </Typography>
              )}
              {placedCount > 0 && empty && (
                <>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', visibility: crop ? 'hidden' : 'visible' }}>
                    <Typography variant="body2">Fill empty areas with</Typography>
                    <ToggleButtonGroup size="small" exclusive value={fill} onChange={(_event, value: 'black' | 'white' | null) => { if (value) setFill(value); }}>
                      <ToggleButton value="black">Black</ToggleButton>
                      <ToggleButton value="white">White</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                  {cropRect && (
                    <FormControlLabel
                      control={<Checkbox size="small" checked={cropOn} onChange={(event) => setCropOn(event.target.checked)} />}
                      label="Crop to the fully covered rectangle"
                    />
                  )}
                </>
              )}
            </Stack>
            {placedCount === 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                No two of these images were found to overlap. Check that they show neighboring parts of the same area with some overlap, under the same lighting.
              </Alert>
            )}
            {problem && <Alert severity="error" sx={{ mt: 1 }}>{problem}</Alert>}
          </DialogContent>
        )}

        {step === 'building' && (
          <DialogContent>
            <Stack spacing={1} sx={{ py: 2 }}>
              <LinearProgress variant="determinate" value={buildRows.total > 0 ? Math.min(100, (buildRows.done / buildRows.total) * 100) : 0} />
              <Typography variant="body2" color="text.secondary">
                {buildRows.total > 0 ? `${Math.round((buildRows.done / buildRows.total) * 100)}%` : ' '}
              </Typography>
            </Stack>
          </DialogContent>
        )}

        {step === 'done' && built && (
          <DialogContent>
            <Stack spacing={1.5}>
              <Typography variant="body1" data-testid="stitch-built">
                {included.length.toLocaleString('en-US')} images, {built.width.toLocaleString('en-US')} x {built.height.toLocaleString('en-US')} px.
              </Typography>
              {mosaicScale !== null && (
                <Typography variant="body2" color="text.secondary" data-testid="stitch-scale">
                  Scale of the mosaic: {Number(mosaicScale.toPrecision(6)).toLocaleString('en-US')} pixels per {scaleUnit}.
                </Typography>
              )}
              {savedTo && <Alert severity="success">Saved to {savedTo}</Alert>}
              {problem && <Alert severity="error">{problem}</Alert>}
            </Stack>
          </DialogContent>
        )}

        <DialogActions>
          {step === 'choose' && (
            <>
              <Button onClick={requestClose}>Cancel</Button>
              <Button variant="contained" onClick={handleFit} disabled={usable.length < 2 || tooMany}>Fit Images Together</Button>
            </>
          )}
          {step === 'fitting' && (
            <>
              {(progress.stage === 'hard-features' || progress.stage === 'hard-pairs') && <Button onClick={() => run.current?.skipHard()}>Skip</Button>}
              <Button onClick={handleCancelFit}>Cancel</Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button onClick={handleBack}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={requestClose}>Cancel</Button>
              <Button variant="contained" onClick={handleBuild} disabled={placedCount === 0 || included.length === 0}>Build</Button>
            </>
          )}
          {step === 'building' && <Button onClick={() => void window.api?.stitch.cancelBuild(session)}>Cancel</Button>}
          {step === 'done' && (
            <>
              <Button onClick={() => setStep('review')} disabled={saving}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={requestClose} disabled={saving}>Close</Button>
              <Button variant="contained" onClick={handleSave} disabled={saving}>Save as an Image File...</Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={open && confirmDiscard} onClose={() => setConfirmDiscard(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard this mosaic?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {step === 'done' ? 'The mosaic has not been saved. It will be lost.' : 'The fitted layout will be lost.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep Working</Button>
          <Button color="error" onClick={onClose}>Discard</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
