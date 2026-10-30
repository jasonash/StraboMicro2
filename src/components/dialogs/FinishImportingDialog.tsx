/**
 * Finish Importing (Jason, 2026-10-30): the one way to complete micrographs that
 * were batch imported, with or without instrument info. Opened by clicking an
 * incomplete micrograph, and by the end of Batch Import.
 *
 * Steps (src/utils/finishImporting.ts): the micrographs to finish, Rotate / Flip
 * (only while nothing depends on the pixels), Instrument & Image Info and
 * Instrument Data once for all (an image type per micrograph), then how to place
 * them, or their scale. Nothing is saved before the last step before placing:
 * Cancel up to there changes nothing. After it the instrument info is saved, so
 * leaving at the placement step keeps it and the warning dot shows what is left.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  FormControlLabel,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import { asOwnUndoStep } from '@/store/undoHistory';
import type { MicrographMetadata } from '@/types/project-types';
import { canRotate, finishSteps, needsOf, needsText, type FinishStep } from '@/utils/finishImporting';
import { effectiveImageType, imageTypesComplete } from '@/utils/imageTypeChoices';
import { cannotPlaceChildrenReason } from '@/utils/micrographLocation';
import { listPlacedChildren } from '@/utils/copySizePlacement';
import { IDENTITY_ORIENTATION, isIdentityOrientation, type Orientation } from '@/utils/rotationUtils';
import { InstrumentInfoForm } from './InstrumentInfoForm';
import { InstrumentDataForm } from './InstrumentDataForm';
import { ImageTypeRows } from './ImageTypeRows';
import { RotateFlipList } from './RotateFlipList';
import { useInstrumentForms } from './useInstrumentForms';
import { PlaceChoice } from './PlaceChoice';

export type FinishPlacement = 'auto' | 'parent-area' | 'like-sibling' | 'by-hand';

export interface FinishRequest {
  /** The micrographs that can be finished together (finishGroup, or those just imported) */
  ids: string[];
  /** Just imported: no list to choose from, and Batch Import already asked about rotating */
  importedCount?: number;
}

interface FinishImportingDialogProps {
  request: FinishRequest | null;
  onClose: () => void;
  /** The steps here are done and nothing is left to place */
  onDone: (ids: string[]) => void;
  /** Go on with placing these (or setting their scale, 'by-hand' for reference micrographs) */
  onPlace: (how: FinishPlacement, ids: string[]) => void;
}

