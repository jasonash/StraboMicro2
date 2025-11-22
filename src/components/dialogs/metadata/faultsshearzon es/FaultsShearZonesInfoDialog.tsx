/**
 * Faults/Shear Zones Info Dialog Component
 *
 * Dialog for managing fault and shear zone data.
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
import { FaultsShearZonesInfoType, FaultsShearZonesType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { FaultsShearZonesAddForm, FaultsShearZonesData } from './FaultsShearZonesAddForm';
import { FaultsShearZonesListItem } from './FaultsShearZonesListItem';

interface FaultsShearZonesInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function FaultsShearZonesInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FaultsShearZonesInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [faultsShearZones, setFaultsShearZones] = useState<FaultsShearZonesData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: FaultsShearZonesInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.faultsShearZonesInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.faultsShearZonesInfo;
    }

    setFaultsShearZones((existingData?.faultsShearZones || []) as FaultsShearZonesData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const faultsShearZonesInfo: FaultsShearZonesInfoType = {
      faultsShearZones: faultsShearZones as FaultsShearZonesType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { faultsShearZonesInfo });
    } else if (spotId) {
      updateSpotData(spotId, { faultsShearZonesInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Faults and Shear Zones'
    : spotId
      ? 'Spot Faults and Shear Zones'
      : 'Faults and Shear Zones';

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
        <ListManager<FaultsShearZonesData>
          items={faultsShearZones}
          notes={notes}
          onItemsChange={setFaultsShearZones}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Faults and Shear Zones"
          addSectionTitle="Add Fault/Shear Zone"
          emptyMessage="No faults or shear zones added yet. Use the form below to add your first entry."
          renderItem={(fault) => (
            <FaultsShearZonesListItem fault={fault} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <FaultsShearZonesAddForm
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
