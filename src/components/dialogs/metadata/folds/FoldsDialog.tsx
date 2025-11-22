/**
 * Folds Dialog Component
 *
 * Dialog for managing fold data (array of folds + notes).
 * Matches legacy editFoldInfo.fxml layout with list management.
 *
 * CORRECT ARCHITECTURE:
 * - List of existing folds with Edit/Delete
 * - Add form for new folds
 * - General notes field
 * - Saves to foldInfo = { folds: [], notes: '' }
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import { useAppStore } from '@/store';
import { ListManager } from '../reusable/ListManager';
import { FoldAddForm, FoldData } from './FoldAddForm';
import { FoldListItem } from './FoldListItem';

interface FoldsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface FoldInfoData {
  folds: FoldData[];
  notes: string;
}

export function FoldsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FoldsDialogProps) {
  const project = useAppStore((state) => state.project);

  const [foldInfo, setFoldInfo] = useState<FoldInfoData>({
    folds: [],
    notes: '',
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual foldInfo from micrograph or spot
    // For now, initialize with empty data
    setFoldInfo({
      folds: [],
      notes: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = (data: { items: FoldData[]; notes: string }) => {
    // TODO: Save foldInfo to store
    console.log('Saving fold info:', {
      folds: data.items,
      notes: data.notes,
    });
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Fold Data'
    : spotId
      ? 'Spot Fold Data'
      : 'Fold Data';

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
        <ListManager<FoldData>
          items={foldInfo.folds}
          notes={foldInfo.notes}
          onSave={handleSave}
          onCancel={handleCancel}
          title="Folds"
          addSectionTitle="Add Fold"
          emptyMessage="No folds added yet. Use the form below to add your first fold."
          renderItem={(fold) => (
            <FoldListItem fold={fold} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <FoldAddForm
              onAdd={onAdd}
              onCancel={onCancel}
            />
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
