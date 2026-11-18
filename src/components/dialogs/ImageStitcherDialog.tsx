/**
 * Image Stitcher (Tools > Image Stitcher...): overlapping images of one area become one mosaic.
 *
 * Steps: choose the images; "Fitting the images together" (automatic, in workers); review the
 * result on a canvas with the list of images beside it; build the mosaic; save it as an image file.
 *
 * The built mosaic goes into the project or to a file. From Tools > Image Stitcher... the last
 * step offers a new reference micrograph, an associated micrograph (both continue in New
 * Micrograph) or an image file. Opened by "Stitch Images..." in New Micrograph or the New Project
 * wizard (purpose "pick"), the last step hands the mosaic back to that dialog.
 *
 * On the review screen the layout can be changed by hand (stitchEdit.ts): an image dragged,
 * turned or nudged on the canvas, an image or group that was not placed dragged in from the
 * list, images left out; a drop is followed by a search for the exact fit there (snap). Undo,
 * Redo and Reset to Automatic cover every change.
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
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddCircleOutlined, CheckCircle, Close, ErrorOutlined, RadioButtonUnchecked, Redo, RemoveCircleOutlined, RestartAlt, Undo, WarningAmber,
} from '@mui/icons-material';
import { closeUnlessEscapeBlocked } from '@/utils/dialogClose';
import { mosaicName } from '@/utils/mosaicName';
import {
  estimateText, graphicsText, groupText, magnificationText, overlapsText, placedText, progressLines, sizeText, skippedText, tooManyText,
  type ProgressStage,
} from '@/utils/stitchText';
import type { AffineMatrix } from '@/utils/affineTransform';
import { coveredRectangle, groupOfTile, hasEmptyAreas, otherMagnifications, type MosaicFrame, type Overlap, type StitchGroup, type StitchLayout } from '@/services/stitch/stitchLayout';
import {
  change, deltaInGroup, dropPlacement, leaveOut, mainGroup, moveInMosaic, otherGroups as groupsNotPlaced, pieceOf, placeOnMosaic, putBack, redo,
  resetTile, separateGroup, snapSides, startEdit, startHistory, tileStatuses, undo, type EditHistory, type StitchEdit,
} from '@/services/stitch/stitchEdit';
import { ESTIMATE_FROM, MAX_IMAGES, estimateSeconds } from '@/services/stitch/stitch';
import { workerCount, type StitchRun } from '@/services/stitch/stitchPool';
import {
  buildGroup, fitImagesTogether, frameOf, handOverMosaic, newSession, prepareImages,
  type MosaicTarget, type PreparedImage, type StitchedMosaic,
} from '@/services/stitch/stitchApp';
import { originalsOf } from '@/services/stitch/keptOriginals';
import { useAppStore } from '@/store';
import { useCanCreate } from '@/hooks/usePermissions';
import { STITCH_DRAG_TYPE, StitchReviewCanvas } from './StitchReviewCanvas';

interface ImageStitcherDialogProps {
  open: boolean;
  onClose: () => void;
  /** "pick": opened by a dialog that wants an image; the last step hands the mosaic to onUse */
  purpose?: 'tools' | 'pick';
  /** The mosaic for the dialog that asked (purpose "pick"); the stitcher closes itself after */
  onUse?: (mosaic: StitchedMosaic) => void;
  /** Tools route: the mosaic and where the user wants it; the stitcher closes itself after */
  onAddToProject?: (mosaic: StitchedMosaic, target: MosaicTarget) => void;
}

type Destination = 'reference' | 'associated' | 'file';

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

