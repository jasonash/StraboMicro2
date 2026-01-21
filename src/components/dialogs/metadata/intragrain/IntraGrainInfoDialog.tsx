/**
 * Intra-Grain Info Dialog Component
 *
 * Dialog for managing intragranular structures.
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
import { IntraGrainInfoType, IntraGrainType } from '@/types/project-types';
import { findMicrographById, findSpotById, getAvailablePhasesFromMicrograph, getAvailablePhasesFromSpot } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { IntraGrainAddForm, IntraGrainData } from './IntraGrainAddForm';
import { IntraGrainListItem } from './IntraGrainListItem';

interface IntraGrainInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
  // Preset mode props
  presetMode?: boolean;
  initialData?: IntraGrainInfoType | null;
  onSavePresetData?: (data: IntraGrainInfoType | null) => void;
}

export function IntraGrainInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
  presetMode,
  initialData,
  onSavePresetData,
}: IntraGrainInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [grains, setGrains] = useState<IntraGrainData[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    // Preset mode: load from props instead of store
    if (presetMode) {
      setGrains((initialData?.grains || []) as IntraGrainData[]);
      setNotes(initialData?.notes || '');
      return;
    }

    // Normal mode: load from store
    if (!project) return;

    let existingData: IntraGrainInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.intraGrainInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.intraGrainInfo;
    }

    setGrains((existingData?.grains || []) as IntraGrainData[]);
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project, presetMode, initialData]);

  const handleSave = () => {
    const hasData = grains.length > 0 || notes;
    const intraGrainInfo: IntraGrainInfoType = {
      grains: grains as IntraGrainType[],
      notes: notes,
    };

    // Preset mode: return data via callback
    if (presetMode && onSavePresetData) {
      onSavePresetData(hasData ? intraGrainInfo : null);
      onClose();
      return;
    }

    // Normal mode: save to store
    if (micrographId) {
      updateMicrographMetadata(micrographId, { intraGrainInfo });
    } else if (spotId) {
      updateSpotData(spotId, { intraGrainInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Get available phases from mineralogy data (LEGACY: lines 444-462 in editIntraGrain.java)
  const availablePhases: string[] = micrographId
    ? getAvailablePhasesFromMicrograph(findMicrographById(project, micrographId))
    : spotId
      ? getAvailablePhasesFromSpot(findSpotById(project, spotId))
      : [];

  const title = presetMode
    ? 'Preset Intragranular Structures'
    : micrographId
      ? 'Micrograph Intragranular Structures'
      : spotId
        ? 'Spot Intragranular Structures'
        : 'Intragranular Structures';

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
        <ListManager<IntraGrainData>
          items={grains}
          notes={notes}
          onItemsChange={setGrains}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Intragranular Structures"
          addSectionTitle="Add Intragranular Structure"
          emptyMessage="No intragranular structures added yet. Use the form below to add your first structure."
          renderItem={(grain) => (
            <IntraGrainListItem grain={grain} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <IntraGrainAddForm
              availablePhases={availablePhases}
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
