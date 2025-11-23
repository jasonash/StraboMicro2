/**
 * Edit Micrograph Dialog
 *
 * Multi-step wizard for editing existing micrograph metadata.
 * Matches the legacy JavaFX workflow where editing micrograph metadata
 * uses the same wizard steps as creating a new micrograph.
 *
 * Steps:
 * 1. Instrument & Image Information (with periodic table for EDS/WDS)
 * 2. Instrument Data (conditional based on instrument type)
 * 3. Instrument Settings (conditional based on instrument type)
 * 4. Micrograph Metadata (name, polished, notes) - Save button here
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
  Typography,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  IconButton,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import { PeriodicTableModal } from '../PeriodicTableModal';
import type { InstrumentDetectorType } from '@/types/project-types';

interface EditMicrographDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string;
}

interface Detector {
  type: string;
  make: string;
  model: string;
}

interface MicrographFormData {
  micrographName: string;
  micrographPolished: boolean;
  micrographPolishDescription: string;
  micrographNotes: string;
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
  // Instrument Settings fields
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

const initialFormData: MicrographFormData = {
  micrographName: '',
  micrographPolished: false,
  micrographPolishDescription: '',
  micrographNotes: '',
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

export function EditMicrographDialog({ isOpen, onClose, micrographId }: EditMicrographDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<MicrographFormData>(initialFormData);
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);

  // Load existing micrograph data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const micrograph = findMicrographById(project, micrographId);
    if (!micrograph) return;

    console.log('[EditMicrographDialog] Loading data for micrograph:', micrographId, micrograph);

    // Load basic metadata
    setFormData({
      micrographName: micrograph.name || '',
      micrographPolished: micrograph.polish || false,
      micrographPolishDescription: micrograph.polishDescription || '',
      micrographNotes: micrograph.notes || '',

      // Load instrument data if available
      instrumentType: micrograph.instrument?.instrumentType || '',
      otherInstrumentType: micrograph.instrument?.otherInstrumentType || '',
      dataType: micrograph.instrument?.dataType || '',
      imageType: micrograph.imageType || '',
      instrumentBrand: micrograph.instrument?.instrumentBrand || '',
      instrumentModel: micrograph.instrument?.instrumentModel || '',
      university: micrograph.instrument?.university || '',
      laboratory: micrograph.instrument?.laboratory || '',
      dataCollectionSoftware: micrograph.instrument?.dataCollectionSoftware || '',
      dataCollectionSoftwareVersion: micrograph.instrument?.dataCollectionSoftwareVersion || '',
      postProcessingSoftware: micrograph.instrument?.postProcessingSoftware || '',
      postProcessingSoftwareVersion: micrograph.instrument?.postProcessingSoftwareVersion || '',
      filamentType: micrograph.instrument?.filamentType || '',
      instrumentNotes: micrograph.instrument?.instrumentNotes || '',

      // Load instrument settings
      accelerationVoltage: micrograph.instrument?.accelerationVoltage?.toString() || '',
      beamCurrent: micrograph.instrument?.beamCurrent?.toString() || '',
      spotSize: micrograph.instrument?.spotSize?.toString() || '',
      aperture: micrograph.instrument?.aperture?.toString() || '',
      cameraLength: micrograph.instrument?.cameraLength?.toString() || '',
      cameraBinning: micrograph.instrument?.cameraBinning || '',
      dwellTime: micrograph.instrument?.dwellTime?.toString() || '',
      analysisDwellTime: micrograph.instrument?.analysisDwellTime?.toString() || '',
      analysisDwellTimeUnit: 's',
      backgroundDwellTime: micrograph.instrument?.backgroundDwellTime?.toString() || '',
      backgroundDwellTimeUnit: 's',
      workingDistance: micrograph.instrument?.workingDistance?.toString() || '',
      instrumentPurged: micrograph.instrument?.instrumentPurged ? 'Yes' : micrograph.instrument?.instrumentPurged === false ? 'No' : '',
      instrumentPurgedGasType: micrograph.instrument?.instrumentPurgedGasType || '',
      instrumentPurgedGasOtherType: '',
      environmentPurged: micrograph.instrument?.environmentPurged ? 'Yes' : micrograph.instrument?.environmentPurged === false ? 'No' : '',
      environmentPurgedGasType: micrograph.instrument?.environmentPurgedGasType || '',
      environmentPurgedGasOtherType: '',
      scanTime: micrograph.instrument?.scanTime?.toString() || '',
      resolution: micrograph.instrument?.resolution?.toString() || '',
      spectralResolution: micrograph.instrument?.spectralResolution?.toString() || '',
      wavenumberRange: micrograph.instrument?.wavenumberRange || '',
      averaging: micrograph.instrument?.averaging || '',
      excitationWavelength: micrograph.instrument?.excitationWavelength?.toString() || '',
      laserPower: micrograph.instrument?.laserPower?.toString() || '',
      diffractionGrating: micrograph.instrument?.diffractionGrating?.toString() || '',
      integrationTime: micrograph.instrument?.integrationTime?.toString() || '',
      objective: micrograph.instrument?.objective?.toString() || '',
      calibration: micrograph.instrument?.calibration || '',
      cantileverStiffness: micrograph.instrument?.cantileverStiffness?.toString() || '',
      tipDiameter: micrograph.instrument?.tipDiameter?.toString() || '',
      operatingFrequency: micrograph.instrument?.operatingFrequency?.toString() || '',
      scanDimensions: micrograph.instrument?.scanDimensions || '',
      scanArea: micrograph.instrument?.scanArea || '',
      spatialResolution: micrograph.instrument?.spatialResolution?.toString() || '',
      temperatureOfRoom: micrograph.instrument?.temperatureOfRoom?.toString() || '',
      relativeHumidity: micrograph.instrument?.relativeHumidity?.toString() || '',
      sampleTemperature: micrograph.instrument?.sampleTemperature?.toString() || '',
      stepSize: micrograph.instrument?.stepSize?.toString() || '',
      backgroundCorrectionTechnique: micrograph.instrument?.backgroundCorrectionTechnique || '',
      deadTime: micrograph.instrument?.deadTime?.toString() || '',
      energyLoss: micrograph.instrument?.energyLoss || '',
      backgroundComposition: micrograph.instrument?.backgroundComposition || '',
      otherBackgroundComposition: '',
      clColor: micrograph.instrument?.color || '',
      rgbCheck: micrograph.instrument?.rgbCheck ? micrograph.instrument.rgbCheck.split(',') : [],
      atomicMode: micrograph.instrument?.atomicMode || '',
      backgroundCorrectionFrequencyAndNotes: micrograph.instrument?.backgroundCorrectionFrequencyAndNotes || '',
      notesOnPostProcessing: micrograph.instrument?.notesOnPostProcessing || '',
      calibrationStandardNotes: micrograph.instrument?.calibrationStandardNotes || '',
      notesOnCrystalStructuresUsed: micrograph.instrument?.notesOnCrystalStructuresUsed || '',
    });

    // Load detectors
    if (micrograph.instrument?.instrumentDetectors && micrograph.instrument.instrumentDetectors.length > 0) {
      setDetectors(
        micrograph.instrument.instrumentDetectors.map((d) => ({
          type: d.detectorType || '',
          make: d.detectorMake || '',
          model: d.detectorModel || '',
        }))
      );
    } else {
      setDetectors([{ type: '', make: '', model: '' }]);
    }

    // Reset to first step
    setActiveStep(0);
  }, [isOpen, micrographId, project]);

  // Auto-set imageType based on dataType for certain instrument/data type combinations
  useEffect(() => {
    if (formData.instrumentType === 'Transmission Electron Microscopy (TEM)' && formData.dataType) {
      if (
        !['Electron Diffraction', 'Energy Dispersive X-ray Spectroscopy (EDS)'].includes(
          formData.dataType
        )
      ) {
        setFormData((prev) => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (
      formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
      formData.dataType
    ) {
      if (
        !['Energy Dispersive X-ray Spectroscopy (EDS)', 'Cathodoluminescence (CL)'].includes(
          formData.dataType
        )
      ) {
        setFormData((prev) => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (
      formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
      formData.dataType
    ) {
      if (
        ![
          'Electron Backscatter Diffraction (EBSD)',
          'Energy Dispersive X-ray Spectroscopy (EDS)',
          'Wavelength-dispersive X-ray spectroscopy (WDS)',
          'Cathodoluminescence (CL)',
          'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)',
        ].includes(formData.dataType)
      ) {
        setFormData((prev) => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (formData.instrumentType === 'Electron Microprobe' && formData.dataType) {
      if (
        ![
          'Energy Dispersive X-ray Spectroscopy (EDS)',
          'Wavelength-dispersive X-ray spectroscopy (WDS)',
          'Cathodoluminescence (CL)',
        ].includes(formData.dataType)
      ) {
        setFormData((prev) => ({ ...prev, imageType: formData.dataType }));
      }
    } else if (formData.instrumentType === 'Optical Microscopy' && formData.dataType) {
      // Optical microscopy always uses dataType as imageType
      setFormData((prev) => ({ ...prev, imageType: formData.dataType }));
    }
  }, [formData.instrumentType, formData.dataType]);

  const updateField = <K extends keyof MicrographFormData>(field: K, value: MicrographFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateDetector = (index: number, field: keyof Detector, value: string) => {
    setDetectors((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addDetector = () => {
    setDetectors((prev) => [...prev, { type: '', make: '', model: '' }]);
  };

  const removeDetector = (index: number) => {
    if (detectors.length > 1) {
      setDetectors((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handlePeriodicTableSelect = (selectedElements: string[]) => {
    updateField('imageType', selectedElements.join(', '));
    setShowPeriodicTable(false);
  };

  // Determine if we need to show instrument settings step
  const shouldShowInstrumentSettings = (): boolean => {
    const instrumentsWithSettings = [
      'Transmission Electron Microscopy (TEM)',
      'Scanning Transmission Electron Microscopy (STEM)',
      'Scanning Electron Microscopy (SEM)',
      'Electron Microprobe',
      'Fourier Transform Infrared Spectroscopy (FTIR)',
      'Raman Spectroscopy',
      'Atomic Force Microscopy (AFM)',
    ];
    return instrumentsWithSettings.includes(formData.instrumentType);
  };

  const getStepLabels = (): string[] => {
    const labels = ['Instrument & Image Info', 'Instrument Data'];
    if (shouldShowInstrumentSettings()) {
      labels.push('Instrument Settings');
    }
    labels.push('Metadata');
    return labels;
  };

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSave = () => {
    // Build the updated micrograph data
    const updates: any = {
      name: formData.micrographName,
      polish: formData.micrographPolished,
      polishDescription: formData.micrographPolished ? formData.micrographPolishDescription : null,
      notes: formData.micrographNotes || null,
      imageType: formData.imageType || null,
    };

    // Build instrument object
    const instrumentDetectors: InstrumentDetectorType[] = detectors
      .filter((d) => d.type || d.make || d.model)
      .map((d) => ({
        detectorType: d.type || null,
        detectorMake: d.make || null,
        detectorModel: d.model || null,
      }));

    updates.instrument = {
      instrumentType: formData.instrumentType || null,
      otherInstrumentType: formData.otherInstrumentType || null,
      dataType: formData.dataType || null,
      instrumentBrand: formData.instrumentBrand || null,
      instrumentModel: formData.instrumentModel || null,
      university: formData.university || null,
      laboratory: formData.laboratory || null,
      dataCollectionSoftware: formData.dataCollectionSoftware || null,
      dataCollectionSoftwareVersion: formData.dataCollectionSoftwareVersion || null,
      postProcessingSoftware: formData.postProcessingSoftware || null,
      postProcessingSoftwareVersion: formData.postProcessingSoftwareVersion || null,
      filamentType: formData.filamentType || null,
      instrumentDetectors: instrumentDetectors.length > 0 ? instrumentDetectors : null,
      instrumentNotes: formData.instrumentNotes || null,
      accelerationVoltage: formData.accelerationVoltage ? parseFloat(formData.accelerationVoltage) : null,
      beamCurrent: formData.beamCurrent ? parseFloat(formData.beamCurrent) : null,
      spotSize: formData.spotSize ? parseFloat(formData.spotSize) : null,
      aperture: formData.aperture ? parseFloat(formData.aperture) : null,
      cameraLength: formData.cameraLength ? parseFloat(formData.cameraLength) : null,
      cameraBinning: formData.cameraBinning || null,
      dwellTime: formData.dwellTime ? parseFloat(formData.dwellTime) : null,
      analysisDwellTime: formData.analysisDwellTime ? parseFloat(formData.analysisDwellTime) : null,
      backgroundDwellTime: formData.backgroundDwellTime ? parseFloat(formData.backgroundDwellTime) : null,
      workingDistance: formData.workingDistance ? parseFloat(formData.workingDistance) : null,
      instrumentPurged: formData.instrumentPurged === 'Yes' ? true : formData.instrumentPurged === 'No' ? false : null,
      instrumentPurgedGasType: formData.instrumentPurgedGasType || null,
      environmentPurged: formData.environmentPurged === 'Yes' ? true : formData.environmentPurged === 'No' ? false : null,
      environmentPurgedGasType: formData.environmentPurgedGasType || null,
      scanTime: formData.scanTime ? parseFloat(formData.scanTime) : null,
      resolution: formData.resolution ? parseFloat(formData.resolution) : null,
      spectralResolution: formData.spectralResolution ? parseFloat(formData.spectralResolution) : null,
      wavenumberRange: formData.wavenumberRange || null,
      averaging: formData.averaging || null,
      excitationWavelength: formData.excitationWavelength ? parseFloat(formData.excitationWavelength) : null,
      laserPower: formData.laserPower ? parseFloat(formData.laserPower) : null,
      diffractionGrating: formData.diffractionGrating ? parseFloat(formData.diffractionGrating) : null,
      integrationTime: formData.integrationTime ? parseFloat(formData.integrationTime) : null,
      objective: formData.objective ? parseFloat(formData.objective) : null,
      calibration: formData.calibration || null,
      cantileverStiffness: formData.cantileverStiffness ? parseFloat(formData.cantileverStiffness) : null,
      tipDiameter: formData.tipDiameter ? parseFloat(formData.tipDiameter) : null,
      operatingFrequency: formData.operatingFrequency ? parseFloat(formData.operatingFrequency) : null,
      scanDimensions: formData.scanDimensions || null,
      scanArea: formData.scanArea || null,
      spatialResolution: formData.spatialResolution ? parseFloat(formData.spatialResolution) : null,
      temperatureOfRoom: formData.temperatureOfRoom ? parseFloat(formData.temperatureOfRoom) : null,
      relativeHumidity: formData.relativeHumidity ? parseFloat(formData.relativeHumidity) : null,
      sampleTemperature: formData.sampleTemperature ? parseFloat(formData.sampleTemperature) : null,
      stepSize: formData.stepSize ? parseFloat(formData.stepSize) : null,
      backgroundCorrectionTechnique: formData.backgroundCorrectionTechnique || null,
      deadTime: formData.deadTime ? parseFloat(formData.deadTime) : null,
      energyLoss: formData.energyLoss || null,
      backgroundComposition: formData.backgroundComposition || null,
      color: formData.clColor || null,
      rgbCheck: formData.rgbCheck.length > 0 ? formData.rgbCheck.join(',') : null,
      atomicMode: formData.atomicMode || null,
      backgroundCorrectionFrequencyAndNotes: formData.backgroundCorrectionFrequencyAndNotes || null,
      notesOnPostProcessing: formData.notesOnPostProcessing || null,
      calibrationStandardNotes: formData.calibrationStandardNotes || null,
      notesOnCrystalStructuresUsed: formData.notesOnCrystalStructuresUsed || null,
    };

    console.log('[EditMicrographDialog] Saving updates:', updates);
    updateMicrographMetadata(micrographId, updates);
    onClose();
  };

  const handleCancel = () => {
    setActiveStep(0);
    onClose();
  };

  const isStepValid = (): boolean => {
    switch (activeStep) {
      case 0: // Instrument & Image Info
        return formData.instrumentType !== '' && formData.dataType !== '' && formData.imageType !== '';
      case 1: // Instrument Data
        return true; // All fields optional
      case 2: // Instrument Settings (if shown) OR Metadata (if no settings)
        if (shouldShowInstrumentSettings()) {
          return true; // All fields optional
        } else {
          // This is the metadata step
          return formData.micrographName !== '' && (!formData.micrographPolished || formData.micrographPolishDescription !== '');
        }
      case 3: // Metadata (only if settings shown)
        return formData.micrographName !== '' && (!formData.micrographPolished || formData.micrographPolishDescription !== '');
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    const hasInstrumentSettings = shouldShowInstrumentSettings();

    // Map logical steps to UI
    // Step 0: Instrument & Image Info
    // Step 1: Instrument Data
    // Step 2: Instrument Settings (if applicable) OR Metadata (if not)
    // Step 3: Metadata (only if instrument settings shown)

    if (activeStep === 0) {
      return renderInstrumentInfoStep();
    } else if (activeStep === 1) {
      return renderInstrumentDataStep();
    } else if (activeStep === 2) {
      if (hasInstrumentSettings) {
        return renderInstrumentSettingsStep();
      } else {
        return renderMetadataStep();
      }
    } else if (activeStep === 3) {
      return renderMetadataStep();
    }

    return null;
  };

  const renderInstrumentInfoStep = () => {
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
          <MenuItem value="Transmission Electron Microscopy (TEM)">
            Transmission Electron Microscopy (TEM)
          </MenuItem>
          <MenuItem value="Scanning Transmission Electron Microscopy (STEM)">
            Scanning Transmission Electron Microscopy (STEM)
          </MenuItem>
          <MenuItem value="Scanning Electron Microscopy (SEM)">
            Scanning Electron Microscopy (SEM)
          </MenuItem>
          <MenuItem value="Electron Microprobe">Electron Microprobe</MenuItem>
          <MenuItem value="Fourier Transform Infrared Spectroscopy (FTIR)">
            Fourier Transform Infrared Spectroscopy (FTIR)
          </MenuItem>
          <MenuItem value="Raman Spectroscopy">Raman Spectroscopy</MenuItem>
          <MenuItem value="Atomic Force Microscopy (AFM)">
            Atomic Force Microscopy (AFM)
          </MenuItem>
          <MenuItem value="Other">Other</MenuItem>
        </TextField>

        {formData.instrumentType === 'Other' && (
          <TextField
            fullWidth
            required
            label="Other Instrument Type"
            value={formData.otherInstrumentType}
            onChange={(e) => updateField('otherInstrumentType', e.target.value)}
          />
        )}

        {/* Data Type dropdown - conditional based on Instrument Type */}
        {formData.instrumentType === 'Optical Microscopy' && (
          <TextField
            fullWidth
            required
            select
            label="Data Type"
            value={formData.dataType}
            onChange={(e) => {
              updateField('dataType', e.target.value);
              updateField('imageType', ''); // Clear image type when data type changes
            }}
          >
            <MenuItem value="">Select Data Type...</MenuItem>
            <MenuItem value="Plane Polarized Light">Plane Polarized Light</MenuItem>
            <MenuItem value="Cross Polarized Light">Cross Polarized Light</MenuItem>
            <MenuItem value="Reflected Light">Reflected Light</MenuItem>
          </TextField>
        )}

        {/* Continue with all other instrument type data type selections... */}
        {/* This follows the exact same pattern as NewMicrographDialog case 1 */}

        {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' && (
          <TextField
            fullWidth
            required
            select
            label="Data Type"
            value={formData.dataType}
            onChange={(e) => {
              updateField('dataType', e.target.value);
              updateField('imageType', '');
            }}
          >
            <MenuItem value="">Select Data Type...</MenuItem>
            <MenuItem value="Bright Field Image">Bright Field Image</MenuItem>
            <MenuItem value="Dark Field Image">Dark Field Image</MenuItem>
            <MenuItem value="Electron Diffraction">Electron Diffraction</MenuItem>
            <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
              Energy Dispersive X-ray Spectroscopy (EDS)
            </MenuItem>
          </TextField>
        )}

        {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' && (
          <TextField
            fullWidth
            required
            select
            label="Data Type"
            value={formData.dataType}
            onChange={(e) => {
              updateField('dataType', e.target.value);
              updateField('imageType', '');
            }}
          >
            <MenuItem value="">Select Data Type...</MenuItem>
            <MenuItem value="Bright Field Image">Bright Field Image</MenuItem>
            <MenuItem value="Dark Field Image">Dark Field Image</MenuItem>
            <MenuItem value="High-Angle Annular Dark Field (HAADF)">
              High-Angle Annular Dark Field (HAADF)
            </MenuItem>
            <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
              Energy Dispersive X-ray Spectroscopy (EDS)
            </MenuItem>
            <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
          </TextField>
        )}

        {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' && (
          <TextField
            fullWidth
            required
            select
            label="Data Type"
            value={formData.dataType}
            onChange={(e) => {
              updateField('dataType', e.target.value);
              updateField('imageType', '');
            }}
          >
            <MenuItem value="">Select Data Type...</MenuItem>
            <MenuItem value="Backscattered Electron Image (BSE)">
              Backscattered Electron Image (BSE)
            </MenuItem>
            <MenuItem value="Secondary Electron Image (SE)">Secondary Electron Image (SE)</MenuItem>
            <MenuItem value="Electron Backscatter Diffraction (EBSD)">
              Electron Backscatter Diffraction (EBSD)
            </MenuItem>
            <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
              Energy Dispersive X-ray Spectroscopy (EDS)
            </MenuItem>
            <MenuItem value="Wavelength-dispersive X-ray spectroscopy (WDS)">
              Wavelength-dispersive X-ray spectroscopy (WDS)
            </MenuItem>
            <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
            <MenuItem value="Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)">
              Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)
            </MenuItem>
          </TextField>
        )}

        {formData.instrumentType === 'Electron Microprobe' && (
          <TextField
            fullWidth
            required
            select
            label="Data Type"
            value={formData.dataType}
            onChange={(e) => {
              updateField('dataType', e.target.value);
              updateField('imageType', '');
            }}
          >
            <MenuItem value="">Select Data Type...</MenuItem>
            <MenuItem value="Backscattered Electron Image (BSE)">
              Backscattered Electron Image (BSE)
            </MenuItem>
            <MenuItem value="Secondary Electron Image (SE)">Secondary Electron Image (SE)</MenuItem>
            <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
              Energy Dispersive X-ray Spectroscopy (EDS)
            </MenuItem>
            <MenuItem value="Wavelength-dispersive X-ray spectroscopy (WDS)">
              Wavelength-dispersive X-ray spectroscopy (WDS)
            </MenuItem>
            <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
          </TextField>
        )}

        {/* Image Type fields - conditional based on Data Type */}
        {formData.instrumentType === 'Optical Microscopy' && formData.dataType && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Image Type: {formData.dataType}
          </Typography>
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

        {/* TEM Electron Diffraction Image Types */}
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
              <MenuItem value="Selected Area Electron Diffraction (SAED)">
                Selected Area Electron Diffraction (SAED)
              </MenuItem>
              <MenuItem value="Convergent Beam Electron Diffraction (CBED)">
                Convergent Beam Electron Diffraction (CBED)
              </MenuItem>
              <MenuItem value="Nano Beam Diffraction (NBD)">Nano Beam Diffraction (NBD)</MenuItem>
              <MenuItem value="Large Area Convergent Beam Electron Diffraction (LACBED)">
                Large Area Convergent Beam Electron Diffraction (LACBED)
              </MenuItem>
            </TextField>
          )}

        {/* STEM CL Image Types */}
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
              <MenuItem value="Cathodoluminescence Spectroscopy">
                Cathodoluminescence Spectroscopy
              </MenuItem>
            </TextField>
          )}

        {/* SEM EBSD Image Types */}
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

        {/* SEM CL Image Types */}
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

        {/* SEM FIB-SEM Image Type */}
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

        {/* Electron Microprobe CL Image Types */}
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
              <MenuItem value="Wavelength Filtered SEM-CL Image">
                Wavelength Filtered SEM-CL Image
              </MenuItem>
            </TextField>
          )}

        {/* Auto-set imageType display for certain data types */}
        {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' &&
          formData.dataType &&
          !['Electron Diffraction', 'Energy Dispersive X-ray Spectroscopy (EDS)'].includes(
            formData.dataType
          ) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Image Type: {formData.dataType}
            </Typography>
          )}

        {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
          formData.dataType &&
          !['Energy Dispersive X-ray Spectroscopy (EDS)', 'Cathodoluminescence (CL)'].includes(
            formData.dataType
          ) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Image Type: {formData.dataType}
            </Typography>
          )}

        {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
          formData.dataType &&
          ![
            'Electron Backscatter Diffraction (EBSD)',
            'Energy Dispersive X-ray Spectroscopy (EDS)',
            'Wavelength-dispersive X-ray spectroscopy (WDS)',
            'Cathodoluminescence (CL)',
            'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)',
          ].includes(formData.dataType) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Image Type: {formData.dataType}
            </Typography>
          )}

        {formData.instrumentType === 'Electron Microprobe' &&
          formData.dataType &&
          ![
            'Energy Dispersive X-ray Spectroscopy (EDS)',
            'Wavelength-dispersive X-ray spectroscopy (WDS)',
            'Cathodoluminescence (CL)',
          ].includes(formData.dataType) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Image Type: {formData.dataType}
            </Typography>
          )}

        {/* Periodic Table Element Picker for EDS/WDS */}
        {((formData.instrumentType === 'Transmission Electron Microscopy (TEM)' &&
          formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)') ||
          (formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
            formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)') ||
          (formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
            (formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
              formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)')) ||
          (formData.instrumentType === 'Electron Microprobe' &&
            (formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
              formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)'))) && (
          <Box>
            <TextField
              fullWidth
              required
              label="Image Type(s)"
              value={formData.imageType}
              InputProps={{ readOnly: true }}
              helperText="Click 'Select Element(s) from Periodic Table' to choose elements"
            />
            <Button
              variant="outlined"
              onClick={() => setShowPeriodicTable(true)}
              sx={{ mt: 1 }}
            >
              Select Element(s) from Periodic Table
            </Button>
          </Box>
        )}
      </Stack>
    );
  };

  const renderInstrumentDataStep = () => {
    const showDetectors = [
      'Transmission Electron Microscopy (TEM)',
      'Scanning Transmission Electron Microscopy (STEM)',
      'Scanning Electron Microscopy (SEM)',
      'Electron Microprobe',
    ].includes(formData.instrumentType);

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
                  <IconButton onClick={() => removeDetector(index)} color="error">
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            ))}

            <Button variant="outlined" onClick={addDetector} sx={{ alignSelf: 'flex-start' }}>
              Add Detector
            </Button>
          </>
        )}

        <TextField
          fullWidth
          multiline
          rows={3}
          label="Instrument Notes"
          value={formData.instrumentNotes}
          onChange={(e) => updateField('instrumentNotes', e.target.value)}
        />
      </Stack>
    );
  };

  const renderInstrumentSettingsStep = () => {
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
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    kV
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Beam Current"
              value={formData.beamCurrent}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nA
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Spot Size"
              value={formData.spotSize}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
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
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    mm
                  </Typography>
                ),
              }}
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
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        um
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Analysis Dwell Time (/pixel)"
                  value={formData.analysisDwellTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Dead Time"
                  value={formData.deadTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
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
                              : formData.rgbCheck.filter((c) => c !== 'R');
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
                              : formData.rgbCheck.filter((c) => c !== 'G');
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
                              : formData.rgbCheck.filter((c) => c !== 'B');
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
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    kV
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Beam Current"
              value={formData.beamCurrent}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nA
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Spot Size"
              value={formData.spotSize}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
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
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    mm
                  </Typography>
                ),
              }}
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
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    s
                  </Typography>
                ),
              }}
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
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        eV
                      </Typography>
                    ),
                  }}
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
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        um
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Analysis Dwell Time (/pixel)"
                  value={formData.analysisDwellTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Dead Time"
                  value={formData.deadTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
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
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.rgbCheck.includes('R')}
                          onChange={(e) => {
                            const newCheck = e.target.checked
                              ? [...formData.rgbCheck, 'R']
                              : formData.rgbCheck.filter((c) => c !== 'R');
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
                              : formData.rgbCheck.filter((c) => c !== 'G');
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
                              : formData.rgbCheck.filter((c) => c !== 'B');
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

        {/* SEM Settings */}
        {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' && (
          <>
            <Typography variant="h6">SEM Settings</Typography>
            <TextField
              fullWidth
              label="Acceleration Voltage"
              value={formData.accelerationVoltage}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    kV
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Beam Current"
              value={formData.beamCurrent}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nA
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Spot Size"
              value={formData.spotSize}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Working Distance"
              value={formData.workingDistance}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('workingDistance', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    mm
                  </Typography>
                ),
              }}
            />

            {/* EDS/WDS Settings for SEM */}
            {(formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
              formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6">
                  {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ? 'EDS' : 'WDS'} Settings
                </Typography>
                <TextField
                  fullWidth
                  label="Step Size"
                  value={formData.stepSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        um
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Analysis Dwell Time (/pixel)"
                  value={formData.analysisDwellTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('analysisDwellTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Dead Time"
                  value={formData.deadTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('deadTime', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        ms
                      </Typography>
                    ),
                  }}
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

            {/* EBSD Settings for SEM */}
            {formData.dataType === 'Electron Backscatter Diffraction (EBSD)' && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6">EBSD Settings</Typography>
                <TextField
                  fullWidth
                  label="Step Size"
                  value={formData.stepSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        um
                      </Typography>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Notes on Crystal Structures Used"
                  value={formData.notesOnCrystalStructuresUsed}
                  onChange={(e) => updateField('notesOnCrystalStructuresUsed', e.target.value)}
                />
              </>
            )}
          </>
        )}

        {/* Electron Microprobe Settings */}
        {formData.instrumentType === 'Electron Microprobe' && (
          <>
            <Typography variant="h6">Electron Microprobe Settings</Typography>
            <TextField
              fullWidth
              label="Acceleration Voltage"
              value={formData.accelerationVoltage}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('accelerationVoltage', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    kV
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Beam Current"
              value={formData.beamCurrent}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('beamCurrent', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nA
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Spot Size"
              value={formData.spotSize}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('spotSize', val);
              }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
            />

            {(formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
              formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6">
                  {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ? 'EDS' : 'WDS'} Settings
                </Typography>
                <TextField
                  fullWidth
                  label="Step Size"
                  value={formData.stepSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateField('stepSize', val);
                  }}
                  InputProps={{
                    endAdornment: (
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        um
                      </Typography>
                    ),
                  }}
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
          </>
        )}

        {/* FTIR Settings */}
        {formData.instrumentType === 'Fourier Transform Infrared Spectroscopy (FTIR)' && (
          <>
            <Typography variant="h6">FTIR Settings</Typography>
            <TextField
              fullWidth
              label="Scan Time"
              value={formData.scanTime}
              onChange={(e) => updateField('scanTime', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    s
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Resolution"
              value={formData.resolution}
              onChange={(e) => updateField('resolution', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    cm⁻¹
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Spectral Resolution"
              value={formData.spectralResolution}
              onChange={(e) => updateField('spectralResolution', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    cm⁻¹
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Wavenumber Range"
              value={formData.wavenumberRange}
              onChange={(e) => updateField('wavenumberRange', e.target.value)}
              placeholder="e.g., 4000-400"
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    cm⁻¹
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Averaging (number of scans)"
              value={formData.averaging}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*$/.test(val)) updateField('averaging', val);
              }}
            />
            <TextField
              fullWidth
              label="Spatial Resolution"
              value={formData.spatialResolution}
              onChange={(e) => updateField('spatialResolution', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Background Correction: Frequency and Notes"
              value={formData.backgroundCorrectionFrequencyAndNotes}
              onChange={(e) => updateField('backgroundCorrectionFrequencyAndNotes', e.target.value)}
            />
          </>
        )}

        {/* Raman Spectroscopy Settings */}
        {formData.instrumentType === 'Raman Spectroscopy' && (
          <>
            <Typography variant="h6">Raman Spectroscopy Settings</Typography>
            <TextField
              fullWidth
              label="Excitation Wavelength"
              value={formData.excitationWavelength}
              onChange={(e) => updateField('excitationWavelength', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nm
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Laser Power"
              value={formData.laserPower}
              onChange={(e) => updateField('laserPower', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    mW
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Diffraction Grating"
              value={formData.diffractionGrating}
              onChange={(e) => updateField('diffractionGrating', e.target.value)}
              placeholder="e.g., 600 lines/mm"
            />
            <TextField
              fullWidth
              label="Integration Time"
              value={formData.integrationTime}
              onChange={(e) => updateField('integrationTime', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    s
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Objective"
              value={formData.objective}
              onChange={(e) => updateField('objective', e.target.value)}
              placeholder="e.g., 50x, 100x"
            />
            <TextField
              fullWidth
              label="Spatial Resolution"
              value={formData.spatialResolution}
              onChange={(e) => updateField('spatialResolution', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Calibration Notes"
              value={formData.calibrationStandardNotes}
              onChange={(e) => updateField('calibrationStandardNotes', e.target.value)}
            />
          </>
        )}

        {/* AFM Settings */}
        {formData.instrumentType === 'Atomic Force Microscopy (AFM)' && (
          <>
            <Typography variant="h6">AFM Settings</Typography>
            <TextField
              fullWidth
              select
              label="Atomic Mode"
              value={formData.atomicMode}
              onChange={(e) => updateField('atomicMode', e.target.value)}
            >
              <MenuItem value="">Select...</MenuItem>
              <MenuItem value="Contact">Contact</MenuItem>
              <MenuItem value="Non-Contact">Non-Contact</MenuItem>
              <MenuItem value="Tapping">Tapping</MenuItem>
            </TextField>
            <TextField
              fullWidth
              label="Cantilever Stiffness"
              value={formData.cantileverStiffness}
              onChange={(e) => updateField('cantileverStiffness', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    N/m
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Tip Diameter"
              value={formData.tipDiameter}
              onChange={(e) => updateField('tipDiameter', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    nm
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Operating Frequency"
              value={formData.operatingFrequency}
              onChange={(e) => updateField('operatingFrequency', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    kHz
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Scan Dimensions"
              value={formData.scanDimensions}
              onChange={(e) => updateField('scanDimensions', e.target.value)}
              placeholder="e.g., 512x512"
            />
            <TextField
              fullWidth
              label="Scan Area"
              value={formData.scanArea}
              onChange={(e) => updateField('scanArea', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    um²
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Temperature of Room"
              value={formData.temperatureOfRoom}
              onChange={(e) => updateField('temperatureOfRoom', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    °C
                  </Typography>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Relative Humidity"
              value={formData.relativeHumidity}
              onChange={(e) => updateField('relativeHumidity', e.target.value)}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    %
                  </Typography>
                ),
              }}
            />
          </>
        )}
      </Stack>
    );
  };

  const renderMetadataStep = () => {
    return (
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Add descriptive information about this micrograph.
        </Typography>
        <TextField
          fullWidth
          required
          label="Micrograph Name"
          value={formData.micrographName}
          onChange={(e) => updateField('micrographName', e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={formData.micrographPolished}
              onChange={(e) => {
                updateField('micrographPolished', e.target.checked);
                // Clear polish description if unchecking
                if (!e.target.checked) {
                  updateField('micrographPolishDescription', '');
                }
              }}
            />
          }
          label="Polished?"
        />
        {formData.micrographPolished && (
          <TextField
            fullWidth
            required
            label="Polish Description"
            value={formData.micrographPolishDescription}
            onChange={(e) => updateField('micrographPolishDescription', e.target.value)}
            helperText="Required when 'Polished?' is checked"
          />
        )}
        <TextField
          fullWidth
          multiline
          rows={4}
          label="Notes"
          value={formData.micrographNotes}
          onChange={(e) => updateField('micrographNotes', e.target.value)}
        />
      </Stack>
    );
  };

  const stepLabels = getStepLabels();
  const isLastStep = activeStep === stepLabels.length - 1;

  return (
    <>
      <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
        <DialogTitle>Edit Micrograph Metadata</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Stepper activeStep={activeStep}>
              {stepLabels.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            <Box sx={{ mt: 3 }}>{renderStepContent()}</Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel}>Cancel</Button>
          {activeStep > 0 && <Button onClick={handleBack}>Back</Button>}
          {!isLastStep && (
            <Button onClick={handleNext} variant="contained" disabled={!isStepValid()}>
              Next
            </Button>
          )}
          {isLastStep && (
            <Button onClick={handleSave} variant="contained" disabled={!isStepValid()}>
              Save
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Periodic Table Modal */}
      <PeriodicTableModal
        isOpen={showPeriodicTable}
        onClose={() => setShowPeriodicTable(false)}
        onSelectElements={handlePeriodicTableSelect}
        initialSelection={formData.imageType.split(', ').filter((e) => e)}
      />
    </>
  );
}
