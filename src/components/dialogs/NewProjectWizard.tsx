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

import { useState, useEffect } from 'react';
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
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
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
  instrumentType: string;
  otherInstrumentType: string;
  dataType: string;
  imageType: string;
  instrumentBrand: string;
  instrumentModel: string;
  university: string;
  laboratory: string;
  dataCollectionSoftware: string;
  dataCollectionSoftwareVersion: string;
  postProcessingSoftware: string;
  postProcessingSoftwareVersion: string;
  filamentType: string;
  instrumentNotes: string;
  // Instrument Settings fields (Step 7)
  accelerationVoltage: string;
  beamCurrent: string;
  spotSize: string;
  aperture: string;
  cameraLength: string;
  cameraBinning: string;
  dwellTime: string;
  analysisDwellTime: string;
  analysisDwellTimeUnit: string;
  backgroundDwellTime: string;
  backgroundDwellTimeUnit: string;
  workingDistance: string;
  instrumentPurged: string;
  instrumentPurgedGasType: string;
  instrumentPurgedGasOtherType: string;
  environmentPurged: string;
  environmentPurgedGasType: string;
  environmentPurgedGasOtherType: string;
  scanTime: string;
  resolution: string;
  spectralResolution: string;
  wavenumberRange: string;
  averaging: string;
  excitationWavelength: string;
  laserPower: string;
  diffractionGrating: string;
  integrationTime: string;
  objective: string;
  calibration: string;
  cantileverStiffness: string;
  tipDiameter: string;
  operatingFrequency: string;
  scanDimensions: string;
  scanArea: string;
  spatialResolution: string;
  temperatureOfRoom: string;
  relativeHumidity: string;
  sampleTemperature: string;
  stepSize: string;
  backgroundCorrectionTechnique: string;
  deadTime: string;
  energyLoss: string;
  backgroundComposition: string;
  otherBackgroundComposition: string;
  clColor: string;
  rgbCheck: string[];
  atomicMode: string;
  backgroundCorrectionFrequencyAndNotes: string;
  notesOnPostProcessing: string;
  calibrationStandardNotes: string;
  notesOnCrystalStructuresUsed: string;
}

