/**
 * "Place automatically on parent": finds where the image sits on its parent (src/services/autoPlace)
 * and shows the result for the user to check. Used by the New Micrograph wizard and Edit Location.
 *
 * - Rectangle result: the placement canvas opens with the overlay already in place (drag, turn,
 *   resize as with Stretch and Drag).
 * - Affine result (a skew was needed, or an ancestor is placed with 3-Point Registration, see
 *   docs/drop-to-place-design.md D6): affine tiles are baked as 3-Point Registration does, a
 *   preview shows the footprint, and "Adjust points" opens the registration with three points set.
 * - Ambiguous or no match: says so and offers to place by hand.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { useLatest } from '@/hooks/useLatest';
import { findMicrographById } from '@/store/helpers';
import { bakeAffineOutcome, mustPlaceAffine, placeAutomatically, type AutoPlaceResult } from '@/services/autoPlace/autoPlace';
import { rectangleFields, type AutoPlacementOutcome, type RectanglePlacement } from '@/services/autoPlace/placementFields';
import PlacementCanvas from './PlacementCanvas';
import { AffineRegistrationModal } from './AffineRegistrationModal';
import FootprintPreview from './FootprintPreview';

export type { AutoPlacementOutcome };

export type HandPlacementMethod = 'Locate as a scaled rectangle' | '3-Point Registration';

interface AutoPlacementPanelProps {
  parentMicrographId: string;
  /** The image being placed: scratch path in the wizard, project image in Edit Location */
  detailPath: string;
  detailWidth: number;
  detailHeight: number;
  initialOpacity?: number;
  /** null while matching, or when nothing usable was found */
  onOutcome: (outcome: AutoPlacementOutcome | null) => void;
  onOpacityChange?: (opacity: number) => void;
  onPlaceByHand: (method: HandPlacementMethod) => void;
}

type Phase =
  | { name: 'matching'; step: string; percent: number }
  | { name: 'baking' }
  | { name: 'done'; result: AutoPlaceResult }
  | { name: 'failed'; message: string };

