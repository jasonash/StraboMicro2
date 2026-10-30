/**
 * Batch Import Dialog
 *
 * Multi-step wizard for batch importing micrographs.
 * Allows users to:
 * 1. Select multiple image files
 * 2. Choose which metadata to apply to all images
 * 3. Enter shared instrument & image info (optional)
 * 4. Enter shared instrument data - detectors, software, etc. (optional)
 * 5. Enter shared orientation (optional, reference only)
 * 6. Set per-image rotation (optional) - destructive 90° pixel rotation, import-time only
 * 7. Create all micrographs at once
 *
 * Note: Batch imported micrographs do NOT have scale/location data. The import
 * goes on to Finish Importing, as does clicking one in the tree later.
 *
 * IMPORTANT: Full data model compatibility with legacy JavaFX app is maintained.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Stack,
  Typography,
  Checkbox,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  LinearProgress,
  Alert,
} from '@mui/material';
import { Delete, CloudUpload, Warning } from '@mui/icons-material';
import {
  IDENTITY_ORIENTATION,
  isIdentityOrientation,
  type Orientation,
} from '@/utils/rotationUtils';
import { useAppStore } from '@/store';
import type { MicrographMetadata } from '@/types/project-types';
import { effectiveImageType, imageTypesComplete } from '@/utils/imageTypeChoices';
import { InstrumentInfoForm } from './InstrumentInfoForm';
import { ImageTypeRows } from './ImageTypeRows';
import { RotateFlipList } from './RotateFlipList';
import { useInstrumentForms } from './useInstrumentForms';
import { InstrumentDataForm } from './InstrumentDataForm';
import { OrientationForm, type OrientationFormData, initialOrientationData, validateOrientationForm } from './OrientationForm';
import { describeImageLoadError } from '@/utils/imageLoadError';

interface BatchImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string | null; // For reference micrographs
  parentMicrographId: string | null; // For associated micrographs
  /** Every file imported without errors: goes on to Finish Importing with the new micrographs */
  onImported?: (micrographIds: string[]) => void;
}

interface SelectedFile {
  path: string;
  name: string;
  validationError?: string;
}

