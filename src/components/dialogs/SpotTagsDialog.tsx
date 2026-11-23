/**
 * Tags of one spot, from the right pane: the Tags section's pencil and
 * "Tags" in Add Data (Claire's issue #61, 2026-11-17). Chooses among the
 * project's tags; new tags are still made in the Tags tab.
 */

import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { findSpotById } from '@/store/helpers';
import { TagPicker } from '../TagPicker';
import { tagChanges, tagsOfSpot } from '@/utils/tagsAndGroups';

interface SpotTagsDialogProps {
  open: boolean;
  onClose: () => void;
  spotId: string;
}

export function SpotTagsDialog({ open, onClose, spotId }: SpotTagsDialogProps) {
  const project = useAppStore((state) => state.project);
  const addTagToSpot = useAppStore((state) => state.addTagToSpot);
  const removeTagFromSpot = useAppStore((state) => state.removeTagFromSpot);

  const spot = findSpotById(project, spotId);
  const tags = project?.tags ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  // Start from the spot's tags each time the dialog opens
  useEffect(() => {
    if (open) setSelected(tagsOfSpot(project, spot).map((tag) => tag.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spotId]);

  const handleSave = () => {
    const current = tagsOfSpot(project, spot).map((tag) => tag.id);
    const { add, remove } = tagChanges(current, selected);
    for (const id of add) addTagToSpot(id, spotId);
    for (const id of remove) removeTagFromSpot(id, spotId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Tags of "{spot?.name ?? 'spot'}"</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TagPicker tags={tags} selectedTagIds={selected} onChange={setSelected} />
        {tags.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
            To make a new tag, choose + New Tag... at the bottom of the list.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!spot}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
