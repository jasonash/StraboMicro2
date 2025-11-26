/**
 * Instrument Data Form Component
 *
 * Reusable form for capturing detailed instrument information.
 * This is the SECOND instrument step - brand, model, detectors, software, etc.
 * Used in:
 * - NewMicrographDialog (single micrograph creation)
 * - BatchImportDialog (batch micrograph import)
 *
 * All fields match exactly with legacy JavaFX app data model.
 */

import {
  TextField,
  MenuItem,
  Box,
  Stack,
  Typography,
  Button,
  Divider,
  IconButton,
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';

export interface Detector {
  type: string;
  make: string;
  model: string;
}

export interface InstrumentDataFormData {
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
}

export const initialInstrumentDataFormData: InstrumentDataFormData = {
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
};

interface InstrumentDataFormProps {
  formData: InstrumentDataFormData;
  detectors: Detector[];
  instrumentType: string; // Needed to show/hide filament type
  onFormChange: (field: keyof InstrumentDataFormData, value: string) => void;
  onDetectorChange: (index: number, field: keyof Detector, value: string) => void;
  onAddDetector: () => void;
  onRemoveDetector: (index: number) => void;
}

export const InstrumentDataForm: React.FC<InstrumentDataFormProps> = ({
  formData,
  detectors,
  instrumentType,
  onFormChange,
  onDetectorChange,
  onAddDetector,
  onRemoveDetector,
}) => {
  // Filament Type is only shown for SEM, TEM, STEM, Electron Microprobe
  const showFilamentType = [
    'Scanning Electron Microscopy (SEM)',
    'Transmission Electron Microscopy (TEM)',
    'Scanning Transmission Electron Microscopy (STEM)',
    'Electron Microprobe',
  ].includes(instrumentType);

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Instrument Data</Typography>

      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Instrument Details
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          label="Instrument Brand"
          value={formData.instrumentBrand}
          onChange={(e) => onFormChange('instrumentBrand', e.target.value)}
        />
        <TextField
          label="Instrument Model"
          value={formData.instrumentModel}
          onChange={(e) => onFormChange('instrumentModel', e.target.value)}
        />
        <TextField
          label="University"
          value={formData.university}
          onChange={(e) => onFormChange('university', e.target.value)}
        />
        <TextField
          label="Laboratory"
          value={formData.laboratory}
          onChange={(e) => onFormChange('laboratory', e.target.value)}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Detectors
      </Typography>

      {detectors.map((detector, index) => (
        <Stack key={index} direction="row" spacing={2} alignItems="center">
          <TextField
            label="Detector Type"
            value={detector.type}
            onChange={(e) => onDetectorChange(index, 'type', e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Detector Make"
            value={detector.make}
            onChange={(e) => onDetectorChange(index, 'make', e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Detector Model"
            value={detector.model}
            onChange={(e) => onDetectorChange(index, 'model', e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            onClick={() => onRemoveDetector(index)}
            disabled={detectors.length === 1}
          >
            <Remove />
          </IconButton>
        </Stack>
      ))}

      <Button
        variant="outlined"
        startIcon={<Add />}
        onClick={onAddDetector}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add Detector
      </Button>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Software
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          label="Data Collection Software"
          value={formData.dataCollectionSoftware}
          onChange={(e) => onFormChange('dataCollectionSoftware', e.target.value)}
        />
        <TextField
          label="Version"
          value={formData.dataCollectionSoftwareVersion}
          onChange={(e) => onFormChange('dataCollectionSoftwareVersion', e.target.value)}
        />
        <TextField
          label="Post Processing Software"
          value={formData.postProcessingSoftware}
          onChange={(e) => onFormChange('postProcessingSoftware', e.target.value)}
        />
        <TextField
          label="Version"
          value={formData.postProcessingSoftwareVersion}
          onChange={(e) => onFormChange('postProcessingSoftwareVersion', e.target.value)}
        />
      </Box>

      {/* Filament Type - only for SEM, TEM, STEM, Electron Microprobe */}
      {showFilamentType && (
        <TextField
          fullWidth
          select
          label="Filament Type"
          value={formData.filamentType}
          onChange={(e) => onFormChange('filamentType', e.target.value)}
        >
          <MenuItem value="">Select Filament Type...</MenuItem>
          <MenuItem value="Tungsten (W)">Tungsten (W)</MenuItem>
          <MenuItem value="Lanthanum hexaboride (LaB6)">Lanthanum hexaboride (LaB6)</MenuItem>
          <MenuItem value="Field Emission Gun (FEG)">Field Emission Gun (FEG)</MenuItem>
        </TextField>
      )}

      <TextField
        fullWidth
        multiline
        rows={3}
        label="Instrument Notes"
        value={formData.instrumentNotes}
        onChange={(e) => onFormChange('instrumentNotes', e.target.value)}
      />
    </Stack>
  );
};
