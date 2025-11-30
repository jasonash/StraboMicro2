/**
 * Pseudotachylyte Info Dialog Component
 *
 * Dialog for managing pseudotachylyte data with reasoning field.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import { useAppStore } from '@/store';
import { PseudotachylyteInfoType, PseudotachylyteType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { PseudotachylyteAddForm, PseudotachylyteData } from './PseudotachylyteAddForm';
import { PseudotachylyteListItem } from './PseudotachylyteListItem';

interface PseudotachylyteInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function PseudotachylyteInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: PseudotachylyteInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [pseudotachylytes, setPseudotachylytes] = useState<PseudotachylyteData[]>([]);
  const [reasoning, setReasoning] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    let existingData: PseudotachylyteInfoType | null | undefined = null;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      existingData = micrograph?.pseudotachylyteInfo;
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      existingData = spot?.pseudotachylyteInfo;
    }

    setPseudotachylytes((existingData?.pseudotachylytes || []) as PseudotachylyteData[]);
    setReasoning(existingData?.reasoning || '');
    setNotes(existingData?.notes || '');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    const pseudotachylyteInfo: PseudotachylyteInfoType = {
      pseudotachylytes: pseudotachylytes as PseudotachylyteType[],
      reasoning,
      notes: notes,
    };

    if (micrographId) {
      updateMicrographMetadata(micrographId, { pseudotachylyteInfo });
    } else if (spotId) {
      updateSpotData(spotId, { pseudotachylyteInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Pseudotachylyte Info'
    : spotId
      ? 'Spot Pseudotachylyte Info'
      : 'Pseudotachylyte Info';

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
        <ListManager<PseudotachylyteData>
          items={pseudotachylytes}
          notes={notes}
          onItemsChange={setPseudotachylytes}
          onNotesChange={setNotes}
          hideButtons={true}
          title="Pseudotachylytes"
          addSectionTitle="Add Pseudotachylyte"
          emptyMessage="No pseudotachylytes added yet. Use the form below to add your first pseudotachylyte."
          notesLabel="Notes"
          renderItem={(pseudotachylyte) => (
            <PseudotachylyteListItem pseudotachylyte={pseudotachylyte} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <PseudotachylyteAddForm
              onAdd={onAdd}
              onCancel={onCancel}
              initialData={initialData}
            />
          )}
          renderBeforeNotes={() => (
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Reasoning for Pseudotachylyte Identification"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Describe the reasoning for identifying this as pseudotachylyte..."
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
