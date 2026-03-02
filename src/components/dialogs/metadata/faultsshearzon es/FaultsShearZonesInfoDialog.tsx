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
  // Preset mode props
  presetMode?: boolean;
  initialData?: FaultsShearZonesInfoType | null;
  onSavePresetData?: (data: FaultsShearZonesInfoType | null) => void;
}

export function FaultsShearZonesInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
  presetMode,
  initialData,
  onSavePresetData,
}: FaultsShearZonesInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [faultsShearZones, setFaultsShearZones] = useState<FaultsShearZonesData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    // Preset mode: load from props instead of store
    if (presetMode) {
      setFaultsShearZones((initialData?.faultsShearZones || []) as FaultsShearZonesData[]);
      setNotes(initialData?.notes || '');
      return;
    }

    // Normal mode: load from store
    if (!project) return;

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
  }, [isOpen, micrographId, spotId, project, presetMode, initialData]);

  const handleSave = () => {
    const hasData = faultsShearZones.length > 0 || notes;
    const faultsShearZonesInfo: FaultsShearZonesInfoType = {
      faultsShearZones: faultsShearZones as FaultsShearZonesType[],
      notes: notes,
    };

    // Preset mode: return data via callback
    if (presetMode && onSavePresetData) {
      onSavePresetData(hasData ? faultsShearZonesInfo : null);
      onClose();
      return;
    }

    // Normal mode: save to store
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

  const title = presetMode
    ? 'Preset Faults and Shear Zones'
    : micrographId
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
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <FaultsShearZonesAddForm
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
