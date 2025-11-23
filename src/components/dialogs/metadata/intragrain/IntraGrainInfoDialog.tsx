/**
 * Intra-Grain Info Dialog Component
 *
 * Dialog for managing intragranular structures.
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
import { IntraGrainInfoType, IntraGrainType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { IntraGrainAddForm, IntraGrainData } from './IntraGrainAddForm';
import { IntraGrainListItem } from './IntraGrainListItem';

interface IntraGrainInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function IntraGrainInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: IntraGrainInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [grains, setGrains] = useState<IntraGrainData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: IntraGrainInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.intraGrainInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.intraGrainInfo;
    }

    setGrains((existingData?.grains || []) as IntraGrainData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const intraGrainInfo: IntraGrainInfoType = {
      grains: grains as IntraGrainType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { intraGrainInfo });
    } else if (spotId) {
      updateSpotData(spotId, { intraGrainInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Intragranular Structures'
    : spotId
      ? 'Spot Intragranular Structures'
      : 'Intragranular Structures';

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
        <ListManager<IntraGrainData>
          items={grains}
          notes={notes}
          onItemsChange={setGrains}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Intragranular Structures"
          addSectionTitle="Add Intragranular Structure"
          emptyMessage="No intragranular structures added yet. Use the form below to add your first structure."
          renderItem={(grain) => (
            <IntraGrainListItem grain={grain} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <IntraGrainAddForm
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
