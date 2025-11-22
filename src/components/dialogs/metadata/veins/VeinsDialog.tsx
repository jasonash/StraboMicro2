/**
 * Veins Dialog Component
 *
 * Dialog for managing vein data (array of veins + notes).
 * Matches legacy editVeinInfo.fxml layout with list management.
 *
 * CORRECT ARCHITECTURE:
 * - List of existing veins with Edit/Delete
 * - Add form for new veins
 * - General notes field
 * - Saves to veinInfo = { veins: [], notes: '' }
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import { useAppStore } from '@/store';
import { VeinInfoType, VeinType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { VeinAddForm, VeinData } from './VeinAddForm';
import { VeinListItem } from './VeinListItem';

interface VeinsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function VeinsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: VeinsDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Local state uses non-nullable types for ListManager
  const [veins, setVeins] = useState<VeinData[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: VeinInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.veinInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.veinInfo;
    }

    setVeins((existingData?.veins || []) as VeinData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = (data: { items: VeinData[]; notes: string }) => {
    const veinInfo: VeinInfoType = {
      veins: data.items as VeinType[],
      notes: data.notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { veinInfo });
    } else if (spotId) {
      updateSpotData(spotId, { veinInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Vein'
    : spotId
      ? 'Spot Vein'
      : 'Edit Vein';

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
        <ListManager<VeinData>
          items={veins}
          notes={notes}
          onSave={handleSave}
          onCancel={handleCancel}
          title="Veins"
          addSectionTitle="Add Vein"
          emptyMessage="No veins added yet. Use the form below to add your first vein."
          renderItem={(vein) => (
            <VeinListItem vein={vein} />
          )}
          renderAddForm={({ onAdd, onCancel }) => (
            <VeinAddForm
              onAdd={onAdd}
              onCancel={onCancel}
            />
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
