/**
 * Properties Panel Component
 *
 * Displays metadata for the currently selected micrograph or spot.
 * Provides a dropdown menu to add/edit various types of geological data.
 */

import { useState } from 'react';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Divider,
  Stack,
} from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useAppStore } from '@/store';
import { NotesDialog } from './dialogs/metadata/NotesDialog';
import { SampleInfoDialog } from './dialogs/metadata/SampleInfoDialog';
import { MicrographInfoDialog } from './dialogs/metadata/MicrographInfoDialog';
import { MineralogyDialog } from './dialogs/metadata/MineralogyDialog';
import { GrainSizeDialog } from './dialogs/metadata/GrainSizeDialog';
import { GrainShapeDialog } from './dialogs/metadata/GrainShapeDialog';
import { GrainOrientationDialog } from './dialogs/metadata/GrainOrientationDialog';

/**
 * Data type options for micrographs
 */
const MICROGRAPH_DATA_TYPES = [
  { id: '', label: 'Select Data Type...' },
  { id: 'sample', label: 'Sample Info' },
  { id: 'micrograph', label: 'Micrograph Info' },
  { id: 'mineralogy', label: 'Mineralogy/Lithology' },
  { id: 'grainSize', label: 'Grain Size' },
  { id: 'grainShape', label: 'Grain Shape' },
  { id: 'grainOrientation', label: 'Grain Orientation/SPO' },
  { id: 'fabric', label: 'Fabrics' },
  { id: 'clastic', label: 'Clastic Deformation Bands' },
  { id: 'grainBoundary', label: 'Grain Boundaries / Contacts' },
  { id: 'intraGrain', label: 'Intragranular Structures' },
  { id: 'vein', label: 'Veins' },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte' },
  { id: 'fold', label: 'Folds' },
  { id: 'faultsShearZones', label: 'Faults and Shear Zones' },
  { id: 'extinctionMicrostructures', label: 'Extinction Microstructures' },
  { id: 'fracture', label: 'Fractures' },
  { id: 'notes', label: 'Notes' },
  { id: 'files', label: 'Associated Files' },
  { id: 'links', label: 'Links' },
] as const;

/**
 * Data type options for spots
 */
const SPOT_DATA_TYPES = [
  { id: '', label: 'Select Data Type...' },
  { id: 'sample', label: 'Sample Info' },
  { id: 'spot', label: 'Spot Data' },
  { id: 'mineralogy', label: 'Mineralogy/Lithology' },
  { id: 'grainSize', label: 'Grain Size' },
  { id: 'grainShape', label: 'Grain Shape' },
  { id: 'grainOrientation', label: 'Grain Orientation/SPO' },
  { id: 'fabric', label: 'Fabrics' },
  { id: 'clastic', label: 'Clastic Deformation Bands' },
  { id: 'grainBoundary', label: 'Grain Boundaries / Contacts' },
  { id: 'intraGrain', label: 'Intragranular Structures' },
  { id: 'vein', label: 'Veins' },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte' },
  { id: 'fold', label: 'Folds' },
  { id: 'faultsShearZones', label: 'Faults and Shear Zones' },
  { id: 'extinctionMicrostructures', label: 'Extinction Microstructures' },
  { id: 'fracture', label: 'Fractures' },
  { id: 'notes', label: 'Notes' },
  { id: 'files', label: 'Associated Files' },
  { id: 'links', label: 'Links' },
] as const;

export function PropertiesPanel() {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);

  const [selectedDataType, setSelectedDataType] = useState('');
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  // Find the sample ID for the active micrograph
  const findSampleIdForMicrograph = (): string | undefined => {
    if (!activeMicrographId || !project) return undefined;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (sample.micrographs?.some((m) => m.id === activeMicrographId)) {
          return sample.id;
        }
      }
    }
    return undefined;
  };

  const sampleId = findSampleIdForMicrograph();

  // Determine what type of entity is selected
  const selectionType = activeMicrographId ? 'micrograph' : activeSpotId ? 'spot' : null;

  // Get appropriate data types based on selection
  const dataTypes = selectionType === 'micrograph'
    ? MICROGRAPH_DATA_TYPES
    : selectionType === 'spot'
      ? SPOT_DATA_TYPES
      : [];

  const handleDataTypeChange = (event: SelectChangeEvent<string>) => {
    const dataType = event.target.value;

    if (dataType) {
      // Open the corresponding dialog
      setOpenDialog(dataType);
    }

    // Always reset dropdown to "Select Data Type..." after any selection
    // Use setTimeout to ensure the menu closes first
    setTimeout(() => {
      setSelectedDataType('');
    }, 0);
  };

  // If nothing is selected, show placeholder
  if (!selectionType) {
    return (
      <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Select a micrograph or spot to view and edit metadata
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        {selectionType === 'micrograph' ? 'Micrograph Properties' : 'Spot Properties'}
      </Typography>

      <Divider sx={{ mb: 2 }} />

      {/* Data Type Selector */}
      <FormControl fullWidth sx={{ mb: 3 }}>
        <Select
          value={selectedDataType}
          onChange={handleDataTypeChange}
          displayEmpty
          sx={{
            '& .MuiSelect-select': {
              py: 1.5,
            }
          }}
        >
          {dataTypes.map((type) => (
            <MenuItem key={type.id} value={type.id} disabled={type.id === ''}>
              {type.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Metadata Summary Section */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Collected Data
        </Typography>

        <Stack spacing={1}>
          {/* TODO: Display collected metadata here */}
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No metadata collected yet. Use the dropdown above to add data.
          </Typography>
        </Stack>
      </Box>

      {/* Dialogs */}
      {openDialog === 'notes' && (
        <NotesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'sample' && sampleId && (
        <SampleInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          sampleId={sampleId}
        />
      )}

      {openDialog === 'micrograph' && activeMicrographId && (
        <MicrographInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId}
        />
      )}

      {openDialog === 'mineralogy' && (
        <MineralogyDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainSize' && (
        <GrainSizeDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainShape' && (
        <GrainShapeDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainOrientation' && (
        <GrainOrientationDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}
    </Box>
  );
}
