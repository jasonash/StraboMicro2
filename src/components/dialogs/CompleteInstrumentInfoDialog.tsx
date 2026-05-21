/**
 * Complete Instrument Info Dialog
 *
 * Two-step wizard used to collect Instrument & Image Info for a micrograph
 * that was created via Batch Import with the "Instrument and Image Info"
 * checkbox unchecked. Mirrors the two instrument steps from BatchImportDialog
 * so users get the same fields they would have provided at import time.
 *
 * Opens before EditMicrographLocationDialog / SetScaleDialog when a
 * batch-imported thumbnail with `needsInstrumentInfo: true` is clicked.
 */

import { useMemo, useState } from 'react';
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
} from '@mui/material';
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

const STEPS = ['Instrument & Image Info', 'Instrument Data'] as const;

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
    if (activeStep === 0) {
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

  const handleNext = () => setActiveStep((prev) => prev + 1);
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
          {activeStep === 0 && (
            <InstrumentInfoForm
              formData={instrumentInfoData}
              onFormChange={handleInstrumentInfoChange}
              onInstrumentFromDatabase={handleInstrumentFromDatabase}
              existingMicrographs={existingMicrographs}
              onCopyFromExisting={handleCopyFromExisting}
              showCopyFromExisting={true}
            />
          )}
          {activeStep === 1 && (
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
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleBack} disabled={activeStep === 0}>
          Back
        </Button>
        {isLastStep ? (
          <Button variant="contained" onClick={handleSave} disabled={!canProceed()}>
            Save
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