interface Detector {
  type: string;
  make: string;
  model: string;
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
  instrumentType: '',
  otherInstrumentType: '',
  dataType: '',
  imageType: '',
  instrumentBrand: '',
  instrumentModel: '',
  university: '',
  laboratory: '',
  dataCollectionSoftware: '',
  dataCollectionSoftwareVersion: '',
  postProcessingSoftware: '',
  postProcessingSoftwareVersion: '',
  filamentType: '',
  instrumentNotes: '',
  accelerationVoltage: '',
  beamCurrent: '',
  spotSize: '',
  aperture: '',
  cameraLength: '',
  cameraBinning: '',
  dwellTime: '',
  analysisDwellTime: '',
  analysisDwellTimeUnit: 's',
  backgroundDwellTime: '',
  backgroundDwellTimeUnit: 's',
  workingDistance: '',
  instrumentPurged: '',
  instrumentPurgedGasType: '',
  instrumentPurgedGasOtherType: '',
  environmentPurged: '',
  environmentPurgedGasType: '',
  environmentPurgedGasOtherType: '',
  scanTime: '',
  resolution: '',
  spectralResolution: '',
  wavenumberRange: '',
  averaging: '',
  excitationWavelength: '',
  laserPower: '',
  diffractionGrating: '',
  integrationTime: '',
  objective: '',
  calibration: '',
  cantileverStiffness: '',
  tipDiameter: '',
  operatingFrequency: '',
  scanDimensions: '',
  scanArea: '',
  spatialResolution: '',
  temperatureOfRoom: '',
  relativeHumidity: '',
  sampleTemperature: '',
  stepSize: '',
  backgroundCorrectionTechnique: '',
  deadTime: '',
  energyLoss: '',
  backgroundComposition: '',
  otherBackgroundComposition: '',
  clColor: '',
  rgbCheck: [],
  atomicMode: '',
  backgroundCorrectionFrequencyAndNotes: '',
  notesOnPostProcessing: '',
  calibrationStandardNotes: '',
  notesOnCrystalStructuresUsed: '',
};

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);
  const loadProject = useAppStore(state => state.loadProject);

  // Determine which steps to show based on instrument type
  const shouldShowInstrumentSettings = () => {
    return formData.instrumentType &&
           !['Optical Microscopy', 'Scanner', 'Other'].includes(formData.instrumentType);
  };

  const baseSteps = ['Project Metadata', 'Dataset Information', 'Sample Information', 'Load Reference Micrograph', 'Instrument & Image Information', 'Instrument Data'];
  const steps = shouldShowInstrumentSettings()
    ? [...baseSteps, 'Instrument Settings']
    : baseSteps;

  const updateField = (field: keyof ProjectFormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Auto-set imageType based on dataType for certain instrument/data type combinations
  useEffect(() => {
    if (formData.instrumentType === 'Transmission Electron Microscopy (TEM)' && formData.dataType) {
      if (!['Electron Diffraction', 'Energy Dispersive X-ray Spectroscopy (EDS)'].includes(formData.dataType)) {
        setFormData(prev => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' && formData.dataType) {
      if (!['Energy Dispersive X-ray Spectroscopy (EDS)', 'Cathodoluminescence (CL)'].includes(formData.dataType)) {
        setFormData(prev => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (formData.instrumentType === 'Scanning Electron Microscopy (SEM)' && formData.dataType) {
      if (!['Electron Backscatter Diffraction (EBSD)', 'Energy Dispersive X-ray Spectroscopy (EDS)',
           'Wavelength-dispersive X-ray spectroscopy (WDS)', 'Cathodoluminescence (CL)',
           'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)'].includes(formData.dataType)) {
        setFormData(prev => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (formData.instrumentType === 'Electron Microprobe' && formData.dataType) {
      if (!['Energy Dispersive X-ray Spectroscopy (EDS)', 'Wavelength-dispersive X-ray spectroscopy (WDS)',
           'Cathodoluminescence (CL)'].includes(formData.dataType)) {
        setFormData(prev => ({ ...prev, imageType: formData.dataType }));
      }
    }
  }, [formData.instrumentType, formData.dataType]);

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

          // Just store the file path - dimensions will be loaded later when displaying
          setFormData(prev => ({
            ...prev,
            micrographFilePath: filePath,
            micrographFileName: fileName,
            micrographWidth: 0,  // Will be loaded later
            micrographHeight: 0,  // Will be loaded later
          }));
        }
      } catch (error) {
        console.error('Error selecting image:', error);
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
      imageType: formData.imageType || undefined,
      visible: true,
      instrument: {
        instrumentType: formData.instrumentType || undefined,
        otherInstrumentType: formData.otherInstrumentType || undefined,
        dataType: formData.dataType || undefined,
        instrumentBrand: formData.instrumentBrand || undefined,
        instrumentModel: formData.instrumentModel || undefined,
        university: formData.university || undefined,
        laboratory: formData.laboratory || undefined,
        dataCollectionSoftware: formData.dataCollectionSoftware || undefined,
        dataCollectionSoftwareVersion: formData.dataCollectionSoftwareVersion || undefined,
        postProcessingSoftware: formData.postProcessingSoftware || undefined,
        postProcessingSoftwareVersion: formData.postProcessingSoftwareVersion || undefined,
        filamentType: formData.filamentType || undefined,
        instrumentNotes: formData.instrumentNotes || undefined,
        instrumentDetectors: detectors.filter(d => d.type || d.make || d.model).map(d => ({
          detectorType: d.type || undefined,
          detectorMake: d.make || undefined,
          detectorModel: d.model || undefined,
        })),
      },
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
    setDetectors([{ type: '', make: '', model: '' }]);
    setActiveStep(0);
    onClose();
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setDetectors([{ type: '', make: '', model: '' }]);
    setActiveStep(0);
    onClose();
  };

  const updateDetector = (index: number, field: keyof Detector, value: string) => {
    setDetectors(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addDetector = () => {
    setDetectors(prev => [...prev, { type: '', make: '', model: '' }]);
  };

  const removeDetector = (index: number) => {
    setDetectors(prev => prev.filter((_, i) => i !== index));
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
    if (activeStep === 4) {
      // Instrument Type is required
      if (formData.instrumentType.trim() === '') return false;

      // If "Other" is selected for Instrument Type, require text in Other Instrument Type
      if (formData.instrumentType === 'Other' && formData.otherInstrumentType.trim() === '') {
        return false;
      }

      // Image Type is required (for most instrument types)
      if (formData.imageType.trim() === '') return false;

      return true;
    }
    if (activeStep === 5) {
      // Step 6: Instrument Data - no required fields, all optional
      return true;
    }
    if (activeStep === 6) {
      // Step 7: Instrument Settings - validation for conditional "Other" fields
      if (formData.instrumentPurged === 'Yes' &&
          formData.instrumentPurgedGasType === 'Other' &&
          formData.instrumentPurgedGasOtherType.trim() === '') {
        return false;
      }
      if (formData.environmentPurged === 'Yes' &&
          formData.environmentPurgedGasType === 'Other' &&
          formData.environmentPurgedGasOtherType.trim() === '') {
        return false;
      }
      if (formData.backgroundComposition === 'Other' &&
          formData.otherBackgroundComposition.trim() === '') {
        return false;
      }
      return true;
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
                helperText="Click 'Browse' to select an image file (TIFF, JPEG, PNG, BMP)"
              />
              <Button
                variant="contained"
                onClick={handleBrowseImage}
                sx={{ minWidth: '120px', mt: 0 }}
              >
                Browse...
              </Button>
            </Box>
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

      case 4:
        return (
          <Stack spacing={2}>
            <TextField
              fullWidth
              required
              select
              label="Instrument Type"
              value={formData.instrumentType}
              onChange={(e) => {
                updateField('instrumentType', e.target.value);
                // Clear dependent fields when instrument type changes
                updateField('otherInstrumentType', '');
                updateField('dataType', '');
                updateField('imageType', '');
              }}
            >
              <MenuItem value="">Select Instrument Type...</MenuItem>
              <MenuItem value="Optical Microscopy">Optical Microscopy</MenuItem>
              <MenuItem value="Scanner">Scanner</MenuItem>
              <MenuItem value="Transmission Electron Microscopy (TEM)">Transmission Electron Microscopy (TEM)</MenuItem>
              <MenuItem value="Scanning Transmission Electron Microscopy (STEM)">Scanning Transmission Electron Microscopy (STEM)</MenuItem>
              <MenuItem value="Scanning Electron Microscopy (SEM)">Scanning Electron Microscopy (SEM)</MenuItem>
              <MenuItem value="Electron Microprobe">Electron Microprobe</MenuItem>
              <MenuItem value="Fourier Transform Infrared Spectroscopy (FTIR)">Fourier Transform Infrared Spectroscopy (FTIR)</MenuItem>
              <MenuItem value="Raman Spectroscopy">Raman Spectroscopy</MenuItem>
              <MenuItem value="Atomic Force Microscopy (AFM)">Atomic Force Microscopy (AFM)</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </TextField>

            {formData.instrumentType === 'Other' && (
              <TextField
                fullWidth
                required
                label="Other Instrument Type"
                value={formData.otherInstrumentType}
                onChange={(e) => updateField('otherInstrumentType', e.target.value)}
                helperText="Required when 'Other' is selected"
              />
            )}

            {/* Data Type field - shown for TEM, STEM, SEM, Electron Microprobe */}
            {(formData.instrumentType === 'Transmission Electron Microscopy (TEM)') && (
              <TextField
                fullWidth
                select
                label="Data Type"
                value={formData.dataType}
                onChange={(e) => {
                  updateField('dataType', e.target.value);
                  // Clear imageType when dataType changes
                  updateField('imageType', '');
                }}
              >
                <MenuItem value="">Select Data Type...</MenuItem>
                <MenuItem value="Bright Field">Bright Field</MenuItem>
                <MenuItem value="Dark Field">Dark Field</MenuItem>
                <MenuItem value="Electron Diffraction">Electron Diffraction</MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">Energy Dispersive X-ray Spectroscopy (EDS)</MenuItem>
                <MenuItem value="Automated Crystal Orientation Mapping (ACOM)">Automated Crystal Orientation Mapping (ACOM)</MenuItem>
                <MenuItem value="Energy Dispersive X-ray Tomography">Energy Dispersive X-ray Tomography</MenuItem>
              </TextField>
            )}

            {(formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)') && (
              <TextField
                fullWidth
                select
                label="Data Type"
                value={formData.dataType}
                onChange={(e) => {
                  updateField('dataType', e.target.value);
                  updateField('imageType', '');
                }}
              >
                <MenuItem value="">Select Data Type...</MenuItem>
                <MenuItem value="Bright Field">Bright Field</MenuItem>
                <MenuItem value="Dark Field">Dark Field</MenuItem>
                <MenuItem value="Annular Dark Field (ADF)">Annular Dark Field (ADF)</MenuItem>
                <MenuItem value="High-Angle Annular Dark Field (HAADF)">High-Angle Annular Dark Field (HAADF)</MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">Energy Dispersive X-ray Spectroscopy (EDS)</MenuItem>
                <MenuItem value="Electron Energy Loss Spectroscopy (EELS)">Electron Energy Loss Spectroscopy (EELS)</MenuItem>
                <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
              </TextField>
            )}

            {(formData.instrumentType === 'Scanning Electron Microscopy (SEM)') && (
              <TextField
                fullWidth
                select
                label="Data Type"
                value={formData.dataType}
                onChange={(e) => {
                  updateField('dataType', e.target.value);
                  updateField('imageType', '');
                }}
              >
                <MenuItem value="">Select Data Type...</MenuItem>
                <MenuItem value="Secondary Electron (SE)">Secondary Electron (SE)</MenuItem>
                <MenuItem value="Backscatter Electron (BSE)">Backscatter Electron (BSE)</MenuItem>
                <MenuItem value="Forescatter Electron (FSE)">Forescatter Electron (FSE)</MenuItem>
                <MenuItem value="Electron Backscatter Diffraction (EBSD)">Electron Backscatter Diffraction (EBSD)</MenuItem>
                <MenuItem value="Transmission Kikuchi Diffraction (TKD)">Transmission Kikuchi Diffraction (TKD)</MenuItem>
                <MenuItem value="Electron Channeling Contrast Imaging (ECCI)">Electron Channeling Contrast Imaging (ECCI)</MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">Energy Dispersive X-ray Spectroscopy (EDS)</MenuItem>
                <MenuItem value="Wavelength-dispersive X-ray spectroscopy (WDS)">Wavelength-dispersive X-ray spectroscopy (WDS)</MenuItem>
                <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
                <MenuItem value="Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)">Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)</MenuItem>
              </TextField>
            )}

            {(formData.instrumentType === 'Electron Microprobe') && (
              <TextField
                fullWidth
                select
                label="Data Type"
                value={formData.dataType}
                onChange={(e) => {
                  updateField('dataType', e.target.value);
                  updateField('imageType', '');
                }}
              >
                <MenuItem value="">Select Data Type...</MenuItem>
                <MenuItem value="Secondary Electron (SE)">Secondary Electron (SE)</MenuItem>
                <MenuItem value="Backscatter Electron (BSE)">Backscatter Electron (BSE)</MenuItem>
                <MenuItem value="Electron Channeling Contrast Imaging (ECCI)">Electron Channeling Contrast Imaging (ECCI)</MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">Energy Dispersive X-ray Spectroscopy (EDS)</MenuItem>
                <MenuItem value="Wavelength-dispersive X-ray spectroscopy (WDS)">Wavelength-dispersive X-ray spectroscopy (WDS)</MenuItem>
                <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
              </TextField>
            )}

            {/* Image Type field - shown for Optical Microscopy, Scanner, FTIR, Raman, AFM */}
            {formData.instrumentType === 'Optical Microscopy' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Plane Polarized Light">Plane Polarized Light</MenuItem>
                <MenuItem value="Cross Polarized Light">Cross Polarized Light</MenuItem>
                <MenuItem value="Reflected Light">Reflected Light</MenuItem>
                <MenuItem value="1/4 Lambda Plate">1/4 Lambda Plate</MenuItem>
                <MenuItem value="Cathodoluminescence">Cathodoluminescence</MenuItem>
                <MenuItem value="Gypsum Plate">Gypsum Plate</MenuItem>
              </TextField>
            )}

            {formData.instrumentType === 'Scanner' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="No Polarizer">No Polarizer</MenuItem>
                <MenuItem value="Plane Polarized">Plane Polarized</MenuItem>
                <MenuItem value="Cross Polarized">Cross Polarized</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </TextField>
            )}

            {(formData.instrumentType === 'Fourier Transform Infrared Spectroscopy (FTIR)' ||
              formData.instrumentType === 'Raman Spectroscopy') && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="False Color Map">False Color Map</MenuItem>
                <MenuItem value="Intensity Map">Intensity Map</MenuItem>
              </TextField>
            )}

            {formData.instrumentType === 'Atomic Force Microscopy (AFM)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Topography Image">Topography Image</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type based on Data Type for TEM */}
            {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' &&
             formData.dataType === 'Electron Diffraction' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Selected Area Electron Diffraction (SAED)">Selected Area Electron Diffraction (SAED)</MenuItem>
                <MenuItem value="Convergent Beam Electron Diffraction (CBED)">Convergent Beam Electron Diffraction (CBED)</MenuItem>
                <MenuItem value="Nano Beam Diffraction (NBD)">Nano Beam Diffraction (NBD)</MenuItem>
                <MenuItem value="Large Area Convergent Beam Electron Diffraction (LACBED)">Large Area Convergent Beam Electron Diffraction (LACBED)</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type based on Data Type for STEM CL */}
            {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
             formData.dataType === 'Cathodoluminescence (CL)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Panchromatic CL Image">Panchromatic CL Image</MenuItem>
                <MenuItem value="Wavelength Filtered CL Image">Wavelength Filtered CL Image</MenuItem>
                <MenuItem value="Cathodoluminescence Spectroscopy">Cathodoluminescence Spectroscopy</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type based on Data Type for SEM EBSD */}
            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
             formData.dataType === 'Electron Backscatter Diffraction (EBSD)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Orientation (Euler)">Orientation (Euler)</MenuItem>
                <MenuItem value="Orientation (IPF-X)">Orientation (IPF-X)</MenuItem>
                <MenuItem value="Orientation (IPF-Y)">Orientation (IPF-Y)</MenuItem>
                <MenuItem value="Orientation (IPF-Z)">Orientation (IPF-Z)</MenuItem>
                <MenuItem value="Band Contrast">Band Contrast</MenuItem>
                <MenuItem value="Phase Map">Phase Map</MenuItem>
                <MenuItem value="Misorientation to Mean">Misorientation to Mean</MenuItem>
                <MenuItem value="Grain Boundaries">Grain Boundaries</MenuItem>
                <MenuItem value="Sub-grain Boundaries">Sub-grain Boundaries</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type based on Data Type for SEM CL */}
            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
             formData.dataType === 'Cathodoluminescence (CL)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Panchromatic CL Image">Panchromatic CL Image</MenuItem>
                <MenuItem value="Wavelength Filtered CL Image">Wavelength Filtered CL Image</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type for SEM FIB-SEM */}
            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
             formData.dataType === 'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="FIB Imaging">FIB Imaging</MenuItem>
              </TextField>
            )}

            {/* Conditional Image Type for Electron Microprobe CL */}
            {formData.instrumentType === 'Electron Microprobe' &&
             formData.dataType === 'Cathodoluminescence (CL)' && (
              <TextField
                fullWidth
                required
                select
                label="Image Type"
                value={formData.imageType}
                onChange={(e) => updateField('imageType', e.target.value)}
              >
                <MenuItem value="">Select Image Type...</MenuItem>
                <MenuItem value="Panchromatic SEM-CL Image">Panchromatic SEM-CL Image</MenuItem>
                <MenuItem value="Wavelength Filtered SEM-CL Image">Wavelength Filtered SEM-CL Image</MenuItem>
              </TextField>
            )}

            {/* Auto-set imageType for certain data types that don't need a separate image type dropdown */}
            {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' &&
             formData.dataType &&
             !['Electron Diffraction', 'Energy Dispersive X-ray Spectroscopy (EDS)'].includes(formData.dataType) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Image Type: {formData.dataType}
              </Typography>
            )}

            {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
             formData.dataType &&
             !['Energy Dispersive X-ray Spectroscopy (EDS)', 'Cathodoluminescence (CL)'].includes(formData.dataType) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Image Type: {formData.dataType}
              </Typography>
            )}

            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
             formData.dataType &&
             !['Electron Backscatter Diffraction (EBSD)', 'Energy Dispersive X-ray Spectroscopy (EDS)',
               'Wavelength-dispersive X-ray spectroscopy (WDS)', 'Cathodoluminescence (CL)',
               'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)'].includes(formData.dataType) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Image Type: {formData.dataType}
              </Typography>
            )}

            {formData.instrumentType === 'Electron Microprobe' &&
             formData.dataType &&
             !['Energy Dispersive X-ray Spectroscopy (EDS)', 'Wavelength-dispersive X-ray spectroscopy (WDS)',
               'Cathodoluminescence (CL)'].includes(formData.dataType) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Image Type: {formData.dataType}
              </Typography>
            )}
          </Stack>
        );

      case 5:
        const showDetectors = ['Transmission Electron Microscopy (TEM)', 'Scanning Transmission Electron Microscopy (STEM)',
                               'Scanning Electron Microscopy (SEM)', 'Electron Microprobe'].includes(formData.instrumentType);

        return (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Instrument Type: {formData.instrumentType}
            </Typography>

            <TextField
              fullWidth
              label="Instrument Brand"
              placeholder="e.g., FEI, JEOL, Zeiss"
              value={formData.instrumentBrand}
              onChange={(e) => updateField('instrumentBrand', e.target.value)}
            />

            <TextField
              fullWidth
              label="Instrument Model"
              placeholder="e.g., Quanta 650, JEM-2100"
              value={formData.instrumentModel}
              onChange={(e) => updateField('instrumentModel', e.target.value)}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="University"
                value={formData.university}
                onChange={(e) => updateField('university', e.target.value)}
              />
              <TextField
                fullWidth
                label="Laboratory"
                value={formData.laboratory}
                onChange={(e) => updateField('laboratory', e.target.value)}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Data Collection Software"
                value={formData.dataCollectionSoftware}
                onChange={(e) => updateField('dataCollectionSoftware', e.target.value)}
              />
              <TextField
                fullWidth
                label="Version"
                value={formData.dataCollectionSoftwareVersion}
                onChange={(e) => updateField('dataCollectionSoftwareVersion', e.target.value)}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Post Processing Software"
                value={formData.postProcessingSoftware}
                onChange={(e) => updateField('postProcessingSoftware', e.target.value)}
              />
              <TextField
                fullWidth
                label="Version"
                value={formData.postProcessingSoftwareVersion}
                onChange={(e) => updateField('postProcessingSoftwareVersion', e.target.value)}
              />
            </Box>

            {showDetectors && (
              <>
                <TextField
                  fullWidth
                  label="Filament Type"
                  placeholder="e.g., W, LaB6, Field Emission"
                  value={formData.filamentType}
                  onChange={(e) => updateField('filamentType', e.target.value)}
                />

                <Typography variant="h6" sx={{ mt: 2 }}>
                  Detectors
                </Typography>

                {detectors.map((detector, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <TextField
                      fullWidth
                      label="Type"
                      placeholder="e.g., EBSD, Spectrometer"
                      value={detector.type}
                      onChange={(e) => updateDetector(index, 'type', e.target.value)}
                    />
                    <TextField
                      fullWidth
                      label="Make"
                      placeholder="e.g., Oxford"
                      value={detector.make}
                      onChange={(e) => updateDetector(index, 'make', e.target.value)}
                    />
                    <TextField
                      fullWidth
                      label="Model"
                      placeholder="e.g., Nordlys"
                      value={detector.model}
                      onChange={(e) => updateDetector(index, 'model', e.target.value)}
                    />
                    {detectors.length > 1 && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => removeDetector(index)}
                        sx={{ minWidth: '100px' }}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                ))}

                <Button variant="outlined" onClick={addDetector} sx={{ alignSelf: 'center' }}>
                  Add Additional Detector
                </Button>
              </>
            )}

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Instrument Notes"
              value={formData.instrumentNotes}
              onChange={(e) => updateField('instrumentNotes', e.target.value)}
            />
          </Stack>
        );

      case 6:
        // Step 7: Instrument Settings - Only shown for certain instrument types
        return (
          <Stack spacing={2}>
            {/* TEM Settings */}
            {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' && (
              <>
                <Typography variant="h6">TEM Settings</Typography>
                <TextField
                  fullWidth
                  label="Acceleration Voltage"
                  value={formData.accelerationVoltage}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>kV</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Beam Current"
                  value={formData.beamCurrent}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nA</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Spot Size"
                  value={formData.spotSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Aperture"
                  value={formData.aperture}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('aperture', val);
                  }}
                />
                <TextField
                  fullWidth
                  label="Camera Length"
                  value={formData.cameraLength}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('cameraLength', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>mm</Typography> }}
                />

                {/* EDS Settings for TEM */}
                {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">EDS Settings</Typography>
                    <TextField
                      fullWidth
                      label="Step Size"
                      value={formData.stepSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }}
                    />
                    <TextField
                      fullWidth
                      label="Analysis Dwell Time (/pixel)"
                      value={formData.analysisDwellTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }}
                    />
                    <TextField
                      fullWidth
                      label="Dead Time"
                      value={formData.deadTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }}
                    />
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Calibration / Standard Notes"
                      value={formData.calibrationStandardNotes}
                      onChange={(e) => updateField('calibrationStandardNotes', e.target.value)}
                    />
                  </>
                )}

                {/* CL Settings for TEM */}
                {formData.dataType === 'Cathodoluminescence (CL)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">CL Settings</Typography>
                    <TextField
                      fullWidth
                      select
                      label="Color"
                      value={formData.clColor}
                      onChange={(e) => {
                        updateField('clColor', e.target.value);
                        if (e.target.value !== 'Color CL') {
                          updateField('rgbCheck', []);
                        }
                      }}
                    >
                      <MenuItem value="">Select...</MenuItem>
                      <MenuItem value="Color CL">Color CL</MenuItem>
                      <MenuItem value="Panchromatic (greyscale)">Panchromatic (greyscale)</MenuItem>
                    </TextField>
                    {formData.clColor === 'Color CL' && (
                      <FormGroup row>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={formData.rgbCheck.includes('R')}
                              onChange={(e) => {
                                const newCheck = e.target.checked
                                  ? [...formData.rgbCheck, 'R']
                                  : formData.rgbCheck.filter(c => c !== 'R');
                                updateField('rgbCheck', newCheck);
                              }}
                            />
                          }
                          label="Red"
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={formData.rgbCheck.includes('G')}
                              onChange={(e) => {
                                const newCheck = e.target.checked
                                  ? [...formData.rgbCheck, 'G']
                                  : formData.rgbCheck.filter(c => c !== 'G');
                                updateField('rgbCheck', newCheck);
                              }}
                            />
                          }
                          label="Green"
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={formData.rgbCheck.includes('B')}
                              onChange={(e) => {
                                const newCheck = e.target.checked
                                  ? [...formData.rgbCheck, 'B']
                                  : formData.rgbCheck.filter(c => c !== 'B');
                                updateField('rgbCheck', newCheck);
                              }}
                            />
                          }
                          label="Blue"
                        />
                      </FormGroup>
                    )}
                  </>
                )}
              </>
            )}

            {/* STEM Settings */}
            {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' && (
              <>
                <Typography variant="h6">STEM Settings</Typography>
                <TextField
                  fullWidth
                  label="Acceleration Voltage"
                  value={formData.accelerationVoltage}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>kV</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Beam Current"
                  value={formData.beamCurrent}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nA</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Spot Size"
                  value={formData.spotSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Aperture"
                  value={formData.aperture}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('aperture', val);
                  }}
                />
                <TextField
                  fullWidth
                  label="Camera Length"
                  value={formData.cameraLength}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('cameraLength', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>mm</Typography> }}
                />
                <TextField
                  fullWidth
                  label="Camera Binning"
                  value={formData.cameraBinning}
                  onChange={(e) => updateField('cameraBinning', e.target.value)}
                />
                <TextField
                  fullWidth
                  label="Dwell Time"
                  value={formData.dwellTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('dwellTime', val);
                  }}
                  InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>s</Typography> }}
                />

                {/* EELS Settings for STEM */}
                {formData.dataType === 'Electron Energy Loss Spectroscopy (EELS)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">EELS Settings</Typography>
                    <TextField
                      fullWidth
                      label="Energy Loss"
                      value={formData.energyLoss}
                      onChange={(e) => updateField('energyLoss', e.target.value)}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>eV</Typography> }}
                    />
                  </>
                )}

                {/* EDS Settings for STEM */}
                {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">EDS Settings</Typography>
                    <TextField
                      fullWidth
                      label="Step Size"
                      value={formData.stepSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }}
                    />
                    <TextField
                      fullWidth
                      label="Analysis Dwell Time (/pixel)"
                      value={formData.analysisDwellTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }}
                    />
                    <TextField
                      fullWidth
                      label="Dead Time"
                      value={formData.deadTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val);
                      }}
                      InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }}
                    />
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Calibration / Standard Notes"
                      value={formData.calibrationStandardNotes}
                      onChange={(e) => updateField('calibrationStandardNotes', e.target.value)}
                    />
                  </>
                )}

                {/* CL Settings for STEM */}
                {formData.dataType === 'Cathodoluminescence (CL)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">CL Settings</Typography>
                    <TextField
                      fullWidth
                      select
                      label="Color"
                      value={formData.clColor}
                      onChange={(e) => {
                        updateField('clColor', e.target.value);
                        if (e.target.value !== 'Color CL') {
                          updateField('rgbCheck', []);
                        }
                      }}
                    >
                      <MenuItem value="">Select...</MenuItem>
                      <MenuItem value="Color CL">Color CL</MenuItem>
                      <MenuItem value="Panchromatic (greyscale)">Panchromatic (greyscale)</MenuItem>
                    </TextField>
                    {formData.clColor === 'Color CL' && (
                      <FormGroup row>
                        <FormControlLabel control={<Checkbox checked={formData.rgbCheck.includes('R')} onChange={(e) => { const newCheck = e.target.checked ? [...formData.rgbCheck, 'R'] : formData.rgbCheck.filter(c => c !== 'R'); updateField('rgbCheck', newCheck); }} />} label="Red" />
                        <FormControlLabel control={<Checkbox checked={formData.rgbCheck.includes('G')} onChange={(e) => { const newCheck = e.target.checked ? [...formData.rgbCheck, 'G'] : formData.rgbCheck.filter(c => c !== 'G'); updateField('rgbCheck', newCheck); }} />} label="Green" />
                        <FormControlLabel control={<Checkbox checked={formData.rgbCheck.includes('B')} onChange={(e) => { const newCheck = e.target.checked ? [...formData.rgbCheck, 'B'] : formData.rgbCheck.filter(c => c !== 'B'); updateField('rgbCheck', newCheck); }} />} label="Blue" />
                      </FormGroup>
                    )}
                  </>
                )}
              </>
            )}

            {/* SEM Settings */}
            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' && (
              <>
                <Typography variant="h6">SEM Settings</Typography>
                <TextField fullWidth label="Acceleration Voltage" value={formData.accelerationVoltage} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>kV</Typography> }} />
                <TextField fullWidth label="Beam Current" value={formData.beamCurrent} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nA</Typography> }} />
                <TextField fullWidth label="Spot Size" value={formData.spotSize} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                <TextField fullWidth label="Working Distance" value={formData.workingDistance} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('workingDistance', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>mm</Typography> }} />

                {/* EDS/WDS Settings for SEM */}
                {(formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' || formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">{formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ? 'EDS' : 'WDS'} Settings</Typography>
                    <TextField fullWidth label="Step Size" value={formData.stepSize} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                    <TextField fullWidth label="Analysis Dwell Time (/pixel)" value={formData.analysisDwellTime} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }} />
                    <TextField fullWidth label="Dead Time" value={formData.deadTime} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>ms</Typography> }} />
                    <TextField fullWidth multiline rows={3} label="Calibration / Standard Notes" value={formData.calibrationStandardNotes} onChange={(e) => updateField('calibrationStandardNotes', e.target.value)} />
                  </>
                )}

                {/* EBSD Settings for SEM */}
                {formData.dataType === 'Electron Backscatter Diffraction (EBSD)' && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">EBSD Settings</Typography>
                    <TextField fullWidth label="Step Size" value={formData.stepSize} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                    <TextField fullWidth multiline rows={3} label="Notes on Crystal Structures Used" value={formData.notesOnCrystalStructuresUsed} onChange={(e) => updateField('notesOnCrystalStructuresUsed', e.target.value)} />
                  </>
                )}
              </>
            )}

            {/* Electron Microprobe Settings */}
            {formData.instrumentType === 'Electron Microprobe' && (
              <>
                <Typography variant="h6">Electron Microprobe Settings</Typography>
                <TextField fullWidth label="Acceleration Voltage" value={formData.accelerationVoltage} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>kV</Typography> }} />
                <TextField fullWidth label="Beam Current" value={formData.beamCurrent} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nA</Typography> }} />
                <TextField fullWidth label="Spot Size" value={formData.spotSize} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />

                {(formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' || formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6">{formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ? 'EDS' : 'WDS'} Settings</Typography>
                    <TextField fullWidth label="Step Size" value={formData.stepSize} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val); }} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                    <TextField fullWidth multiline rows={3} label="Calibration / Standard Notes" value={formData.calibrationStandardNotes} onChange={(e) => updateField('calibrationStandardNotes', e.target.value)} />
                  </>
                )}
              </>
            )}

            {/* FTIR Settings */}
            {formData.instrumentType === 'Fourier Transform Infrared Spectroscopy (FTIR)' && (
              <>
                <Typography variant="h6">FTIR Settings</Typography>
                <TextField fullWidth label="Scan Time" value={formData.scanTime} onChange={(e) => updateField('scanTime', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>s</Typography> }} />
                <TextField fullWidth label="Resolution" value={formData.resolution} onChange={(e) => updateField('resolution', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>cm⁻¹</Typography> }} />
                <TextField fullWidth label="Spectral Resolution" value={formData.spectralResolution} onChange={(e) => updateField('spectralResolution', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>cm⁻¹</Typography> }} />
                <TextField fullWidth label="Wavenumber Range" value={formData.wavenumberRange} onChange={(e) => updateField('wavenumberRange', e.target.value)} placeholder="e.g., 4000-400" InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>cm⁻¹</Typography> }} />
                <TextField fullWidth label="Averaging (number of scans)" value={formData.averaging} onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*$/.test(val)) updateField('averaging', val); }} />
                <TextField fullWidth label="Spatial Resolution" value={formData.spatialResolution} onChange={(e) => updateField('spatialResolution', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                <TextField fullWidth multiline rows={3} label="Background Correction: Frequency and Notes" value={formData.backgroundCorrectionFrequencyAndNotes} onChange={(e) => updateField('backgroundCorrectionFrequencyAndNotes', e.target.value)} />
              </>
            )}

            {/* Raman Spectroscopy Settings */}
            {formData.instrumentType === 'Raman Spectroscopy' && (
              <>
                <Typography variant="h6">Raman Spectroscopy Settings</Typography>
                <TextField fullWidth label="Excitation Wavelength" value={formData.excitationWavelength} onChange={(e) => updateField('excitationWavelength', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nm</Typography> }} />
                <TextField fullWidth label="Laser Power" value={formData.laserPower} onChange={(e) => updateField('laserPower', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>mW</Typography> }} />
                <TextField fullWidth label="Diffraction Grating" value={formData.diffractionGrating} onChange={(e) => updateField('diffractionGrating', e.target.value)} placeholder="e.g., 600 lines/mm" />
                <TextField fullWidth label="Integration Time" value={formData.integrationTime} onChange={(e) => updateField('integrationTime', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>s</Typography> }} />
                <TextField fullWidth label="Objective" value={formData.objective} onChange={(e) => updateField('objective', e.target.value)} placeholder="e.g., 50x, 100x" />
                <TextField fullWidth label="Spatial Resolution" value={formData.spatialResolution} onChange={(e) => updateField('spatialResolution', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um</Typography> }} />
                <TextField fullWidth multiline rows={3} label="Calibration Notes" value={formData.calibrationStandardNotes} onChange={(e) => updateField('calibrationStandardNotes', e.target.value)} />
              </>
            )}

            {/* AFM Settings */}
            {formData.instrumentType === 'Atomic Force Microscopy (AFM)' && (
              <>
                <Typography variant="h6">AFM Settings</Typography>
                <TextField fullWidth select label="Atomic Mode" value={formData.atomicMode} onChange={(e) => updateField('atomicMode', e.target.value)}>
                  <MenuItem value="">Select...</MenuItem>
                  <MenuItem value="Contact">Contact</MenuItem>
                  <MenuItem value="Non-Contact">Non-Contact</MenuItem>
                  <MenuItem value="Tapping">Tapping</MenuItem>
                </TextField>
                <TextField fullWidth label="Cantilever Stiffness" value={formData.cantileverStiffness} onChange={(e) => updateField('cantileverStiffness', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>N/m</Typography> }} />
                <TextField fullWidth label="Tip Diameter" value={formData.tipDiameter} onChange={(e) => updateField('tipDiameter', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>nm</Typography> }} />
                <TextField fullWidth label="Operating Frequency" value={formData.operatingFrequency} onChange={(e) => updateField('operatingFrequency', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>kHz</Typography> }} />
                <TextField fullWidth label="Scan Dimensions" value={formData.scanDimensions} onChange={(e) => updateField('scanDimensions', e.target.value)} placeholder="e.g., 512x512" />
                <TextField fullWidth label="Scan Area" value={formData.scanArea} onChange={(e) => updateField('scanArea', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>um²</Typography> }} />
                <TextField fullWidth label="Temperature of Room" value={formData.temperatureOfRoom} onChange={(e) => updateField('temperatureOfRoom', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>°C</Typography> }} />
                <TextField fullWidth label="Relative Humidity" value={formData.relativeHumidity} onChange={(e) => updateField('relativeHumidity', e.target.value)} InputProps={{ endAdornment: <Typography variant="body2" sx={{ ml: 1 }}>%</Typography> }} />
              </>
            )}
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
