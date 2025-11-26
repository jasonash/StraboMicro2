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
} from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useAppStore } from '@/store';
import { BreadcrumbsBar } from './BreadcrumbsBar';
import { DataTypeAutocomplete } from './DataTypeAutocomplete';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { NotesDialog } from './dialogs/metadata/NotesDialog';
import { SampleInfoDialog } from './dialogs/metadata/SampleInfoDialog';
import { EditMicrographDialog } from './dialogs/metadata/EditMicrographDialog';
import { EditSpotDialog } from './dialogs/metadata/EditSpotDialog';
import { EditDatasetDialog } from './dialogs/EditDatasetDialog';
import { EditProjectDialog } from './dialogs/EditProjectDialog';
import { MineralogyDialog } from './dialogs/metadata/MineralogyDialog';
import { GrainInfoDialog } from './dialogs/metadata/graininfo/GrainInfoDialog';
import { FabricsDialog } from './dialogs/metadata/fabrics/FabricsDialog';
import { FracturesDialog } from './dialogs/metadata/fractures/FracturesDialog';
import { VeinsDialog } from './dialogs/metadata/veins/VeinsDialog';
import { FoldsDialog } from './dialogs/metadata/folds/FoldsDialog';
import { GrainBoundaryInfoDialog } from './dialogs/metadata/grainboundary/GrainBoundaryInfoDialog';
import { IntraGrainInfoDialog } from './dialogs/metadata/intragrain/IntraGrainInfoDialog';
import { ClasticDeformationBandInfoDialog } from './dialogs/metadata/clasticdeformationband/ClasticDeformationBandInfoDialog';
import { PseudotachylyteInfoDialog } from './dialogs/metadata/pseudotachylyte/PseudotachylyteInfoDialog';
import { FaultsShearZonesInfoDialog } from './dialogs/metadata/faultsshearzon es/FaultsShearZonesInfoDialog';
import { ExtinctionMicrostructureInfoDialog } from './dialogs/metadata/extinctionmicrostructure/ExtinctionMicrostructureInfoDialog';
import { AssociatedFilesInfoDialog } from './dialogs/metadata/associatedfiles/AssociatedFilesInfoDialog';
import { LinksInfoDialog } from './dialogs/metadata/links/LinksInfoDialog';
import { MetadataSummary } from './MetadataSummary';

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
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const deleteMicrograph = useAppStore((state) => state.deleteMicrograph);
  const deleteSpot = useAppStore((state) => state.deleteSpot);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);

  const [selectedDataType, setSelectedDataType] = useState('');
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'micrograph' | 'spot' | null>(null);

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

  // Find the dataset ID for the active micrograph
  const findDatasetIdForMicrograph = (): string | undefined => {
    if (!activeMicrographId || !project) return undefined;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (sample.micrographs?.some((m) => m.id === activeMicrographId)) {
          return dataset.id;
        }
      }
    }
    return undefined;
  };

  const sampleId = findSampleIdForMicrograph();
  const datasetId = findDatasetIdForMicrograph();

  // Determine what type of entity is selected (check spot first since it's more specific)
  const selectionType = activeSpotId ? 'spot' : activeMicrographId ? 'micrograph' : null;

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

  // Handle download micrograph image
  const handleDownloadMicrograph = async () => {
    if (!activeMicrographId) return;

    // Find the micrograph to get its image path
    for (const dataset of project?.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micrograph = sample.micrographs?.find((m) => m.id === activeMicrographId);
        if (micrograph?.imagePath) {
          // Use the Electron API to trigger a save dialog
          await window.api?.downloadMicrograph(micrograph.imagePath, micrograph.name || 'micrograph');
          return;
        }
      }
    }
  };

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    if (confirmDelete === 'micrograph' && activeMicrographId) {
      deleteMicrograph(activeMicrographId);
      selectMicrograph(null);
    } else if (confirmDelete === 'spot' && activeSpotId) {
      deleteSpot(activeSpotId);
      selectActiveSpot(null);
    }
    setConfirmDelete(null);
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
      {/* Breadcrumbs Navigation Bar */}
      <BreadcrumbsBar
        onDownloadMicrograph={handleDownloadMicrograph}
        onDeleteMicrograph={() => setConfirmDelete('micrograph')}
        onDeleteSpot={() => setConfirmDelete('spot')}
      />

      {/* Header */}
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        Add Data:
      </Typography>

      {/* Autocomplete Search */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Search by Data Type:
        </Typography>
        <DataTypeAutocomplete
          context={selectionType}
          onSelectModal={(modal) => setOpenDialog(modal)}
        />
      </Box>

      {/* Data Type Selector Dropdown */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        or Select Data Type:
      </Typography>
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

        <MetadataSummary
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
          onEditSection={(sectionId) => setOpenDialog(sectionId)}
        />
      </Box>

      {/* Dialogs */}
      {openDialog === 'notes' && (
        <NotesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'project' && project && (
        <EditProjectDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
        />
      )}

      {openDialog === 'dataset' && datasetId && (
        <EditDatasetDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          datasetId={datasetId}
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
        <EditMicrographDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId}
        />
      )}

      {openDialog === 'spot' && activeSpotId && (
        <EditSpotDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          spotId={activeSpotId}
        />
      )}

      {openDialog === 'mineralogy' && (
        <MineralogyDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grain' && (
        <GrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fabric' && (
        <FabricsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fracture' && (
        <FracturesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'vein' && (
        <VeinsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fold' && (
        <FoldsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainBoundary' && (
        <GrainBoundaryInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'intraGrain' && (
        <IntraGrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'clastic' && (
        <ClasticDeformationBandInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'pseudotachylyte' && (
        <PseudotachylyteInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'faultsShearZones' && (
        <FaultsShearZonesInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'extinctionMicrostructures' && (
        <ExtinctionMicrostructureInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'files' && (
        <AssociatedFilesInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'links' && (
        <LinksInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDelete === 'micrograph' ? 'Delete Micrograph' : 'Delete Spot'}
        message={
          confirmDelete === 'micrograph'
            ? 'Are you sure you want to delete this micrograph? This action cannot be undone.'
            : 'Are you sure you want to delete this spot? This action cannot be undone.'
        }
        confirmLabel="Delete"
        confirmColor="error"
      />
    </Box>
  );
}
