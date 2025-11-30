/**
 * Extinction Microstructure Info Dialog Component
 *
 * Dialog for managing extinction microstructure data.
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
import { ExtinctionMicrostructureInfoType, ExtinctionMicrostructureType } from '@/types/project-types';
import { findMicrographById, findSpotById, getAvailablePhasesFromMicrograph, getAvailablePhasesFromSpot } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { ExtinctionMicrostructureAddForm, ExtinctionMicrostructureData } from './ExtinctionMicrostructureAddForm';
import { ExtinctionMicrostructureListItem } from './ExtinctionMicrostructureListItem';

interface ExtinctionMicrostructureInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function ExtinctionMicrostructureInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: ExtinctionMicrostructureInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [extinctionMicrostructures, setExtinctionMicrostructures] = useState<ExtinctionMicrostructureData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: ExtinctionMicrostructureInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.extinctionMicrostructureInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.extinctionMicrostructureInfo;
    }

    setExtinctionMicrostructures((existingData?.extinctionMicrostructures || []) as ExtinctionMicrostructureData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const extinctionMicrostructureInfo: ExtinctionMicrostructureInfoType = {
      extinctionMicrostructures: extinctionMicrostructures as ExtinctionMicrostructureType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { extinctionMicrostructureInfo });
    } else if (spotId) {
      updateSpotData(spotId, { extinctionMicrostructureInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Get available phases from mineralogy data (LEGACY: lines 162-183 in editExtinctionMicrostructure.java)
  const availablePhases: string[] = micrographId
    ? getAvailablePhasesFromMicrograph(findMicrographById(project, micrographId))
    : spotId
      ? getAvailablePhasesFromSpot(findSpotById(project, spotId))
      : [];

  const title = micrographId
    ? 'Micrograph Extinction Microstructures'
    : spotId
      ? 'Spot Extinction Microstructures'
      : 'Extinction Microstructures';

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
        <ListManager<ExtinctionMicrostructureData>
          items={extinctionMicrostructures}
          notes={notes}
          onItemsChange={setExtinctionMicrostructures}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Extinction Microstructures"
          addSectionTitle="Add Extinction Microstructure"
          emptyMessage="No extinction microstructures added yet. Use the form below to add your first microstructure."
          renderItem={(extinction) => (
            <ExtinctionMicrostructureListItem extinction={extinction} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <ExtinctionMicrostructureAddForm
              availablePhases={availablePhases}
              onAdd={onAdd}
              onCancel={onCancel}
              initialData={initialData}
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
