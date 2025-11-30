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
  DialogActions,
  Button,
} from '@mui/material';
import { useAppStore } from '@/store';
import { FoldInfoType, FoldType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { FoldAddForm, FoldData } from './FoldAddForm';
import { FoldListItem } from './FoldListItem';

interface FoldsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function FoldsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: FoldsDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Local state uses non-nullable types for ListManager
  const [folds, setFolds] = useState<FoldData[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: FoldInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.foldInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.foldInfo;
    }

    setFolds((existingData?.folds || []) as FoldData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const foldInfo: FoldInfoType = {
      folds: folds as FoldType[],
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { foldInfo });
    } else if (spotId) {
      updateSpotData(spotId, { foldInfo });
    }

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
          items={folds}
          notes={notes}
          onItemsChange={setFolds}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Folds"
          addSectionTitle="Add Fold"
          emptyMessage="No folds added yet. Use the form below to add your first fold."
          renderItem={(fold) => (
            <FoldListItem fold={fold} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <FoldAddForm
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
