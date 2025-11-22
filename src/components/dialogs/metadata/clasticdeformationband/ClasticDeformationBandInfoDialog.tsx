/**
 * Clastic Deformation Band Info Dialog Component
 *
 * Dialog for managing clastic deformation band data.
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
import { ClasticDeformationBandInfoType, ClasticDeformationBandType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { ClasticDeformationBandAddForm, ClasticDeformationBandData } from './ClasticDeformationBandAddForm';
import { ClasticDeformationBandListItem } from './ClasticDeformationBandListItem';

interface ClasticDeformationBandInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function ClasticDeformationBandInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: ClasticDeformationBandInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [bands, setBands] = useState<ClasticDeformationBandData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: ClasticDeformationBandInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.clasticDeformationBandInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.clasticDeformationBandInfo;
    }

    setBands((existingData?.bands || []) as ClasticDeformationBandData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const clasticDeformationBandInfo: ClasticDeformationBandInfoType = {
      bands: bands as ClasticDeformationBandType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { clasticDeformationBandInfo });
    } else if (spotId) {
      updateSpotData(spotId, { clasticDeformationBandInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Clastic Deformation Bands'
    : spotId
      ? 'Spot Clastic Deformation Bands'
      : 'Clastic Deformation Bands';

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
        <ListManager<ClasticDeformationBandData>
          items={bands}
          notes={notes}
          onItemsChange={setBands}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Clastic Deformation Bands"
          addSectionTitle="Add Deformation Band"
          emptyMessage="No deformation bands added yet. Use the form below to add your first band."
          renderItem={(band) => (
            <ClasticDeformationBandListItem band={band} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <ClasticDeformationBandAddForm
              onAdd={onAdd}
              onCancel={onCancel}
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
