/**
 * Add Micrographs to Group Dialog
 *
 * Modal dialog for selecting micrographs to add to a group.
 * Supports two modes:
 * 1. If preselectedGroupId is provided - adds to that specific group
 * 2. If preselectedGroupId is null - first select a group, then select micrographs
 *
 * Matches the legacy JavaFX groupSelectGroup.java and groupSelectMicrograph.java functionality.
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
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { useAppStore } from '@/store';

interface AddMicrographsToGroupDialogProps {
  open: boolean;
  onClose: () => void;
  preselectedGroupId?: string | null;
}

export function AddMicrographsToGroupDialog({
  open,
  onClose,
  preselectedGroupId = null,
}: AddMicrographsToGroupDialogProps) {
  const project = useAppStore((state) => state.project);
  const addMicrographToGroup = useAppStore((state) => state.addMicrographToGroup);
  const micrographIndex = useAppStore((state) => state.micrographIndex);

  // State
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMicrographIds, setSelectedMicrographIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0); // 0 = select group (if needed), 1 = select micrographs

  // Get all groups
  const groups = project?.groups || [];

  // Get all micrographs from the index
  const allMicrographs = useMemo(() => {
    const micrographs = Array.from(micrographIndex.values());
    console.log('[AddMicrographsToGroupDialog] micrographIndex size:', micrographIndex.size);
    console.log('[AddMicrographsToGroupDialog] allMicrographs:', micrographs.map(m => m.name));
    return micrographs;
  }, [micrographIndex]);

  // Filter out micrographs already in the selected group
  const availableMicrographs = useMemo(() => {
    if (!selectedGroupId) return allMicrographs;

    const group = groups.find(g => g.id === selectedGroupId);
    const existingIds = new Set(group?.micrographs || []);
    console.log('[AddMicrographsToGroupDialog] group:', group?.name);
    console.log('[AddMicrographsToGroupDialog] existingIds:', Array.from(existingIds));

    const available = allMicrographs.filter(m => !existingIds.has(m.id));
    console.log('[AddMicrographsToGroupDialog] available:', available.map(m => m.name));
    return available;
  }, [allMicrographs, selectedGroupId, groups]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (preselectedGroupId) {
        setSelectedGroupId(preselectedGroupId);
        setStep(1); // Skip group selection
      } else {
        setSelectedGroupId(null);
        setStep(0); // Start with group selection
      }
      setSelectedMicrographIds(new Set());
    }
  }, [open, preselectedGroupId]);

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    setStep(1);
  };

  const handleMicrographToggle = (micrographId: string) => {
    setSelectedMicrographIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(micrographId)) {
        newSet.delete(micrographId);
      } else {
        newSet.add(micrographId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedMicrographIds.size === availableMicrographs.length) {
      // Deselect all
      setSelectedMicrographIds(new Set());
    } else {
      // Select all
      setSelectedMicrographIds(new Set(availableMicrographs.map(m => m.id)));
    }
  };

  const handleBack = () => {
    if (step === 1 && !preselectedGroupId) {
      setStep(0);
      setSelectedGroupId(null);
      setSelectedMicrographIds(new Set());
    }
  };

  const handleSubmit = () => {
    if (!selectedGroupId) return;

    // Add all selected micrographs to the group
    selectedMicrographIds.forEach(micrographId => {
      addMicrographToGroup(selectedGroupId, micrographId);
    });

    onClose();
  };

  const getGroupName = (groupId: string): string => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || 'Unknown Group';
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {step === 0 ? 'Select Group' : `Add Micrographs to "${getGroupName(selectedGroupId!)}"`}
      </DialogTitle>

      <DialogContent>
        {/* Stepper (only show if not preselected) */}
        {!preselectedGroupId && (
          <Stepper activeStep={step} sx={{ mb: 2 }}>
            <Step>
              <StepLabel>Select Group</StepLabel>
            </Step>
            <Step>
              <StepLabel>Select Micrographs</StepLabel>
            </Step>
          </Stepper>
        )}

        {/* Step 0: Group Selection */}
        {step === 0 && (
          <Box>
            {groups.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No groups available. Create a group first.
              </Typography>
            ) : (
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {groups.map((group) => (
                  <ListItem key={group.id} disablePadding>
                    <ListItemButton
                      onClick={() => handleGroupSelect(group.id)}
                      onDoubleClick={() => {
                        handleGroupSelect(group.id);
                        // Double-click also advances (like legacy app)
                      }}
                    >
                      <ListItemText
                        primary={group.name}
                        secondary={`${(group.micrographs || []).length} micrograph(s)`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {/* Step 1: Micrograph Selection */}
        {step === 1 && (
          <Box>
            {/* Select All checkbox */}
            {availableMicrographs.length > 0 && (
              <>
                <ListItem disablePadding>
                  <ListItemButton onClick={handleSelectAll} dense>
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedMicrographIds.size === availableMicrographs.length}
                        indeterminate={
                          selectedMicrographIds.size > 0 &&
                          selectedMicrographIds.size < availableMicrographs.length
                        }
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary="Select All"
                      secondary={`${selectedMicrographIds.size} of ${availableMicrographs.length} selected`}
                    />
                  </ListItemButton>
                </ListItem>
                <Divider />
              </>
            )}

            {availableMicrographs.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                All micrographs are already in this group.
              </Typography>
            ) : (
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {availableMicrographs.map((micrograph) => (
                  <ListItem key={micrograph.id} disablePadding>
                    <ListItemButton
                      onClick={() => handleMicrographToggle(micrograph.id)}
                      dense
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={selectedMicrographIds.has(micrograph.id)}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={micrograph.name || 'Unnamed Micrograph'}
                        secondary={micrograph.parentID ? '(Associated)' : '(Reference)'}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === 1 && !preselectedGroupId && (
          <Button onClick={handleBack}>
            Back
          </Button>
        )}
        <Button onClick={onClose}>
          Cancel
        </Button>
        {step === 1 && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={selectedMicrographIds.size === 0}
          >
            Add {selectedMicrographIds.size > 0 ? `(${selectedMicrographIds.size})` : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
