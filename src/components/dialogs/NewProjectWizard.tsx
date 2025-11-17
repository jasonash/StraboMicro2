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

import { useState, useEffect, useRef } from 'react';
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
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  Radio,
  RadioGroup,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PeriodicTableModal } from './PeriodicTableModal';
import { ScaleBarCanvas, type Tool, type ScaleBarCanvasRef } from '../ScaleBarCanvas';
import { PanTool, Timeline, RestartAlt } from '@mui/icons-material';

interface NewProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  debugInitialStep?: number;
  debugTestData?: Partial<ProjectFormData>;
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
  micrographName: string;
  micrographPolished: boolean;
  micrographPolishDescription: string;
  micrographNotes: string;
  // Orientation fields
  orientationMethod: 'unoriented' | 'trendPlunge' | 'fabricReference';
  topTrend: string;
  topPlunge: string;
  topReferenceCorner: 'left' | 'right';
  sideTrend: string;
  sidePlunge: string;
  sideReferenceCorner: 'top' | 'bottom';
  trendPlungeStrike: string;
  trendPlungeDip: string;
  fabricReference: 'xz' | 'yz' | 'xy';
  fabricStrike: string;
  fabricDip: string;
  fabricTrend: string;
  fabricPlunge: string;
  fabricRake: string;
  lookDirection: 'down' | 'up';
  // Scale fields
  scaleMethod: 'Trace Scale Bar' | 'Pixel Conversion Factor' | 'Provide Width/Height of Image' | '';
  scaleBarLineStart: { x: number; y: number } | null;
  scaleBarLineEnd: { x: number; y: number } | null;
  scaleBarLineLengthPixels: string;
  scaleBarPhysicalLength: string;
  scaleBarUnits: string;
  pixels: string;
  physicalLength: string;
  pixelUnits: string;
  imageWidthPhysical: string;
  imageHeightPhysical: string;
  sizeUnits: string;
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
  datasetName: 'Default',
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
  micrographName: '',
  micrographPolished: false,
  micrographPolishDescription: '',
  micrographNotes: '',
  // Orientation initial values
  orientationMethod: 'unoriented',
  topTrend: '',
  topPlunge: '',
  topReferenceCorner: 'left',
  sideTrend: '',
  sidePlunge: '',
  sideReferenceCorner: 'top',
  trendPlungeStrike: '',
  trendPlungeDip: '',
  fabricReference: 'xz',
  fabricStrike: '',
  fabricDip: '',
  fabricTrend: '',
  fabricPlunge: '',
  fabricRake: '',
  lookDirection: 'down',
  // Scale initial values
  scaleMethod: 'Trace Scale Bar',
  scaleBarLineStart: null,
  scaleBarLineEnd: null,
  scaleBarLineLengthPixels: '',
  scaleBarPhysicalLength: '',
  scaleBarUnits: 'μm',
  pixels: '',
  physicalLength: '',
  pixelUnits: 'μm',
  imageWidthPhysical: '',
  imageHeightPhysical: '',
  sizeUnits: 'μm',
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

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({
  isOpen,
  onClose,
  debugInitialStep,
  debugTestData,
}) => {
  const [activeStep, setActiveStep] = useState(debugInitialStep || 0);
  const [formData, setFormData] = useState<ProjectFormData>(
    debugTestData ? { ...initialFormData, ...debugTestData } : initialFormData
  );
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);
  const [micrographPreviewUrl, setMicrographPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [canvasTool, setCanvasTool] = useState<Tool>('line'); // Start with line tool selected
  const canvasRef = useRef<ScaleBarCanvasRef>(null);
  const loadProject = useAppStore((state) => state.loadProject);

  // Determine which steps to show based on instrument type
  const shouldShowInstrumentSettings = () => {
    return (
      formData.instrumentType &&
      !['Optical Microscopy', 'Scanner', 'Other'].includes(formData.instrumentType)
    );
  };

  const baseSteps = [
    'Project Metadata',
    'Dataset Information',
    'Sample Information',
    'Load Reference Micrograph',
    'Instrument & Image Information',
    'Instrument Data',
    'Micrograph Metadata',
    'Micrograph Orientation',
    'Set Micrograph Scale',
    'Trace Scale Bar',
  ];
  const steps = shouldShowInstrumentSettings()
    ? [...baseSteps.slice(0, 6), 'Instrument Settings', ...baseSteps.slice(6)]
    : baseSteps;

  const updateField = (
    field: keyof ProjectFormData,
    value: string | string[] | boolean | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

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
    }
  }, [formData.instrumentType, formData.dataType]);

  // Handle debug mode: update step and form data when debug props change
  useEffect(() => {
    if (isOpen && debugInitialStep !== undefined) {
      setActiveStep(debugInitialStep);
    }
    if (isOpen && debugTestData) {
      setFormData({ ...initialFormData, ...debugTestData });
    }
  }, [isOpen, debugInitialStep, debugTestData]);

  // Clear orientation data when switching between orientation methods
  useEffect(() => {
    if (formData.orientationMethod === 'trendPlunge') {
      // Clear fabric reference fields
      setFormData(prev => ({
        ...prev,
        fabricReference: 'xz',
        fabricStrike: '',
        fabricDip: '',
        fabricTrend: '',
        fabricPlunge: '',
        fabricRake: '',
        lookDirection: 'down'
      }));
    } else if (formData.orientationMethod === 'fabricReference') {
      // Clear trend and plunge fields
      setFormData(prev => ({
        ...prev,
        topTrend: '',
        topPlunge: '',
        topReferenceCorner: 'left',
        sideTrend: '',
        sidePlunge: '',
        sideReferenceCorner: 'top',
        trendPlungeStrike: '',
        trendPlungeDip: ''
      }));
    } else if (formData.orientationMethod === 'unoriented') {
      // Clear all orientation fields
      setFormData(prev => ({
        ...prev,
        topTrend: '',
        topPlunge: '',
        topReferenceCorner: 'left',
        sideTrend: '',
        sidePlunge: '',
        sideReferenceCorner: 'top',
        trendPlungeStrike: '',
        trendPlungeDip: '',
        fabricReference: 'xz',
        fabricStrike: '',
        fabricDip: '',
        fabricTrend: '',
        fabricPlunge: '',
        fabricRake: '',
        lookDirection: 'down'
      }));
    }
  }, [formData.orientationMethod]);

  // Load micrograph preview image (thumbnail for fast preview)
  useEffect(() => {
    const loadPreview = async () => {
      if (formData.micrographFilePath && window.api?.loadImagePreview) {
        try {
          setIsLoadingPreview(true);
          console.log('Loading thumbnail preview for:', formData.micrographFilePath);
          // Request thumbnail size for fast loading in orientation step
          const dataUrl = await window.api.loadImagePreview(
            formData.micrographFilePath,
            'thumbnail'
          );
          console.log('Thumbnail preview loaded, dataUrl length:', dataUrl?.length);
          setMicrographPreviewUrl(dataUrl);
        } catch (error) {
          console.error('Error loading micrograph preview:', error);
        } finally {
          setIsLoadingPreview(false);
        }
      }
    };
    loadPreview();
  }, [formData.micrographFilePath]);

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
          // Extract name without extension for micrograph name (matching legacy behavior)
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

          // Just store the file path - dimensions will be loaded later when displaying
          setFormData((prev) => ({
            ...prev,
            micrographFilePath: filePath,
            micrographFileName: fileName,
            micrographName: prev.micrographName || nameWithoutExt, // Only set if not already set
            micrographWidth: 0, // Will be loaded later
            micrographHeight: 0, // Will be loaded later
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
    const micrographs = formData.micrographFilePath
      ? [
          {
            id: crypto.randomUUID(),
            name: formData.micrographName || formData.micrographFileName,
            notes: formData.micrographNotes || undefined,
            imageFilename: formData.micrographFileName,
            imageWidth: formData.micrographWidth,
            imageHeight: formData.micrographHeight,
            imageType: formData.imageType || undefined,
            visible: true,
            orientationInfo: (() => {
              // Only include orientation data for the selected method
              if (formData.orientationMethod === 'unoriented') {
                return { orientationMethod: 'unoriented' };
              } else if (formData.orientationMethod === 'trendPlunge') {
                return {
                  orientationMethod: 'trendPlunge',
                  ...(formData.topTrend && { topTrend: parseFloat(formData.topTrend) }),
                  ...(formData.topPlunge && { topPlunge: parseFloat(formData.topPlunge) }),
                  ...(formData.topReferenceCorner && { topReferenceCorner: formData.topReferenceCorner }),
                  ...(formData.sideTrend && { sideTrend: parseFloat(formData.sideTrend) }),
                  ...(formData.sidePlunge && { sidePlunge: parseFloat(formData.sidePlunge) }),
                  ...(formData.sideReferenceCorner && { sideReferenceCorner: formData.sideReferenceCorner }),
                  ...(formData.trendPlungeStrike && { trendPlungeStrike: parseFloat(formData.trendPlungeStrike) }),
                  ...(formData.trendPlungeDip && { trendPlungeDip: parseFloat(formData.trendPlungeDip) }),
                };
              } else if (formData.orientationMethod === 'fabricReference') {
                return {
                  orientationMethod: 'fabricReference',
                  ...(formData.fabricReference && { fabricReference: formData.fabricReference }),
                  ...(formData.fabricStrike && { fabricStrike: parseFloat(formData.fabricStrike) }),
                  ...(formData.fabricDip && { fabricDip: parseFloat(formData.fabricDip) }),
                  ...(formData.fabricTrend && { fabricTrend: parseFloat(formData.fabricTrend) }),
                  ...(formData.fabricPlunge && { fabricPlunge: parseFloat(formData.fabricPlunge) }),
                  ...(formData.fabricRake && { fabricRake: parseFloat(formData.fabricRake) }),
                  ...(formData.lookDirection && { lookDirection: formData.lookDirection }),
                };
              }
              return { orientationMethod: formData.orientationMethod };
            })(),
            scale: (() => {
              // Calculate pixelsPerUnit based on selected method
              if (formData.scaleMethod === 'Trace Scale Bar') {
                const lineLengthPixels = parseFloat(formData.scaleBarLineLengthPixels);
                const physicalLength = parseFloat(formData.scaleBarPhysicalLength);
                return {
                  scaleMethod: 'Trace Scale Bar',
                  scaleBarLineStart: formData.scaleBarLineStart,
                  scaleBarLineEnd: formData.scaleBarLineEnd,
                  scaleBarLineLengthPixels: lineLengthPixels,
                  scaleBarPhysicalLength: physicalLength,
                  scaleBarUnits: formData.scaleBarUnits,
                  pixelsPerUnit: lineLengthPixels / physicalLength,
                };
              } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
                const pixels = parseFloat(formData.pixels);
                const physicalLength = parseFloat(formData.physicalLength);
                return {
                  scaleMethod: 'Pixel Conversion Factor',
                  pixels: pixels,
                  physicalLength: physicalLength,
                  units: formData.pixelUnits,
                  pixelsPerUnit: pixels / physicalLength,
                };
              } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
                const imageWidthPhysical = parseFloat(formData.imageWidthPhysical);
                return {
                  scaleMethod: 'Provide Width/Height of Image',
                  imageWidthPhysical: imageWidthPhysical,
                  imageHeightPhysical: parseFloat(formData.imageHeightPhysical),
                  units: formData.sizeUnits,
                  pixelsPerUnit: formData.micrographWidth / imageWidthPhysical,
                };
              }
              return undefined;
            })(),
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
              instrumentDetectors: detectors
                .filter((d) => d.type || d.make || d.model)
                .map((d) => ({
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
            spots: [],
          },
        ]
      : [];

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
      datasets: [
        {
          id: crypto.randomUUID(),
          name: formData.datasetName,
          samples: [
            {
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
              micrographs: micrographs,
            },
          ],
        },
      ],
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
    setDetectors((prev) => prev.filter((_, i) => i !== index));
  };

  const validateOrientationStep = () => {
    if (formData.orientationMethod === 'unoriented') {
      return true; // No validation needed
    }

    if (formData.orientationMethod === 'trendPlunge') {
      // Need TWO of THREE data sets:
      // 1. Top edge (trend + plunge)
      // 2. Side edge (trend + plunge)
      // 3. Strike and Dip
      const hasTop = formData.topTrend.trim() !== '' && formData.topPlunge.trim() !== '';
      const hasSide = formData.sideTrend.trim() !== '' && formData.sidePlunge.trim() !== '';
      const hasStrikeDip =
        formData.trendPlungeStrike.trim() !== '' && formData.trendPlungeDip.trim() !== '';

      const setCount = [hasTop, hasSide, hasStrikeDip].filter(Boolean).length;
      return setCount >= 2;
    }

    if (formData.orientationMethod === 'fabricReference') {
      // For fabric reference, no fields are strictly required - they're all optional
      return true;
    }

    return true;
  };

  const canProceed = () => {
    if (activeStep === 0) {
      // Project name is required
      if (formData.name.trim() === '') return false;
      // If both dates are provided, validate that start <= end
      if (formData.startDate && formData.endDate && formData.startDate > formData.endDate)
        return false;
      return true;
    }
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

      // Image Type is required only when shown (not shown for "Other" instrument type)
      if (formData.instrumentType !== 'Other' && formData.imageType.trim() === '') {
        return false;
      }

      return true;
    }
    if (activeStep === 5) {
      // Step 6: Instrument Data - no required fields, all optional
      return true;
    }
    if (activeStep === 6) {
      // Step 7: Instrument Settings (only shown for certain instrument types) OR Step 7: Micrograph Metadata
      // For Instrument Settings - validation for conditional "Other" fields
      if (shouldShowInstrumentSettings()) {
        if (
          formData.instrumentPurged === 'Yes' &&
          formData.instrumentPurgedGasType === 'Other' &&
          formData.instrumentPurgedGasOtherType.trim() === ''
        ) {
          return false;
        }
        if (
          formData.environmentPurged === 'Yes' &&
          formData.environmentPurgedGasType === 'Other' &&
          formData.environmentPurgedGasOtherType.trim() === ''
        ) {
          return false;
        }
        if (
          formData.backgroundComposition === 'Other' &&
          formData.otherBackgroundComposition.trim() === ''
        ) {
          return false;
        }
        return true;
      } else {
        // This is Step 7: Micrograph Metadata (when Instrument Settings not shown)
        // Name is required, and if polished is checked, polish description is required
        if (formData.micrographName.trim() === '') return false;
        if (formData.micrographPolished && formData.micrographPolishDescription.trim() === '')
          return false;
        return true;
      }
    }
    if (activeStep === 7) {
      // Step 8: Micrograph Metadata (when Instrument Settings IS shown) OR Step 8: Micrograph Orientation (when not shown)
      if (shouldShowInstrumentSettings()) {
        // This is Micrograph Metadata
        if (formData.micrographName.trim() === '') return false;
        if (formData.micrographPolished && formData.micrographPolishDescription.trim() === '')
          return false;
        return true;
      } else {
        // This is Micrograph Orientation
        return validateOrientationStep();
      }
    }
    if (activeStep === 8) {
      // Step 9: Either Micrograph Orientation (when Instrument Settings IS shown) OR Set Micrograph Scale (when NOT shown)
      if (shouldShowInstrumentSettings()) {
        // This is Micrograph Orientation
        return validateOrientationStep();
      } else {
        // This is Set Micrograph Scale
        return formData.scaleMethod !== '';
      }
    }
    if (activeStep === 9) {
      // Step 10: Either Set Micrograph Scale (when Instrument Settings IS shown) OR Trace Scale Bar (when NOT shown)
      if (shouldShowInstrumentSettings()) {
        // This is Set Micrograph Scale - Method Selection
        return formData.scaleMethod !== '';
      } else {
        // This is Trace Scale Bar - Execute selected scale method
        if (formData.scaleMethod === 'Trace Scale Bar') {
          return (
            formData.scaleBarLineLengthPixels !== '' &&
            formData.scaleBarPhysicalLength !== '' &&
            parseFloat(formData.scaleBarPhysicalLength) > 0
          );
        } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
          return (
            formData.pixels !== '' &&
            formData.physicalLength !== '' &&
            parseFloat(formData.pixels) > 0 &&
            parseFloat(formData.physicalLength) > 0
          );
        } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
          return (
            formData.imageWidthPhysical !== '' &&
            formData.imageHeightPhysical !== '' &&
            parseFloat(formData.imageWidthPhysical) > 0 &&
            parseFloat(formData.imageHeightPhysical) > 0
          );
        }
        return false;
      }
    }
    if (activeStep === 10) {
      // Step 11: Trace Scale Bar (when Instrument Settings IS shown) - Execute selected scale method
      if (formData.scaleMethod === 'Trace Scale Bar') {
        // Line must be drawn, and physical length must be provided
        return (
          formData.scaleBarLineLengthPixels !== '' &&
          formData.scaleBarPhysicalLength !== '' &&
          parseFloat(formData.scaleBarPhysicalLength) > 0
        );
      } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
        // Pixels and physical length must be provided
        return (
          formData.pixels !== '' &&
          formData.physicalLength !== '' &&
          parseFloat(formData.pixels) > 0 &&
          parseFloat(formData.physicalLength) > 0
        );
      } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
        // Width and height must be provided
        return (
          formData.imageWidthPhysical !== '' &&
          formData.imageHeightPhysical !== '' &&
          parseFloat(formData.imageWidthPhysical) > 0 &&
          parseFloat(formData.imageHeightPhysical) > 0
        );
      }
      return false;
    }
    return true;
  };

  const renderOrientationStep = () => {
    return (
      <Stack spacing={3}>
        <Typography variant="h6">Orientation of Reference Micrograph</Typography>
        <Typography variant="body2" color="text.secondary">
          Thin Section Oriented by:
        </Typography>

        <RadioGroup
          value={formData.orientationMethod}
          onChange={(e) =>
            updateField(
              'orientationMethod',
              e.target.value as 'unoriented' | 'trendPlunge' | 'fabricReference'
            )
          }
        >
          <FormControlLabel
            value="unoriented"
            control={<Radio />}
            label="Unoriented Thin Section"
          />
          <FormControlLabel
            value="trendPlunge"
            control={<Radio />}
            label="Trend and Plunge of Edges/Strike and Dip of Surface"
          />
          <FormControlLabel
            value="fabricReference"
            control={<Radio />}
            label="Fabric Reference Frame (XZ, YZ, XY Thin Sections)"
          />
        </RadioGroup>

        {formData.orientationMethod === 'trendPlunge' && (
          <Stack spacing={3} sx={{ pl: 4 }}>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 600 }}>
              Provide TWO of THREE: Select the arrow on each edge that represents a lower hemisphere
              plunge, and enter the trend and plunge information and/or provide the strike and dip
              of the thin section.
            </Typography>

            {/* Main layout: Side fields on left, Image preview with arrows on right */}
            <Box sx={{ display: 'flex', gap: 5, alignItems: 'flex-start', mt: 2 }}>
              {/* Left side: Side Edge Trend and Plunge fields */}
              <Stack spacing={2} sx={{ width: 120, flexShrink: 0, mt: '80px' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Trend:
                </Typography>
                <TextField
                  type="number"
                  value={formData.sideTrend}
                  onChange={(e) => updateField('sideTrend', e.target.value)}
                  InputProps={{ endAdornment: '°' }}
                  size="small"
                />

                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>
                  Plunge:
                </Typography>
                <TextField
                  type="number"
                  value={formData.sidePlunge}
                  onChange={(e) => updateField('sidePlunge', e.target.value)}
                  InputProps={{ endAdornment: '°' }}
                  size="small"
                />
              </Stack>

              {/* Right side: Image preview with arrows */}
              <Box sx={{ position: 'relative', display: 'inline-block', mt: 10, ml: 8 }}>
                {/* Top Edge Trend and Plunge fields - positioned above image */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: -100,
                    left: -35,
                    right: 0,
                    display: 'flex',
                    gap: 4,
                    justifyContent: 'center',
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 60 }}>
                      Trend:
                    </Typography>
                    <TextField
                      type="number"
                      value={formData.topTrend}
                      onChange={(e) => updateField('topTrend', e.target.value)}
                      InputProps={{ endAdornment: '°' }}
                      size="small"
                      sx={{ width: 120 }}
                    />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 'bold', minWidth: 60, ml: 2 }}
                    >
                      Plunge:
                    </Typography>
                    <TextField
                      type="number"
                      value={formData.topPlunge}
                      onChange={(e) => updateField('topPlunge', e.target.value)}
                      InputProps={{ endAdornment: '°' }}
                      size="small"
                      sx={{ width: 120 }}
                    />
                  </Stack>
                </Box>
                {/* Top edge arrows - positioned at corners */}
                <RadioGroup
                  row
                  value={formData.topReferenceCorner}
                  onChange={(e) =>
                    updateField('topReferenceCorner', e.target.value as 'left' | 'right')
                  }
                >
                  {/* Left corner */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -45,
                      left: -5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Radio value="left" />
                    <Typography sx={{ fontSize: 28, lineHeight: 1 }}>→</Typography>
                  </Box>
                  {/* Right corner */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -45,
                      right: -5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Typography sx={{ fontSize: 28, lineHeight: 1 }}>←</Typography>
                    <Radio value="right" />
                  </Box>
                </RadioGroup>

                {/* Left edge arrows - positioned at corners */}
                <RadioGroup
                  value={formData.sideReferenceCorner}
                  onChange={(e) =>
                    updateField('sideReferenceCorner', e.target.value as 'top' | 'bottom')
                  }
                >
                  {/* Top corner */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: -55,
                      top: -5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <Radio value="top" />
                    <Typography sx={{ fontSize: 28, lineHeight: 1 }}>↓</Typography>
                  </Box>
                  {/* Bottom corner */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: -55,
                      bottom: -5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <Typography sx={{ fontSize: 28, lineHeight: 1 }}>↑</Typography>
                    <Radio value="bottom" />
                  </Box>
                </RadioGroup>

                {/* Image preview */}
                {isLoadingPreview ? (
                  <Box
                    sx={{
                      width: 300,
                      height: 300,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.default',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                    }}
                  >
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                      Loading preview...
                    </Typography>
                  </Box>
                ) : micrographPreviewUrl ? (
                  <Box
                    component="img"
                    src={micrographPreviewUrl}
                    alt="Micrograph preview"
                    sx={{
                      width: 300,
                      height: 300,
                      objectFit: 'contain',
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 300,
                      height: 300,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No image loaded
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Strike and Dip below the image */}
            <Box sx={{ display: 'flex', gap: 5, mt: 2 }}>
              {/* Spacer to match left side width */}
              <Box sx={{ width: 120, flexShrink: 0 }} />

              {/* Strike and Dip fields */}
              <Box sx={{ ml: '-20px' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 60 }}>
                    Strike:
                  </Typography>
                  <TextField
                    type="number"
                    value={formData.trendPlungeStrike}
                    onChange={(e) => updateField('trendPlungeStrike', e.target.value)}
                    InputProps={{ endAdornment: '°' }}
                    size="small"
                    sx={{ width: 120 }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 40, ml: 2 }}>
                    Dip:
                  </Typography>
                  <TextField
                    type="number"
                    value={formData.trendPlungeDip}
                    onChange={(e) => updateField('trendPlungeDip', e.target.value)}
                    InputProps={{ endAdornment: '°' }}
                    size="small"
                    sx={{ width: 120 }}
                  />
                </Stack>
              </Box>
            </Box>
          </Stack>
        )}

        {formData.orientationMethod === 'fabricReference' && (
          <Stack spacing={2} sx={{ pl: 4 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Fabric Reference:{' '}
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 'normal' }}
              >
                (X - Lineation, Y - Perpendicular to lineation within the foliation plane, Z - Pole
                to foliation)
              </Typography>
            </Typography>
            <RadioGroup
              row
              value={formData.fabricReference}
              onChange={(e) => updateField('fabricReference', e.target.value as 'xz' | 'yz' | 'xy')}
            >
              <FormControlLabel value="xz" control={<Radio />} label="XZ" />
              <FormControlLabel value="yz" control={<Radio />} label="YZ" />
              <FormControlLabel value="xy" control={<Radio />} label="XY" />
            </RadioGroup>

            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
              Foliation Orientation: (Geographic Coordinates)
            </Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Strike"
                type="number"
                value={formData.fabricStrike}
                onChange={(e) => updateField('fabricStrike', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Dip"
                type="number"
                value={formData.fabricDip}
                onChange={(e) => updateField('fabricDip', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                sx={{ flex: 1 }}
              />
            </Stack>

            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
              Lineation Orientation: (Geographic Coordinates)
            </Typography>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <TextField
                label="Trend"
                type="number"
                value={formData.fabricTrend}
                onChange={(e) => updateField('fabricTrend', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                helperText=" "
                sx={{ flex: 1 }}
              />
              <TextField
                label="Plunge"
                type="number"
                value={formData.fabricPlunge}
                onChange={(e) => updateField('fabricPlunge', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                helperText=" "
                sx={{ flex: 1 }}
              />
              <Typography variant="body2" sx={{ px: 1, pt: 2 }}>
                OR
              </Typography>
              <TextField
                label="Rake"
                type="number"
                value={formData.fabricRake}
                onChange={(e) => updateField('fabricRake', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                helperText="(RHR, 0-180)"
                sx={{ flex: 1 }}
              />
            </Stack>

            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
              Look Direction:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              When looking at the Reference micrograph, are you looking toward the lower hemisphere
              or upper hemisphere in geographic coordinates?
            </Typography>
            <RadioGroup
              value={formData.lookDirection}
              onChange={(e) => updateField('lookDirection', e.target.value as 'down' | 'up')}
            >
              <FormControlLabel
                value="down"
                control={<Radio />}
                label="Looking down through the micrograph (Lower hemisphere)"
              />
              <FormControlLabel
                value="up"
                control={<Radio />}
                label="Looking up through the micrograph (Upper hemisphere)"
              />
            </RadioGroup>
          </Stack>
        )}
      </Stack>
    );
  };

  const renderScaleInputStep = () => {
    const units = ['μm', 'mm', 'cm', 'm', 'inches'];

    if (formData.scaleMethod === 'Trace Scale Bar') {
      return (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Draw a line over the scale bar in the micrograph, then enter the physical length that line represents.
          </Typography>

          {/* Toolbar and input fields all on one line */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            {/* Drawing tools */}
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Pointer Tool (Pan/Zoom)">
                <IconButton
                  size="small"
                  onClick={() => setCanvasTool('pointer')}
                  color={canvasTool === 'pointer' ? 'primary' : 'default'}
                >
                  <PanTool />
                </IconButton>
              </Tooltip>

              <Tooltip title="Line Tool (Draw Scale Bar)">
                <IconButton
                  size="small"
                  onClick={() => setCanvasTool('line')}
                  color={canvasTool === 'line' ? 'primary' : 'default'}
                >
                  <Timeline />
                </IconButton>
              </Tooltip>

              <Tooltip title="Reset Zoom">
                <IconButton size="small" onClick={() => canvasRef.current?.resetZoom()}>
                  <RestartAlt />
                </IconButton>
              </Tooltip>
            </Stack>

            <Divider orientation="vertical" flexItem />

            {/* Input fields */}
            <TextField
              required
              label="Line Length (pixels)"
              value={formData.scaleBarLineLengthPixels}
              InputProps={{ readOnly: true }}
              size="small"
              sx={{ width: 180 }}
            />

            <TextField
              required
              label="Physical Length"
              type="number"
              value={formData.scaleBarPhysicalLength}
              onChange={(e) => updateField('scaleBarPhysicalLength', e.target.value)}
              size="small"
              sx={{ width: 150 }}
            />

            <TextField
              select
              required
              label="Units"
              value={formData.scaleBarUnits}
              onChange={(e) => updateField('scaleBarUnits', e.target.value)}
              size="small"
              sx={{ width: 100 }}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Canvas for drawing scale bar line */}
          {micrographPreviewUrl ? (
            <ScaleBarCanvas
              ref={canvasRef}
              imageUrl={micrographPreviewUrl}
              showToolbar={false}
              currentTool={canvasTool}
              onToolChange={setCanvasTool}
              onLineDrawn={(lineData) => {
                updateField('scaleBarLineStart', lineData.start);
                updateField('scaleBarLineEnd', lineData.end);
                updateField('scaleBarLineLengthPixels', lineData.lengthPixels.toFixed(2));
              }}
            />
          ) : (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              <CircularProgress size={24} sx={{ mr: 2 }} />
              <Typography variant="body2" component="span">
                Loading micrograph preview...
              </Typography>
            </Box>
          )}
        </Stack>
      );
    } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
      return (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Enter the number of pixels per unit directly.
          </Typography>

          {/* Image preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              {isLoadingPreview ? (
                <CircularProgress />
              ) : (
                <img
                  src={micrographPreviewUrl}
                  alt="Micrograph preview"
                  style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                />
              )}
            </Box>
          )}

          {/* Single-line input fields */}
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              required
              label="Pixels"
              type="number"
              value={formData.pixels}
              onChange={(e) => updateField('pixels', e.target.value)}
              helperText="Number of pixels"
              sx={{ flex: 1 }}
            />

            <TextField
              required
              label="Physical Length"
              type="number"
              value={formData.physicalLength}
              onChange={(e) => updateField('physicalLength', e.target.value)}
              helperText="Corresponding length"
              sx={{ flex: 1 }}
            />

            <TextField
              select
              required
              label="Units"
              value={formData.pixelUnits}
              onChange={(e) => updateField('pixelUnits', e.target.value)}
              helperText="Unit of measurement"
              sx={{ flex: 1 }}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Pixels per unit: {formData.pixels && formData.physicalLength
              ? (parseFloat(formData.pixels) / parseFloat(formData.physicalLength)).toFixed(4)
              : 'N/A'}
          </Typography>
        </Stack>
      );
    } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
      // Calculate aspect ratio from image pixel dimensions
      const aspectRatio = formData.micrographWidth / formData.micrographHeight;

      const handleWidthChange = (value: string) => {
        updateField('imageWidthPhysical', value);
        // Auto-calculate height based on aspect ratio
        if (value && !isNaN(parseFloat(value))) {
          const width = parseFloat(value);
          const height = width / aspectRatio;
          updateField('imageHeightPhysical', height.toFixed(4));
        } else {
          updateField('imageHeightPhysical', '');
        }
      };

      const handleHeightChange = (value: string) => {
        updateField('imageHeightPhysical', value);
        // Auto-calculate width based on aspect ratio
        if (value && !isNaN(parseFloat(value))) {
          const height = parseFloat(value);
          const width = height * aspectRatio;
          updateField('imageWidthPhysical', width.toFixed(4));
        } else {
          updateField('imageWidthPhysical', '');
        }
      };

      return (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Enter either the physical width or height - the other will be auto-calculated.
          </Typography>

          {/* Image preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              {isLoadingPreview ? (
                <CircularProgress />
              ) : (
                <img
                  src={micrographPreviewUrl}
                  alt="Micrograph preview"
                  style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                />
              )}
            </Box>
          )}

          <Typography variant="caption" color="text.secondary">
            Image: {formData.micrographWidth} x {formData.micrographHeight} pixels (aspect ratio: {aspectRatio.toFixed(3)})
          </Typography>

          {/* Single-line input fields */}
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              required
              label="Width"
              type="number"
              value={formData.imageWidthPhysical}
              onChange={(e) => handleWidthChange(e.target.value)}
              helperText="Auto-calculates height"
              sx={{ flex: 1 }}
            />

            <TextField
              required
              label="Height"
              type="number"
              value={formData.imageHeightPhysical}
              onChange={(e) => handleHeightChange(e.target.value)}
              helperText="Auto-calculates width"
              sx={{ flex: 1 }}
            />

            <TextField
              select
              required
              label="Units"
              value={formData.sizeUnits}
              onChange={(e) => updateField('sizeUnits', e.target.value)}
              helperText="Unit of measurement"
              sx={{ flex: 1 }}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Pixels per unit: {formData.imageWidthPhysical
              ? (formData.micrographWidth / parseFloat(formData.imageWidthPhysical)).toFixed(4)
              : 'N/A'}
          </Typography>
        </Stack>
      );
    }

    return (
      <Typography color="error">
        Please select a scale method from the previous step.
      </Typography>
    );
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
                inputProps={{
                  max: formData.endDate || '2100-12-31', // Date picker can't select after end date or year 2100
                }}
                helperText={
                  formData.endDate && formData.startDate && formData.startDate > formData.endDate
                    ? 'Start date must be before end date'
                    : ''
                }
                error={
                  !!(
                    formData.endDate &&
                    formData.startDate &&
                    formData.startDate > formData.endDate
                  )
                }
              />
              <TextField
                fullWidth
                type="date"
                label="End Date"
                InputLabelProps={{ shrink: true }}
                value={formData.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
                inputProps={{
                  min: formData.startDate || undefined, // Date picker can't select before start date
                  max: '2100-12-31', // Date picker can't select after year 2100
                }}
                helperText={
                  formData.startDate && formData.endDate && formData.endDate < formData.startDate
                    ? 'End date must be after start date'
                    : ''
                }
                error={
                  !!(
                    formData.startDate &&
                    formData.endDate &&
                    formData.endDate < formData.startDate
                  )
                }
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
              Select a reference micrograph image file to add to this sample. This will be the base
              image for your annotations and measurements.
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
                helperText="Required when 'Other' is selected"
              />
            )}

            {/* Data Type field - shown for TEM, STEM, SEM, Electron Microprobe */}
            {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' && (
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
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
                  Energy Dispersive X-ray Spectroscopy (EDS)
                </MenuItem>
                <MenuItem value="Automated Crystal Orientation Mapping (ACOM)">
                  Automated Crystal Orientation Mapping (ACOM)
                </MenuItem>
                <MenuItem value="Energy Dispersive X-ray Tomography">
                  Energy Dispersive X-ray Tomography
                </MenuItem>
              </TextField>
            )}

            {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' && (
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
                <MenuItem value="High-Angle Annular Dark Field (HAADF)">
                  High-Angle Annular Dark Field (HAADF)
                </MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
                  Energy Dispersive X-ray Spectroscopy (EDS)
                </MenuItem>
                <MenuItem value="Electron Energy Loss Spectroscopy (EELS)">
                  Electron Energy Loss Spectroscopy (EELS)
                </MenuItem>
                <MenuItem value="Cathodoluminescence (CL)">Cathodoluminescence (CL)</MenuItem>
              </TextField>
            )}

            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' && (
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
                <MenuItem value="Electron Backscatter Diffraction (EBSD)">
                  Electron Backscatter Diffraction (EBSD)
                </MenuItem>
                <MenuItem value="Transmission Kikuchi Diffraction (TKD)">
                  Transmission Kikuchi Diffraction (TKD)
                </MenuItem>
                <MenuItem value="Electron Channeling Contrast Imaging (ECCI)">
                  Electron Channeling Contrast Imaging (ECCI)
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
                <MenuItem value="Electron Channeling Contrast Imaging (ECCI)">
                  Electron Channeling Contrast Imaging (ECCI)
                </MenuItem>
                <MenuItem value="Energy Dispersive X-ray Spectroscopy (EDS)">
                  Energy Dispersive X-ray Spectroscopy (EDS)
                </MenuItem>
                <MenuItem value="Wavelength-dispersive X-ray spectroscopy (WDS)">
                  Wavelength-dispersive X-ray spectroscopy (WDS)
                </MenuItem>
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
                  <MenuItem value="Selected Area Electron Diffraction (SAED)">
                    Selected Area Electron Diffraction (SAED)
                  </MenuItem>
                  <MenuItem value="Convergent Beam Electron Diffraction (CBED)">
                    Convergent Beam Electron Diffraction (CBED)
                  </MenuItem>
                  <MenuItem value="Nano Beam Diffraction (NBD)">
                    Nano Beam Diffraction (NBD)
                  </MenuItem>
                  <MenuItem value="Large Area Convergent Beam Electron Diffraction (LACBED)">
                    Large Area Convergent Beam Electron Diffraction (LACBED)
                  </MenuItem>
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
                  <MenuItem value="Wavelength Filtered CL Image">
                    Wavelength Filtered CL Image
                  </MenuItem>
                  <MenuItem value="Cathodoluminescence Spectroscopy">
                    Cathodoluminescence Spectroscopy
                  </MenuItem>
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
                  <MenuItem value="Wavelength Filtered CL Image">
                    Wavelength Filtered CL Image
                  </MenuItem>
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
                  <MenuItem value="Wavelength Filtered SEM-CL Image">
                    Wavelength Filtered SEM-CL Image
                  </MenuItem>
                </TextField>
              )}

            {/* Auto-set imageType for certain data types that don't need a separate image type dropdown */}
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
            {/* TEM + EDS */}
            {formData.instrumentType === 'Transmission Electron Microscopy (TEM)' &&
              formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' && (
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

            {/* STEM + EDS */}
            {formData.instrumentType === 'Scanning Transmission Electron Microscopy (STEM)' &&
              formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' && (
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

            {/* SEM + EDS or WDS */}
            {formData.instrumentType === 'Scanning Electron Microscopy (SEM)' &&
              (formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
                formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
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

            {/* Electron Microprobe + EDS or WDS */}
            {formData.instrumentType === 'Electron Microprobe' &&
              (formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)' ||
                formData.dataType === 'Wavelength-dispersive X-ray spectroscopy (WDS)') && (
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

      case 5:
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
        // Step 7: Either Instrument Settings OR Micrograph Metadata (depending on instrument type)
        if (!shouldShowInstrumentSettings()) {
          // This is Micrograph Metadata (when Instrument Settings not shown)
          return (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Add descriptive information about this micrograph.
              </Typography>
              <TextField
                fullWidth
                required
                label="Name"
                value={formData.micrographName}
                onChange={(e) => updateField('micrographName', e.target.value)}
                helperText="Name for this micrograph"
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
        }
        // Otherwise, this is Instrument Settings
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
                    if (val === '' || /^\d*\.?\d*$/.test(val))
                      updateField('accelerationVoltage', val);
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
                        if (val === '' || /^\d*\.?\d*$/.test(val))
                          updateField('analysisDwellTime', val);
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
                    if (val === '' || /^\d*\.?\d*$/.test(val))
                      updateField('accelerationVoltage', val);
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
                        if (val === '' || /^\d*\.?\d*$/.test(val))
                          updateField('analysisDwellTime', val);
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
                    if (val === '' || /^\d*\.?\d*$/.test(val))
                      updateField('accelerationVoltage', val);
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
                      {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)'
                        ? 'EDS'
                        : 'WDS'}{' '}
                      Settings
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
                        if (val === '' || /^\d*\.?\d*$/.test(val))
                          updateField('analysisDwellTime', val);
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
                    if (val === '' || /^\d*\.?\d*$/.test(val))
                      updateField('accelerationVoltage', val);
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
                      {formData.dataType === 'Energy Dispersive X-ray Spectroscopy (EDS)'
                        ? 'EDS'
                        : 'WDS'}{' '}
                      Settings
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
                  onChange={(e) =>
                    updateField('backgroundCorrectionFrequencyAndNotes', e.target.value)
                  }
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

      case 7:
        // Step 8: Either Micrograph Metadata (when Instrument Settings IS shown) OR Micrograph Orientation (when NOT shown)
        if (shouldShowInstrumentSettings()) {
          // This is Micrograph Metadata
          return (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Add descriptive information about this micrograph.
              </Typography>
              <TextField
                fullWidth
                required
                label="Name"
                value={formData.micrographName}
                onChange={(e) => updateField('micrographName', e.target.value)}
                helperText="Name for this micrograph"
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
        } else {
          // This is Micrograph Orientation (when Instrument Settings NOT shown)
          return renderOrientationStep();
        }

      case 8:
        // Step 9: Either Micrograph Orientation (when Instrument Settings IS shown) OR Set Micrograph Scale (when NOT shown)
        if (shouldShowInstrumentSettings()) {
          // This is Micrograph Orientation
          return renderOrientationStep();
        } else {
          // This is Set Micrograph Scale (when Instrument Settings NOT shown)
          return (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                How do you wish to set the scale?
              </Typography>
              <RadioGroup
                value={formData.scaleMethod}
                onChange={(e) => updateField('scaleMethod', e.target.value)}
              >
                <FormControlLabel
                  value="Trace Scale Bar"
                  control={<Radio />}
                  label="Trace Scale Bar"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Draw a line over the scale bar in the micrograph (most accurate)
                </Typography>

                <FormControlLabel
                  value="Pixel Conversion Factor"
                  control={<Radio />}
                  label="Pixel Conversion Factor"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Enter the number of pixels per unit directly
                </Typography>

                <FormControlLabel
                  value="Provide Width/Height of Image"
                  control={<Radio />}
                  label="Provide Width/Height of Image"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Enter the physical dimensions of the entire image
                </Typography>
              </RadioGroup>
            </Stack>
          );
        }

      case 9:
        // Step 10: Either Set Micrograph Scale (when Instrument Settings IS shown) OR Trace Scale Bar (when NOT shown)
        if (shouldShowInstrumentSettings()) {
          // This is Set Micrograph Scale
          return (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                How do you wish to set the scale?
              </Typography>
              <RadioGroup
                value={formData.scaleMethod}
                onChange={(e) => updateField('scaleMethod', e.target.value)}
              >
                <FormControlLabel
                  value="Trace Scale Bar"
                  control={<Radio />}
                  label="Trace Scale Bar"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Draw a line over the scale bar in the micrograph (most accurate)
                </Typography>

                <FormControlLabel
                  value="Pixel Conversion Factor"
                  control={<Radio />}
                  label="Pixel Conversion Factor"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Enter the number of pixels per unit directly
                </Typography>

                <FormControlLabel
                  value="Provide Width/Height of Image"
                  control={<Radio />}
                  label="Provide Width/Height of Image"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
                  Enter the physical dimensions of the entire image
                </Typography>
              </RadioGroup>
            </Stack>
          );
        } else {
          // This is Trace Scale Bar (when Instrument Settings NOT shown)
          return renderScaleInputStep();
        }

      case 10:
        // Step 11: Trace Scale Bar (when Instrument Settings IS shown)
        return renderScaleInputStep();

      default:
        return null;
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={(_event, reason) => {
          if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') {
            handleCancel();
          }
        }}
        maxWidth="md"
        fullWidth
        TransitionComponent={Grow}
        transitionDuration={300}
      >
        <DialogTitle>New Project</DialogTitle>
        <DialogContent>
          <Stepper activeStep={activeStep} sx={{ pt: 3, pb: 5 }}>
            {(() => {
              const maxVisibleSteps = 5;
              const totalSteps = steps.length;

              // Calculate visible window
              let startIndex = Math.max(0, activeStep - Math.floor(maxVisibleSteps / 2));
              let endIndex = Math.min(totalSteps, startIndex + maxVisibleSteps);

              // Adjust start if we're near the end
              if (endIndex === totalSteps) {
                startIndex = Math.max(0, totalSteps - maxVisibleSteps);
              }

              const visibleSteps = steps.slice(startIndex, endIndex);

              return visibleSteps.map((label, index) => {
                const actualIndex = startIndex + index;
                return (
                  <Step key={label} completed={actualIndex < activeStep}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                );
              });
            })()}
          </Stepper>
          <Box sx={{ mt: 2, mb: 1 }}>{renderStepContent(activeStep)}</Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel}>Cancel</Button>
          {activeStep > 0 && <Button onClick={handleBack}>Back</Button>}
          {activeStep < steps.length - 1 ? (
            <Button variant="contained" onClick={handleNext} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button variant="contained" onClick={handleFinish} disabled={!canProceed()}>
              Finish
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Periodic Table Modal */}
      <PeriodicTableModal
        isOpen={showPeriodicTable}
        onClose={() => setShowPeriodicTable(false)}
        onSelectElements={(elements) => {
          // Join elements with ", " as per legacy app (straboMicroUtil.implode)
          updateField('imageType', elements.join(', '));
        }}
        initialSelection={
          formData.imageType ? formData.imageType.split(', ').filter((e) => e.trim() !== '') : []
        }
      />
    </>
  );
};
