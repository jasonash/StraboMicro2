/**
 * Edit Micrograph Location Dialog
 *
 * Dialog for editing the location/placement of an associated micrograph on its parent.
 * Provides the same Location Method and Scale Method selection as the NewMicrographDialog wizard,
 * followed by the appropriate placement UI (PlacementCanvas or PointPlacementCanvas).
 *
 * Steps:
 * 1. Location Method Selection (radio buttons)
 * 2. Scale Method Selection (radio buttons - options depend on location method)
 * 3. Placement UI (depends on methods chosen)
 */

import { useState, useEffect, useMemo } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
type ScaleMethod =
  | 'Trace Scale Bar and Drag'
  | 'Stretch and Drag'
  | 'Trace Scale Bar'
  | 'Pixel Conversion Factor'
  | 'Provide Width/Height of Image'
  | 'Copy Size from Existing Micrograph'
  | '';

export function EditMicrographLocationDialog({
  open,
  onClose,
  micrographId,
}: EditMicrographLocationDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  // State
  const [step, setStep] = useState(0); // 0 = location method, 1 = scale method, 2 = placement
  const [locationMethod, setLocationMethod] = useState<LocationMethod>('Locate as a scaled rectangle');
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>('Stretch and Drag');
  const [copySizeFromMicrographId, setCopySizeFromMicrographId] = useState<string>('');
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

  // Get sibling micrographs with matching aspect ratio for "Copy Size" option
  const matchingSiblings = useMemo(() => {
    if (!project || !micrograph || !parentMicrograph) return [];

    const isScaledRectangle = locationMethod === 'Locate as a scaled rectangle';
    const currentAspectRatio = (micrograph.imageWidth || 800) / (micrograph.imageHeight || 600);
    const tolerance = 0.01;
    const siblings: Array<{ id: string; name: string; width: number; height: number }> = [];

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          // Must be a sibling (same parent), not self, and have dimensions
          if (micro.parentID === parentMicrograph.id &&
              micro.id !== micrograph.id &&
              micro.imageWidth && micro.imageHeight) {

            // Check placement type matches current location method
            const hasOffsetInParent = !!(micro as { offsetInParent?: unknown }).offsetInParent;
            const hasPointInParent = !!micro.pointInParent;

            if (isScaledRectangle && !hasOffsetInParent) continue;
            if (!isScaledRectangle && !hasPointInParent) continue;

            const ratio = micro.imageWidth / micro.imageHeight;
            if (Math.abs(ratio - currentAspectRatio) / currentAspectRatio < tolerance) {
              siblings.push({
                id: micro.id,
                name: micro.name,
                width: micro.imageWidth,
                height: micro.imageHeight,
              });
            }
          }
        }
      }
    }
    return siblings;
  }, [project, micrograph, parentMicrograph, locationMethod]);

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
      setScaleMethod('Stretch and Drag'); // Default for editing
      const offset = (micro as { offsetInParent: { X: number; Y: number } }).offsetInParent;
      setOffsetX(offset.X);
      setOffsetY(offset.Y);
      setRotation(micro.rotation || 0);
      setScaleX(micro.scaleX || 1);
      setScaleY(micro.scaleY || 1);
    } else if (hasPoint) {
      setLocationMethod('Locate by an approximate point');
      setScaleMethod('Trace Scale Bar'); // Default for point method
      setPointX(micro.pointInParent?.X || 0);
      setPointY(micro.pointInParent?.Y || 0);
    } else {
      // Default to rectangle method
      setLocationMethod('Locate as a scaled rectangle');
      setScaleMethod('Stretch and Drag');
      setOffsetX(100);
      setOffsetY(100);
      setRotation(0);
      setScaleX(1);
      setScaleY(1);
    }

    setCopySizeFromMicrographId('');
    setStep(0);
  }, [open, project, micrographId]);

  // Reset scale method when location method changes
  useEffect(() => {
    if (locationMethod === 'Locate as a scaled rectangle') {
      if (scaleMethod !== 'Trace Scale Bar and Drag' &&
          scaleMethod !== 'Stretch and Drag' &&
          scaleMethod !== 'Pixel Conversion Factor' &&
          scaleMethod !== 'Provide Width/Height of Image' &&
          scaleMethod !== 'Copy Size from Existing Micrograph') {
        setScaleMethod('Stretch and Drag');
      }
    } else {
      if (scaleMethod !== 'Trace Scale Bar' &&
          scaleMethod !== 'Pixel Conversion Factor' &&
          scaleMethod !== 'Provide Width/Height of Image' &&
          scaleMethod !== 'Copy Size from Existing Micrograph') {
        setScaleMethod('Trace Scale Bar');
      }
    }
  }, [locationMethod]);

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

  const canProceedFromScaleMethod = (): boolean => {
    if (!scaleMethod) return false;
    if (scaleMethod === 'Copy Size from Existing Micrograph' && !copySizeFromMicrographId) {
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1 && canProceedFromScaleMethod()) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  // Get copy size data from selected sibling
  const getCopySizeData = () => {
    if (scaleMethod !== 'Copy Size from Existing Micrograph' || !copySizeFromMicrographId || !micrograph) {
      return null;
    }

    const sibling = findMicrographById(project, copySizeFromMicrographId);
    if (!sibling) return null;

    const isRectangle = locationMethod === 'Locate as a scaled rectangle';

    if (isRectangle) {
      const siblingOffset = (sibling as { offsetInParent?: { X: number; Y: number } }).offsetInParent;
      if (!siblingOffset || !sibling.scaleX || !sibling.imageWidth || !micrograph.imageWidth) return null;

      // Calculate the pixelsPerCm for the sibling, then apply to our image
      const siblingPixelsPerCm = sibling.scaleX * sibling.imageWidth;
      const newImageScaleX = siblingPixelsPerCm / micrograph.imageWidth;

      return {
        xOffset: siblingOffset.X,
        yOffset: siblingOffset.Y,
        rotation: sibling.rotation || 0,
        newImagePixelsPerCm: siblingPixelsPerCm,
        scaleX: newImageScaleX,
        scaleY: newImageScaleX, // Uniform scaling
      };
    } else {
      // Point placement
      if (!sibling.pointInParent) return null;
      return {
        pointX: sibling.pointInParent.X,
        pointY: sibling.pointInParent.Y,
      };
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

  const steps = ['Location Method', 'Scale Method', 'Position'];
  const isScaledRectangle = locationMethod === 'Locate as a scaled rectangle';
  const hasMatchingAspectRatio = matchingSiblings.length > 0;

  // Get copy size data for placement canvas
  const copySizeData = getCopySizeData();

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth={step === 2 ? 'lg' : 'sm'}
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

        {/* Step 1: Scale Method Selection */}
        {step === 1 && (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              How do you wish to set the scale?
            </Typography>
            <RadioGroup
              value={scaleMethod}
              onChange={(e) => setScaleMethod(e.target.value as ScaleMethod)}
            >
              {isScaledRectangle && (
                <>
                  <FormControlLabel
                    value="Trace Scale Bar and Drag"
                    control={<Radio />}
                    label="Trace Scale Bar and Drag"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                    Interactive: trace scale bar, then drag/resize/rotate the image
                  </Typography>

                  <FormControlLabel
                    value="Stretch and Drag"
                    control={<Radio />}
                    label="Stretch and Drag"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                    Interactive: stretch to fit, then drag/resize/rotate the image
                  </Typography>
                </>
              )}

              {!isScaledRectangle && (
                <>
                  <FormControlLabel
                    value="Trace Scale Bar"
                    control={<Radio />}
                    label="Trace Scale Bar"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                    Trace a scale bar to set the scale
                  </Typography>
                </>
              )}

              <FormControlLabel
                value="Pixel Conversion Factor"
                control={<Radio />}
                label="Pixel Conversion Factor"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                Enter pixels per unit manually
              </Typography>

              <FormControlLabel
                value="Provide Width/Height of Image"
                control={<Radio />}
                label="Provide Width/Height of Image"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                Specify the physical dimensions of the image
              </Typography>

              {hasMatchingAspectRatio && (
                <>
                  <FormControlLabel
                    value="Copy Size from Existing Micrograph"
                    control={<Radio />}
                    label="Copy Size from Existing Micrograph"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
                    Copy position and scale from a sibling micrograph
                  </Typography>

                  {scaleMethod === 'Copy Size from Existing Micrograph' && (
                    <FormControl sx={{ ml: 4, mt: 1, minWidth: 300 }} size="small">
                      <InputLabel>Select Micrograph</InputLabel>
                      <Select
                        value={copySizeFromMicrographId}
                        label="Select Micrograph"
                        onChange={(e) => setCopySizeFromMicrographId(e.target.value)}
                      >
                        {matchingSiblings.map((sibling) => (
                          <MenuItem key={sibling.id} value={sibling.id}>
                            {sibling.name} ({sibling.width} × {sibling.height})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </>
              )}
            </RadioGroup>
          </Stack>
        )}

        {/* Step 2: Placement UI */}
        {step === 2 && (
          <Box>
            {isScaledRectangle ? (
              <PlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childScratchPath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod={scaleMethod}
                initialOffsetX={copySizeData?.xOffset ?? offsetX}
                initialOffsetY={copySizeData?.yOffset ?? offsetY}
                initialRotation={copySizeData?.rotation ?? rotation}
                initialScaleX={copySizeData?.scaleX ?? scaleX}
                initialScaleY={copySizeData?.scaleY ?? scaleY}
                copySizePixelsPerCm={copySizeData?.newImagePixelsPerCm}
                onPlacementChange={handlePlacementChange}
              />
            ) : (
              <PointPlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childScratchPath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod={scaleMethod}
                initialOffsetX={copySizeData?.pointX ?? pointX}
                initialOffsetY={copySizeData?.pointY ?? pointY}
                onPlacementChange={(x, y) => handlePointPlacementChange(x, y)}
              />
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step > 0 && (
          <Button onClick={handleBack}>Back</Button>
        )}
        <Button onClick={handleCancel}>Cancel</Button>
        {step < 2 ? (
          <Button
            onClick={handleNext}
            variant="contained"
            disabled={step === 1 && !canProceedFromScaleMethod()}
          >
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
