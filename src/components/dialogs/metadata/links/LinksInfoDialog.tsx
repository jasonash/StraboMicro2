/**
 * Links Info Dialog Component
 *
 * Dialog for managing external links
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
import { LinkType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { LinkAddForm, LinkData } from './LinkAddForm';
import { LinkListItem } from './LinkListItem';

interface LinksInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function LinksInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: LinksInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [links, setLinks] = useState<LinkData[]>([]);

  useEffect(() => {
    if (!isOpen || !project) return;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      setLinks((micrograph?.links || []) as LinkData[]);
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      setLinks((spot?.links || []) as LinkData[]);
    }
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    if (micrographId) {
      updateMicrographMetadata(micrographId, { links: links as LinkType[] });
    } else if (spotId) {
      updateSpotData(spotId, { links: links as LinkType[] });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const title = micrographId
    ? 'Micrograph Links'
    : spotId
      ? 'Spot Links'
      : 'Links';

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
        <ListManager<LinkData>
          items={links}
          notes=""
          onItemsChange={setLinks}
          hideButtons={true}
          title="Links"
          addSectionTitle="Add Link"
          emptyMessage="No links added yet. Use the form below to add your first link."
          renderItem={(link) => (
            <LinkListItem link={link} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <LinkAddForm
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
