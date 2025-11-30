/**
 * Add Micrograph to Groups Dialog
 *
 * Modal dialog for adding a single micrograph to one or more groups.
 * This is the inverse of AddMicrographsToGroupDialog - here we select groups for a micrograph.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Typography,
  Divider,
} from '@mui/material';
import { useAppStore } from '@/store';

interface AddMicrographToGroupsDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string;
  micrographName: string;
}

export function AddMicrographToGroupsDialog({
  open,
  onClose,
  micrographId,
  micrographName,
}: AddMicrographToGroupsDialogProps) {
  const project = useAppStore((state) => state.project);
  const addMicrographToGroup = useAppStore((state) => state.addMicrographToGroup);
  const removeMicrographFromGroup = useAppStore((state) => state.removeMicrographFromGroup);

  // Track which groups are selected (will include groups the micrograph is already in)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Get all groups
  const groups = useMemo(() => project?.groups || [], [project]);

  // Get groups that already contain this micrograph
  const initialGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (group.micrographs?.includes(micrographId)) {
        ids.add(group.id);
      }
    }
    return ids;
  }, [groups, micrographId]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedGroupIds(new Set(initialGroupIds));
    }
  }, [open, initialGroupIds]);

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedGroupIds.size === groups.length) {
      // Deselect all
      setSelectedGroupIds(new Set());
    } else {
      // Select all
      setSelectedGroupIds(new Set(groups.map(g => g.id)));
    }
  };

  const handleSubmit = () => {
    // Calculate what changed
    const toAdd = new Set<string>();
    const toRemove = new Set<string>();

    // Find groups to add to
    selectedGroupIds.forEach(groupId => {
      if (!initialGroupIds.has(groupId)) {
        toAdd.add(groupId);
      }
    });

    // Find groups to remove from
    initialGroupIds.forEach(groupId => {
      if (!selectedGroupIds.has(groupId)) {
        toRemove.add(groupId);
      }
    });

    // Apply changes
    toAdd.forEach(groupId => {
      addMicrographToGroup(groupId, micrographId);
    });

    toRemove.forEach(groupId => {
      removeMicrographFromGroup(groupId, micrographId);
    });

    onClose();
  };

  // Check if anything changed
  const hasChanges = useMemo(() => {
    if (selectedGroupIds.size !== initialGroupIds.size) return true;
    for (const id of selectedGroupIds) {
      if (!initialGroupIds.has(id)) return true;
    }
    return false;
  }, [selectedGroupIds, initialGroupIds]);

  if (!project) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add "{micrographName}" to Group(s)</DialogTitle>

      <DialogContent>
        {groups.length === 0 ? (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No groups available. Create a group first from the Groups tab.
            </Typography>
          </Box>
        ) : (
          <Box>
            {/* Select All checkbox */}
            <ListItem disablePadding>
              <ListItemButton onClick={handleSelectAll} dense>
                <ListItemIcon>
                  <Checkbox
                    edge="start"
                    checked={selectedGroupIds.size === groups.length && groups.length > 0}
                    indeterminate={
                      selectedGroupIds.size > 0 &&
                      selectedGroupIds.size < groups.length
                    }
                    tabIndex={-1}
                    disableRipple
                  />
                </ListItemIcon>
                <ListItemText
                  primary="Select All"
                  secondary={`${selectedGroupIds.size} of ${groups.length} selected`}
                />
              </ListItemButton>
            </ListItem>
            <Divider />

            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {groups.map((group) => {
                const isSelected = selectedGroupIds.has(group.id);
                const wasInitiallySelected = initialGroupIds.has(group.id);

                return (
                  <ListItem key={group.id} disablePadding>
                    <ListItemButton
                      onClick={() => handleGroupToggle(group.id)}
                      dense
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={isSelected}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={group.name}
                        secondary={
                          wasInitiallySelected
                            ? isSelected
                              ? 'Already in group'
                              : 'Will be removed'
                            : isSelected
                              ? 'Will be added'
                              : `${(group.micrographs || []).length} micrograph(s)`
                        }
                        secondaryTypographyProps={{
                          color: !wasInitiallySelected && isSelected
                            ? 'success.main'
                            : wasInitiallySelected && !isSelected
                              ? 'error.main'
                              : 'text.secondary',
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!hasChanges}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
