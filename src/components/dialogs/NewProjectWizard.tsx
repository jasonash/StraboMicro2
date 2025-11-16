/**
 * New Project Wizard
 *
 * Multi-step wizard matching the legacy JavaFX workflow:
 * Step 1: Project Metadata (name, dates, purpose, etc.)
 * Step 2: Dataset Name
 * Step 3: Sample Information
 * Step 4: Load Reference Micrograph
 *
 * After completion, creates project structure in store with micrograph
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  MenuItem,
  Box,
  Stack,
  Grow,
  Typography,
  Link,
} from '@mui/material';
import { useAppStore } from '@/store';

interface NewProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectFormData {
  name: string;
  startDate: string;
  endDate: string;
  purposeOfStudy: string;
  otherTeamMembers: string;
  areaOfInterest: string;
  gpsDatum: string;
  magneticDeclination: string;
  notes: string;
  datasetName: string;
  sampleID: string;
  longitude: string;
  latitude: string;
  mainSamplingPurpose: string;
  otherSamplingPurpose: string;
  sampleDescription: string;
  materialType: string;
  inplacenessOfSample: string;
  orientedSample: string;
  sampleOrientationNotes: string;
  sampleSize: string;
  degreeOfWeathering: string;
  sampleNotes: string;
  sampleType: string;
  color: string;
  lithology: string;
  sampleUnit: string;
  otherMaterialType: string;
  micrographFilePath: string;
  micrographFileName: string;
  micrographWidth: number;
  micrographHeight: number;
}

const initialFormData: ProjectFormData = {
  name: '',
  startDate: '',
  endDate: '',
  purposeOfStudy: '',
  otherTeamMembers: '',
  areaOfInterest: '',
  gpsDatum: '',
  magneticDeclination: '',
  notes: '',
  datasetName: '',
  sampleID: '',
  longitude: '',
  latitude: '',
  mainSamplingPurpose: '',
  otherSamplingPurpose: '',
  sampleDescription: '',
  materialType: '',
  inplacenessOfSample: '',
  orientedSample: '',
  sampleOrientationNotes: '',
  sampleSize: '',
  degreeOfWeathering: '',
  sampleNotes: '',
  sampleType: '',
  color: '',
  lithology: '',
  sampleUnit: '',
  otherMaterialType: '',
  micrographFilePath: '',
  micrographFileName: '',
  micrographWidth: 0,
  micrographHeight: 0,
};

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const loadProject = useAppStore(state => state.loadProject);

  const steps = ['Project Metadata', 'Dataset Information', 'Sample Information', 'Load Reference Micrograph'];

  const updateField = (field: keyof ProjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Validation handlers for latitude/longitude
  const handleLatitudeChange = (value: string) => {
    // Allow empty, minus sign, or valid decimal numbers
    if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
      const num = parseFloat(value);
      // Allow partial input or valid range
      if (value === '' || value === '-' || (num >= -90 && num <= 90) || isNaN(num)) {
        updateField('latitude', value);
      }
    }
  };

  const handleLongitudeChange = (value: string) => {
    // Allow empty, minus sign, or valid decimal numbers
    if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
      const num = parseFloat(value);
      // Allow partial input or valid range
      if (value === '' || value === '-' || (num >= -180 && num <= 180) || isNaN(num)) {
        updateField('longitude', value);
      }
    }
  };

  const handleBrowseImage = async () => {
    if (window.api && window.api.openTiffDialog) {
      try {
        const filePath = await window.api.openTiffDialog();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || '';

          // Load the image to get dimensions and create preview
          const imageData = await window.api.loadTiffImage(filePath);

          setFormData(prev => ({
            ...prev,
            micrographFilePath: filePath,
            micrographFileName: fileName,
            micrographWidth: imageData.width,
            micrographHeight: imageData.height,
          }));

          // Create preview image from base64 data
          setImagePreview(`data:image/png;base64,${imageData.data}`);
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    }
  };

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleFinish = () => {
    // Create micrograph object if file was selected
    const micrographs = formData.micrographFilePath ? [{
      id: crypto.randomUUID(),
      name: formData.micrographFileName,
      imageFilename: formData.micrographFileName,
      imageWidth: formData.micrographWidth,
      imageHeight: formData.micrographHeight,
      visible: true,
      grains: [],
      fabrics: [],
      boundaries: [],
      mineralogy: [],
      veins: [],
      fractures: [],
      folds: [],
      porosity: [],
      pseudotachylyte: [],
      otherFeatures: [],
      spots: []
    }] : [];

    const newProject = {
      id: crypto.randomUUID(),
      name: formData.name,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      purposeOfStudy: formData.purposeOfStudy || undefined,
      otherTeamMembers: formData.otherTeamMembers || undefined,
      areaOfInterest: formData.areaOfInterest || undefined,
      gpsDatum: formData.gpsDatum || undefined,
      magneticDeclination: formData.magneticDeclination || undefined,
      notes: formData.notes || undefined,
      projectLocation: 'local',
      datasets: [{
        id: crypto.randomUUID(),
        name: formData.datasetName,
        samples: [{
          id: crypto.randomUUID(),
          name: formData.sampleID,
          label: formData.sampleID,
          sampleID: formData.sampleID,
          longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
          latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
          mainSamplingPurpose: formData.mainSamplingPurpose || undefined,
          otherSamplingPurpose: formData.otherSamplingPurpose || undefined,
          sampleDescription: formData.sampleDescription || undefined,
          materialType: formData.materialType || undefined,
          inplacenessOfSample: formData.inplacenessOfSample || undefined,
          orientedSample: formData.orientedSample || undefined,
          sampleOrientationNotes: formData.sampleOrientationNotes || undefined,
          sampleSize: formData.sampleSize || undefined,
          degreeOfWeathering: formData.degreeOfWeathering || undefined,
          sampleNotes: formData.sampleNotes || undefined,
          sampleType: formData.sampleType || undefined,
          color: formData.color || undefined,
          lithology: formData.lithology || undefined,
          sampleUnit: formData.sampleUnit || undefined,
          otherMaterialType: formData.otherMaterialType || undefined,
          micrographs: micrographs
        }]
      }]
    };

    loadProject(newProject, null);
    setFormData(initialFormData);
    setImagePreview(null);
    setActiveStep(0);
    onClose();
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setImagePreview(null);
    setActiveStep(0);
    onClose();
  };

  const canProceed = () => {
    if (activeStep === 0) return formData.name.trim() !== '';
    if (activeStep === 1) return formData.datasetName.trim() !== '';
    if (activeStep === 2) {
      // Sample ID is required
      if (formData.sampleID.trim() === '') return false;

      // If "other" is selected for Main Sampling Purpose, require text in Other Sampling Purpose
      if (formData.mainSamplingPurpose === 'other' && formData.otherSamplingPurpose.trim() === '') {
        return false;
      }

      // If "other" is selected for Material Type, require text in Other Material Type
      if (formData.materialType === 'other' && formData.otherMaterialType.trim() === '') {
        return false;
      }

      return true;
    }
    if (activeStep === 3) {
      // Micrograph file is required
      return formData.micrographFilePath.trim() !== '';
    }
    return true;
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Stack spacing={2}>
            <TextField
              fullWidth
              required
              label="Project Name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                InputLabelProps={{ shrink: true }}
                value={formData.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
              />
              <TextField
                fullWidth
                type="date"
                label="End Date"
                InputLabelProps={{ shrink: true }}
                value={formData.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
              />
            </Box>
            <TextField
              fullWidth
              label="Purpose of Study"
              value={formData.purposeOfStudy}
              onChange={(e) => updateField('purposeOfStudy', e.target.value)}
            />
            <TextField
              fullWidth
              label="Other Team Members"
              value={formData.otherTeamMembers}
              onChange={(e) => updateField('otherTeamMembers', e.target.value)}
            />
            <TextField
              fullWidth
              label="Area of Interest"
              value={formData.areaOfInterest}
              onChange={(e) => updateField('areaOfInterest', e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="GPS Datum"
                value={formData.gpsDatum}
                onChange={(e) => updateField('gpsDatum', e.target.value)}
              />
              <TextField
                fullWidth
                label="Magnetic Declination"
                value={formData.magneticDeclination}
                onChange={(e) => updateField('magneticDeclination', e.target.value)}
              />
            </Box>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Notes"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </Stack>
        );

      case 1:
        return (
          <TextField
            fullWidth
            required
            label="Dataset Name"
            value={formData.datasetName}
            onChange={(e) => updateField('datasetName', e.target.value)}
          />
        );

      case 2:
        return (
          <Stack spacing={2}>
            <TextField
              fullWidth
              required
              label="Sample ID"
              value={formData.sampleID}
              onChange={(e) => updateField('sampleID', e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Longitude"
                placeholder="-180 to 180"
                value={formData.longitude}
                onChange={(e) => handleLongitudeChange(e.target.value)}
                helperText="Valid range: -180 to 180"
              />
              <TextField
                fullWidth
                label="Latitude"
                placeholder="-90 to 90"
                value={formData.latitude}
                onChange={(e) => handleLatitudeChange(e.target.value)}
                helperText="Valid range: -90 to 90"
              />
            </Box>
            <TextField
              fullWidth
              select
              label="Main Sampling Purpose"
              value={formData.mainSamplingPurpose}
              onChange={(e) => {
                updateField('mainSamplingPurpose', e.target.value);
                // Clear "Other Sampling Purpose" if user selects non-"other" option
                if (e.target.value !== 'other') {
                  updateField('otherSamplingPurpose', '');
                }
              }}
            >
              <MenuItem value="">Select Main Sampling Purpose...</MenuItem>
              <MenuItem value="fabric___micro">Fabric / Microstructure</MenuItem>
              <MenuItem value="petrology">Petrology</MenuItem>
              <MenuItem value="geochronology">Geochronology</MenuItem>
              <MenuItem value="geochemistry">Geochemistry</MenuItem>
              <MenuItem value="active_eruptio">Active Eruption</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            {formData.mainSamplingPurpose === 'other' && (
              <TextField
                fullWidth
                required
                label="Other Sampling Purpose"
                value={formData.otherSamplingPurpose}
                onChange={(e) => updateField('otherSamplingPurpose', e.target.value)}
                helperText="Required when 'Other' is selected"
              />
            )}
            <TextField
              fullWidth
              label="Sample Description"
              value={formData.sampleDescription}
              onChange={(e) => updateField('sampleDescription', e.target.value)}
            />
            <TextField
              fullWidth
              select
              label="Material Type"
              value={formData.materialType}
              onChange={(e) => {
                updateField('materialType', e.target.value);
                // Clear "Other Material Type" if user selects non-"other" option
                if (e.target.value !== 'other') {
                  updateField('otherMaterialType', '');
                }
              }}
            >
              <MenuItem value="">Select Material Type...</MenuItem>
              <MenuItem value="intact_rock">Intact Rock</MenuItem>
              <MenuItem value="fragmented_roc">Fragmented Rock</MenuItem>
              <MenuItem value="sediment">Sediment</MenuItem>
              <MenuItem value="tephra">Tephra</MenuItem>
              <MenuItem value="carbon_or_animal">Carbon or Animal</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            {formData.materialType === 'other' && (
              <TextField
                fullWidth
                required
                label="Other Material Type"
                value={formData.otherMaterialType}
                onChange={(e) => updateField('otherMaterialType', e.target.value)}
                helperText="Required when 'Other' is selected"
              />
            )}
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Sample Notes"
              value={formData.sampleNotes}
              onChange={(e) => updateField('sampleNotes', e.target.value)}
            />
          </Stack>
        );

      case 3:
        return (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Select a reference micrograph image file to add to this sample. This will be the base image
              for your annotations and measurements.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                required
                label="Micrograph File Path"
                value={formData.micrographFilePath}
                InputProps={{ readOnly: true }}
                helperText="Click 'Browse' to select an image file"
              />
              <Button
                variant="contained"
                onClick={handleBrowseImage}
                sx={{ minWidth: '120px', mt: 0 }}
              >
                Browse...
              </Button>
            </Box>
            {formData.micrographFileName && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  <strong>File:</strong> {formData.micrographFileName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Dimensions:</strong> {formData.micrographWidth} × {formData.micrographHeight} pixels
                </Typography>
              </Box>
            )}
            {imagePreview && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  backgroundColor: 'background.default',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={imagePreview}
                  alt="Micrograph preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    objectFit: 'contain',
                  }}
                />
              </Box>
            )}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                <Link
                  href="https://www.google.com/search?q=reference+micrograph"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  What is a reference micrograph?
                </Link>
              </Typography>
            </Box>
          </Stack>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      TransitionComponent={Grow}
      transitionDuration={300}
    >
      <DialogTitle>New Project</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ pt: 3, pb: 5 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Box sx={{ mt: 2, mb: 1 }}>
          {renderStepContent(activeStep)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        {activeStep > 0 && (
          <Button onClick={handleBack}>Back</Button>
        )}
        {activeStep < steps.length - 1 ? (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleFinish}
            disabled={!canProceed()}
          >
            Finish
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
