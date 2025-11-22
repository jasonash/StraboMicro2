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
import { ListManager } from '../reusable/ListManager';
import { FractureAddForm, FractureData } from './FractureAddForm';
import { FractureListItem } from './FractureListItem';

interface FracturesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface FractureInfoData {
  fractures: FractureData[];
  notes: string;
}

export function FracturesDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FracturesDialogProps) {
  const project = useAppStore((state) => state.project);

  const [fractureInfo, setFractureInfo] = useState<FractureInfoData>({
    fractures: [],
    notes: '',
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual fractureInfo from micrograph or spot
    // For now, initialize with empty data
    setFractureInfo({
      fractures: [],
      notes: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = (data: { items: FractureData[]; notes: string }) => {
    // TODO: Save fractureInfo to store
    console.log('Saving fracture info:', {
      fractures: data.items,
      notes: data.notes,
    });
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
          items={fractureInfo.fractures}
          notes={fractureInfo.notes}
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