export const ImageStitcherDialog: React.FC<ImageStitcherDialogProps> = ({ open, onClose, purpose = 'tools', onUse, onAddToProject }) => {
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
  /** What the automatic pass found (Reset to Automatic goes back to it) */
  const [automatic, setAutomatic] = useState<StitchLayout | null>(null);
  /** The layout as changed by hand since, with its undo steps */
  const [history, setHistory] = useState<EditHistory | null>(null);
  /** Per tile: rectangles around burned-in graphics (a scale bar, a label), full-size pixels */
  const [graphicAreas, setGraphicAreas] = useState<Array<Array<{ x: number; y: number; width: number; height: number }>>>([]);
  /** An exact fit is being looked for where an image was dropped */
  const [snapping, setSnapping] = useState(false);
  /** What the last change by hand came to ("Snapped to fit.") */
  const [message, setMessage] = useState<string | null>(null);
  const viewCenter = useRef<(() => { x: number; y: number }) | null>(null);
  const edit = history ? history.now : null;
  const layout = edit ? edit.layout : null;
  const leftOut: ReadonlySet<number> = useMemo(() => edit?.leftOut ?? new Set<number>(), [edit]);
  const [selected, setSelected] = useState<number | null>(null);
  const [fill, setFill] = useState<'black' | 'white'>('black');
  const [cropOn, setCropOn] = useState(false);
  const [buildRows, setBuildRows] = useState({ done: 0, total: 0 });
  /** The mosaic as built: its size, and the frame and crop it was built from (the originals' places follow from them) */
  const [built, setBuilt] = useState<{ width: number; height: number; scale: number; frame: MosaicFrame; crop: { left: number; top: number } | null } | null>(null);
  /** Also add the original images as associated micrographs of the mosaic (decision 28: off unless chosen) */
  const [keepOriginals, setKeepOriginals] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [destination, setDestination] = useState<Destination>('file');
  const [sampleChoice, setSampleChoice] = useState('');
  const [parentChoice, setParentChoice] = useState('');
  /** The mosaic is on its way to New Micrograph / the dialog that asked */
  const [handing, setHanding] = useState(false);

  // Where the mosaic can go in the open project (Tools route)
  const project = useAppStore((state) => state.project);
  const mayCreate = useCanCreate();
  const samples = useMemo(() => (project?.datasets ?? []).flatMap((dataset) =>
    (dataset.samples ?? []).map((sample) => ({ id: sample.id, label: `${dataset.name} / ${sample.label || sample.name}` }))), [project]);
  const micrographs = useMemo(() => (project?.datasets ?? []).flatMap((dataset) =>
    (dataset.samples ?? []).flatMap((sample) =>
      (sample.micrographs ?? []).map((micrograph) => ({ id: micrograph.id, label: `${sample.label || sample.name} / ${micrograph.name}` })))), [project]);
  const offersProject = purpose === 'tools' && !!onAddToProject && !!project && mayCreate;

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
    setAutomatic(null);
    setHistory(null);
    setSnapping(false);
    setMessage(null);
    setFitted([]);
    setSelected(null);
    setFill('black');
    setCropOn(false);
    setBuilt(null);
    setKeepOriginals(false);
    setSavedTo(null);
    setConfirmDiscard(false);
    setHanding(false);
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
      setAutomatic(result.layout);
      setGraphicAreas(result.graphicAreas);
      setHistory(startHistory(startEdit(result.layout)));
      setMessage(null);
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

  const main = edit ? mainGroup(edit) : null;
  const frame = useMemo(() => (layout && main ? frameOf(layout, main, leftOut) : null), [layout, main, leftOut]);
  const empty = useMemo(() => (layout && frame ? hasEmptyAreas(layout, frame) : false), [layout, frame]);
  const cropRect = useMemo(() => (layout && frame && empty ? coveredRectangle(layout, frame) : null), [layout, frame, empty]);
  const crop = cropOn && cropRect ? cropRect : null;
  const included = main ? main.tiles.filter((t) => !leftOut.has(t)) : [];
  /** How many images the automatic pass fitted together (0: no two of them) */
  const placedCount = automatic && automatic.groups[0].tiles.length > 1 ? automatic.groups[0].tiles.length : 0;
  const otherGroups = edit ? groupsNotPlaced(edit) : [];
  const statuses = useMemo(() => (edit ? tileStatuses(edit) : {}), [edit]);
  const piece = useMemo(() => (edit && selected !== null ? pieceOf(edit, selected) : undefined), [edit, selected]);
  /** Images of the mosaic with a scale bar or label burned in */
  const withGraphics = included.filter((t) => (graphicAreas[t]?.length ?? 0) > 0);
  /** Images of the mosaic at another magnification than the rest */
  const oddOnes = useMemo(
    () => (main && included.length > 2 ? otherMagnifications({ tiles: included, placements: main.placements }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [main, leftOut],
  );

  /** A change by hand: one undo step (changes with the same joins text one after the other are one step) */
  const applyEdit = (next: StitchEdit, joins?: string) => {
    setHistory((old) => (old ? change(old, next, joins) : old));
  };

  const toggleLeftOut = (tile: number) => {
    if (!edit) return;
    setMessage(null);
    applyEdit(edit.leftOut.has(tile) ? putBack(edit, tile) : leaveOut(edit, tile));
  };

  /** The exact fit near where tiles were dropped, looked for in a worker; null when there is none */
  const findSnap = async (moved: StitchGroup, target: StitchGroup, rough: AffineMatrix): Promise<{ groupToTarget: AffineMatrix; overlaps: Overlap[] } | null> => {
    if (!layout || !run.current || target.tiles.length === 0) return null;
    setSnapping(true);
    setMessage('Looking for an exact fit...');
    try {
      return await run.current.snap(layout, moved, target, rough);
    } catch (error) {
      console.warn('[Stitch] Snap failed:', error);
      return null;
    } finally {
      setSnapping(false);
    }
  };

  const SNAPPED = 'Snapped to fit.';
  const BY_HAND = 'No exact fit was found there. The image stays where you put it, marked as placed by hand.';

  /** Tiles of the mosaic dragged, turned or nudged on the canvas (delta in saved mosaic pixels) */
  const handleMove = async (tiles: number[], deltaInMosaic: AffineMatrix, how: 'drag' | 'nudge') => {
    if (!edit || !frame || snapping) return;
    const mine = life.current;
    const delta = deltaInGroup(edit, frame, deltaInMosaic);
    if (!delta) return;
    if (how === 'nudge') {
      setMessage(null);
      applyEdit(moveInMosaic(edit, tiles, delta, null), `nudge ${tiles.join()}`);
      return;
    }
    const sides = snapSides(edit, tiles);
    const snap = sides ? await findSnap(sides.moved, sides.target, delta) : null;
    if (life.current !== mine) return;
    applyEdit(snap ? moveInMosaic(edit, tiles, snap.groupToTarget, snap.overlaps) : moveInMosaic(edit, tiles, delta, null));
    setMessage(snap ? SNAPPED : BY_HAND);
  };

  /** An image or group that is not part of the mosaic dropped on it at a point (saved mosaic pixels) */
  const handlePlace = async (tile: number, point?: { x: number; y: number }) => {
    if (!edit || !frame || !main || snapping) return;
    const mine = life.current;
    const group = groupOfTile(edit.layout, tile);
    if (group === main) return;
    const rough = dropPlacement(edit, frame, group, point ?? viewCenter.current?.() ?? { x: frame.width / 2, y: frame.height / 2 });
    if (!rough) return;
    const targetTiles = main.tiles.filter((t) => !edit.leftOut.has(t));
    const target: StitchGroup = { tiles: targetTiles, placements: Object.fromEntries(targetTiles.map((t) => [t, main.placements[t]])) };
    const snap = await findSnap(group, target, rough);
    if (life.current !== mine) return;
    applyEdit(placeOnMosaic(edit, group, snap ? snap.groupToTarget : rough, snap ? snap.overlaps : null));
    setSelected(tile);
    setMessage(snap ? SNAPPED : BY_HAND);
  };

  const handleUndo = () => {
    setMessage(null);
    setHistory((old) => (old ? undo(old) : old));
  };
  const handleRedo = () => {
    setMessage(null);
    setHistory((old) => (old ? redo(old) : old));
  };
  const handleResetAll = () => {
    if (!automatic || !edit) return;
    setMessage(null);
    setSelected(null);
    applyEdit(startEdit(automatic));
  };
  const isChanged = !!edit && !!automatic && (edit.layout !== automatic || edit.leftOut.size > 0);

  const handleBack = () => {
    run.current?.close();
    run.current = null;
    setHistory(null);
    setAutomatic(null);
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
      { leftOut, fill: fill === 'white' ? [255, 255, 255] : [0, 0, 0], crop: crop ?? undefined, masks: graphicAreas },
      (done, total) => {
        if (life.current === mine) setBuildRows({ done, total });
      },
    ).catch((error: unknown) => ({ success: false, cancelled: false, error: error instanceof Error ? error.message : String(error), width: undefined, height: undefined }));
    if (life.current !== mine) return;
    if (result.success && result.width && result.height) {
      setBuilt({ width: result.width, height: result.height, scale: frame.scale, frame, crop: crop ? { left: crop.left, top: crop.top } : null });
      setSavedTo(null);
      // Where it goes by default: the sample or micrograph the user is working in
      const state = useAppStore.getState();
      const sample = samples.find((x) => x.id === state.activeSampleId) ?? samples[0];
      const parent = micrographs.find((x) => x.id === state.activeMicrographId) ?? micrographs[0];
      setSampleChoice(sample?.id ?? '');
      setParentChoice(parent?.id ?? '');
      setDestination(!offersProject ? 'file' : sample ? 'reference' : parent ? 'associated' : 'file');
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

  /** Images left out of the mosaic that are at another magnification: kept with the originals, at their place (decision 29) */
  const leftOutForMagnification = useMemo(() => {
    if (!main || main.tiles.length < 3) return [];
    return otherMagnifications(main).map((o) => o.tile).filter((t) => leftOut.has(t));
  }, [main, leftOut]);
  const originalsCount = included.length + leftOutForMagnification.length;
  const offersOriginals = purpose === 'pick' || (offersProject && destination !== 'file');

  /** The mosaic leaves the stitcher: to the dialog that asked, or to New Micrograph for the chosen place */
  const handleHandOver = async () => {
    const target: MosaicTarget | null = purpose === 'pick' ? null
      : destination === 'reference' && sampleChoice ? { sampleId: sampleChoice, parentMicrographId: null }
      : destination === 'associated' && parentChoice ? { sampleId: null, parentMicrographId: parentChoice }
      : null;
    if (purpose !== 'pick' && !target) return;
    const mine = life.current;
    setHanding(true);
    setProblem(null);
    try {
      const mosaic = await handOverMosaic(
        session,
        mosaicName(included.map((t) => fitted[t].path)),
        mosaicScale !== null ? { pixelsPerUnit: mosaicScale, unit: scaleUnit } : null,
        keepOriginals && built && main ? originalsOf(fitted, main, built.frame, built.crop, leftOutForMagnification) : undefined,
      );
      if (life.current !== mine) {
        void window.api?.stitch.discardHanded(mosaic.path);
        return;
      }
      if (target) onAddToProject?.(mosaic, target);
      else onUse?.(mosaic);
      onClose();
    } catch (error) {
      if (life.current !== mine) return;
      setProblem(`The mosaic could not be added: ${error instanceof Error ? error.message : String(error)}`);
      setHanding(false);
    }
  };

  // ---------------------------------------------------------------- closing

  const busy = step === 'fitting' || step === 'building' || saving || handing || snapping;
  const requestClose = () => {
    if (busy) return;
    // A fitted layout (and later, placements made by hand) is work worth a question
    if ((step === 'review' || (step === 'done' && (!savedTo || purpose === 'pick'))) && !confirmDiscard) {
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

  /** One image in the list. where: its section. A row of "Not placed" can be dragged onto the canvas. */
  const tileRow = (tile: number, where: 'placed' | 'not-placed' | 'left-out') => {
    const image = fitted[tile];
    if (!image || !edit) return null;
    const name = fileName(image.path);
    const status = where === 'placed' ? statuses[tile] : undefined;
    return (
      <ListItem
        key={tile}
        disablePadding
        data-testid="stitch-tile-row"
        data-status={status ?? ''}
        draggable={where === 'not-placed' && !snapping}
        onDragStart={(event) => {
          event.dataTransfer.setData(STITCH_DRAG_TYPE, String(tile));
          event.dataTransfer.effectAllowed = 'move';
        }}
        secondaryAction={where !== 'not-placed' && (
          <Stack direction="row">
            {where === 'placed' && edit.changed.has(tile) && automatic && (
              <Tooltip title="Reset to automatic">
                <span>
                  <IconButton size="small" aria-label={`Reset ${name} to automatic`} disabled={snapping} onClick={() => { setMessage(null); applyEdit(resetTile(edit, automatic, tile)); }}>
                    <RestartAlt fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Tooltip title={where === 'placed' ? 'Leave out of the mosaic' : 'Put back into the mosaic'}>
              <span>
                <IconButton edge="end" size="small" aria-label={where === 'placed' ? `Leave out ${name}` : `Put back ${name}`} disabled={snapping} onClick={() => toggleLeftOut(tile)}>
                  {where === 'placed' ? <RemoveCircleOutlined fontSize="small" /> : <Undo fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}
      >
        <ListItemButton dense selected={selected === tile} onClick={() => setSelected(selected === tile ? null : tile)} sx={{ gap: 1, pr: where === 'placed' && edit.changed.has(tile) ? 9 : 5 }}>
          <Box component="img" src={image.thumbnail} alt="" draggable={false} sx={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap title={image.path}>{name}</Typography>
            {status === 'weak' && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'warning.main' }}>
                <WarningAmber sx={{ fontSize: 14 }} />
                <Typography variant="caption">Weak overlap: check this seam</Typography>
              </Stack>
            )}
            {status === 'hand' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Placed by hand</Typography>}
            {where === 'placed' && (graphicAreas[tile]?.length ?? 0) > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Scale bar or label</Typography>}
          </Box>
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

        {step === 'review' && layout && edit && main && (
          <DialogContent sx={{ pt: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="subtitle1" data-testid="stitch-placed" sx={{ flex: 1 }}>{placedText(placedCount, layout.tiles.length)}</Typography>
              <Button size="small" startIcon={<Undo />} onClick={handleUndo} disabled={snapping || !history || history.past.length === 0}>Undo</Button>
              <Button size="small" startIcon={<Redo />} onClick={handleRedo} disabled={snapping || !history || history.future.length === 0}>Redo</Button>
              <Button size="small" startIcon={<RestartAlt />} onClick={handleResetAll} disabled={snapping || !isChanged}>Reset to Automatic</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Click an image to select it. Drag the selected image to move it, turn it with the handle above it, or nudge it with the arrow keys. Drag an image that was not placed from the list onto the mosaic.
            </Typography>
            <Stack direction="row" spacing={2} sx={{ height: '58vh', minHeight: 340 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StitchReviewCanvas
                  session={session}
                  images={fitted}
                  frame={frame}
                  selected={selected}
                  onSelect={setSelected}
                  crop={crop}
                  graphicAreas={graphicAreas}
                  statuses={statuses}
                  piece={piece}
                  busy={snapping}
                  onMove={(tiles, delta, how) => void handleMove(tiles, delta, how)}
                  onDropGroup={(tile, point) => void handlePlace(tile, point)}
                  viewCenterRef={viewCenter}
                />
              </Box>
              <Box sx={{ width: 320, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
                <List dense disablePadding>
                  <ListSubheader sx={{ lineHeight: '32px' }}>Placed ({included.length})</ListSubheader>
                  {included.map((tile) => tileRow(tile, 'placed'))}
                  <ListSubheader sx={{ lineHeight: '32px' }}>
                    Not placed ({otherGroups.reduce((sum, g) => sum + g.tiles.length, 0)})
                  </ListSubheader>
                  {otherGroups.map((group) => (
                    <React.Fragment key={group.tiles[0]}>
                      <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 0.5 }} data-testid="stitch-group">
                        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{groupText(group.tiles.length)}</Typography>
                        {group.tiles.length > 1 && (
                          <Button size="small" disabled={snapping} onClick={() => { setMessage(null); applyEdit(separateGroup(edit, group)); }} sx={{ minWidth: 0, py: 0 }}>Separate</Button>
                        )}
                        <Tooltip title="Place on the mosaic, in the middle of the view (or drag it there)">
                          <span>
                            <IconButton size="small" aria-label={`Place ${fileName(fitted[group.tiles[0]]?.path ?? '')} on the mosaic`} disabled={snapping || !frame} onClick={() => void handlePlace(group.tiles[0])}>
                              <AddCircleOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      {group.tiles.map((tile) => tileRow(tile, 'not-placed'))}
                    </React.Fragment>
                  ))}
                  <ListSubheader sx={{ lineHeight: '32px' }}>Left out ({main.tiles.length - included.length})</ListSubheader>
                  {main.tiles.filter((t) => leftOut.has(t)).map((tile) => tileRow(tile, 'left-out'))}
                </List>
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" data-testid="stitch-message" sx={{ mt: 1, minHeight: 20 }}>
              {message ?? ' '}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 0.5, minHeight: 40, flexWrap: 'wrap' }}>
              {frame && included.length > 1 && (
                <Typography variant="body2" data-testid="stitch-size">
                  {crop
                    ? sizeText({ fullWidth: crop.width / frame.scale, fullHeight: crop.height / frame.scale, width: crop.width, height: crop.height, scale: frame.scale })
                    : sizeText(frame)}
                </Typography>
              )}
              {frame && included.length > 1 && empty && (
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
            {withGraphics.length > 0 && included.length > 1 && (
              <Alert severity="info" sx={{ mt: 1, py: 0 }} data-testid="stitch-graphics">{graphicsText(withGraphics.length)}</Alert>
            )}
            {oddOnes.map(({ tile, factor }) => (
              <Alert
                key={tile}
                severity="warning"
                sx={{ mt: 1, py: 0 }}
                data-testid="stitch-magnification"
                action={<Button color="inherit" size="small" disabled={snapping} onClick={() => toggleLeftOut(tile)} sx={{ whiteSpace: 'nowrap' }}>Leave Out</Button>}
              >
                {magnificationText(fileName(fitted[tile]?.path ?? ''), factor)}
              </Alert>
            ))}
            {placedCount === 0 && included.length < 2 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                No two of these images were found to overlap. Check that they show neighboring parts of the same area with some overlap, under the same lighting. You can also place them by hand: drag an image from the list onto the canvas.
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
              {offersProject && (
                <RadioGroup value={destination} onChange={(event) => setDestination(event.target.value as Destination)}>
                  <FormControlLabel value="reference" control={<Radio size="small" />} disabled={samples.length === 0 || handing} label="Add to the project as a new reference micrograph" />
                  {destination === 'reference' && (
                    <TextField select size="small" label="Sample" value={sampleChoice} onChange={(event) => setSampleChoice(event.target.value)} disabled={handing} sx={{ ml: 3.5, mb: 1, maxWidth: 480 }}>
                      {samples.map((sample) => <MenuItem key={sample.id} value={sample.id}>{sample.label}</MenuItem>)}
                    </TextField>
                  )}
                  <FormControlLabel value="associated" control={<Radio size="small" />} disabled={micrographs.length === 0 || handing} label="Add to the project as an associated micrograph" />
                  {destination === 'associated' && (
                    <TextField select size="small" label="Parent micrograph" value={parentChoice} onChange={(event) => setParentChoice(event.target.value)} disabled={handing} sx={{ ml: 3.5, mb: 1, maxWidth: 480 }}>
                      {micrographs.map((micrograph) => <MenuItem key={micrograph.id} value={micrograph.id}>{micrograph.label}</MenuItem>)}
                    </TextField>
                  )}
                  <FormControlLabel value="file" control={<Radio size="small" />} disabled={handing} label="Save as an image file" />
                </RadioGroup>
              )}
              {offersOriginals && (
                <Box>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={keepOriginals} disabled={handing} onChange={(event) => setKeepOriginals(event.target.checked)} />}
                    label={`Also add the ${originalsCount.toLocaleString('en-US')} original images as associated micrographs of the mosaic`}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 3.5 }}>
                    They keep their full detail and are placed where they belong on the mosaic. They start hidden, so you see the mosaic itself; show one with the eye icon beside it in the tree, or all with Show All Associated Micrographs in the mosaic's menu.
                  </Typography>
                </Box>
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
              <Button onClick={handleBack} disabled={snapping}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={requestClose} disabled={snapping}>Cancel</Button>
              <Button variant="contained" onClick={handleBuild} disabled={snapping || included.length < 2}>Build</Button>
            </>
          )}
          {step === 'building' && <Button onClick={() => void window.api?.stitch.cancelBuild(session)}>Cancel</Button>}
          {step === 'done' && (
            <>
              <Button onClick={() => setStep('review')} disabled={saving || handing}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={requestClose} disabled={saving || handing}>{purpose === 'pick' || (offersProject && !savedTo) ? 'Cancel' : 'Close'}</Button>
              {purpose === 'pick' ? (
                <>
                  <Button onClick={handleSave} disabled={saving || handing}>Save as an Image File...</Button>
                  <Button variant="contained" onClick={handleHandOver} disabled={saving || handing}>Use This Mosaic</Button>
                </>
              ) : offersProject && destination !== 'file' ? (
                <Button variant="contained" onClick={handleHandOver} disabled={saving || handing}>Continue</Button>
              ) : (
                <Button variant="contained" onClick={handleSave} disabled={saving || handing}>Save as an Image File...</Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={open && confirmDiscard} onClose={() => setConfirmDiscard(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard this mosaic?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {step !== 'done' ? (isChanged ? 'The fitted layout and the changes you made to it will be lost.' : 'The fitted layout will be lost.')
              : savedTo ? 'The mosaic will not be added to the project.'
              : purpose === 'pick' || offersProject ? 'The mosaic has not been added to the project or saved. It will be lost.'
              : 'The mosaic has not been saved. It will be lost.'}
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
