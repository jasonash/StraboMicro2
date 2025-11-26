/**
 * Instrument Info Form Component
 *
 * Reusable form for capturing instrument and image information.
 * Used in:
 * - NewMicrographDialog (single micrograph creation)
 * - BatchImportDialog (batch micrograph import)
 *
 * Controlled vocabularies match exactly with legacy JavaFX app.
 */

import { useState } from 'react';
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
import { PeriodicTableModal } from './PeriodicTableModal';
import { InstrumentDatabaseDialog, type InstrumentData } from './InstrumentDatabaseDialog';
import type { MicrographMetadata } from '@/types/project-types';

export interface InstrumentFormData {
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
}

export interface Detector {
  type: string;
  make: string;
  model: string;
}

interface InstrumentInfoFormProps {
  formData: InstrumentFormData;
  detectors: Detector[];
  onFormChange: (field: keyof InstrumentFormData, value: string) => void;
  onDetectorChange: (index: number, field: keyof Detector, value: string) => void;
  onAddDetector: () => void;
  onRemoveDetector: (index: number) => void;
  onInstrumentFromDatabase?: (instrument: InstrumentData) => void;
  existingMicrographs?: MicrographMetadata[];
  onCopyFromExisting?: (micrographId: string) => void;
  showCopyFromExisting?: boolean;
}

export const InstrumentInfoForm: React.FC<InstrumentInfoFormProps> = ({
  formData,
  detectors,
  onFormChange,
  onDetectorChange,
  onAddDetector,
  onRemoveDetector,
  onInstrumentFromDatabase,
  existingMicrographs = [],
  onCopyFromExisting,
  showCopyFromExisting = false,
}) => {
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);
  const [showInstrumentDatabase, setShowInstrumentDatabase] = useState(false);

  const handleInstrumentFromDatabase = (instrument: InstrumentData) => {
    if (onInstrumentFromDatabase) {
      onInstrumentFromDatabase(instrument);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Instrument and Image Information</Typography>

      {/* Load Metadata from Previous Image */}
      {showCopyFromExisting && existingMicrographs.length > 0 && (
        <TextField
          fullWidth
          select
          label="Load Metadata from Previous Image"
          value=""
          onChange={(e) => onCopyFromExisting?.(e.target.value)}
        >
          <MenuItem value="">Select a micrograph...</MenuItem>
          {existingMicrographs.map((micro) => (
            <MenuItem key={micro.id} value={micro.id}>
              {micro.name} - {micro.instrument?.instrumentType || 'Unknown'}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Button
        variant="outlined"
        onClick={() => setShowInstrumentDatabase(true)}
        sx={{ alignSelf: 'flex-start' }}
      >
        Load Instrument from Database
      </Button>

      <TextField
        fullWidth
        required
        select
        label="Instrument Type"
        value={formData.instrumentType}
        onChange={(e) => {
          onFormChange('instrumentType', e.target.value);
          // Clear dependent fields when instrument type changes
          onFormChange('otherInstrumentType', '');
          onFormChange('dataType', '');
          onFormChange('imageType', '');
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
          onChange={(e) => onFormChange('otherInstrumentType', e.target.value)}
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
            onFormChange('dataType', e.target.value);
            onFormChange('imageType', '');
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
            onFormChange('dataType', e.target.value);
            onFormChange('imageType', '');
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
            onFormChange('dataType', e.target.value);
            onFormChange('imageType', '');
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
            onFormChange('dataType', e.target.value);
            onFormChange('imageType', '');
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
          onChange={(e) => onFormChange('imageType', e.target.value)}
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
          onChange={(e) => onFormChange('imageType', e.target.value)}
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
          onChange={(e) => onFormChange('imageType', e.target.value)}
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
          onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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
            onChange={(e) => onFormChange('imageType', e.target.value)}
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

      <Divider sx={{ my: 2 }} />

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
      {['Scanning Electron Microscopy (SEM)', 'Transmission Electron Microscopy (TEM)', 'Scanning Transmission Electron Microscopy (STEM)', 'Electron Microprobe'].includes(formData.instrumentType) && (
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

      {/* Periodic Table Modal */}
      <PeriodicTableModal
        isOpen={showPeriodicTable}
        onClose={() => setShowPeriodicTable(false)}
        initialSelection={formData.imageType ? formData.imageType.split(', ') : []}
        onSelectElements={(elements: string[]) => onFormChange('imageType', elements.join(', '))}
      />

      {/* Instrument Database Dialog */}
      <InstrumentDatabaseDialog
        isOpen={showInstrumentDatabase}
        onClose={() => setShowInstrumentDatabase(false)}
        onSelect={handleInstrumentFromDatabase}
      />
    </Stack>
  );
};
