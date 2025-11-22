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
import { ListManager } from '../reusable/ListManager';
import { VeinAddForm, VeinData } from './VeinAddForm';
import { VeinListItem } from './VeinListItem';

interface VeinsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

interface VeinInfoData {
  veins: VeinData[];
  notes: string;
}

export function VeinsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: VeinsDialogProps) {
  const project = useAppStore((state) => state.project);

  const [veinInfo, setVeinInfo] = useState<VeinInfoData>({
    veins: [],
    notes: '',
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual veinInfo from micrograph or spot
    // For now, initialize with empty data
    setVeinInfo({
      veins: [],
      notes: '',
    });
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = (data: { items: VeinData[]; notes: string }) => {
    // TODO: Save veinInfo to store
    console.log('Saving vein info:', {
      veins: data.items,
      notes: data.notes,
    });
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
          items={veinInfo.veins}
          notes={veinInfo.notes}
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
