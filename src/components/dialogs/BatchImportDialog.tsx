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
 * 6. Create all micrographs at once
 *
 * Note: Batch imported micrographs do NOT have scale/location data.
 * When clicked in the sidebar, they redirect to the scale/location dialog.
 *
 * IMPORTANT: Full data model compatibility with legacy JavaFX app is maintained.
 */

import { useState, useMemo } from 'react';
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
import { Delete, CloudUpload } from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { MicrographMetadata } from '@/types/project-types';
import { InstrumentInfoForm, type InstrumentFormData } from './InstrumentInfoForm';
import { InstrumentDataForm, type InstrumentDataFormData, type Detector, initialInstrumentDataFormData } from './InstrumentDataForm';
import { OrientationForm, type OrientationFormData, initialOrientationData, validateOrientationForm } from './OrientationForm';
import type { InstrumentData } from './InstrumentDatabaseDialog';

interface BatchImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string | null; // For reference micrographs
  parentMicrographId: string | null; // For associated micrographs
}

interface SelectedFile {
  path: string;
  name: string;
}

const initialInstrumentInfoData: InstrumentFormData = {
  instrumentType: '',
  otherInstrumentType: '',
  dataType: '',
  imageType: '',
};

export const BatchImportDialog: React.FC<BatchImportDialogProps> = ({
  isOpen,
  onClose,
  sampleId,
  parentMicrographId,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [includeInstrumentInfo, setIncludeInstrumentInfo] = useState(false);
  const [includeOrientation, setIncludeOrientation] = useState(false);

  // Instrument & Image Info (step 1)
  const [instrumentInfoData, setInstrumentInfoData] = useState<InstrumentFormData>(initialInstrumentInfoData);

  // Instrument Data (step 2) - detectors, software, etc.
  const [instrumentDataFormData, setInstrumentDataFormData] = useState<InstrumentDataFormData>(initialInstrumentDataFormData);
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);

  // Orientation
  const [orientationData, setOrientationData] = useState<OrientationFormData>(initialOrientationData);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Determine if this is for associated micrographs (has parent) or reference (no parent)
  const isAssociated = parentMicrographId !== null;

  // Get project from store
  const project = useAppStore((state) => state.project);

  // Get existing micrographs for "copy from" dropdown
  const existingMicrographs = useMemo((): MicrographMetadata[] => {
    if (!project) return [];
    const micrographs: MicrographMetadata[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.instrument?.instrumentType) {
            micrographs.push(micro);
          }
        }
      }
    }
    return micrographs;
  }, [project]);

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
    stepList.push('Import');
    return stepList;
  }, [includeInstrumentInfo, includeOrientation, isAssociated]);

  const handleBrowseFiles = async () => {
    if (window.api && window.api.openMultipleTiffDialog) {
      try {
        const filePaths = await window.api.openMultipleTiffDialog();
        if (filePaths && filePaths.length > 0) {
          const newFiles: SelectedFile[] = filePaths.map((path: string) => ({
            path,
            name: path.split(/[\\/]/).pop() || path,
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
  };

  // Instrument Info handlers
  const handleInstrumentInfoChange = (field: keyof InstrumentFormData, value: string) => {
    setInstrumentInfoData((prev) => ({ ...prev, [field]: value }));
  };

  // Instrument Data handlers
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

  // Orientation handlers
  const handleOrientationChange = <K extends keyof OrientationFormData>(
    field: K,
    value: OrientationFormData[K]
  ) => {
    setOrientationData((prev) => ({ ...prev, [field]: value }));
  };

  // Load from database
  const handleInstrumentFromDatabase = (instrument: InstrumentData) => {
    // Update instrument info (type)
    setInstrumentInfoData((prev) => ({
      ...prev,
      instrumentType: instrument.instrumentType || prev.instrumentType,
    }));

    // Update instrument data (brand, model, etc.)
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

    // Update detectors
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

  // Copy from existing micrograph
  const handleCopyFromExisting = (micrographId: string) => {
    const sourceMicro = existingMicrographs.find((m) => m.id === micrographId);
    if (!sourceMicro || !sourceMicro.instrument) return;

    const inst = sourceMicro.instrument;

    // Update instrument info
    setInstrumentInfoData({
      instrumentType: inst.instrumentType || '',
      otherInstrumentType: inst.otherInstrumentType || '',
      dataType: inst.dataType || '',
      imageType: sourceMicro.imageType || '',
    });

    // Update instrument data
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

    // Update detectors
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

  const canProceed = () => {
    const currentStepName = steps[activeStep];

    switch (currentStepName) {
      case 'Select Files':
        return selectedFiles.length > 0;

      case 'Instrument & Image Info':
        // Require instrumentType and imageType (matching legacy validation)
        if (!instrumentInfoData.instrumentType) return false;
        if (instrumentInfoData.instrumentType === 'Other' && !instrumentInfoData.otherInstrumentType) return false;
        if (!instrumentInfoData.imageType) return false;
        return true;

      case 'Instrument Data':
        // Instrument data step is always valid (all fields optional)
        return true;

      case 'Orientation':
        return validateOrientationForm(orientationData);

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
    if (!project?.id) {
      console.error('No project ID found');
      return;
    }

    // Determine target sample ID
    let targetSampleId = sampleId;
    if (isAssociated && parentMicrographId) {
      // Find sample containing parent micrograph
      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.some((m) => m.id === parentMicrographId)) {
            targetSampleId = sample.id;
            break;
          }
        }
      }
    }

    if (!targetSampleId) {
      console.error('Could not determine target sample');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: selectedFiles.length, currentFile: '' });
    setImportErrors([]);

    const errors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setImportProgress({ current: i + 1, total: selectedFiles.length, currentFile: file.name });

      try {
        // Convert image to scratch JPEG
        console.log(`[BatchImport] Converting file ${i + 1}/${selectedFiles.length}: ${file.name}`);
        const conversionResult = await window.api!.convertToScratchJPEG(file.path);

        // Load into tile system (ensures tiles are generated)
        await window.api!.loadImageWithTiles(conversionResult.scratchPath);

        // Generate micrograph ID
        const micrographId = crypto.randomUUID();

        // Extract name without extension
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

        // Build micrograph metadata
        const micrograph: MicrographMetadata = {
          id: micrographId,
          name: nameWithoutExt,
          imageWidth: conversionResult.jpegWidth,
          imageHeight: conversionResult.jpegHeight,
          width: conversionResult.jpegWidth,
          height: conversionResult.jpegHeight,
          // NO scalePixelsPerCentimeter - this is the key marker for batch-imported images
          parentID: isAssociated ? parentMicrographId : undefined,
        };

        // Add instrument info if included (FULL data model)
        if (includeInstrumentInfo && instrumentInfoData.instrumentType) {
          micrograph.imageType = instrumentInfoData.imageType;
          micrograph.instrument = {
            instrumentType: instrumentInfoData.instrumentType,
            otherInstrumentType: instrumentInfoData.otherInstrumentType || undefined,
            dataType: instrumentInfoData.dataType || undefined,
            // Instrument data fields
            instrumentBrand: instrumentDataFormData.instrumentBrand || undefined,
            instrumentModel: instrumentDataFormData.instrumentModel || undefined,
            university: instrumentDataFormData.university || undefined,
            laboratory: instrumentDataFormData.laboratory || undefined,
            dataCollectionSoftware: instrumentDataFormData.dataCollectionSoftware || undefined,
            dataCollectionSoftwareVersion: instrumentDataFormData.dataCollectionSoftwareVersion || undefined,
            postProcessingSoftware: instrumentDataFormData.postProcessingSoftware || undefined,
            postProcessingSoftwareVersion: instrumentDataFormData.postProcessingSoftwareVersion || undefined,
            filamentType: instrumentDataFormData.filamentType || undefined,
            instrumentNotes: instrumentDataFormData.instrumentNotes || undefined,
            // Detectors
            instrumentDetectors: detectors
              .filter((d) => d.type || d.make || d.model)
              .map((d) => ({
                detectorType: d.type || undefined,
                detectorMake: d.make || undefined,
                detectorModel: d.model || undefined,
              })),
          };
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

        // Move scratch image to project storage
        await window.api!.moveFromScratch(
          conversionResult.identifier,
          project.id,
          micrographId
        );

        // Add micrograph to store
        useAppStore.getState().addMicrograph(targetSampleId, micrograph);

        // Generate composite thumbnail for the new micrograph
        // Use setTimeout to ensure this runs after store update
        // Note: We don't regenerate parent thumbnails here because batch-imported
        // associated micrographs don't have position data yet - that happens in
        // EditMicrographLocationDialog when the user sets scale/location.
        setTimeout(() => {
          const freshProject = useAppStore.getState().project;
          if (!freshProject || !window.api) return;

          window.api.generateCompositeThumbnail(freshProject.id, micrographId, freshProject)
            .then(() => {
              console.log(`[BatchImport] Generated thumbnail for: ${micrographId}`);
              window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId } }));
            })
            .catch((err) => {
              console.error(`[BatchImport] Failed to generate thumbnail for ${micrographId}:`, err);
            });
        }, 0);

        console.log(`[BatchImport] Successfully imported: ${file.name}`);
      } catch (error) {
        console.error(`[BatchImport] Error importing ${file.name}:`, error);
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setImportErrors(errors);
    setIsImporting(false);

    // If all successful, close dialog
    if (errors.length === 0) {
      handleClose();
    }
  };

  const handleClose = () => {
    // Reset state
    setActiveStep(0);
    setSelectedFiles([]);
    setIncludeInstrumentInfo(false);
    setIncludeOrientation(false);
    setInstrumentInfoData(initialInstrumentInfoData);
    setInstrumentDataFormData(initialInstrumentDataFormData);
    setDetectors([{ type: '', make: '', model: '' }]);
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
            <Typography variant="body2" color="text.secondary">
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
                      sx={{ bgcolor: 'action.hover' }}
                    >
                      <ListItemText
                        primary={file.name}
                        secondary={file.path}
                        secondaryTypographyProps={{ noWrap: true }}
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
              <Typography variant="body2" color="text.secondary">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </Typography>
            )}
          </Stack>
        );

      case 'Instrument & Image Info':
        return (
          <InstrumentInfoForm
            formData={instrumentInfoData}
            onFormChange={handleInstrumentInfoChange}
            onInstrumentFromDatabase={handleInstrumentFromDatabase}
            existingMicrographs={existingMicrographs}
            onCopyFromExisting={handleCopyFromExisting}
            showCopyFromExisting={true}
          />
        );

      case 'Instrument Data':
        return (
          <InstrumentDataForm
            formData={instrumentDataFormData}
            detectors={detectors}
            instrumentType={instrumentInfoData.instrumentType}
            onFormChange={handleInstrumentDataChange}
            onDetectorChange={handleDetectorChange}
            onAddDetector={handleAddDetector}
            onRemoveDetector={handleRemoveDetector}
          />
        );

      case 'Orientation':
        return (
          <OrientationForm
            formData={orientationData}
            onFormChange={handleOrientationChange}
          />
        );

      case 'Import':
        return (
          <Stack spacing={3}>
            <Typography variant="h6">Ready to Import</Typography>
            <Typography variant="body2">
              {selectedFiles.length} micrograph{selectedFiles.length !== 1 ? 's' : ''} will be imported
              {isAssociated ? ` as associated micrographs` : ` as reference micrographs`}.
            </Typography>

            {includeInstrumentInfo && (
              <Typography variant="body2" color="text.secondary">
                Instrument info will be applied to all micrographs.
              </Typography>
            )}

            {includeOrientation && !isAssociated && (
              <Typography variant="body2" color="text.secondary">
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
      PaperProps={{ sx: { minHeight: '60vh' } }}
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
