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

  // Opacity state for associated micrograph overlay
  const [opacity, setOpacity] = useState(1);

  // Flip state for associated micrograph
  const [isFlipped, setIsFlipped] = useState(false);

  // Scale data state (for "Trace Scale Bar" methods)
  const [hasScaleData, setHasScaleData] = useState(false);

  // Point placement state (for "Locate as a point" method)
  const [hasPointPlaced, setHasPointPlaced] = useState(false);

  // Project folder paths for constructing image paths
  const [imagesFolder, setImagesFolder] = useState<string>('');

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

  // Release memory when dialog closes to prevent accumulation
  // This is critical when opening/closing the dialog for multiple micrographs
  useEffect(() => {
    if (!open) {
      // Dialog just closed - release Sharp/libvips memory
      window.api?.releaseMemory().catch((err) => {
        console.error('[EditMicrographLocationDialog] Error releasing memory:', err);
      });
    }
  }, [open]);

  // Load project folder paths when dialog opens
  useEffect(() => {
    if (!open || !project) return;

    const loadProjectFolderPaths = async () => {
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);
      if (folderPaths) {
        setImagesFolder(folderPaths.images);
      }
    };

    loadProjectFolderPaths();
  }, [open, project]);

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
      setOpacity(micro.opacity ?? 1);
    } else if (hasPoint) {
      setLocationMethod('Locate by an approximate point');
      setScaleMethod('Trace Scale Bar'); // Default for point method
      setPointX(micro.pointInParent?.X || 0);
      setPointY(micro.pointInParent?.Y || 0);
    } else {
      // Default to rectangle method
      setLocationMethod('Locate as a scaled rectangle');
      setScaleMethod('Stretch and Drag');
      // Use 0, 0 to trigger centering logic in PlacementCanvas
      setOffsetX(0);
      setOffsetY(0);
      setRotation(0);
      setScaleX(1);
      setScaleY(1);
    }

    setCopySizeFromMicrographId('');
    setIsFlipped(false);
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
    console.log('[EditMicrographLocationDialog] handlePlacementChange called:', {
      newOffsetX,
      newOffsetY,
      newRotation,
      newScaleX,
      newScaleY,
    });
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
    setRotation(newRotation);
    if (newScaleX !== undefined) setScaleX(newScaleX);
    if (newScaleY !== undefined) setScaleY(newScaleY);
  };

  const handlePointPlacementChange = (x: number, y: number) => {
    setPointX(x);
    setPointY(y);
    setHasPointPlaced(true);
  };

  // Handle scale data changes from PlacementCanvas
  const handleScaleDataChange = (data: {
    scaleBarLineLengthPixels?: number;
    scaleBarPhysicalLength?: number;
    scaleBarUnits?: string;
    pixels?: number;
    physicalLength?: number;
    pixelUnits?: string;
    imageWidthPhysical?: number;
    imageHeightPhysical?: number;
    sizeUnits?: string;
  }) => {
    // Check if we have valid scale data based on the scale method
    let hasValidScaleData = false;

    if (scaleMethod === 'Trace Scale Bar and Drag' || scaleMethod === 'Trace Scale Bar') {
      hasValidScaleData = !!(
        data.scaleBarLineLengthPixels &&
        data.scaleBarPhysicalLength &&
        data.scaleBarUnits
      );
    } else if (scaleMethod === 'Pixel Conversion Factor') {
      hasValidScaleData = !!(
        data.pixels &&
        data.physicalLength &&
        data.pixelUnits
      );
    } else if (scaleMethod === 'Provide Width/Height of Image') {
      hasValidScaleData = !!(
        data.imageWidthPhysical &&
        data.imageHeightPhysical &&
        data.sizeUnits
      );
    }

    setHasScaleData(hasValidScaleData);
  };

  // Check if scale method requires scale data input
  const requiresScaleData = (): boolean => {
    return (
      scaleMethod === 'Trace Scale Bar and Drag' ||
      scaleMethod === 'Trace Scale Bar' ||
      scaleMethod === 'Pixel Conversion Factor' ||
      scaleMethod === 'Provide Width/Height of Image'
    );
  };

  // Check if Save should be enabled
  const canSave = (): boolean => {
    const isPointLocation = locationMethod === 'Locate by an approximate point';

    // For point location, always require a point to be placed
    if (isPointLocation && !hasPointPlaced) {
      return false;
    }

    // For methods that require scale data, check hasScaleData
    if (requiresScaleData()) {
      return hasScaleData;
    }

    // For other methods (Stretch and Drag, Copy Size), always allow save
    return true;
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
      // Reset scale data and point placement when entering placement step
      setHasScaleData(false);
      setHasPointPlaced(false);
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      // Reset scale data and point placement when going back
      setHasScaleData(false);
      setHasPointPlaced(false);
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
    if (!micrograph || !parentMicrograph || !project) return;

    // Calculate scalePixelsPerCentimeter from the display scale
    // Formula: displayScale = parentPxPerCm / childPxPerCm
    // So: childPxPerCm = parentPxPerCm / displayScale
    const parentPxPerCm = parentMicrograph.scalePixelsPerCentimeter || 100;
    const newChildPxPerCm = parentPxPerCm / scaleX; // scaleX is the display scale

    console.log('[EditMicrographLocationDialog] handleSave called with:', {
      locationMethod,
      offsetX,
      offsetY,
      rotation,
      scaleX,
      scaleY,
      parentPxPerCm,
      newChildPxPerCm,
    });

    if (locationMethod === 'Locate as a scaled rectangle') {
      updateMicrographMetadata(micrographId, {
        offsetInParent: { X: offsetX, Y: offsetY },
        rotation,
        scalePixelsPerCentimeter: newChildPxPerCm,
        opacity,
        // Clear point placement if switching methods
        pointInParent: undefined,
      });
    } else {
      updateMicrographMetadata(micrographId, {
        pointInParent: { x: pointX, y: pointY },
        // Clear rectangle placement if switching methods
        offsetInParent: undefined,
        rotation: undefined,
        scaleX: undefined,
        scaleY: undefined,
      });
    }

    // Capture parent ID before closing (parentMicrograph may become stale)
    const parentId = parentMicrograph.id;

    // Regenerate composite thumbnails for both the child and the parent micrograph
    // Use setTimeout to ensure store is updated before getting fresh project data
    // Run sequentially to avoid memory spike from parallel image loading
    setTimeout(async () => {
      const freshProject = useAppStore.getState().project;
      if (!freshProject) return;

      console.log('[EditMicrographLocationDialog] Regenerating thumbnails with fresh project data');
      console.log('[EditMicrographLocationDialog] Child ID:', micrographId, 'Parent ID:', parentId);

      try {
        // Regenerate the child's composite thumbnail (in case image was flipped)
        await window.api?.generateCompositeThumbnail(freshProject.id, micrographId, freshProject);
        console.log('[EditMicrographLocationDialog] Successfully regenerated child composite thumbnail');
        window.dispatchEvent(new CustomEvent('thumbnail-generated', {
          detail: { micrographId: micrographId }
        }));

        // Release memory between operations
        await window.api?.releaseMemory();

        // Regenerate the parent's composite thumbnail (includes all children as overlays)
        await window.api?.generateCompositeThumbnail(freshProject.id, parentId, freshProject);
        console.log('[EditMicrographLocationDialog] Successfully regenerated parent composite thumbnail');
        window.dispatchEvent(new CustomEvent('thumbnail-generated', {
          detail: { micrographId: parentId }
        }));

        // Release memory after thumbnail generation
        await window.api?.releaseMemory();
      } catch (error) {
        console.error('[EditMicrographLocationDialog] Failed to regenerate thumbnails:', error);
      }
    }, 100);

    onClose();
  };

  const handleCancel = async () => {
    // Release memory when closing dialog to prevent accumulation
    // This is important when opening/closing the dialog multiple times
    await window.api?.releaseMemory();
    onClose();
  };

  if (!micrograph || !parentMicrograph || !project || !imagesFolder) {
    return null;
  }

  // Build full path to child micrograph image
  // Same pattern as parent: ${folderPaths.images}/${micrograph.imagePath}
  const childImagePath = `${imagesFolder}/${micrograph.imagePath}`;

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
                childScratchPath={childImagePath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod={scaleMethod}
                // For methods requiring scale input, use (0, 0) to center the child initially
                // For "Stretch and Drag" or "Copy Size", use existing position or copy data
                initialOffsetX={
                  requiresScaleData()
                    ? 0
                    : (copySizeData?.xOffset ?? offsetX)
                }
                initialOffsetY={
                  requiresScaleData()
                    ? 0
                    : (copySizeData?.yOffset ?? offsetY)
                }
                initialRotation={
                  requiresScaleData()
                    ? 0
                    : (copySizeData?.rotation ?? rotation)
                }
                initialScaleX={
                  requiresScaleData()
                    ? 1
                    : (copySizeData?.scaleX ?? scaleX)
                }
                initialScaleY={
                  requiresScaleData()
                    ? 1
                    : (copySizeData?.scaleY ?? scaleY)
                }
                copySizePixelsPerCm={copySizeData?.newImagePixelsPerCm}
                initialOpacity={opacity}
                isFlipped={isFlipped}
                onFlipChange={setIsFlipped}
                onPlacementChange={handlePlacementChange}
                onOpacityChange={setOpacity}
                onScaleDataChange={handleScaleDataChange}
              />
            ) : (
              <PointPlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childImagePath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod={scaleMethod}
                initialOffsetX={copySizeData?.pointX ?? pointX}
                initialOffsetY={copySizeData?.pointY ?? pointY}
                onPlacementChange={(x, y) => handlePointPlacementChange(x, y)}
                onScaleDataChange={handleScaleDataChange}
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
          <Button onClick={handleSave} variant="contained" disabled={!canSave()}>
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
