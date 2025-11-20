/**
 * New Micrograph Dialog
 *
 * Multi-step wizard for adding a new micrograph (reference or associated) to a sample.
 * Extracted from NewProjectWizard.tsx steps 4-10.
 *
 * Steps:
 * 1. Load Reference Micrograph (file browser)
 * 2. Instrument & Image Information (with periodic table for EDS/WDS)
 * 3. Instrument Data (conditional based on instrument type)
 * 4. Micrograph Metadata (name, polished, notes)
 * 5. Micrograph Orientation (3 methods: unoriented, trend/plunge, fabric reference)
 * 6. Scale Method Selection (3 methods)
 * 7. Scale Input (conditional based on method chosen in Step 6)
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
import PlacementCanvas from './PlacementCanvas';
import { PanTool, Timeline, RestartAlt } from '@mui/icons-material';

interface NewMicrographDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string | null; // For reference micrographs
  parentMicrographId: string | null; // For associated micrographs
}

interface MicrographFormData {
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
  // Location fields (for associated micrographs)
  locationMethod: 'Not Located' | 'Locate by an approximate point' | 'Locate by known grid coordinates' | 'Locate as a scaled rectangle' | '';
  offsetX: number;
  offsetY: number;
  rotationAngle: number;
  scaleX: number;
  scaleY: number;
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

interface Detector {
  type: string;
  make: string;
  model: string;
}

const initialFormData: MicrographFormData = {
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
  // Location initial values (for associated micrographs)
  locationMethod: 'Locate as a scaled rectangle',
  offsetX: 0,
  offsetY: 0,
  rotationAngle: 0,
  scaleX: 1,
  scaleY: 1,
  // Scale method will be set based on location method (defaults to 'Trace Scale Bar' initially)
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

export const NewMicrographDialog: React.FC<NewMicrographDialogProps> = ({
  isOpen,
  onClose,
  sampleId,
  parentMicrographId,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<MicrographFormData>(initialFormData);
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);
  const [detectors, setDetectors] = useState<Detector[]>([{ type: '', make: '', model: '' }]);
  const [micrographPreviewUrl, setMicrographPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [canvasTool, setCanvasTool] = useState<Tool>('pointer');
  const canvasRef = useRef<ScaleBarCanvasRef>(null);

  // Determine if this is an associated micrograph (has a parent) or reference (no parent)
  const isAssociated = parentMicrographId !== null;

  const shouldShowInstrumentSettings = () => {
    return (
      formData.instrumentType &&
      !['Optical Microscopy', 'Scanner', 'Other'].includes(formData.instrumentType)
    );
  };

  // Reference micrograph steps (includes orientation)
  const referenceBaseSteps = [
    'Load Reference Micrograph',
    'Instrument & Image Information',
    'Instrument Data',
    'Micrograph Metadata',
    'Micrograph Orientation',
    'Set Micrograph Scale',
    'Trace Scale Bar',
  ];

  // Associated micrograph steps (NO orientation, adds location method → scale method → placement)
  const associatedBaseSteps = [
    'Load Associated Micrograph',
    'Instrument & Image Information',
    'Instrument Data',
    'Micrograph Metadata',
    'Location Method',
    'Scale Method',
    'Micrograph Location & Scale',
  ];

  const baseSteps = isAssociated ? associatedBaseSteps : referenceBaseSteps;

  const steps = shouldShowInstrumentSettings()
    ? [...baseSteps.slice(0, 3), 'Instrument Settings', ...baseSteps.slice(3)]
    : baseSteps;

  const updateField = (
    field: keyof MicrographFormData,
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

  // Reset canvas tool to 'pointer' when entering the scale bar step
  useEffect(() => {
    const isScaleBarStep =
      (activeStep === 6 && !shouldShowInstrumentSettings()) ||
      (activeStep === 7 && shouldShowInstrumentSettings());

    if (isScaleBarStep && formData.scaleMethod === 'Trace Scale Bar') {
      setCanvasTool('pointer');
    }
  }, [activeStep, formData.scaleMethod]);

  const [scratchIdentifier, setScratchIdentifier] = useState<string | null>(null);
  const [conversionProgress, setConversionProgress] = useState<{ stage: string; percent: number } | null>(null);

  const handleBrowseImage = async () => {
    if (window.api && window.api.openTiffDialog) {
      try {
        const filePath = await window.api.openTiffDialog();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || '';
          // Extract name without extension for micrograph name (matching legacy behavior)
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

          console.log('[NewMicrographDialog] Selected file:', filePath);

          // Convert to JPEG in scratch space IMMEDIATELY
          setIsLoadingPreview(true);
          setConversionProgress({ stage: 'reading', percent: 10 });

          try {
            // Listen for progress updates
            if (window.api.onConversionProgress) {
              window.api.onConversionProgress((progress: { stage: string; percent: number }) => {
                setConversionProgress(progress);
              });
            }

            // Convert TIFF to JPEG in scratch space (never loads full TIFF into memory)
            console.log('[NewMicrographDialog] Converting to scratch JPEG...');
            const conversionResult = await window.api.convertToScratchJPEG(filePath);

            console.log('[NewMicrographDialog] Conversion complete:', conversionResult);

            // Store scratch identifier for later cleanup or move
            setScratchIdentifier(conversionResult.identifier);

            // Now load the JPEG from scratch space (much smaller, much faster)
            console.log('[NewMicrographDialog] Loading tiles from scratch JPEG...');
            const result = await window.api.loadImageWithTiles(conversionResult.scratchPath);

            // Load medium resolution (2048px) for better quality in scale bar tracing
            const mediumDataUrl = await window.api.loadMedium(result.hash);
            setMicrographPreviewUrl(mediumDataUrl);

            // Update form data with image dimensions and file info
            setFormData((prev) => ({
              ...prev,
              micrographFilePath: conversionResult.scratchPath, // Use scratch path now
              micrographFileName: fileName,
              micrographName: prev.micrographName || nameWithoutExt,
              micrographWidth: conversionResult.jpegWidth,
              micrographHeight: conversionResult.jpegHeight,
            }));

            setConversionProgress(null);
          } catch (error) {
            console.error('[NewMicrographDialog] Failed to convert/load image:', error);
            alert(`Error loading image: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setConversionProgress(null);
          } finally {
            setIsLoadingPreview(false);
          }
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

  const handleCancel = async () => {
    // Clean up scratch file if exists
    if (scratchIdentifier && window.api) {
      try {
        console.log('[NewMicrographDialog] Cleaning up scratch file:', scratchIdentifier);
        await window.api.deleteScratchImage(scratchIdentifier);
      } catch (error) {
        console.error('[NewMicrographDialog] Error cleaning up scratch file:', error);
      }
    }

    setFormData(initialFormData);
    setActiveStep(0);
    setDetectors([]);
    setScratchIdentifier(null);
    setConversionProgress(null);
    onClose();
  };

  const handleFinish = async () => {
    // For associated micrographs, we need to find the sampleId from the parent micrograph
    let targetSampleId = sampleId;

    if (isAssociated && parentMicrographId) {
      // Find which sample contains the parent micrograph by searching the project directly
      const project = useAppStore.getState().project;

      if (!project) {
        console.error('Cannot create associated micrograph: no active project');
        alert('Error: No active project found. Please try again.');
        return;
      }

      console.log('[NewMicrographDialog] Looking for parent micrograph:', parentMicrographId);

      let foundParent = false;
      outer: for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.some(m => m.id === parentMicrographId)) {
            targetSampleId = sample.id;
            foundParent = true;
            console.log('[NewMicrographDialog] Found parent in sample:', sample.id);
            break outer;
          }
        }
      }

      if (!foundParent || !targetSampleId) {
        console.error('Cannot create associated micrograph: parent micrograph not found in project');
        console.error('Parent ID:', parentMicrographId);
        console.error('Project structure:', JSON.stringify(project, null, 2));
        alert('Error: Parent micrograph not found. Please try again.');
        return;
      }
    }

    if (!targetSampleId) {
      console.error('Cannot create micrograph: sampleId is required');
      return;
    }

    // Get project ID from store
    const projectId = useAppStore.getState().project?.id;
    if (!projectId) {
      console.error('Cannot create micrograph: project ID not found');
      alert('Error: No active project found. Please create a project first.');
      return;
    }

    // Calculate scale in pixels per centimeter (legacy format)
    let scalePixelsPerCentimeter = 100; // Default fallback

    if (formData.scaleMethod === 'Trace Scale Bar' && formData.scaleBarLineLengthPixels && formData.scaleBarPhysicalLength) {
      const lineLengthPixels = parseFloat(formData.scaleBarLineLengthPixels);
      const physicalLength = parseFloat(formData.scaleBarPhysicalLength);
      const pixelsPerUnit = lineLengthPixels / physicalLength;
      const conversionToCm: { [key: string]: number } = {
        'μm': 10000,
        'mm': 10,
        'cm': 1,
        'm': 0.01,
        'inches': 0.393701
      };
      scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[formData.scaleBarUnits] || 1);
    } else if (formData.scaleMethod === 'Pixel Conversion Factor' && formData.pixels && formData.physicalLength) {
      const pixels = parseFloat(formData.pixels);
      const physicalLength = parseFloat(formData.physicalLength);
      const pixelsPerUnit = pixels / physicalLength;
      const conversionToCm: { [key: string]: number } = {
        'μm': 10000,
        'mm': 10,
        'cm': 1,
        'm': 0.01,
        'inches': 0.393701
      };
      scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[formData.pixelUnits] || 1);
    } else if (formData.scaleMethod === 'Provide Width/Height of Image' && formData.imageWidthPhysical) {
      const imageWidthPhysical = parseFloat(formData.imageWidthPhysical);
      const pixelsPerUnit = formData.micrographWidth / imageWidthPhysical;
      const conversionToCm: { [key: string]: number } = {
        'μm': 10000,
        'mm': 10,
        'cm': 1,
        'm': 0.01,
        'inches': 0.393701
      };
      scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[formData.sizeUnits] || 1);
    }

    // Build orientation info based on selected method (only for reference micrographs)
    const orientationInfo = (() => {
      // Associated micrographs don't have orientation data
      if (isAssociated) {
        return undefined;
      }

      if (formData.orientationMethod === 'unoriented') {
        return { orientationMethod: 'unoriented' as const };
      } else if (formData.orientationMethod === 'trendPlunge') {
        return {
          orientationMethod: 'trendPlunge' as const,
          topTrend: formData.topTrend ? parseFloat(formData.topTrend) : undefined,
          topPlunge: formData.topPlunge ? parseFloat(formData.topPlunge) : undefined,
          topReferenceCorner: formData.topReferenceCorner || undefined,
          sideTrend: formData.sideTrend ? parseFloat(formData.sideTrend) : undefined,
          sidePlunge: formData.sidePlunge ? parseFloat(formData.sidePlunge) : undefined,
          sideReferenceCorner: formData.sideReferenceCorner || undefined,
          trendPlungeStrike: formData.trendPlungeStrike ? parseFloat(formData.trendPlungeStrike) : undefined,
          trendPlungeDip: formData.trendPlungeDip ? parseFloat(formData.trendPlungeDip) : undefined,
        };
      } else if (formData.orientationMethod === 'fabricReference') {
        return {
          orientationMethod: 'fabricReference' as const,
          fabricReference: formData.fabricReference || undefined,
          fabricStrike: formData.fabricStrike ? parseFloat(formData.fabricStrike) : undefined,
          fabricDip: formData.fabricDip ? parseFloat(formData.fabricDip) : undefined,
          fabricTrend: formData.fabricTrend ? parseFloat(formData.fabricTrend) : undefined,
          fabricPlunge: formData.fabricPlunge ? parseFloat(formData.fabricPlunge) : undefined,
          fabricRake: formData.fabricRake ? parseFloat(formData.fabricRake) : undefined,
          lookDirection: formData.lookDirection || undefined,
        };
      }
      return { orientationMethod: 'unoriented' as const };
    })();

    // Generate micrograph ID
    const micrographId = crypto.randomUUID();

    try {
      // Move image from scratch to project folder
      if (window.api && scratchIdentifier) {
        console.log(`[NewMicrographDialog] Moving scratch JPEG to project folder for micrograph ${micrographId}`);

        const moveResult = await window.api.moveFromScratch(
          scratchIdentifier,
          projectId,
          micrographId
        );

        console.log('[NewMicrographDialog] Image moved successfully:', moveResult);

        // Clear scratch identifier since it's been moved
        setScratchIdentifier(null);

        // NOTE: Image variants (uiImages, compositeImages, thumbnails, etc.) are NOT generated here.
        // They will only be generated when:
        // 1. Saving project to .smz file
        // 2. Uploading to Strabo server
        // For local work in StraboMicro2, only the images/ folder is populated.
      } else {
        console.warn('[NewMicrographDialog] window.api not available or no scratch identifier - skipping image move');
      }

      // Create micrograph object
      const micrograph = {
        id: micrographId,
        name: formData.micrographName || formData.micrographFileName || 'Unnamed Micrograph',
        notes: formData.micrographNotes || undefined,
        imageFilename: formData.micrographFileName,
        // imagePath is now just the micrograph ID (image stored in project folder)
        imagePath: micrographId,
        imageWidth: formData.micrographWidth,
        imageHeight: formData.micrographHeight,
        width: formData.micrographWidth, // Legacy field
        height: formData.micrographHeight, // Legacy field
        opacity: 1.0,
        polish: formData.micrographPolished,
        polishDescription: formData.micrographPolishDescription || undefined,
        orientationInfo,
        scalePixelsPerCentimeter,
        // Associated micrograph fields
        parentID: parentMicrographId || undefined,
        ...(isAssociated && {
          xOffset: formData.offsetX,
          yOffset: formData.offsetY,
          rotation: formData.rotationAngle,
        }),
        instrument: {
          instrumentType: formData.instrumentType || undefined,
          otherInstrumentType: formData.otherInstrumentType || undefined,
          dataType: formData.dataType || undefined,
          imageType: formData.imageType || undefined,
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
        },
        isMicroVisible: true,
        isFlipped: false,
      };

      // Add micrograph to store
      useAppStore.getState().addMicrograph(targetSampleId, micrograph);

      // Select the newly created micrograph
      useAppStore.getState().selectMicrograph(micrograph.id);

      console.log('Micrograph created successfully:', micrograph.id);

      // Close dialog
      handleCancel();
    } catch (error) {
      console.error('[NewMicrographDialog] Error creating micrograph:', error);
      alert(`Failed to create micrograph: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const validateOrientationStep = () => {
    // Unoriented is always valid
    if (formData.orientationMethod === 'unoriented') {
      return true;
    }

    // Trend and Plunge of Edges: Need TWO of THREE sets
    if (formData.orientationMethod === 'trendPlunge') {
      const hasTopEdge = formData.topTrend !== '' && formData.topPlunge !== '';
      const hasSideEdge = formData.sideTrend !== '' && formData.sidePlunge !== '';
      const hasStrikeDip = formData.trendPlungeStrike !== '' && formData.trendPlungeDip !== '';

      const completedSets = [hasTopEdge, hasSideEdge, hasStrikeDip].filter(Boolean).length;
      return completedSets >= 2;
    }

    // Fabric Reference Frame
    if (formData.orientationMethod === 'fabricReference') {
      // Must have fabric reference selection (XZ, YZ, or XY)
      if (!formData.fabricReference) return false;

      // Need EITHER (Strike AND Dip) OR (Trend AND (Plunge OR Rake))
      const hasStrikeDip = formData.fabricStrike !== '' && formData.fabricDip !== '';
      const hasTrendPlunge = formData.fabricTrend !== '' && formData.fabricPlunge !== '';
      const hasTrendRake = formData.fabricTrend !== '' && formData.fabricRake !== '';

      return hasStrikeDip || hasTrendPlunge || hasTrendRake;
    }

    return false;
  };

  const canProceed = () => {
    // For associated micrographs, use different validation
    if (isAssociated) {
      const hasInstrumentSettings = shouldShowInstrumentSettings();

      switch (activeStep) {
        case 0: // Load Image
          return formData.micrographFilePath !== '';
        case 1: // Instrument Info
          if (!formData.instrumentType) return false;
          if (formData.instrumentType === 'Other' && !formData.otherInstrumentType) return false;
          return true;
        case 2: // Instrument Data
          return true;
        case 3: // Instrument Settings OR Metadata
          if (hasInstrumentSettings) return true; // Instrument Settings
          // Metadata step
          return formData.micrographName?.trim() !== '';
        case 4: // Metadata OR Location Method
          if (hasInstrumentSettings) {
            // Metadata step
            return formData.micrographName?.trim() !== '';
          } else {
            // Location Method step
            return formData.locationMethod !== '';
          }
        case 5: // Location Method OR Scale Method
          if (hasInstrumentSettings) {
            // Location Method step
            return formData.locationMethod !== '';
          } else {
            // Scale Method step
            return formData.scaleMethod !== '';
          }
        case 6: // Scale Method OR Location/Placement
          if (hasInstrumentSettings) {
            // Scale Method step
            return formData.scaleMethod !== '';
          } else {
            // Location/Placement step - always allow proceeding (placement is optional)
            return true;
          }
        case 7: // Location/Placement (when has settings)
          return true; // Always allow proceeding
        default:
          return true;
      }
    }

    // Reference micrograph validation (existing logic)
    switch (activeStep) {
      case 0: // Load Reference Micrograph
        return formData.micrographFilePath !== '';

      case 1: // Instrument & Image Information
        // Required: instrumentType
        if (!formData.instrumentType) return false;
        if (formData.instrumentType === 'Other' && !formData.otherInstrumentType) return false;
        return true;

      case 2: // Instrument Data - no required fields, all optional
        return true;

      case 3: // Either Instrument Settings OR Micrograph Metadata (depending on instrument type)
        if (shouldShowInstrumentSettings()) {
          // This is Step 3: Instrument Settings (when shown) - no required fields
          return true;
        } else {
          // This is Step 3: Micrograph Metadata (when Instrument Settings not shown)
          // Required: micrographName
          if (!formData.micrographName || formData.micrographName.trim() === '') {
            return false;
          }
          return true;
        }

      case 4: // Either Micrograph Metadata (when Instrument Settings IS shown) OR Micrograph Orientation (when not shown)
        if (shouldShowInstrumentSettings()) {
          // This is Step 4: Micrograph Metadata (when Instrument Settings IS shown)
          if (!formData.micrographName || formData.micrographName.trim() === '') {
            return false;
          }
          return true;
        } else {
          // This is Step 4: Micrograph Orientation (when Instrument Settings NOT shown)
          return validateOrientationStep();
        }

      case 5: // Either Micrograph Orientation (when Instrument Settings IS shown) OR Set Micrograph Scale (when NOT shown)
        if (shouldShowInstrumentSettings()) {
          // This is Step 5: Micrograph Orientation (when Instrument Settings IS shown)
          return validateOrientationStep();
        } else {
          // This is Step 5: Set Micrograph Scale (when Instrument Settings NOT shown)
          return formData.scaleMethod !== '';
        }

      case 6: // Either Set Micrograph Scale (when Instrument Settings IS shown) OR Trace Scale Bar (when NOT shown)
        if (shouldShowInstrumentSettings()) {
          // This is Step 6: Set Micrograph Scale (when Instrument Settings IS shown)
          return formData.scaleMethod !== '';
        } else {
          // This is Step 6: Trace Scale Bar / Execute selected scale method (when Instrument Settings NOT shown)
          if (formData.scaleMethod === 'Trace Scale Bar') {
            return (
              formData.scaleBarLineStart !== null &&
              formData.scaleBarLineEnd !== null &&
              formData.scaleBarLineLengthPixels !== '' &&
              formData.scaleBarPhysicalLength !== ''
            );
          } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
            return formData.pixels !== '' && formData.physicalLength !== '';
          } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
            return formData.imageWidthPhysical !== '' || formData.imageHeightPhysical !== '';
          }
          return false;
        }

      case 7: // Trace Scale Bar (when Instrument Settings IS shown) - Execute selected scale method
        if (formData.scaleMethod === 'Trace Scale Bar') {
          return (
            formData.scaleBarLineStart !== null &&
            formData.scaleBarLineEnd !== null &&
            formData.scaleBarLineLengthPixels !== '' &&
            formData.scaleBarPhysicalLength !== ''
          );
        } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
          return formData.pixels !== '' && formData.physicalLength !== '';
        } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
          return formData.imageWidthPhysical !== '' || formData.imageHeightPhysical !== '';
        }
        return false;

      default:
        return true;
    }
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
                      {conversionProgress
                        ? `Converting image... ${conversionProgress.percent}%`
                        : 'Loading preview...'}
                    </Typography>
                    {conversionProgress && (
                      <Typography variant="caption" color="text.secondary">
                        {conversionProgress.stage === 'reading' && 'Reading image file...'}
                        {conversionProgress.stage === 'converting' && 'Converting to JPEG...'}
                        {conversionProgress.stage === 'complete' && 'Complete!'}
                      </Typography>
                    )}
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
              originalWidth={formData.micrographWidth}
              originalHeight={formData.micrographHeight}
              showToolbar={false}
              currentTool={canvasTool}
              onToolChange={setCanvasTool}
              onLineDrawn={(lineData) => {
                console.log('Line drawn:', lineData);
                // lineData.lengthPixels is already in original image pixels
                setFormData((prev) => ({
                  ...prev,
                  scaleBarLineStart: lineData.start,
                  scaleBarLineEnd: lineData.end,
                  scaleBarLineLengthPixels: lineData.lengthPixels.toFixed(2),
                }));
              }}
            />
          ) : (
            <Box
              sx={{
                height: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              {isLoadingPreview ? (
                <CircularProgress />
              ) : (
                <Typography color="text.secondary">Loading micrograph preview...</Typography>
              )}
            </Box>
          )}
        </Stack>
      );
    } else if (formData.scaleMethod === 'Pixel Conversion Factor') {
      return (
        <Stack spacing={2}>
          {/* Micrograph thumbnail preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box
                component="img"
                src={micrographPreviewUrl}
                alt="Micrograph preview"
                sx={{
                  maxWidth: '100%',
                  maxHeight: 400,
                  objectFit: 'contain',
                }}
              />
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            Enter the number of pixels that corresponds to a known physical length.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              required
              label="Number of Pixels"
              type="number"
              value={formData.pixels}
              onChange={(e) => updateField('pixels', e.target.value)}
            />
            <TextField
              fullWidth
              required
              label="Physical Length"
              type="number"
              value={formData.physicalLength}
              onChange={(e) => updateField('physicalLength', e.target.value)}
            />
            <TextField
              fullWidth
              select
              required
              label="Units"
              value={formData.pixelUnits}
              onChange={(e) => updateField('pixelUnits', e.target.value)}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      );
    } else if (formData.scaleMethod === 'Provide Width/Height of Image') {
      return (
        <Stack spacing={2}>
          {/* Micrograph thumbnail preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box
                component="img"
                src={micrographPreviewUrl}
                alt="Micrograph preview"
                sx={{
                  maxWidth: '100%',
                  maxHeight: 400,
                  objectFit: 'contain',
                }}
              />
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            Enter the physical width and/or height of the entire micrograph image. At least one
            dimension is required.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Image Width"
              type="number"
              value={formData.imageWidthPhysical}
              onChange={(e) => updateField('imageWidthPhysical', e.target.value)}
              helperText="Physical width of the entire image"
            />
            <TextField
              fullWidth
              label="Image Height"
              type="number"
              value={formData.imageHeightPhysical}
              onChange={(e) => updateField('imageHeightPhysical', e.target.value)}
              helperText="Physical height of the entire image"
            />
            <TextField
              fullWidth
              select
              required
              label="Units"
              value={formData.sizeUnits}
              onChange={(e) => updateField('sizeUnits', e.target.value)}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      );
    }

    return null;
  };

  // Render Micrograph Metadata step
  const renderMetadataStep = () => {
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
  };

  // Render Location Method Selection step (for associated micrographs)
  const renderLocationMethodStep = () => {
    return (
      <Stack spacing={3}>
        <Typography variant="body2" color="text.secondary">
          Choose how to locate this associated micrograph on its parent image. The default method
          (scaled rectangle) allows you to interactively position, resize, and rotate the image.
        </Typography>
        <RadioGroup
          value={formData.locationMethod}
          onChange={(e) => updateField('locationMethod', e.target.value)}
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

          {/* TODO: Implement these location methods later
          <FormControlLabel
            value="Locate by known grid coordinates"
            control={<Radio />}
            label="Locate by known grid coordinates"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
            Enter precise grid coordinates for positioning
          </Typography>

          <FormControlLabel
            value="Not Located"
            control={<Radio />}
            label="Not Located"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
            Do not specify a location for this image
          </Typography>
          */}
        </RadioGroup>
      </Stack>
    );
  };

  // Render Scale Method Selection step (for associated micrographs)
  const renderAssociatedScaleMethodStep = () => {
    // Different scale options based on location method
    const isScaledRectangle = formData.locationMethod === 'Locate as a scaled rectangle';

    // Check if there are any micrographs with matching aspect ratio
    const currentAspectRatio = formData.micrographWidth / formData.micrographHeight;
    const hasMatchingAspectRatio = (() => {
      const project = useAppStore.getState().project;
      if (!project) return false;

      const tolerance = 0.01; // 1% tolerance for aspect ratio matching

      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          for (const micrograph of sample.micrographs || []) {
            if (micrograph.imageWidth && micrograph.imageHeight) {
              const ratio = micrograph.imageWidth / micrograph.imageHeight;
              if (Math.abs(ratio - currentAspectRatio) / currentAspectRatio < tolerance) {
                return true;
              }
            }
          }
        }
      }
      return false;
    })();

    return (
      <Stack spacing={3}>
        <Typography variant="body2" color="text.secondary">
          How do you wish to set the scale?
        </Typography>
        <RadioGroup
          value={formData.scaleMethod}
          onChange={(e) => updateField('scaleMethod', e.target.value)}
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
                Use the same scale as another micrograph with matching aspect ratio
              </Typography>
            </>
          )}
        </RadioGroup>
      </Stack>
    );
  };

  // Render Location & Scale step (for associated micrographs)
  const renderLocationPlacementStep = () => {
    // Handler for placement changes from the canvas
    const handlePlacementChange = (offsetX: number, offsetY: number, rotation: number, scaleX?: number, scaleY?: number) => {
      updateField('offsetX', offsetX);
      updateField('offsetY', offsetY);
      updateField('rotationAngle', rotation);
      if (scaleX !== undefined) updateField('scaleX', scaleX);
      if (scaleY !== undefined) updateField('scaleY', scaleY);
    };

    // Render different canvas based on location method
    if (formData.locationMethod === 'Locate as a scaled rectangle') {
      // Ensure we have necessary data
      if (!parentMicrographId || !formData.micrographFilePath) {
        return (
          <Typography variant="body2" color="error">
            Error: Missing parent micrograph or child image data
          </Typography>
        );
      }

      return (
        <Stack spacing={2}>
          <Typography variant="h6">
            Position the Associated Micrograph
          </Typography>
          <PlacementCanvas
            parentMicrographId={parentMicrographId}
            childScratchPath={formData.micrographFilePath}
            childWidth={formData.micrographWidth}
            childHeight={formData.micrographHeight}
            scaleMethod={formData.scaleMethod}
            initialOffsetX={formData.offsetX}
            initialOffsetY={formData.offsetY}
            initialRotation={formData.rotationAngle}
            onPlacementChange={handlePlacementChange}
          />
        </Stack>
      );
    }

    if (formData.locationMethod === 'Locate by an approximate point') {
      // TODO: Implement PointPlacementCanvas
      return (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Click on the parent micrograph to place the center point of the associated micrograph.
          </Typography>
          <Typography variant="body2" color="warning.main">
            TODO: Implement PointPlacementCanvas component
          </Typography>
          <Box sx={{ p: 4, bgcolor: 'background.default', borderRadius: 1, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Location method: {formData.locationMethod}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Point placement canvas coming soon...
            </Typography>
          </Box>
        </Stack>
      );
    }

    // Fallback for unknown location method
    return (
      <Stack spacing={2}>
        <Typography variant="body2" color="error">
          Unknown location method: {formData.locationMethod}
        </Typography>
      </Stack>
    );
  };

  const renderStepContent = (step: number) => {
    // For associated micrographs, route to different steps after metadata
    if (isAssociated) {
      const hasInstrumentSettings = shouldShowInstrumentSettings();

      // Step mapping for associated micrographs:
      // 0: Load Image
      // 1: Instrument Info
      // 2: Instrument Data
      // 3: Instrument Settings (conditional)
      // 4: Metadata (if has settings) OR Location Method (if no settings)
      // 5: Location Method (if has settings) OR Scale Method (if no settings)
      // 6: Scale Method (if has settings) OR Location/Placement (if no settings)
      // 7: Location/Placement (if has settings)

      if (hasInstrumentSettings) {
        if (step === 4) return renderMetadataStep();
        if (step === 5) return renderLocationMethodStep();
        if (step === 6) return renderAssociatedScaleMethodStep();
        if (step === 7) return renderLocationPlacementStep();
      } else {
        if (step === 3) return renderMetadataStep();
        if (step === 4) return renderLocationMethodStep();
        if (step === 5) return renderAssociatedScaleMethodStep();
        if (step === 6) return renderLocationPlacementStep();
      }
      // Fall through to default handling for steps 0-3 (shared with reference)
    }

    switch (step) {
      case 0:
        return (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {isAssociated
                ? 'Select an associated micrograph image file to overlay on the parent micrograph. This image will be positioned and scaled relative to its parent.'
                : 'Select a reference micrograph image file to add to this sample. This will be the base image for your annotations and measurements.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                required
                label="Micrograph File"
                value={formData.micrographFileName}
                InputProps={{ readOnly: true }}
                helperText="Click 'Browse' to select an image file (TIFF, JPEG, PNG, BMP)"
              />
              <Button
                variant="contained"
                onClick={handleBrowseImage}
                sx={{ minWidth: '120px', mt: 0 }}
                disabled={isLoadingPreview}
              >
                Browse...
              </Button>
            </Box>
          </Stack>
        );
      case 1:
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

      case 2:
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

      case 3:
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

      case 4:
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

      case 5:
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

      case 6:
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

      case 7:
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
        <DialogTitle>{parentMicrographId ? 'New Associated Micrograph' : 'New Reference Micrograph'}</DialogTitle>
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

      {/* Loading Overlay for Image Conversion */}
      {isLoadingPreview && conversionProgress && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            gap: 3,
          }}
        >
          <CircularProgress size={60} />
          <Typography variant="h6" color="white">
            Converting Image...
          </Typography>
          <Typography variant="body1" color="white">
            {conversionProgress.percent}%
          </Typography>
          <Typography variant="body2" color="white" sx={{ opacity: 0.8 }}>
            {conversionProgress.stage === 'reading' && 'Reading TIFF file...'}
            {conversionProgress.stage === 'converting' && 'Optimizing Large Image...'}
            {conversionProgress.stage === 'complete' && 'Loading preview...'}
          </Typography>
          <Typography variant="caption" color="white" sx={{ opacity: 0.6 }}>
            Large TIFF files may take a minute to process
          </Typography>
        </Box>
      )}
    </>
  );
};
