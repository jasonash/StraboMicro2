import React, { useState } from 'react';
import { Box } from '@mui/material';
import { DetailedNotesPanel } from './DetailedNotesPanel';
import { DetailedNotesDialog } from './dialogs/DetailedNotesDialog';
import { NotesDialog } from './dialogs/metadata/NotesDialog';
import { SampleInfoDialog } from './dialogs/metadata/SampleInfoDialog';
import { EditMicrographDialog } from './dialogs/metadata/EditMicrographDialog';
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
import { useAppStore } from '@/store';

/**
 * BottomPanel - Collapsible panel for detailed notes
 *
 * Displays project notes, sample notes, and other detailed information from the selected micrograph or spot.
 * Height and collapse state managed by parent Viewer component.
 */
const BottomPanel: React.FC = () => {
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const project = useAppStore((state) => state.project);

  // Find the sample ID and dataset ID for the active micrograph
  const findMicrographParentIds = (): { sampleId?: string; datasetId?: string } => {
    if (!activeMicrographId || !project) return {};
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (sample.micrographs?.some((m) => m.id === activeMicrographId)) {
          return { sampleId: sample.id, datasetId: dataset.id };
        }
      }
    }
    return {};
  };

  const { sampleId, datasetId } = findMicrographParentIds();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Panel content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <DetailedNotesPanel
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
          onEditSection={(sectionId) => setOpenDialog(sectionId)}
          onViewAllNotes={() => setOpenDialog('detailedNotes')}
        />
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

      {openDialog === 'mineralogy' && (
        <MineralogyDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grain' && (
        <GrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fabric' && (
        <FabricsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fracture' && (
        <FracturesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'vein' && (
        <VeinsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fold' && (
        <FoldsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainBoundary' && (
        <GrainBoundaryInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'intraGrain' && (
        <IntraGrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'clastic' && (
        <ClasticDeformationBandInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'pseudotachylyte' && (
        <PseudotachylyteInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'faultsShearZones' && (
        <FaultsShearZonesInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'extinctionMicrostructures' && (
        <ExtinctionMicrostructureInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId || undefined}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'detailedNotes' && (
        <DetailedNotesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
          onEditSection={(sectionId) => setOpenDialog(sectionId)}
        />
      )}
    </Box>
  );
};

export default BottomPanel;
