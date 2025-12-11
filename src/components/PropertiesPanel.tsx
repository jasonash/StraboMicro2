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
  Snackbar,
  Alert,
} from '@mui/material';
import { useAppStore } from '@/store';
import { BreadcrumbsBar } from './BreadcrumbsBar';
import { CombinedDataTypeSelector } from './CombinedDataTypeSelector';
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


export function PropertiesPanel() {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const deleteMicrograph = useAppStore((state) => state.deleteMicrograph);
  const deleteSpot = useAppStore((state) => state.deleteSpot);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);

  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'micrograph' | 'spot' | null>(null);

  // Export feedback state
  const [isExporting, setIsExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

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

  // Handle download micrograph as JPEG
  const handleDownloadJpeg = async () => {
    if (!activeMicrographId || !project?.id || isExporting) return;

    setIsExporting(true);
    setSnackbar({ open: true, message: 'Exporting as JPEG...', severity: 'info' });

    try {
      const result = await window.api?.exportCompositeMicrograph(
        project.id,
        activeMicrographId,
        project,
        { includeSpots: true, includeLabels: true }
      );

      if (result?.success) {
        setSnackbar({ open: true, message: 'JPEG exported successfully', severity: 'success' });
      } else if (result?.canceled) {
        setSnackbar({ open: false, message: '', severity: 'info' });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle download micrograph as SVG (vector)
  const handleDownloadSvg = async () => {
    if (!activeMicrographId || !project?.id || isExporting) return;

    setIsExporting(true);
    setSnackbar({ open: true, message: 'Exporting as SVG...', severity: 'info' });

    try {
      const result = await window.api?.exportMicrographAsSvg(
        project.id,
        activeMicrographId,
        project
      );

      if (result?.success) {
        setSnackbar({ open: true, message: 'SVG exported successfully', severity: 'success' });
      } else if (result?.canceled) {
        setSnackbar({ open: false, message: '', severity: 'info' });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
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
      {/* Panel Title */}
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
        {selectionType === 'spot' ? 'Spot Details' : 'Micrograph Details'}
      </Typography>

      {/* Breadcrumbs Navigation Bar */}
      <BreadcrumbsBar
        onDownloadJpeg={handleDownloadJpeg}
        onDownloadSvg={handleDownloadSvg}
        onDeleteMicrograph={() => setConfirmDelete('micrograph')}
        onDeleteSpot={() => setConfirmDelete('spot')}
        isDownloading={isExporting}
      />

      {/* Combined Data Type Selector */}
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        Add Data:
      </Typography>
      <Box sx={{ mb: 3 }}>
        <CombinedDataTypeSelector
          context={selectionType}
          onSelectModal={(modal) => setOpenDialog(modal)}
        />
      </Box>

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

      {/* Export Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'info' ? null : 4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            width: '100%',
            color: '#fff', // White text for all messages
            // Use app's primary pinkish-red for info messages
            ...(snackbar.severity === 'info' && {
              backgroundColor: '#e44c65',
            }),
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