const AutoPlacementPanel: React.FC<AutoPlacementPanelProps> = ({
  parentMicrographId,
  detailPath,
  detailWidth,
  detailHeight,
  initialOpacity = 1,
  onOutcome,
  onOpacityChange,
  onPlaceByHand,
}) => {
  const [phase, setPhase] = useState<Phase>({ name: 'matching', step: 'Starting', percent: 0 });
  const [rectangle, setRectangle] = useState<RectanglePlacement | null>(null);
  const [affine, setAffine] = useState<Extract<AutoPlacementOutcome, { kind: 'affine' }> | null>(null);
  const [forcedAffine, setForcedAffine] = useState(false);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onOutcomeRef = useLatest(onOutcome);

  useEffect(() => {
    let cancelled = false;
    let cancelRun: (() => void) | null = null;
    setPhase({ name: 'matching', step: 'Starting', percent: 0 });
    setRectangle(null);
    setAffine(null);
    onOutcomeRef.current(null);

    const run = async () => {
      const { project } = useAppStore.getState();
      const parent = findMicrographById(project, parentMicrographId);
      if (!project || !parent?.imagePath || !window.api) {
        setPhase({ name: 'failed', message: 'The parent micrograph or its image was not found.' });
        return;
      }
      const folders = await window.api.getProjectFolderPaths(project.id);
      if (!folders) {
        setPhase({ name: 'failed', message: 'The project folder was not found.' });
        return;
      }
      const fullParentPath = `${folders.images}/${parent.imagePath}`;
      if (cancelled) return;
      setParentPath(fullParentPath);
      const parentWidth = parent.imageWidth || parent.width || 0;
      const parentHeight = parent.imageHeight || parent.height || 0;
      const mustBeAffine = mustPlaceAffine(project, parentMicrographId);
      setForcedAffine(mustBeAffine);

      const placing = placeAutomatically(
        { path: detailPath, width: detailWidth, height: detailHeight },
        { path: fullParentPath, width: parentWidth, height: parentHeight },
        (step, percent) => {
          if (!cancelled) setPhase({ name: 'matching', step, percent });
        },
      );
      cancelRun = placing.cancel;
      const result = await placing.promise;
      if (cancelled) return;
      if (!result.appMatrix || result.status === 'none' || result.status === 'ambiguous') {
        setPhase({ name: 'done', result });
        return;
      }
      if (result.kind === 'rectangle' && !mustBeAffine) {
        const fields = rectangleFields(result.appMatrix, detailWidth, detailHeight);
        setRectangle(fields);
        onOutcomeRef.current({ kind: 'rectangle', ...fields });
        setPhase({ name: 'done', result });
        return;
      }
      // Affine: bake the overlay tiles the way the 3-Point Registration modal does
      setPhase({ name: 'baking' });
      const outcome = await bakeAffineOutcome(result.appMatrix, { path: detailPath, width: detailWidth, height: detailHeight });
      if (cancelled) return;
      setAffine(outcome);
      onOutcomeRef.current(outcome);
      setPhase({ name: 'done', result });
    };

    run().catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AutoPlacement]', error);
      setPhase({ name: 'failed', message });
    });
    return () => {
      cancelled = true;
      cancelRun?.();
    };
  }, [parentMicrographId, detailPath, detailWidth, detailHeight, attempt, onOutcomeRef]);

  const handleCanvasChange = useCallback(
    (offsetX: number, offsetY: number, rotation: number, scaleX?: number) => {
      setRectangle((prev) => {
        const next = { offsetX, offsetY, rotation, scale: scaleX ?? prev?.scale ?? 1 };
        onOutcomeRef.current({ kind: 'rectangle', ...next });
        return next;
      });
    },
    [onOutcomeRef],
  );

  const handOptions = (
    <Stack direction="row" spacing={1}>
      <Button variant="outlined" onClick={() => onPlaceByHand('Locate as a scaled rectangle')}>
        Place as a scaled rectangle
      </Button>
      <Button variant="outlined" onClick={() => onPlaceByHand('3-Point Registration')}>
        Use 3-Point Registration
      </Button>
    </Stack>
  );

  if (phase.name === 'matching' || phase.name === 'baking') {
    const percent = phase.name === 'matching' ? phase.percent : 100;
    return (
      <Stack spacing={2} sx={{ py: 4 }}>
        <Typography variant="body1">
          {phase.name === 'matching' ? 'Looking for this image on its parent...' : 'Preparing the overlay...'}
        </Typography>
        <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, percent))} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {phase.name === 'matching' ? phase.step : 'Making the skewed overlay tiles'}
        </Typography>
      </Stack>
    );
  }

  if (phase.name === 'failed') {
    return (
      <Stack spacing={2}>
        <Alert severity="error">Automatic placement stopped: {phase.message}</Alert>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </Stack>
        {handOptions}
      </Stack>
    );
  }

  const { result } = phase;
  if (result.status === 'none' || result.status === 'ambiguous') {
    return (
      <Stack spacing={2}>
        {result.status === 'none' ? (
          <Alert severity="info">
            No match found. Automatic placement works best when both images show the same kind of view
            (PPL on PPL, XPL on XPL) and the image is no more than about 8 times finer than its parent.
          </Alert>
        ) : (
          <Alert severity="warning">
            This image fits more than one place on the parent (a repeating pattern), so it was not placed.
          </Alert>
        )}
        <Typography variant="body2">Place it by hand instead:</Typography>
        {handOptions}
      </Stack>
    );
  }

  const confidence =
    result.status === 'placed' ? (
      <Alert severity="success">
        Found it ({result.inliers} matching features). Check the position and adjust it if needed.
      </Alert>
    ) : (
      <Alert severity="warning">
        Low confidence, please check: only {result.inliers} features matched. Compare the overlay with the
        parent before you finish.
      </Alert>
    );

  if (rectangle) {
    return (
      <Stack spacing={2}>
        {confidence}
        <PlacementCanvas
          parentMicrographId={parentMicrographId}
          childScratchPath={detailPath}
          childWidth={detailWidth}
          childHeight={detailHeight}
          scaleMethod="Stretch and Drag"
          initialPlacement={rectangle}
          initialOpacity={initialOpacity}
          onPlacementChange={handleCanvasChange}
          onOpacityChange={onOpacityChange}
        />
      </Stack>
    );
  }

  if (affine) {
    return (
      <Stack spacing={2}>
        {confidence}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {forcedAffine
            ? 'Its parent is placed with 3-Point Registration, so this placement is saved the same way.'
            : 'The image needed a slight skew to fit, so it is saved like a 3-Point Registration.'}
        </Typography>
        {parentPath && (
          <FootprintPreview
            parentPath={parentPath}
            parentMicrographId={parentMicrographId}
            footprints={[{ matrix: affine.matrix, width: detailWidth, height: detailHeight }]}
            maxWidth={800}
          />
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setShowRegistration(true)}>Adjust points</Button>
        </Stack>
        <AffineRegistrationModal
          open={showRegistration}
          onClose={() => setShowRegistration(false)}
          parentMicrographId={parentMicrographId}
          overlayImagePath={detailPath}
          overlayWidth={detailWidth}
          overlayHeight={detailHeight}
          overlayImageHash={affine.tileHash}
          existingControlPoints={affine.controlPoints}
          onApply={(matrix, controlPoints, boundsOffset, transformedWidth, transformedHeight, tileHash) => {
            const outcome = { kind: 'affine' as const, matrix, controlPoints, boundsOffset, transformedWidth, transformedHeight, tileHash };
            setAffine(outcome);
            onOutcomeRef.current(outcome);
          }}
        />
      </Stack>
    );
  }
  return null;
};

export default AutoPlacementPanel;
