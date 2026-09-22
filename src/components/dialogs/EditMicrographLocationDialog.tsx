/**
 * Edit Micrograph Location Dialog
 *
 * Dialog for editing the location/placement of an associated micrograph on its parent.
 * Provides the same Location Method and Scale Method selection as the NewMicrographDialog wizard,
 * followed by the appropriate placement UI (PlacementCanvas or PointPlacementCanvas).
 *
 * Steps:
 * 1. Location Method Selection (radio buttons). "Copy from existing micrograph"
 *    finishes right here: the source sibling's placement is applied as-is.
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
  Alert,
  CircularProgress,
} from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import PlacementCanvas from './PlacementCanvas';
import { PointPlacementCanvas } from './PointPlacementCanvas';
import { AffineRegistrationModal } from './AffineRegistrationModal';
import type { MicrographMetadata } from '@/types/project-types';
import type { AffineMatrix, ControlPoint } from '@/utils/affineTransform';
import {
  bakeAffineTilesForCopy,
  computeCopiedPlacement,
  describeCopyPlacementCandidate,
  listCopyPlacementCandidates,
} from '@/utils/copySizePlacement';

interface EditMicrographLocationDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string;
}

type LocationMethod =
  | 'Locate as a scaled rectangle'
  | 'Locate by an approximate point'
  | '3-Point Registration'
  | 'Copy from existing micrograph';
type ScaleMethod =
  | 'Trace Scale Bar and Drag'
  | 'Stretch and Drag'
  | 'Trace Scale Bar'
  | 'Pixel Conversion Factor'
  | 'Provide Width/Height of Image'
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
  const [copySourceMicrographId, setCopySourceMicrographId] = useState<string>('');
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
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

  // Scale data state (for "Trace Scale Bar" methods)
  const [hasScaleData, setHasScaleData] = useState(false);

  // Point placement state (for "Locate as a point" method)
  const [hasPointPlaced, setHasPointPlaced] = useState(false);

  // Affine state (for "3-Point Registration" method)
  const [affineMatrix, setAffineMatrix] = useState<AffineMatrix | null>(null);
  const [affineControlPoints, setAffineControlPoints] = useState<ControlPoint[] | null>(null);
  const [affineBoundsOffset, setAffineBoundsOffset] = useState<{ x: number; y: number } | null>(null);
  const [affineTransformedWidth, setAffineTransformedWidth] = useState<number | null>(null);
  const [affineTransformedHeight, setAffineTransformedHeight] = useState<number | null>(null);
  const [affineTileHash, setAffineTileHash] = useState<string | null>(null);
  const [showAffineRegistration, setShowAffineRegistration] = useState(false);

  // Project folder paths for constructing image paths
  const [imagesFolder, setImagesFolder] = useState<string>('');

  // Sibling micrographs whose placement can be copied onto this one (any method)
  const copyCandidates = useMemo(
    () =>
      listCopyPlacementCandidates(
        project,
        parentMicrograph?.id,
        micrograph?.id,
        micrograph?.imageWidth,
        micrograph?.imageHeight
      ),
    [project, micrograph, parentMicrograph]
  );

  // Full path to the child micrograph image (same pattern as the parent:
  // ${folderPaths.images}/${micrograph.imagePath}); empty until both are loaded
  const childImagePath = micrograph && imagesFolder ? `${imagesFolder}/${micrograph.imagePath}` : '';

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
    const hasAffine = micro.placementType === 'affine' && !!micro.affineMatrix;

    // Reset affine state by default; will be populated below if applicable
    setAffineMatrix(null);
    setAffineControlPoints(null);
    setAffineBoundsOffset(null);
    setAffineTransformedWidth(null);
    setAffineTransformedHeight(null);
    setAffineTileHash(null);

    if (hasAffine) {
      setLocationMethod('3-Point Registration');
      setScaleMethod('');
      setAffineMatrix(micro.affineMatrix ?? null);
      setAffineControlPoints(
        micro.controlPoints?.map((cp) => ({ source: cp.source, target: cp.target })) ?? null
      );
      setAffineBoundsOffset(micro.affineBoundsOffset ?? null);
      setAffineTransformedWidth(micro.affineTransformedWidth ?? null);
      setAffineTransformedHeight(micro.affineTransformedHeight ?? null);
      setAffineTileHash(micro.affineTileHash ?? null);
      setOpacity(micro.opacity ?? 1);
    } else if (hasOffset) {
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

    setCopySourceMicrographId('');
    setCopyError(null);
    setStep(0);
  }, [open, project, micrographId]);

  // Reset scale method when location method changes
  useEffect(() => {
    if (locationMethod === '3-Point Registration' || locationMethod === 'Copy from existing micrograph') {
      // 3-Point Registration computes scale from the affine matrix, and a copy takes
      // everything from the source; neither needs a scale method.
      setScaleMethod('');
      return;
    }
    if (locationMethod === 'Locate as a scaled rectangle') {
      if (scaleMethod !== 'Trace Scale Bar and Drag' &&
          scaleMethod !== 'Stretch and Drag' &&
          scaleMethod !== 'Pixel Conversion Factor' &&
          scaleMethod !== 'Provide Width/Height of Image') {
        setScaleMethod('Stretch and Drag');
      }
    } else {
      if (scaleMethod !== 'Trace Scale Bar' &&
          scaleMethod !== 'Pixel Conversion Factor' &&
          scaleMethod !== 'Provide Width/Height of Image') {
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
    if (locationMethod === '3-Point Registration') {
      return affineMatrix !== null;
    }

    const isPointLocation = locationMethod === 'Locate by an approximate point';

    // For point location, always require a point to be placed
    if (isPointLocation && !hasPointPlaced) {
      return false;
    }

    // For methods that require scale data, check hasScaleData
    if (requiresScaleData()) {
      return hasScaleData;
    }

    // For other methods (Stretch and Drag), always allow save
    return true;
  };

  const canProceedFromScaleMethod = (): boolean => scaleMethod !== '';

  const isCopyMethod = locationMethod === 'Copy from existing micrograph';
  const canFinishCopy = (): boolean => isCopyMethod && copySourceMicrographId !== '' && !isCopying;

  const handleNext = () => {
    if (step === 0) {
      // Copying finishes here; there is nothing left to set
      if (isCopyMethod) {
        void handleCopyFinish();
        return;
      }
      // 3-Point Registration skips the Scale Method step (affine matrix encodes scale)
      if (locationMethod === '3-Point Registration') {
        setStep(2);
      } else {
        setStep(1);
      }
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
      // From the placement step under 3-Point, jump back to the Location Method step
      if (step === 2 && locationMethod === '3-Point Registration') {
        setStep(0);
      } else {
        setStep(step - 1);
      }
    }
  };

  /**
   * Close the dialog and regenerate the child's and parent's composite thumbnails.
   * Shared by the interactive Save path and the copy path.
   */
  const closeAndRegenerateThumbnails = (parentId: string) => {
    // Capture project state immediately after mutations for thumbnail generation
    const projectForThumbnails = useAppStore.getState().project;

    onClose();

    // Regenerate composite thumbnails for both the child and the parent micrograph
    // Run sequentially to avoid memory spike from parallel image loading
    if (projectForThumbnails) {
      (async () => {
        try {
          console.log('[EditMicrographLocationDialog] Regenerating thumbnails');

          await window.api?.generateCompositeThumbnail(projectForThumbnails.id, micrographId, projectForThumbnails);
          console.log('[EditMicrographLocationDialog] Successfully regenerated child composite thumbnail');
          window.dispatchEvent(new CustomEvent('thumbnail-generated', {
            detail: { micrographId: micrographId }
          }));

          await window.api?.releaseMemory();

          await window.api?.generateCompositeThumbnail(projectForThumbnails.id, parentId, projectForThumbnails);
          console.log('[EditMicrographLocationDialog] Successfully regenerated parent composite thumbnail');
          window.dispatchEvent(new CustomEvent('thumbnail-generated', {
            detail: { micrographId: parentId }
          }));

          await window.api?.releaseMemory();
        } catch (error) {
          console.error('[EditMicrographLocationDialog] Failed to regenerate thumbnails:', error);
        }
      })();
    }
  };

  /**
   * "Copy from existing micrograph": apply the source sibling's placement to this
   * micrograph. Rectangle and point copies are pure metadata; an affine copy also
   * bakes this image's own overlay tiles under its own tile hash.
   */
  const handleCopyFinish = async () => {
    if (!micrograph || !parentMicrograph || !project || !copySourceMicrographId) return;

    const source = findMicrographById(project, copySourceMicrographId);
    if (!source) {
      setCopyError('The selected micrograph could not be found.');
      return;
    }

    const copied = computeCopiedPlacement(source, micrograph.imageWidth, micrograph.imageHeight);
    if (!copied) {
      setCopyError('The selected micrograph has no placement or scale that can be copied.');
      return;
    }

    setIsCopying(true);
    setCopyError(null);
    try {
      let affineTileHash: string | undefined;
      if (copied.placementType === 'affine' && copied.affineMatrix) {
        // The tiles hold this image's warped pixels, so they need their own key.
        // The micrograph id is unique and stable (same convention as StraboTools).
        affineTileHash = micrographId;
        await bakeAffineTilesForCopy(childImagePath, affineTileHash, copied.affineMatrix);
      }

      console.log('[EditMicrographLocationDialog] Copying placement from sibling:', {
        sourceId: source.id,
        placementType: copied.placementType,
        scaleAssumedFromWidthRatio: copied.scaleAssumedFromWidthRatio,
      });

      updateMicrographMetadata(micrographId, {
        ...copied.metadata,
        ...(affineTileHash ? { affineTileHash } : {}),
        opacity,
      });

      closeAndRegenerateThumbnails(parentMicrograph.id);
    } catch (error) {
      console.error('[EditMicrographLocationDialog] Copy placement failed:', error);
      setCopyError(error instanceof Error ? error.message : 'Copying the placement failed.');
    } finally {
      setIsCopying(false);
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

    if (locationMethod === '3-Point Registration') {
      // Affine placement: store matrix + control points, clear other placement fields.
      // scalePixelsPerCentimeter is a placeholder for affine descendants (effective scale
      // is derived from the root non-affine ancestor at render time); preserve the existing
      // value if any, otherwise default to the parent's scale.
      updateMicrographMetadata(micrographId, {
        placementType: 'affine',
        affineMatrix,
        controlPoints: affineControlPoints?.map((cp) => ({
          source: cp.source,
          target: cp.target,
        })),
        affineBoundsOffset,
        affineTransformedWidth,
        affineTransformedHeight,
        affineTileHash,
        scalePixelsPerCentimeter:
          micrograph.scalePixelsPerCentimeter ?? parentPxPerCm,
        opacity,
        // Clear other placement methods
        offsetInParent: undefined,
        rotation: undefined,
        scaleX: undefined,
        scaleY: undefined,
        pointInParent: undefined,
      });
    } else if (locationMethod === 'Locate as a scaled rectangle') {
      updateMicrographMetadata(micrographId, {
        offsetInParent: { X: offsetX, Y: offsetY },
        rotation,
        scalePixelsPerCentimeter: newChildPxPerCm,
        opacity,
        // Clear point and affine placement if switching methods
        pointInParent: undefined,
        placementType: undefined,
        affineMatrix: undefined,
        controlPoints: undefined,
        affineBoundsOffset: undefined,
        affineTransformedWidth: undefined,
        affineTransformedHeight: undefined,
        affineTileHash: undefined,
      });
    } else {
      updateMicrographMetadata(micrographId, {
        pointInParent: { X: pointX, Y: pointY },
        scalePixelsPerCentimeter: newChildPxPerCm,
        // Clear rectangle and affine placement if switching methods
        offsetInParent: undefined,
        rotation: undefined,
        scaleX: undefined,
        scaleY: undefined,
        placementType: undefined,
        affineMatrix: undefined,
        controlPoints: undefined,
        affineBoundsOffset: undefined,
        affineTransformedWidth: undefined,
        affineTransformedHeight: undefined,
        affineTileHash: undefined,
      });
    }

    // Capture parent ID before closing (parentMicrograph may become stale)
    closeAndRegenerateThumbnails(parentMicrograph.id);
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

  const isAffine = locationMethod === '3-Point Registration';
  // 3-Point Registration skips the Scale Method step (affine matrix encodes scale);
  // copying finishes on the first step
  const steps = isCopyMethod
    ? ['Location Method']
    : isAffine
      ? ['Location Method', 'Position']
      : ['Location Method', 'Scale Method', 'Position'];
  // For the Stepper UI, when 3-Point is selected and the user is on the Position step
  // (internal step = 2), display it as step 1 since we hide the Scale Method step.
  const displayStep = isAffine && step === 2 ? 1 : step;
  const isScaledRectangle = locationMethod === 'Locate as a scaled rectangle';
  const selectedCopyCandidate = copyCandidates.find((c) => c.id === copySourceMicrographId) ?? null;

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth={step === 2 ? 'lg' : 'sm'}
      fullWidth
    >
      <DialogTitle>Edit Micrograph Location</DialogTitle>

      <DialogContent>
        <Stepper activeStep={displayStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Location Method Selection */}
        {step === 0 && (
          <Stack spacing={3}>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
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
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1,
                  mb: 2
                }}>
                Interactively position, resize, and rotate the image on the parent (recommended)
              </Typography>

              <FormControlLabel
                value="Locate by an approximate point"
                control={<Radio />}
                label="Locate by an approximate point"
              />
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1,
                  mb: 2
                }}>
                Mark a single point showing approximate location
              </Typography>

              <FormControlLabel
                value="3-Point Registration"
                control={<Radio />}
                label="3-Point Registration"
              />
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1
                }}>
                Match 3+ corresponding features to compute precise alignment (handles rotation, scale, and skew)
              </Typography>

              <FormControlLabel
                value="Copy from existing micrograph"
                control={<Radio />}
                label="Copy location and scale from an existing micrograph"
                disabled={copyCandidates.length === 0}
              />
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1
                }}>
                {copyCandidates.length === 0
                  ? 'No sibling micrograph on this parent has a placement this image can copy'
                  : 'Reproduce a sibling micrograph\'s placement exactly, whatever method located it. Finishes immediately.'}
              </Typography>

              {isCopyMethod && copyCandidates.length > 0 && (
                <Stack spacing={1} sx={{ ml: 4, mt: 1 }}>
                  <FormControl sx={{ minWidth: 300 }} size="small">
                    <InputLabel>Select Micrograph</InputLabel>
                    <Select
                      value={copySourceMicrographId}
                      label="Select Micrograph"
                      onChange={(e) => {
                        setCopySourceMicrographId(e.target.value);
                        setCopyError(null);
                      }}
                    >
                      {copyCandidates.map((candidate) => (
                        <MenuItem key={candidate.id} value={candidate.id}>
                          {describeCopyPlacementCandidate(candidate)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {selectedCopyCandidate && !selectedCopyCandidate.sameDimensions && (
                    <Alert severity="info" sx={{ maxWidth: 520 }}>
                      This image is {micrograph.imageWidth} × {micrograph.imageHeight} pixels and the
                      source is {selectedCopyCandidate.width} × {selectedCopyCandidate.height}. The scale
                      will be adjusted on the assumption that both images cover the same physical
                      width. Use Edit Location again if the scale needs correcting.
                    </Alert>
                  )}
                  {copyError && <Alert severity="error" sx={{ maxWidth: 520 }}>{copyError}</Alert>}
                  {isCopying && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={18} />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {selectedCopyCandidate?.placementType === 'affine'
                          ? 'Generating overlay tiles…'
                          : 'Applying placement…'}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </RadioGroup>
          </Stack>
        )}

        {/* Step 1: Scale Method Selection */}
        {step === 1 && (
          <Stack spacing={3}>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
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
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      ml: 4,
                      mt: -1,
                      mb: 2
                    }}>
                    Interactive: trace scale bar, then drag/resize/rotate the image
                  </Typography>

                  <FormControlLabel
                    value="Stretch and Drag"
                    control={<Radio />}
                    label="Stretch and Drag"
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      ml: 4,
                      mt: -1,
                      mb: 2
                    }}>
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
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      ml: 4,
                      mt: -1,
                      mb: 2
                    }}>
                    Trace a scale bar to set the scale
                  </Typography>
                </>
              )}

              <FormControlLabel
                value="Pixel Conversion Factor"
                control={<Radio />}
                label="Pixel Conversion Factor"
              />
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1,
                  mb: 2
                }}>
                Enter pixels per unit manually
              </Typography>

              <FormControlLabel
                value="Provide Width/Height of Image"
                control={<Radio />}
                label="Provide Width/Height of Image"
              />
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ml: 4,
                  mt: -1,
                  mb: 2
                }}>
                Specify the physical dimensions of the image
              </Typography>

            </RadioGroup>
          </Stack>
        )}

        {/* Step 2: Placement UI */}
        {step === 2 && (
          <Box>
            {isAffine ? (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{
                  color: 'text.secondary'
                }}>
                  Use 3-point registration to precisely align this micrograph on its parent by
                  matching corresponding features between both images.
                </Typography>

                <Box
                  sx={{
                    p: 3,
                    border: '2px solid',
                    borderColor: affineMatrix ? 'success.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: affineMatrix ? 'success.light' : 'action.hover',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  {affineMatrix ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle color="success" />
                        <Typography
                          variant="subtitle1"
                          sx={{
                            color: 'success.dark',
                            fontWeight: 'bold'
                          }}>
                          Registration Complete
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{
                        color: 'text.primary'
                      }}>
                        {affineControlPoints?.length || 0} control points defined
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() => setShowAffineRegistration(true)}
                      >
                        Edit Registration
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          textAlign: 'center'
                        }}>
                        Click the button below to open the registration interface where you can
                        click corresponding features on both images.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => setShowAffineRegistration(true)}
                        size="large"
                      >
                        Start 3-Point Registration
                      </Button>
                    </>
                  )}
                </Box>

                {affineMatrix && (
                  <Typography variant="caption" sx={{
                    color: 'text.secondary'
                  }}>
                    The overlay will be transformed using an affine matrix computed from your
                    control points. This handles translation, rotation, scale, and skew
                    corrections.
                  </Typography>
                )}
              </Stack>
            ) : isScaledRectangle ? (
              <PlacementCanvas
                parentMicrographId={parentMicrograph.id}
                childScratchPath={childImagePath}
                childWidth={micrograph.imageWidth || 800}
                childHeight={micrograph.imageHeight || 600}
                scaleMethod={scaleMethod}
                // For methods requiring scale input, use (0, 0) to center the child initially
                // For "Stretch and Drag", use the existing position
                initialOffsetX={requiresScaleData() ? 0 : offsetX}
                initialOffsetY={requiresScaleData() ? 0 : offsetY}
                initialRotation={requiresScaleData() ? 0 : rotation}
                initialScaleX={requiresScaleData() ? 1 : scaleX}
                initialScaleY={requiresScaleData() ? 1 : scaleY}
                initialOpacity={opacity}
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
                initialOffsetX={pointX}
                initialOffsetY={pointY}
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
        <Button onClick={handleCancel} disabled={isCopying}>Cancel</Button>
        {step === 0 && isCopyMethod ? (
          <Button onClick={handleNext} variant="contained" disabled={!canFinishCopy()}>
            {isCopying ? 'Copying…' : 'Finish'}
          </Button>
        ) : step < 2 ? (
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

      {/* Affine Registration Modal for 3-Point Registration */}
      <AffineRegistrationModal
        open={showAffineRegistration}
        onClose={() => setShowAffineRegistration(false)}
        parentMicrographId={parentMicrograph.id}
        overlayImagePath={childImagePath}
        overlayWidth={micrograph.imageWidth || 800}
        overlayHeight={micrograph.imageHeight || 600}
        existingControlPoints={affineControlPoints ?? undefined}
        onApply={(matrix, controlPoints, boundsOffset, transformedWidth, transformedHeight, tileHash) => {
          setAffineMatrix(matrix);
          setAffineControlPoints(controlPoints);
          setAffineBoundsOffset(boundsOffset);
          setAffineTransformedWidth(transformedWidth);
          setAffineTransformedHeight(transformedHeight);
          setAffineTileHash(tileHash);
          setShowAffineRegistration(false);
        }}
      />
    </Dialog>
  );
}
