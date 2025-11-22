/**
 * Fractures Dialog Component
 *
 * Dialog for managing fracture data (array of fractures + notes).
 * Matches legacy editFractureInfo.fxml layout with list management.
 *
 * CORRECT ARCHITECTURE:
 * - List of existing fractures with Edit/Delete
 * - Add form for new fractures
 * - General notes field
 * - Saves to fractureInfo = { fractures: [], notes: '' }
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import { useAppStore } from '@/store';
import { FractureInfoType, FractureType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { FractureAddForm, FractureData } from './FractureAddForm';
import { FractureListItem } from './FractureListItem';

interface FracturesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function FracturesDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FracturesDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Local state uses non-nullable types for ListManager
  const [fractures, setFractures] = useState<FractureData[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: FractureInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.fractureInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.fractureInfo;
    }

    setFractures((existingData?.fractures || []) as FractureData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = (data: { items: FractureData[]; notes: string }) => {
    const fractureInfo: FractureInfoType = {
      fractures: data.items as FractureType[],
      notes: data.notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { fractureInfo });
    } else if (spotId) {
      updateSpotData(spotId, { fractureInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Fracture Info'
    : spotId
      ? 'Spot Fracture Info'
      : 'Fracture Info';

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
        <ListManager<FractureData>
          items={fractures}
          notes={notes}
          onSave={handleSave}
          onCancel={handleCancel}
          title="Fractures"
          addSectionTitle="Add Fracture"
          emptyMessage="No fractures added yet. Use the form below to add your first fracture."
          renderItem={(fracture) => (
            <FractureListItem fracture={fracture} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <FractureAddForm
              onAdd={onAdd}
              onCancel={onCancel}
            />
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