export const BatchImportDialog: React.FC<BatchImportDialogProps> = ({
  isOpen,
  onClose,
  sampleId,
  parentMicrographId,
  onImported,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [includeInstrumentInfo, setIncludeInstrumentInfo] = useState(true);
  const [includeOrientation, setIncludeOrientation] = useState(false);
  const [includeRotation, setIncludeRotation] = useState(false);

  // Per-file rotation (path → clockwise degrees). Preview-only until the import
  // loop, where each file's rotation is baked into its scratch JPEG's pixels.
  const [fileOrientations, setFileOrientations] = useState<Record<string, Orientation>>({});
  // Source-file thumbnails for the Rotation step (path → data URL; '' = failed).
  // Source files aren't converted to scratch until import, so previews come from
  // loadImagePreview, which decodes the full file — hence lazy + sequential.
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const isLoadingPreviewsRef = useRef(false);

  const forms = useInstrumentForms();

  // Orientation
  const [orientationData, setOrientationData] = useState<OrientationFormData>(initialOrientationData);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  // Synchronous re-entrancy guard for the import run — blocks a same-tick double
  // -click before the `isImporting` state has re-rendered the button as disabled.
  const isImportingRef = useRef(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  // Determine if this is for associated micrographs (has parent) or reference (no parent)
  const isAssociated = parentMicrographId !== null;

  // Split selected files into valid and invalid
  const validFiles = useMemo(() => selectedFiles.filter((f) => !f.validationError), [selectedFiles]);
  const invalidFiles = useMemo(() => selectedFiles.filter((f) => f.validationError), [selectedFiles]);

  // Get project from store
  const project = useAppStore((state) => state.project);

  // Build steps array based on selected options
  const steps = useMemo(() => {
    const stepList = ['Select Files'];
    if (includeInstrumentInfo) {
      stepList.push('Instrument & Image Info');
      stepList.push('Instrument Data');
    }
    if (includeOrientation && !isAssociated) {
      stepList.push('Orientation');
    }
    if (includeRotation) {
      stepList.push('Rotation');
    }
    stepList.push('Import');
    return stepList;
  }, [includeInstrumentInfo, includeOrientation, includeRotation, isAssociated]);

  const handleBrowseFiles = async () => {
    if (window.api && window.api.openMultipleTiffDialog) {
      try {
        const filePaths = await window.api.openMultipleTiffDialog();
        if (filePaths && filePaths.length > 0) {
          // Validate all selected files (checks readability and magic bytes)
          const validationResults = await window.api.validateImageFiles(filePaths);

          const newFiles: SelectedFile[] = filePaths.map((filePath: string, i: number) => ({
            path: filePath,
            name: filePath.split(/[\\/]/).pop() || filePath,
            validationError: validationResults[i]?.valid ? undefined : validationResults[i]?.error,
          }));
          // Add to existing files, avoiding duplicates
          setSelectedFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const uniqueNew = newFiles.filter((f) => !existingPaths.has(f.path));
            return [...prev, ...uniqueNew];
          });
        }
      } catch (error) {
        console.error('Error selecting files:', error);
      }
    }
  };

  const handleRemoveFile = (path: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.path !== path));
    setFileOrientations((prev) => {
      const { [path]: _removed, ...rest } = prev;
      return rest;
    });
    setPreviewCache((prev) => {
      const { [path]: _removed, ...rest } = prev;
      return rest;
    });
  };

  // Lazily load source-file thumbnails when the Rotation step is shown.
  // Sequential on purpose: loadImagePreview decodes the entire source file
  // (large TIFFs included), so parallel loads could exhaust memory.
  const onRotationStep = steps[activeStep] === 'Rotation';
  useEffect(() => {
    if (!onRotationStep || isLoadingPreviewsRef.current || !window.api) return;

    const missing = validFiles.filter((f) => previewCache[f.path] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;
    isLoadingPreviewsRef.current = true;

    (async () => {
      for (const file of missing) {
        if (cancelled) break;
        try {
          const dataUrl = await window.api!.loadImagePreview(file.path, 'thumbnail');
          if (!cancelled) {
            setPreviewCache((prev) => ({ ...prev, [file.path]: dataUrl }));
          }
        } catch (error) {
          console.error(`[BatchImport] Failed to load preview for ${file.name}:`, error);
          if (!cancelled) {
            // Sentinel: preview failed, but rotation can still be set — the pixel
            // rotation during import is independent of the preview.
            setPreviewCache((prev) => ({ ...prev, [file.path]: '' }));
          }
        }
      }
      isLoadingPreviewsRef.current = false;
    })();

    return () => {
      cancelled = true;
      isLoadingPreviewsRef.current = false;
    };
  }, [onRotationStep, validFiles, previewCache]);

  // Orientation handlers
  const handleOrientationChange = <K extends keyof OrientationFormData>(
    field: K,
    value: OrientationFormData[K]
  ) => {
    setOrientationData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    const currentStepName = steps[activeStep];

    switch (currentStepName) {
      case 'Select Files':
        return validFiles.length > 0;

      case 'Instrument & Image Info':
        // Instrument type + an image type for each file, or just the free-text name for "Other"
        return imageTypesComplete(forms.info, forms.ownImageTypes, validFiles.map((f) => f.path));

      case 'Instrument Data':
        // Instrument data step is always valid (all fields optional)
        return true;

      case 'Orientation':
        return validateOrientationForm(orientationData);

      case 'Rotation':
        // Rotation is optional per file
        return true;

      case 'Import':
        return true;

      default:
        return true;
    }
  };

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleImport = async () => {
    if (isImportingRef.current) return;
    if (!project?.id) {
      console.error('No project ID found');
      return;
    }

    // Determine target sample ID. Resolve against the CURRENT store state, not the
    // render-captured `project` — the snapshot can be stale by the time Import is
    // clicked, and a stale/missing sample id made addMicrograph silently drop every
    // imported micrograph while the dialog reported success (Sentry 2026-07-15).
    const freshProject = useAppStore.getState().project;
    if (!freshProject || freshProject.id !== project.id) {
      console.error(
        `[BatchImport] Active project changed since the dialog was opened ` +
        `(was ${project.id}, now ${freshProject?.id ?? 'none'}) — aborting import`
      );
      setImportErrors(['The open project changed since this dialog was opened. Please close this dialog and start the import again.']);
      return;
    }

    let targetSampleId: string | null = null;
    if (isAssociated && parentMicrographId) {
      // Find sample containing parent micrograph
      for (const dataset of freshProject.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.some((m) => m.id === parentMicrographId)) {
            targetSampleId = sample.id;
            break;
          }
        }
      }
    } else if (sampleId) {
      // Reference import: confirm the sample from the tree still exists
      const sampleExists = (freshProject.datasets || []).some(
        (dataset) => (dataset.samples || []).some((sample) => sample.id === sampleId)
      );
      targetSampleId = sampleExists ? sampleId : null;
    }

    if (!targetSampleId) {
      console.error(
        `[BatchImport] Could not resolve target sample (sampleId: ${sampleId}, ` +
        `parentMicrographId: ${parentMicrographId}) — aborting import`
      );
      setImportErrors(['The target sample could not be found in the current project. Please close this dialog and start the import again.']);
      return;
    }

    isImportingRef.current = true;
    setIsImporting(true);
    setImportProgress({ current: 0, total: validFiles.length, currentFile: '' });
    setImportErrors([]);

    const errors: string[] = [];
    const importedIds: string[] = [];

    // Ensure all project folders exist (images, compositeThumbnails, etc.)
    // This is idempotent - safe to call even if folders already exist
    await window.api!.createProjectFolders(project.id);

    // Get project folder paths for constructing final image paths
    const folderPaths = await window.api!.getProjectFolderPaths(project.id);
    if (!folderPaths) {
      console.error('[BatchImport] Could not get project folder paths');
      return;
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setImportProgress({ current: i + 1, total: validFiles.length, currentFile: file.name });

      try {
        // Release memory between imports to prevent OOM crashes
        // This is especially important for large batch imports (9+ images)
        if (i > 0) {
          await window.api!.releaseMemory();
        }

        // Generate micrograph ID FIRST (before conversion)
        // This allows us to move to final location before generating tile cache
        const micrographId = crypto.randomUUID();

        // Convert image to scratch JPEG
        console.log(`[BatchImport] Converting file ${i + 1}/${selectedFiles.length}: ${file.name}`);
        const conversionResult = await window.api!.convertToScratchJPEG(file.path);

        // Bake the user's chosen rotation/flip into the scratch pixels before
        // the image enters the project. 90°/270° swap the stored dimensions.
        let imageWidth = conversionResult.jpegWidth;
        let imageHeight = conversionResult.jpegHeight;
        const orientation = includeRotation
          ? (fileOrientations[file.path] ?? IDENTITY_ORIENTATION)
          : IDENTITY_ORIENTATION;
        if (!isIdentityOrientation(orientation)) {
          const rotateResult = await window.api!.rotateImage(
            conversionResult.scratchPath,
            orientation.rotation,
            orientation.flip
          );
          imageWidth = rotateResult.width;
          imageHeight = rotateResult.height;
        }

        // Move scratch image to project storage BEFORE generating tile cache
        // This ensures the tile cache originalPath points to the permanent location
        await window.api!.moveFromScratch(
          conversionResult.identifier,
          project.id,
          micrographId
        );

        // Now load into tile system from the FINAL path
        // This ensures tiles are cached with the correct originalPath
        const finalImagePath = `${folderPaths.images}/${micrographId}`;
        await window.api!.loadImageWithTiles(finalImagePath);

        // Extract name without extension
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

        // Build micrograph metadata
        const micrograph: MicrographMetadata = {
          id: micrographId,
          name: nameWithoutExt,
          imageFilename: file.name,
          imagePath: micrographId, // Image stored as {micrographId} in project images folder
          imageWidth,
          imageHeight,
          width: imageWidth,
          height: imageHeight,
          // NO scalePixelsPerCentimeter - this is the key marker for batch-imported images
          parentID: isAssociated ? parentMicrographId : undefined,
          // Flag micrographs that skipped the Instrument & Image Info step so the
          // user is prompted for it the first time they click the thumbnail.
          needsInstrumentInfo: includeInstrumentInfo ? undefined : true,
        };

        // Add instrument info if included (FULL data model)
        if (includeInstrumentInfo && forms.info.instrumentType) {
          // Absent rather than '' when no image type applies (e.g. "Other"), like the wizard
          micrograph.imageType = effectiveImageType(forms.info.imageType, forms.ownImageTypes, file.path) || undefined;
          micrograph.instrument = forms.buildInstrument();
        }

        // Add orientation if included (reference only)
        if (includeOrientation && !isAssociated) {
          if (orientationData.orientationMethod === 'unoriented') {
            micrograph.orientationInfo = { orientationMethod: 'unoriented' };
          } else if (orientationData.orientationMethod === 'trendPlunge') {
            micrograph.orientationInfo = {
              orientationMethod: 'trendPlunge',
              topTrend: orientationData.topTrend ? parseFloat(orientationData.topTrend) : undefined,
              topPlunge: orientationData.topPlunge ? parseFloat(orientationData.topPlunge) : undefined,
              topReferenceCorner: orientationData.topReferenceCorner || undefined,
              sideTrend: orientationData.sideTrend ? parseFloat(orientationData.sideTrend) : undefined,
              sidePlunge: orientationData.sidePlunge ? parseFloat(orientationData.sidePlunge) : undefined,
              sideReferenceCorner: orientationData.sideReferenceCorner || undefined,
              trendPlungeStrike: orientationData.trendPlungeStrike ? parseFloat(orientationData.trendPlungeStrike) : undefined,
              trendPlungeDip: orientationData.trendPlungeDip ? parseFloat(orientationData.trendPlungeDip) : undefined,
            };
          } else if (orientationData.orientationMethod === 'fabricReference') {
            micrograph.orientationInfo = {
              orientationMethod: 'fabricReference',
              fabricReference: orientationData.fabricReference || undefined,
              fabricStrike: orientationData.fabricStrike ? parseFloat(orientationData.fabricStrike) : undefined,
              fabricDip: orientationData.fabricDip ? parseFloat(orientationData.fabricDip) : undefined,
              fabricTrend: orientationData.fabricTrend ? parseFloat(orientationData.fabricTrend) : undefined,
              fabricPlunge: orientationData.fabricPlunge ? parseFloat(orientationData.fabricPlunge) : undefined,
              fabricRake: orientationData.fabricRake ? parseFloat(orientationData.fabricRake) : undefined,
              lookDirection: orientationData.lookDirection || undefined,
            };
          }
        }

        // Add micrograph to store
        // Note: moveFromScratch was already called above before loadImageWithTiles
        const added = useAppStore.getState().addMicrograph(targetSampleId, micrograph);
        if (!added) {
          // The target sample vanished mid-import. Every remaining file would fail
          // the same way, so stop here instead of orphaning more image files.
          errors.push(
            `${file.name}: the target sample no longer exists in the project — ` +
            `import stopped. Remaining files were not imported; please retry the import.`
          );
          break;
        }

        // Generate composite thumbnail for the new micrograph
        // Capture project state immediately after addMicrograph to avoid race condition
        // Note: We don't regenerate parent thumbnails here because batch-imported
        // associated micrographs don't have position data yet - that happens in
        // EditMicrographLocationDialog when the user sets scale/location.
        const projectForThumb = useAppStore.getState().project;
        if (projectForThumb && window.api) {
          window.api.generateCompositeThumbnail(projectForThumb.id, micrographId, projectForThumb)
            .then(() => {
              console.log(`[BatchImport] Generated thumbnail for: ${micrographId}`);
              window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId } }));
            })
            .catch((err) => {
              console.error(`[BatchImport] Failed to generate thumbnail for ${micrographId}:`, err);
            });
        }

        importedIds.push(micrographId);
        console.log(`[BatchImport] Successfully imported: ${file.name}`);
      } catch (error) {
        console.error(`[BatchImport] Error importing ${file.name}:`, error);
        errors.push(`${file.name}: ${describeImageLoadError(error)}`);
      }
    }

    // Final memory cleanup after all imports complete
    // This helps release any accumulated memory from libvips/Sharp
    await window.api!.releaseMemory();

    setImportErrors(errors);
    isImportingRef.current = false;
    setIsImporting(false);

    // If all successful, close the dialog and go on with what the new micrographs still need
    if (errors.length === 0) {
      handleClose();
      if (importedIds.length > 0) onImported?.(importedIds);
    }
  };

  const handleClose = () => {
    // Reset state
    setActiveStep(0);
    setSelectedFiles([]);
    setIncludeInstrumentInfo(true);
    setIncludeOrientation(false);
    setIncludeRotation(false);
    setFileOrientations({});
    setPreviewCache({});
    forms.reset();
    setOrientationData(initialOrientationData);
    setImportProgress({ current: 0, total: 0, currentFile: '' });
    setImportErrors([]);
    onClose();
  };

  const renderStepContent = () => {
    const currentStepName = steps[activeStep];

    switch (currentStepName) {
      case 'Select Files':
        return (
          <Stack spacing={3}>
            <Typography variant="h6">
              {isAssociated ? 'Batch Import Associated Micrographs' : 'Batch Import Reference Micrographs'}
            </Typography>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              Import multiple micrographs at once. Select the fields that will be shared between micrographs.
            </Typography>

            {/* Metadata options checkboxes */}
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeInstrumentInfo}
                    onChange={(e) => setIncludeInstrumentInfo(e.target.checked)}
                  />
                }
                label="Instrument and Image Info"
              />
              {!includeInstrumentInfo && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', ml: 4, mt: -1 }}>
                  You will be asked for it when you finish importing them.
                </Typography>
              )}
              {!isAssociated && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeOrientation}
                      onChange={(e) => setIncludeOrientation(e.target.checked)}
                    />
                  }
                  label="Orientation"
                />
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeRotation}
                    onChange={(e) => setIncludeRotation(e.target.checked)}
                  />
                }
                label="Rotate / Flip Images"
              />
            </Box>

            {/* File selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Micrograph Image Files:
              </Typography>
              <Button
                variant="outlined"
                startIcon={<CloudUpload />}
                onClick={handleBrowseFiles}
              >
                Browse
              </Button>
            </Box>

            {/* Selected files list */}
            {selectedFiles.length > 0 && (
              <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                <List dense>
                  {selectedFiles.map((file) => (
                    <ListItem
                      key={file.path}
                      sx={{
                        bgcolor: file.validationError ? 'error.dark' : 'action.hover',
                        opacity: file.validationError ? 0.8 : 1,
                      }}
                    >
                      {file.validationError && (
                        <Warning color="error" sx={{ mr: 1, flexShrink: 0 }} fontSize="small" />
                      )}
                      <ListItemText
                        primary={file.name}
                        secondary={file.validationError || file.path}
                        slotProps={{
                          secondary: {
                            noWrap: !file.validationError,
                            color: file.validationError ? 'error.light' : undefined,
                          }
                        }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveFile(file.path)}
                        >
                          <Delete />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}

            {selectedFiles.length > 0 && (
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                {validFiles.length} of {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} ready to import
                {invalidFiles.length > 0 && ` (${invalidFiles.length} skipped — see warnings above)`}
              </Typography>
            )}
          </Stack>
        );

      case 'Instrument & Image Info':
        return (
          <Stack spacing={2}>
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
              rows={validFiles.map((f) => ({ id: f.path, name: f.name }))}
              onChange={forms.setOwnImageType}
            />
          </Stack>
        );

      case 'Instrument Data':
        return (
          <InstrumentDataForm
            formData={forms.data}
            detectors={forms.detectors}
            instrumentType={forms.info.instrumentType}
            onFormChange={forms.onDataChange}
            onDetectorChange={forms.onDetectorChange}
            onAddDetector={forms.onAddDetector}
            onRemoveDetector={forms.onRemoveDetector}
          />
        );

      case 'Orientation':
        return (
          <OrientationForm
            formData={orientationData}
            onFormChange={handleOrientationChange}
          />
        );

      case 'Rotation':
        return (
          <Stack spacing={2}>
            <Alert severity="info">
              Rotation and flipping permanently change each image's pixels before import and
              affect how the image appears everywhere (detail view, thumbnails, exports). They
              cannot be changed after import.
            </Alert>
            <RotateFlipList
              rows={validFiles.map((f) => ({ id: f.path, name: f.name }))}
              orientations={fileOrientations}
              previews={previewCache}
              onChange={(path, orientation) => setFileOrientations((prev) => ({ ...prev, [path]: orientation }))}
            />
          </Stack>
        );

      case 'Import':
        return (
          <Stack spacing={3}>
            <Typography variant="h6">Ready to Import</Typography>
            <Typography variant="body2">
              {validFiles.length} micrograph{validFiles.length !== 1 ? 's' : ''} will be imported
              {isAssociated ? ` as associated micrographs` : ` as reference micrographs`}.
            </Typography>

            {includeInstrumentInfo && (
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                Instrument info will be applied to all micrographs.
              </Typography>
            )}

            {includeOrientation && !isAssociated && (
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>
                Orientation will be applied to all micrographs.
              </Typography>
            )}

            <Alert severity="info">
              <Typography variant="body2">
                <strong>Note:</strong> Batch imported micrographs will not have scale
                {isAssociated ? ' or location' : ''} data. When you click on them in the sidebar,
                you will be prompted to set the scale{isAssociated ? ' and location' : ''}.
              </Typography>
            </Alert>

            {isImporting && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Importing: {importProgress.currentFile} ({importProgress.current}/{importProgress.total})
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(importProgress.current / importProgress.total) * 100}
                />
              </Box>
            )}

            {importErrors.length > 0 && (
              <Alert severity="error">
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Some files failed to import:
                </Typography>
                {importErrors.map((error, index) => (
                  <Typography key={index} variant="body2">
                    {error}
                  </Typography>
                ))}
              </Alert>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

  const isLastStep = activeStep === steps.length - 1;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: { sx: { minHeight: '60vh' } }
      }}
    >
      <DialogTitle>
        {isAssociated ? 'Batch Import Associated Micrographs' : 'Batch Import Reference Micrographs'}
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ pt: 2, pb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {renderStepContent()}
      </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleBack} disabled={activeStep === 0 || isImporting}>
            Back
          </Button>
          {isLastStep ? (
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={!canProceed() || isImporting}
            >
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          ) : (
            <Button variant="contained" onClick={handleNext} disabled={!canProceed()}>
              Next
            </Button>
          )}
        </DialogActions>
    </Dialog>
  );
};
