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
  InputLabel,
  Divider,
  Stack,
} from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useAppStore } from '@/store';

/**
 * Data type options for micrographs
 */
const MICROGRAPH_DATA_TYPES = [
  { id: '', label: 'Select Data Type...' },
  { id: 'sample', label: 'Sample Info' },
  { id: 'micrograph', label: 'Micrograph Info' },
  { id: 'mineralogy', label: 'Mineralogy/Lithology' },
  { id: 'grain', label: 'Grain Size/Shape/SPO' },
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
  { id: 'grain', label: 'Grain Size/Shape/SPO' },
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
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);

  const [selectedDataType, setSelectedDataType] = useState('');
  const [openDialog, setOpenDialog] = useState<string | null>(null);

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

      // Reset dropdown to "Select Data Type..."
      setSelectedDataType('');
    }
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
        <InputLabel id="data-type-select-label">Add/Edit Data</InputLabel>
        <Select
          labelId="data-type-select-label"
          id="data-type-select"
          value={selectedDataType}
          label="Add/Edit Data"
          onChange={handleDataTypeChange}
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

      {/* Dialogs will be rendered here */}
      {/* TODO: Add dialog components based on openDialog state */}
      {openDialog && (
        <Box>
          {/* Placeholder - will be replaced with actual dialogs */}
          <Typography variant="body2" color="text.secondary">
            Dialog for {openDialog} (coming soon)
          </Typography>
        </Box>
      )}
    </Box>
  );
}