export function FinishImportingDialog({ request, onClose, onDone, onPlace }: FinishImportingDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const forms = useInstrumentForms();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [activeStep, setActiveStep] = useState(0);
  const [orientations, setOrientations] = useState<Record<string, Orientation>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The steps before placing are saved: no way back, and the steps left are placing */
  const [saved, setSaved] = useState(false);

  const requestKey = request?.ids.join(',') ?? '';
  useEffect(() => {
    setUnchecked(new Set());
    setActiveStep(0);
    setOrientations({});
    setPreviews({});
    setSaving(null);
    setError(null);
    setSaved(false);
    forms.reset();
    // Only when another set of micrographs opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const all = useMemo(
    () => (request?.ids ?? []).map((id) => findMicrographById(project, id)).filter((m): m is MicrographMetadata => !!m),
    [request, project]
  );
  const rows = all.filter((m) => !unchecked.has(m.id));
  const imported = request?.importedCount !== undefined;
  const steps: FinishStep[] = saved
    ? finishSteps(project, rows, { showList: false, skipRotation: true })
    : finishSteps(project, rows, { showList: !imported && all.length > 1, skipRotation: imported });
  const step = steps[activeStep];
  const label = (m: MicrographMetadata) => m.name || m.imageFilename || 'Unnamed Micrograph';
  const rowItems = (list: MicrographMetadata[]) => list.map((m) => ({ id: m.id, name: label(m) }));

  const rotatable = rows.filter((m) => canRotate(project, m));
  const needInstrument = rows.filter((m) => needsOf(m).instrument);
  const parentId = all[0]?.parentID ?? null;
  const parent = parentId ? findMicrographById(project, parentId) : null;
  const parentName = parent?.name || 'the parent';

  // Previews of the Rotate / Flip step, one at a time: images can be very large
  const onRotateStep = step === 'Rotate / Flip';
  const rotatableKey = rotatable.map((m) => m.id).join(',');
  useEffect(() => {
    if (!onRotateStep || !project?.id || !window.api) return;
    let cancelled = false;
    (async () => {
      const folders = await window.api!.getProjectFolderPaths(project.id);
      if (!folders) return;
      for (const m of rotatable) {
        if (cancelled) return;
        if (previews[m.id] !== undefined) continue;
        let url = '';
        try {
          const tiles = await window.api!.loadImageWithTiles(`${folders.images}/${m.imagePath || m.id}`);
          url = (tiles && (await window.api!.loadMedium(tiles.hash))) || '';
        } catch (e) {
          console.error('[FinishImporting] Failed to load a preview:', e);
        }
        if (!cancelled) setPreviews((prev) => ({ ...prev, [m.id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRotateStep, rotatableKey, project?.id]);

  /** Turn the pixels and save the instrument info of the checked micrographs */
  const saveBeforePlacing = async (): Promise<boolean> => {
    if (!project?.id || !window.api) return false;
    const api = window.api;
    const turning = rotatable.filter((m) => !isIdentityOrientation(orientations[m.id] ?? IDENTITY_ORIENTATION));
    setError(null);
    if (turning.length > 0) {
      setSaving({ done: 0, total: turning.length });
      const folders = await api.getProjectFolderPaths(project.id);
      if (!folders) return false;
      for (const m of turning) {
        const orientation = orientations[m.id] ?? IDENTITY_ORIENTATION;
        try {
          const path = `${folders.images}/${m.imagePath || m.id}`;
          const result = await api.rotateImage(path, orientation.rotation, orientation.flip);
          await api.loadImageWithTiles(path);
          updateMicrographMetadata(m.id, {
            imageWidth: result.width,
            imageHeight: result.height,
            width: result.width,
            height: result.height,
          });
          setOrientations((prev) => ({ ...prev, [m.id]: IDENTITY_ORIENTATION }));
          const latest = useAppStore.getState().project;
          if (latest) {
            api.generateCompositeThumbnail(latest.id, m.id, latest)
              .then(() => window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId: m.id } })))
              .catch((err) => console.error('[FinishImporting] Failed to regenerate a thumbnail:', err));
          }
        } catch (e) {
          console.error('[FinishImporting] Error rotating', m.id, e);
          setSaving(null);
          setError(`${label(m)} could not be rotated: ${e instanceof Error ? e.message : 'unknown error'}. Rotated images stay rotated; nothing else was saved.`);
          return false;
        }
        setSaving((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setSaving(null);
    }
    if (needInstrument.length > 0) {
      const instrument = forms.buildInstrument();
      asOwnUndoStep(() => {
        for (const m of needInstrument) {
          updateMicrographMetadata(m.id, {
            imageType: effectiveImageType(forms.info.imageType, forms.ownImageTypes, m.id) || undefined,
            instrument,
            needsInstrumentInfo: false,
          });
        }
      });
    }
    return true;
  };

  // What is left once the steps before placing are saved
  const toPlace = rows.filter((m) => m.parentID);
  const nextStep = steps[activeStep + 1];
  const isLastBeforePlacing = nextStep === undefined || nextStep === 'Placement' || nextStep === 'Scale';

  const handleNext = async () => {
    if (!isLastBeforePlacing) {
      setActiveStep((prev) => prev + 1);
      return;
    }
    const ok = await saveBeforePlacing();
    if (!ok) return;
    const ids = rows.map((m) => m.id);
    if (nextStep) {
      setSaved(true);
      setActiveStep(0);
      return;
    }
    // One left to place or scale goes straight to its own dialog
    const latest = useAppStore.getState().project;
    const remaining = ids.filter((id) => {
      const m = findMicrographById(latest, id);
      return m && (needsOf(m).location || needsOf(m).scale);
    });
    if (remaining.length > 0) onPlace('by-hand', remaining);
    else onDone(ids);
  };

  const canGoOn = () => {
    if (saving) return false;
    if (step === 'Micrographs') return rows.length > 0;
    if (step === 'Instrument & Image Info') {
      return imageTypesComplete(forms.info, forms.ownImageTypes, needInstrument.map((m) => m.id));
    }
    return true;
  };

  const placeReason = parent ? cannotPlaceChildrenReason(parent) : null;
  const hasPlaced = !!parentId && listPlacedChildren(project, parentId).length > 0;
  const placingIds = toPlace.filter((m) => needsOf(m).location || needsOf(m).scale).map((m) => m.id);
  const scalingIds = rows.filter((m) => !m.parentID && needsOf(m).scale).map((m) => m.id);
  const onPlacingStep = step === 'Placement' || step === 'Scale';

  return (
    <Dialog open={!!request} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth aria-labelledby="finish-importing-title">
      <DialogTitle id="finish-importing-title">Finish Importing</DialogTitle>
      <DialogContent>
        {steps.length > 1 && (
          <Stepper activeStep={activeStep} sx={{ pt: 1, pb: 3 }}>
            {steps.map((name) => (
              <Step key={name}>
                <StepLabel>{name}</StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
        <Stack spacing={2}>
          {imported && !saved && (
            <Alert severity="success">
              {request?.importedCount === 1 ? '1 micrograph imported.' : `${request?.importedCount} micrographs imported.`}
            </Alert>
          )}

          {step === 'Micrographs' && (
            <>
              <Typography variant="body2">
                These micrographs are not finished yet. Finish them together, or uncheck any you want to leave for later.
              </Typography>
              <Stack>
                {all.map((m) => (
                  <Stack key={m.id} data-testid="finish-row">
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={!unchecked.has(m.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUnchecked((prev) => {
                              const next = new Set(prev);
                              if (checked) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            });
                          }}
                        />
                      }
                      label={label(m)}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4, mt: -1 }}>{needsText(m)}</Typography>
                  </Stack>
                ))}
              </Stack>
            </>
          )}

          {step === 'Rotate / Flip' && (
            <>
              <Alert severity="info">
                Optional. Rotating or flipping permanently changes an image's pixels, and can only be done
                before the image is placed. Leave them as they are if they are the right way round.
              </Alert>
              <RotateFlipList
                rows={rowItems(rotatable)}
                orientations={orientations}
                previews={previews}
                onChange={(id, o) => setOrientations((prev) => ({ ...prev, [id]: o }))}
              />
            </>
          )}

          {step === 'Instrument & Image Info' && (
            <>
              <InstrumentInfoForm
                formData={forms.info}
                onFormChange={forms.onInfoChange}
                onInstrumentFromDatabase={forms.onInstrumentFromDatabase}
                existingMicrographs={forms.existingMicrographs}
                onCopyFromExisting={forms.onCopyFromExisting}
                showCopyFromExisting
              />
              <ImageTypeRows
                instrumentType={forms.info.instrumentType}
                dataType={forms.info.dataType}
                commonImageType={forms.info.imageType}
                own={forms.ownImageTypes}
                rows={rowItems(needInstrument)}
                onChange={forms.setOwnImageType}
              />
            </>
          )}

          {step === 'Instrument Data' && (
            <InstrumentDataForm
              formData={forms.data}
              detectors={forms.detectors}
              instrumentType={forms.info.instrumentType}
              onFormChange={forms.onDataChange}
              onDetectorChange={forms.onDetectorChange}
              onAddDetector={forms.onAddDetector}
              onRemoveDetector={forms.onRemoveDetector}
            />
          )}

          {step === 'Placement' && (
            <>
              <Typography variant="body2">
                How should the {placingIds.length} micrographs be placed on {parentName}? You can also do this later.
              </Typography>
              {placeReason && <Alert severity="info">{placeReason}. Until then they can only be placed by hand.</Alert>}
              {!placeReason && (
                <PlaceChoice
                  label={`Find each one on ${parentName}...`}
                  detail="Automatic: matches features in the images and shows what it found before saving."
                  onClick={() => onPlace('auto', placingIds)}
                />
              )}
              {!placeReason && (
                <PlaceChoice
                  label={`Cover the full area of ${parentName}...`}
                  detail="For example, element maps collected with it."
                  onClick={() => onPlace('parent-area', placingIds)}
                />
              )}
              {hasPlaced && (
                <PlaceChoice
                  label="Copy the placement of a placed micrograph..."
                  detail="Each gets that micrograph's location, scale and rotation."
                  onClick={() => onPlace('like-sibling', placingIds)}
                />
              )}
              <PlaceChoice
                label="Place by hand, one at a time..."
                detail="Choose a location method for each, in Edit Micrograph Location."
                onClick={() => onPlace('by-hand', placingIds)}
              />
            </>
          )}

          {step === 'Scale' && (
            <>
              <Typography variant="body2">The {scalingIds.length} micrographs need a scale. You can also do this later.</Typography>
              <PlaceChoice label="Set the scale of each, one at a time..." onClick={() => onPlace('by-hand', scalingIds)} />
            </>
          )}

          {saving && (
            <Stack spacing={0.5}>
              <LinearProgress variant="determinate" value={(saving.done / Math.max(saving.total, 1)) * 100} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Rotating {saving.done} of {saving.total}...</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!!saving}>{onPlacingStep ? 'Later' : 'Cancel'}</Button>
        {!onPlacingStep && steps.length > 1 && (
          <Button onClick={() => setActiveStep((prev) => prev - 1)} disabled={activeStep === 0 || !!saving}>Back</Button>
        )}
        {!onPlacingStep && (
          <Button variant="contained" onClick={() => void handleNext()} disabled={!canGoOn()}>
            {isLastBeforePlacing && (nextStep === undefined) && rows.every((m) => !needsOf(m).location && !needsOf(m).scale) ? 'Finish' : 'Next'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
