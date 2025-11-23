/**
 * Grain Boundary Info Dialog Component
 *
 * Dialog for managing grain boundary data.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { useAppStore } from '@/store';
import { GrainBoundaryInfoType, GrainBoundaryType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { GrainBoundaryAddForm, GrainBoundaryData } from './GrainBoundaryAddForm';
import { GrainBoundaryListItem } from './GrainBoundaryListItem';

interface GrainBoundaryInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function GrainBoundaryInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: GrainBoundaryInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [boundaries, setBoundaries] = useState<GrainBoundaryData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: GrainBoundaryInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.grainBoundaryInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.grainBoundaryInfo;
    }

    setBoundaries((existingData?.boundaries || []) as GrainBoundaryData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const grainBoundaryInfo: GrainBoundaryInfoType = {
      boundaries: boundaries as GrainBoundaryType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { grainBoundaryInfo });
    } else if (spotId) {
      updateSpotData(spotId, { grainBoundaryInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Grain Boundary Info'
    : spotId
      ? 'Spot Grain Boundary Info'
      : 'Grain Boundary Info';

  return (
    <Dialog
      open={isOpen}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 3 }}>
        <ListManager<GrainBoundaryData>
          items={boundaries}
          notes={notes}
          onItemsChange={setBoundaries}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Grain Boundaries"
          addSectionTitle="Add Grain Boundary"
          emptyMessage="No grain boundaries added yet. Use the form below to add your first grain boundary."
          renderItem={(boundary) => (
            <GrainBoundaryListItem boundary={boundary} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <GrainBoundaryAddForm
              onAdd={onAdd}
              onCancel={onCancel}
              micrographId={micrographId}
              spotId={spotId}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
