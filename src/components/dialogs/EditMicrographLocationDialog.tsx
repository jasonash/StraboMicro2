/**
 * Edit Micrograph Location Dialog
 *
 * Dialog for editing the location/placement of an associated micrograph on its parent.
 * Provides the same Location Method selection as the NewMicrographDialog wizard,
 * followed by the appropriate placement UI (PlacementCanvas or PointPlacementCanvas).
 *
 * Steps:
 * 1. Location Method Selection (radio buttons)
 * 2. Placement UI (depends on method chosen)
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  RadioGroup,
  Radio,
  FormControlLabel,
  Stepper,
  Step,
  StepLabel,
  Box,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import PlacementCanvas from './PlacementCanvas';
import { PointPlacementCanvas } from './PointPlacementCanvas';
import type { MicrographMetadata } from '@/types/project-types';

interface EditMicrographLocationDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string;
}

type LocationMethod = 'Locate as a scaled rectangle' | 'Locate by an approximate point';

export function EditMicrographLocationDialog({
  open,
  onClose,
  micrographId,
}: EditMicrographLocationDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  // State
  const [step, setStep] = useState(0); // 0 = method selection, 1 = placement
  const [locationMethod, setLocationMethod] = useState<LocationMethod>('Locate as a scaled rectangle');
  const [micrograph, setMicrograph] = useState<MicrographMetadata | null>(null);
  const [parentMicrograph, setParentMicrograph] = useState<MicrographMetadata | null>(null);

  // Placement state for rectangle method
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);

  // Placement state for point method
  const [pointX, setPointX] = useState(0);
  const [pointY, setPointY] = useState(0);

  // Load micrograph data when dialog opens
  useEffect(() => {
    if (!open || !project) return;

    const micro = findMicrographById(project, micrographId);
    if (!micro) return;

    setMicrograph(micro);

    // Find parent micrograph
    if (micro.parentID) {
      const parent = findMicrographById(project, micro.parentID);
      setParentMicrograph(parent || null);
    }

    // Determine current location method from existing data
    const hasOffset = !!(micro as { offsetInParent?: unknown }).offsetInParent;
    const hasPoint = !!micro.pointInParent;

    if (hasOffset) {
      setLocationMethod('Locate as a scaled rectangle');
      const offset = (micro as { offsetInParent: { X: number; Y: number } }).offsetInParent;
      setOffsetX(offset.X);
      setOffsetY(offset.Y);
      setRotation(micro.rotation || 0);
      setScaleX(micro.scaleX || 1);
      setScaleY(micro.scaleY || 1);
    } else if (hasPoint) {
      setLocationMethod('Locate by an approximate point');
      setPointX(micro.pointInParent?.X || 0);
      setPointY(micro.pointInParent?.Y || 0);
    } else {
      // Default to rectangle method
      setLocationMethod('Locate as a scaled rectangle');
      setOffsetX(100);
      setOffsetY(100);
      setRotation(0);
      setScaleX(1);
      setScaleY(1);
    }

    setStep(0);
  }, [open, project, micrographId]);

  const handlePlacementChange = (
    newOffsetX: number,
    newOffsetY: number,
    newRotation: number,
    newScaleX?: number,
    newScaleY?: number
  ) => {
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
    setRotation(newRotation);
    if (newScaleX !== undefined) setScaleX(newScaleX);
    if (newScaleY !== undefined) setScaleY(newScaleY);
  };

  const handlePointPlacementChange = (x: number, y: number) => {
    setPointX(x);
    setPointY(y);
  };

  const handleNext = () => {
    if (step === 0) {
      setStep(1);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      setStep(0);
    }
  };

  const handleSave = () => {
    if (!micrograph) return;

    if (locationMethod === 'Locate as a scaled rectangle') {
      updateMicrographMetadata(micrographId, {
        offsetInParent: { X: offsetX, Y: offsetY },
        rotation,
        scaleX,
        scaleY,
        // Clear point placement if switching methods
        pointInParent: undefined,
      });
    } else {
      updateMicrographMetadata(micrographId, {
        pointInParent: { X: pointX, Y: pointY },
        // Clear rectangle placement if switching methods
        offsetInParent: undefined,
        rotation: undefined,
        scaleX: undefined,
        scaleY: undefined,
      });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!micrograph || !parentMicrograph || !project) {
    return null;
  }

  // Build scratch path for the child micrograph image
  const childScratchPath = `${project.id}/images/${micrograph.imageFilename}`;

  const steps = ['Location Method', 'Position'];

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth={step === 1 ? 'lg' : 'sm'}
      fullWidth
    >
      <DialogTitle>Edit Micrograph Location</DialogTitle>

      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Location Method Selection */}
        {step === 0 && (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              Choose how to locate this associated micrograph on its parent image.
            </Typography>
            <RadioGroup
              value={locationMethod}
              onChange={(e) => setLocationMethod(e.target.value as LocationMethod)}
            >
              <FormControlLabel
                value="Locate as a scaled rectangle"
                control={<Radio />}
                label="Locate as a scaled rectangle"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                Interactively position, resize, and rotate the image on the parent (recommended)
              </Typography>

              <FormControlLabel
                value="Locate by an approximate point"
                control={<Radio />}
                label="Locate by an approximate point"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
                Mark a single point showing approximate location
              </Typography>
            </RadioGroup>
          </Stack>
        )}

        {/* Step 1: Placement UI */}
        {step === 1 && (
          <Box>
            {locationMethod === 'Locate as a scaled rectangle' ? (
              <PlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childScratchPath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod="Stretch and Drag"
                initialOffsetX={offsetX}
                initialOffsetY={offsetY}
                initialRotation={rotation}
                initialScaleX={scaleX}
                initialScaleY={scaleY}
                onPlacementChange={handlePlacementChange}
              />
            ) : (
              <PointPlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childScratchPath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod="Use Same Scale as Parent"
                initialOffsetX={pointX}
                initialOffsetY={pointY}
                onPlacementChange={(x, y) => handlePointPlacementChange(x, y)}
              />
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === 1 && (
          <Button onClick={handleBack}>Back</Button>
        )}
        <Button onClick={handleCancel}>Cancel</Button>
        {step === 0 ? (
          <Button onClick={handleNext} variant="contained">
            Next
          </Button>
        ) : (
          <Button onClick={handleSave} variant="contained">
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
