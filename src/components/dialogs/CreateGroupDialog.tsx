/**
 * Create Group Dialog
 *
 * Modal dialog for creating a new group or editing an existing group's name.
 * Matches the legacy JavaFX groupCreateNewGroup.java functionality.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { GroupMetadata } from '@/types/project-types';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  editMode?: boolean;
  editGroupId?: string | null;
  initialName?: string;
  onNameSaved?: (newName: string) => void;
}

export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
  editMode = false,
  editGroupId = null,
  initialName = '',
  onNameSaved,
}: CreateGroupDialogProps) {
  const createGroup = useAppStore((state) => state.createGroup);

  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setGroupName(initialName);
      setError('');
    }
  }, [open, initialName]);

  const handleSubmit = () => {
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      setError('Group name is required');
      return;
    }

    if (editMode && editGroupId && onNameSaved) {
      // Edit mode - just save the new name
      onNameSaved(trimmedName);
    } else {
      // Create mode - create new group
      const newGroup: GroupMetadata = {
        id: uuidv4(),
        name: trimmedName,
        micrographs: [],
        isExpanded: true,
      };

      createGroup(newGroup);
      onCreated();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && groupName.trim()) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editMode ? 'Edit Group Name' : 'Create New Group'}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="Group Name"
            value={groupName}
            onChange={(e) => {
              setGroupName(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            error={!!error}
            helperText={error}
            placeholder="Enter group name"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!groupName.trim()}
        >
          {editMode ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
