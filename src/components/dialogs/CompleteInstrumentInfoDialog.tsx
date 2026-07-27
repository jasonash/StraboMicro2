/**
 * Complete Instrument Info Dialog
 *
 * Three-step wizard used to complete a micrograph that was created via Batch
 * Import: an Image Rotation step (offered here because the Batch Import
 * "Rotate Images" checkbox may have been left unchecked), then the two
 * instrument steps mirroring BatchImportDialog so users get the same fields
 * they would have provided at import time.
 *
 * Rotation is safe here for the same reason it is safe at import: while
 * `needsInstrumentInfo` is true the micrograph has never been viewable, so it
 * cannot have spots, children, or scale/placement data in its pixel space.
 *
 * Opens before EditMicrographLocationDialog / SetScaleDialog when a
 * batch-imported thumbnail with `needsInstrumentInfo: true` is clicked.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Stack,
  Box,
  Typography,
  Alert,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { RotateLeft, RotateRight } from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { InstrumentType, MicrographMetadata } from '@/types/project-types';
import { InstrumentInfoForm, type InstrumentFormData } from './InstrumentInfoForm';
import {
  InstrumentDataForm,
  type InstrumentDataFormData,
  type Detector,
  initialInstrumentDataFormData,
} from './InstrumentDataForm';
import type { InstrumentData } from './InstrumentDatabaseDialog';
import {
  rotateCW,
  rotateCCW,
  isQuarterTurn,
  rotationLabel,
  type RotationDegrees,
} from '@/utils/rotationUtils';

interface CompleteInstrumentInfoDialogProps {
  isOpen: boolean;
  micrographId: string | null;
  onClose: () => void;
  onComplete: () => void;
}

const initialInstrumentInfoData: InstrumentFormData = {
  instrumentType: '',
  otherInstrumentType: '',
  dataType: '',
  imageType: '',
};

const STEPS = ['Image Rotation', 'Instrument & Image Info', 'Instrument Data'] as const;

export const CompleteInstrumentInfoDialog: React.FC<CompleteInstrumentInfoDialogProps> = ({
  isOpen,
  micrographId,
  onClose,
  onComplete,
}) => {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  const [activeStep, setActiveStep] = useState(0);
  const [instrumentInfoData, setInstrumentInfoData] =
    useState<InstrumentFormData>(initialInstrumentInfoData);
  const [instrumentDataFormData, setInstrumentDataFormData] =
    useState<InstrumentDataFormData>(initialInstrumentDataFormData);
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);

  // Image rotation step state. The image is already in the project images
  // folder (batch import moves it before tiling), so rotation operates on the
  // project image path rather than a scratch path.
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingRotation, setPendingRotation] = useState<RotationDegrees>(0);
  const [isRotating, setIsRotating] = useState(false);

  const micrograph = useMemo((): MicrographMetadata | null => {
    if (!project || !micrographId) return null;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find((m) => m.id === micrographId);
        if (micro) return micro;
      }
    }
    return null;
  }, [project, micrographId]);

  // Load the image preview when the dialog opens (already tiled by batch import,
  // so this is normally a cache hit)
  useEffect(() => {
    if (!isOpen || !micrographId || !project?.id || !window.api) return;

    let cancelled = false;
    (async () => {
      try {
        const folderPaths = await window.api!.getProjectFolderPaths(project.id);
        if (!folderPaths || cancelled) return;
        const path = `${folderPaths.images}/${micrographId}`;
        const tileData = await window.api!.loadImageWithTiles(path);
        if (!tileData || cancelled) return;
        const mediumDataUrl = await window.api!.loadMedium(tileData.hash);
        if (cancelled) return;
        setImagePath(path);
        setPreviewUrl(mediumDataUrl || null);
      } catch (error) {
        console.error('[CompleteInstrumentInfo] Failed to load image preview:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, micrographId, project?.id]);

  const existingMicrographs = useMemo((): MicrographMetadata[] => {
    if (!project) return [];
    const result: MicrographMetadata[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id !== micrographId && micro.instrument?.instrumentType) {
            result.push(micro);
          }
        }
      }
    }
    return result;
  }, [project, micrographId]);

  const resetForm = () => {
    setActiveStep(0);
    setInstrumentInfoData(initialInstrumentInfoData);
    setInstrumentDataFormData(initialInstrumentDataFormData);
    setDetectors([{ type: '', make: '', model: '' }]);
    setImagePath(null);
    setPreviewUrl(null);
    setPendingRotation(0);
    setIsRotating(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleInstrumentInfoChange = (field: keyof InstrumentFormData, value: string) => {
    setInstrumentInfoData((prev) => ({ ...prev, [field]: value }));
  };

  const handleInstrumentDataChange = (field: keyof InstrumentDataFormData, value: string) => {
    setInstrumentDataFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDetectorChange = (index: number, field: keyof Detector, value: string) => {
    setDetectors((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddDetector = () => {
    setDetectors((prev) => [...prev, { type: '', make: '', model: '' }]);
  };

  const handleRemoveDetector = (index: number) => {
    setDetectors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInstrumentFromDatabase = (instrument: InstrumentData) => {
    setInstrumentInfoData((prev) => ({
      ...prev,
      instrumentType: instrument.instrumentType || prev.instrumentType,
    }));
    setInstrumentDataFormData({
      instrumentBrand: instrument.instrumentBrand || '',
      instrumentModel: instrument.instrumentModel || '',
      university: instrument.university || '',
      laboratory: instrument.laboratory || '',
      dataCollectionSoftware: instrument.dataCollectionSoftware || '',
      dataCollectionSoftwareVersion: instrument.dataCollectionSoftwareVersion || '',
      postProcessingSoftware: instrument.postProcessingSoftware || '',
      postProcessingSoftwareVersion: instrument.postProcessingSoftwareVersion || '',
      filamentType: instrument.filamentType || '',
      instrumentNotes: instrument.instrumentNotes || '',
    });
    if (instrument.detectors && instrument.detectors.length > 0) {
      setDetectors(
        instrument.detectors.map((d) => ({
          type: d.detectorType || '',
          make: d.detectorMake || '',
          model: d.detectorModel || '',
        }))
      );
    }
  };

  const handleCopyFromExisting = (sourceMicrographId: string) => {
    const sourceMicro = existingMicrographs.find((m) => m.id === sourceMicrographId);
    if (!sourceMicro || !sourceMicro.instrument) return;
    const inst = sourceMicro.instrument;
    setInstrumentInfoData({
      instrumentType: inst.instrumentType || '',
      otherInstrumentType: inst.otherInstrumentType || '',
      dataType: inst.dataType || '',
      imageType: sourceMicro.imageType || '',
    });
    setInstrumentDataFormData({
      instrumentBrand: inst.instrumentBrand || '',
      instrumentModel: inst.instrumentModel || '',
      university: inst.university || '',
      laboratory: inst.laboratory || '',
      dataCollectionSoftware: inst.dataCollectionSoftware || '',
      dataCollectionSoftwareVersion: inst.dataCollectionSoftwareVersion || '',
      postProcessingSoftware: inst.postProcessingSoftware || '',
      postProcessingSoftwareVersion: inst.postProcessingSoftwareVersion || '',
      filamentType: inst.filamentType || '',
      instrumentNotes: inst.instrumentNotes || '',
    });
    if (inst.instrumentDetectors && inst.instrumentDetectors.length > 0) {
      setDetectors(
        inst.instrumentDetectors.map((d) => ({
          type: d.detectorType || '',
          make: d.detectorMake || '',
          model: d.detectorModel || '',
        }))
      );
    }
  };

  // Matches BatchImportDialog and NewMicrographDialog validation for the
  // Instrument & Image Info step.
  const canProceed = () => {
    if (STEPS[activeStep] === 'Instrument & Image Info') {
      if (!instrumentInfoData.instrumentType) return false;
      if (
        instrumentInfoData.instrumentType === 'Other' &&
        !instrumentInfoData.otherInstrumentType
      ) {
        return false;
      }
      if (!instrumentInfoData.imageType) return false;
      return true;
    }
    return true;
  };

  // Apply the pending rotation to the project image pixels. Same commit-boundary
  // pattern as the import wizards: preview is CSS-only until the user leaves the
  // rotation step, so the image is re-encoded at most once per pass.
  const applyPendingRotation = async (): Promise<boolean> => {
    const api = window.api;
    if (!api || !imagePath || !micrographId || pendingRotation === 0) return true;

    setIsRotating(true);
    try {
      const result = await api.rotateImage(imagePath, pendingRotation);

      // Re-tile from the (now rotated) project image and refresh the preview
      const tileData = await api.loadImageWithTiles(imagePath);
      if (tileData) {
        const mediumDataUrl = await api.loadMedium(tileData.hash);
        if (mediumDataUrl) {
          setPreviewUrl(mediumDataUrl);
        }
      }

      // Persist the swapped dimensions on the micrograph
      updateMicrographMetadata(micrographId, {
        imageWidth: result.width,
        imageHeight: result.height,
        width: result.width,
        height: result.height,
      });

      // Regenerate the tree thumbnail in the background (batch import created
      // one from the pre-rotation pixels)
      const projectForThumb = useAppStore.getState().project;
      if (projectForThumb) {
        api
          .generateCompositeThumbnail(projectForThumb.id, micrographId, projectForThumb)
          .then(() => {
            window.dispatchEvent(
              new CustomEvent('thumbnail-generated', { detail: { micrographId } })
            );
          })
          .catch((err) => {
            console.error('[CompleteInstrumentInfo] Failed to regenerate thumbnail:', err);
          });
      }

      setPendingRotation(0);
      return true;
    } catch (error) {
      console.error('[CompleteInstrumentInfo] Error rotating image:', error);
      alert(`Error rotating image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsRotating(false);
    }
  };

  const handleNext = async () => {
    // Leaving the rotation step commits any pending rotation to the pixels
    if (STEPS[activeStep] === 'Image Rotation') {
      const ok = await applyPendingRotation();
      if (!ok) return; // Stay on the step; pending rotation is preserved
    }
    setActiveStep((prev) => prev + 1);
  };
  const handleBack = () => setActiveStep((prev) => prev - 1);

  const handleSave = () => {
    if (!micrographId) return;

    const instrument: InstrumentType = {
      instrumentType: instrumentInfoData.instrumentType,
      otherInstrumentType: instrumentInfoData.otherInstrumentType || undefined,
      dataType: instrumentInfoData.dataType || undefined,
      instrumentBrand: instrumentDataFormData.instrumentBrand || undefined,
      instrumentModel: instrumentDataFormData.instrumentModel || undefined,
      university: instrumentDataFormData.university || undefined,
      laboratory: instrumentDataFormData.laboratory || undefined,
      dataCollectionSoftware: instrumentDataFormData.dataCollectionSoftware || undefined,
      dataCollectionSoftwareVersion:
        instrumentDataFormData.dataCollectionSoftwareVersion || undefined,
      postProcessingSoftware: instrumentDataFormData.postProcessingSoftware || undefined,
      postProcessingSoftwareVersion:
        instrumentDataFormData.postProcessingSoftwareVersion || undefined,
      filamentType: instrumentDataFormData.filamentType || undefined,
      instrumentNotes: instrumentDataFormData.instrumentNotes || undefined,
      instrumentDetectors: detectors
        .filter((d) => d.type || d.make || d.model)
        .map((d) => ({
          detectorType: d.type || undefined,
          detectorMake: d.make || undefined,
          detectorModel: d.model || undefined,
        })),
    };

    updateMicrographMetadata(micrographId, {
      imageType: instrumentInfoData.imageType,
      instrument,
      needsInstrumentInfo: false,
    });

    resetForm();
    onComplete();
  };

  const isLastStep = activeStep === STEPS.length - 1;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '60vh' } }}
    >
      <DialogTitle>Complete Instrument & Image Info</DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ pt: 2, pb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Stack spacing={2}>
          {STEPS[activeStep] === 'Image Rotation' && (
            <Stack spacing={2}>
              <Alert severity="info">
                <strong>Rotate the image pixels (optional).</strong> Rotation permanently changes
                the image's pixels and controls how the image appears everywhere it is shown —
                the main detail view, thumbnails, and exports. It does <strong>not</strong> affect
                how an associated micrograph is positioned on its parent image. This is the last
                opportunity to rotate: once this setup is complete, the rotation{' '}
                <strong>cannot be changed</strong>, so if the image was captured sideways or
                upside down, correct it now.
              </Alert>
              {/* Square container: the rotated bounding box never overflows at 90°/270° */}
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                  sx={{
                    width: 360,
                    height: 360,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                  }}
                >
                  {previewUrl ? (
                    <Box
                      component="img"
                      src={previewUrl}
                      alt="Micrograph preview"
                      sx={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        transform: `rotate(${pendingRotation}deg)`,
                        transition: 'transform 150ms ease',
                      }}
                    />
                  ) : (
                    <CircularProgress />
                  )}
                </Box>
              </Box>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                <Tooltip title="Rotate 90° counter-clockwise">
                  <span>
                    <IconButton
                      onClick={() => setPendingRotation(rotateCCW(pendingRotation))}
                      disabled={isRotating || !previewUrl}
                    >
                      <RotateLeft />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="body2" sx={{ minWidth: 180, textAlign: 'center' }}>
                  {rotationLabel(pendingRotation)}
                </Typography>
                <Tooltip title="Rotate 90° clockwise">
                  <span>
                    <IconButton
                      onClick={() => setPendingRotation(rotateCW(pendingRotation))}
                      disabled={isRotating || !previewUrl}
                    >
                      <RotateRight />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              {micrograph && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                  Resulting dimensions:{' '}
                  {isQuarterTurn(pendingRotation)
                    ? `${micrograph.height ?? micrograph.imageHeight ?? 0} × ${micrograph.width ?? micrograph.imageWidth ?? 0}`
                    : `${micrograph.width ?? micrograph.imageWidth ?? 0} × ${micrograph.height ?? micrograph.imageHeight ?? 0}`}{' '}
                  pixels
                </Typography>
              )}
            </Stack>
          )}
          {STEPS[activeStep] === 'Instrument & Image Info' && (
            <InstrumentInfoForm
              formData={instrumentInfoData}
              onFormChange={handleInstrumentInfoChange}
              onInstrumentFromDatabase={handleInstrumentFromDatabase}
              existingMicrographs={existingMicrographs}
              onCopyFromExisting={handleCopyFromExisting}
              showCopyFromExisting={true}
            />
          )}
          {STEPS[activeStep] === 'Instrument Data' && (
            <InstrumentDataForm
              formData={instrumentDataFormData}
              detectors={detectors}
              instrumentType={instrumentInfoData.instrumentType}
              onFormChange={handleInstrumentDataChange}
              onDetectorChange={handleDetectorChange}
              onAddDetector={handleAddDetector}
              onRemoveDetector={handleRemoveDetector}
            />
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isRotating}>
          Cancel
        </Button>
        <Button onClick={handleBack} disabled={activeStep === 0 || isRotating}>
          Back
        </Button>
        {isLastStep ? (
          <Button variant="contained" onClick={handleSave} disabled={!canProceed()}>
            Save
          </Button>
        ) : (
          <Button variant="contained" onClick={handleNext} disabled={!canProceed() || isRotating}>
            {isRotating ? 'Rotating…' : 'Next'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
