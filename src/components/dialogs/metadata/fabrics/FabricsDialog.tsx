/**
 * Fabrics Dialog Component
 *
 * Dialog for managing fabric data (array of fabrics + notes).
 * Matches legacy editFabric.java layout with list management.
 *
 * CORRECT ARCHITECTURE:
 * - List of existing fabrics with Edit/Delete
 * - Add form for new fabrics
 * - General notes field
 * - Saves to fabricInfo = { fabrics: [], notes: '' }
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
import { FabricInfoType, FabricType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { FabricAddForm, FabricData } from './FabricAddForm';
import { FabricListItem } from './FabricListItem';

interface FabricsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
  // Preset mode props
  presetMode?: boolean;
  initialData?: FabricInfoType | null;
  onSavePresetData?: (data: FabricInfoType | null) => void;
}

export function FabricsDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
  presetMode,
  initialData,
  onSavePresetData,
}: FabricsDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Local state uses non-nullable types for ListManager
  const [fabrics, setFabrics] = useState<FabricData[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // Preset mode: load from props instead of store
    if (presetMode) {
      setFabrics((initialData?.fabrics || []) as FabricData[]);
      setNotes(initialData?.notes || '');
      return;
    }

    // Normal mode: load from store
    if (!project) return;

    let existingData: FabricInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.fabricInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.fabricInfo;
    }

    setFabrics((existingData?.fabrics || []) as FabricData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project, presetMode, initialData]);

  const handleSave = () => {
    const hasData = fabrics.length > 0 || notes;
    const fabricInfo: FabricInfoType = {
      fabrics: fabrics as FabricType[],
      notes: notes,
    };

    // Preset mode: return data via callback
    if (presetMode && onSavePresetData) {
      onSavePresetData(hasData ? fabricInfo : null);
      onClose();
      return;
    }

    // Normal mode: save to store
    if (micrographId) {
      updateMicrographMetadata(micrographId, { fabricInfo });
    } else if (spotId) {
      updateSpotData(spotId, { fabricInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = presetMode
    ? 'Preset Fabric Info'
    : micrographId
      ? 'Micrograph Fabric Info'
      : spotId
        ? 'Spot Fabric Info'
        : 'Fabric Info';

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
        <ListManager<FabricData>
          items={fabrics}
          notes={notes}
          onItemsChange={setFabrics}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Fabrics"
          addSectionTitle="Add Fabric"
          emptyMessage="No fabrics added yet. Use the form below to add your first fabric."
          renderItem={(fabric) => (
            <FabricListItem fabric={fabric} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <FabricAddForm
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
