/**
 * Associated Files Info Dialog Component
 *
 * Dialog for managing associated files metadata
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
import { AssociatedFileType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { AssociatedFileAddForm, AssociatedFileData } from './AssociatedFileAddForm';
import { AssociatedFileListItem } from './AssociatedFileListItem';

interface AssociatedFilesInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function AssociatedFilesInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: AssociatedFilesInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [files, setFiles] = useState<AssociatedFileData[]>([]);

  useEffect(() => {
    if (!isOpen || !project) return;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      setFiles((micrograph?.associatedFiles || []) as AssociatedFileData[]);
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      setFiles((spot?.associatedFiles || []) as AssociatedFileData[]);
    }
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    if (micrographId) {
      updateMicrographMetadata(micrographId, { associatedFiles: files as AssociatedFileType[] });
    } else if (spotId) {
      updateSpotData(spotId, { associatedFiles: files as AssociatedFileType[] });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Associated Files'
    : spotId
      ? 'Spot Associated Files'
      : 'Associated Files';

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
        <ListManager<AssociatedFileData>
          items={files}
          notes=""
          onItemsChange={setFiles}
          hideButtons={true}
          hideAddForm={true}
          title="Associated Files"
          addSectionTitle="Add/Edit File Metadata"
          emptyMessage="No associated files added yet. File upload functionality will be available in a future update."
          renderItem={(file) => (
            <AssociatedFileListItem file={file} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <AssociatedFileAddForm
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
