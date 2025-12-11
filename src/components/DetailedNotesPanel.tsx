/**
 * Detailed Notes Panel Component
 *
 * Displays all notes from various metadata sections for a micrograph or spot.
 * Supports inline editing - user clicks "edit" to make a section editable,
 * can type while panning/zooming, and must explicitly save or cancel.
 *
 * Always-visible sections: Project Notes, Sample Notes, Micrograph/Spot Notes
 * Conditional sections: All other metadata notes (only shown if they have content)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Divider,
  Link,
  Stack,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById, getMicrographParentSample } from '@/store/helpers';

interface DetailedNotesPanelProps {
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
  onViewAllNotes: () => void;
}

// Section IDs for the always-visible sections that support inline editing
type InlineEditableSectionId = 'project-notes' | 'sample-notes' | 'micrograph-notes' | 'spot-notes';

// All section IDs (inline editable + modal-only)
type SectionId = InlineEditableSectionId |
  'polish-description' | 'instrument-notes' | 'post-processing-notes' |
  'mineralogy-notes' | 'lithology-notes' | 'grain-size-notes' | 'grain-shape-notes' |
  'grain-orientation-notes' | 'fabric-notes' | 'clastic-notes' | 'grain-boundary-notes' |
  'intragrain-notes' | 'vein-notes' | 'pseudotachylyte-notes' | 'fold-notes' |
  'faults-shear-zones-notes' | 'extinction-microstructures-notes' | 'fracture-notes';

interface EditingState {
  sectionId: InlineEditableSectionId;
  originalValue: string;
  currentValue: string;
}

export function DetailedNotesPanel({ micrographId, spotId, onEditSection, onViewAllNotes }: DetailedNotesPanelProps) {
  const project = useAppStore((state) => state.project);
  const updateSample = useAppStore((state) => state.updateSample);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);
  const setNavigationGuard = useAppStore((state) => state.setNavigationGuard);

  // Editing state
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Ref to store resolve function for navigation guard promise
  const guardResolveRef = useRef<((proceed: boolean) => void) | null>(null);

  // Get the micrograph or spot data
  const micrograph = micrographId ? findMicrographById(project, micrographId) : undefined;
  const spot = spotId ? findSpotById(project, spotId) : undefined;
  // Use spot data when viewing a spot, otherwise use micrograph data
  const data = spot || micrograph;

  // Get parent sample
  const sample = micrographId && project
    ? getMicrographParentSample(project, micrographId)
    : undefined;

  // Check if there are unsaved changes
  const hasUnsavedChanges = editing !== null && editing.currentValue !== editing.originalValue;

  // Keep a ref to the current editing state for the navigation guard
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // Register/unregister navigation guard when editing state changes
  useEffect(() => {
    if (editing) {
      // Set up navigation guard that will be called before navigation
      const guard = async (): Promise<boolean> => {
        // Check current state via ref (not stale closure)
        if (!hasUnsavedChangesRef.current) {
          return true; // No unsaved changes, allow navigation
        }

        // Show dialog and wait for user response
        return new Promise<boolean>((resolve) => {
          guardResolveRef.current = resolve;
          setShowUnsavedDialog(true);
        });
      };

      setNavigationGuard(guard);
    } else {
      // Clear navigation guard when not editing
      setNavigationGuard(null);
    }

    return () => {
      // Cleanup on unmount
      setNavigationGuard(null);
    };
  }, [editing, setNavigationGuard]);

  // Handle beforeunload event for browser/app close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes to your notes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle unsaved changes warning for internal actions (not navigation)
  const checkUnsavedAndProceed = useCallback((action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  }, [hasUnsavedChanges]);

  // Start editing a section
  const startEditing = (sectionId: InlineEditableSectionId, currentValue: string) => {
    checkUnsavedAndProceed(() => {
      setEditing({
        sectionId,
        originalValue: currentValue,
        currentValue: currentValue,
      });
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditing(null);
  };

  // Save the current edit
  const saveEditing = useCallback(() => {
    const currentEditing = editingRef.current;
    if (!currentEditing || !project) return;

    const { sectionId, currentValue } = currentEditing;

    switch (sectionId) {
      case 'project-notes':
        // Update project notes directly through the store
        if (project) {
          const updatedProject = { ...project, notes: currentValue || undefined };
          useAppStore.setState({ project: updatedProject, isDirty: true });
        }
        break;

      case 'sample-notes':
        if (sample) {
          updateSample(sample.id, { sampleNotes: currentValue || undefined });
        }
        break;

      case 'micrograph-notes':
        if (micrographId) {
          updateMicrographMetadata(micrographId, { notes: currentValue || undefined });
        }
        break;

      case 'spot-notes':
        if (spotId) {
          updateSpotData(spotId, { notes: currentValue || undefined });
        }
        break;
    }

    setEditing(null);
  }, [project, sample, micrographId, spotId, updateSample, updateMicrographMetadata, updateSpotData]);

  // Handle dialog actions
  const handleDialogDiscard = () => {
    setShowUnsavedDialog(false);
    setEditing(null);

    // If this was triggered by navigation guard, resolve the promise
    if (guardResolveRef.current) {
      guardResolveRef.current(true); // Allow navigation
      guardResolveRef.current = null;
    }

    // If this was triggered by internal action, execute it
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleDialogCancel = () => {
    setShowUnsavedDialog(false);
    setPendingAction(null);

    // If this was triggered by navigation guard, resolve the promise
    if (guardResolveRef.current) {
      guardResolveRef.current(false); // Block navigation
      guardResolveRef.current = null;
    }
  };

  const handleDialogSave = () => {
    saveEditing();
    setShowUnsavedDialog(false);

    // If this was triggered by navigation guard, resolve the promise
    if (guardResolveRef.current) {
      guardResolveRef.current(true); // Allow navigation after save
      guardResolveRef.current = null;
    }

    // If this was triggered by internal action, execute it
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Open modal editor for complex sections (non-inline editable)
  const handleEditSection = (sectionId: string) => {
    checkUnsavedAndProceed(() => {
      onEditSection(sectionId);
    });
  };

  // Handle View All Notes
  const handleViewAllNotes = () => {
    checkUnsavedAndProceed(() => {
      onViewAllNotes();
    });
  };

  if (!data && !project) {
    return null;
  }

  // Helper to render an inline-editable notes section (always visible)
  const renderInlineEditableSection = (
    label: string,
    notes: string | null | undefined,
    sectionId: InlineEditableSectionId,
    showDivider: boolean = true
  ) => {
    const isEditing = editing?.sectionId === sectionId;
    const displayValue = isEditing ? editing.currentValue : (notes || '');
    const isEmpty = !notes || notes.trim() === '';

    return (
      <Box key={sectionId}>
        {showDivider && <Divider sx={{ my: 1 }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {label}
          </Typography>
          {!isEditing && (
            <Link
              component="button"
              variant="caption"
              onClick={() => startEditing(sectionId, notes || '')}
              sx={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              (edit)
            </Link>
          )}
        </Box>

        {isEditing ? (
          <Box sx={{ mt: 1, position: 'relative' }}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
              value={displayValue}
              onChange={(e) => setEditing(prev => prev ? { ...prev, currentValue: e.target.value } : null)}
              placeholder={`Enter ${label.toLowerCase()}...`}
              variant="outlined"
              size="small"
              autoFocus
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'action.hover',
                  paddingBottom: '40px', // Make room for buttons
                },
              }}
            />
            <Box sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              display: 'flex',
              gap: 1,
            }}>
              <Button size="small" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={saveEditing}
                disabled={editing.currentValue === editing.originalValue}
              >
                Save Changes
              </Button>
            </Box>
          </Box>
        ) : (
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontStyle: isEmpty ? 'italic' : 'normal',
              color: isEmpty ? 'text.secondary' : 'text.primary',
            }}
          >
            {isEmpty ? `No ${label.toLowerCase()} recorded` : notes}
          </Typography>
        )}
      </Box>
    );
  };

  // Helper to render a read-only notes section with edit link (conditional visibility)
  const renderReadOnlySection = (
    label: string,
    notes: string | null | undefined,
    sectionId: SectionId,
    showDivider: boolean = true
  ) => {
    // Only show if there's content
    if (!notes || notes.trim() === '') return null;

    return (
      <Box key={sectionId}>
        {showDivider && <Divider sx={{ my: 1 }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {label}
          </Typography>
          <Link
            component="button"
            variant="caption"
            onClick={() => handleEditSection(sectionId)}
            sx={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            (edit)
          </Link>
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {notes}
        </Typography>
      </Box>
    );
  };

  // Build the sections
  const sections: JSX.Element[] = [];
  let isFirst = true;

  // Always-visible sections (inline editable)
  // Project notes
  sections.push(renderInlineEditableSection('Project Notes', project?.notes, 'project-notes', !isFirst));
  isFirst = false;

  // Sample notes
  sections.push(renderInlineEditableSection('Sample Notes', sample?.sampleNotes, 'sample-notes', !isFirst));

  // Micrograph or Spot notes (depending on what's active)
  if (spotId) {
    sections.push(renderInlineEditableSection('Spot Notes', spot?.notes, 'spot-notes', !isFirst));
  } else if (micrographId) {
    sections.push(renderInlineEditableSection('Micrograph Notes', micrograph?.notes, 'micrograph-notes', !isFirst));
  }

  // Conditional sections (only shown if they have content, open modal to edit)
  // Polish description
  const polishSection = renderReadOnlySection('Polish Description', micrograph?.polishDescription, 'polish-description', true);
  if (polishSection) sections.push(polishSection);

  // Instrument notes
  const instrumentSection = renderReadOnlySection('Instrument Notes', micrograph?.instrument?.instrumentNotes, 'instrument-notes', true);
  if (instrumentSection) sections.push(instrumentSection);

  // Post processing notes
  const postProcessingSection = renderReadOnlySection('Post Processing Notes', micrograph?.instrument?.notesOnPostProcessing, 'post-processing-notes', true);
  if (postProcessingSection) sections.push(postProcessingSection);

  // Mineralogy notes
  const mineralogySection = renderReadOnlySection('Mineralogy Notes', data?.mineralogy?.notes, 'mineralogy-notes', true);
  if (mineralogySection) sections.push(mineralogySection);

  // Lithology notes
  const lithologySection = renderReadOnlySection('Lithology Notes', data?.lithologyInfo?.notes, 'lithology-notes', true);
  if (lithologySection) sections.push(lithologySection);

  // Grain size notes
  const grainSizeSection = renderReadOnlySection('Grain Size Notes', data?.grainInfo?.grainSizeNotes, 'grain-size-notes', true);
  if (grainSizeSection) sections.push(grainSizeSection);

  // Grain shape notes
  const grainShapeSection = renderReadOnlySection('Grain Shape Notes', data?.grainInfo?.grainShapeNotes, 'grain-shape-notes', true);
  if (grainShapeSection) sections.push(grainShapeSection);

  // Grain orientation notes
  const grainOrientationSection = renderReadOnlySection('Grain Orientation Notes', data?.grainInfo?.grainOrientationNotes, 'grain-orientation-notes', true);
  if (grainOrientationSection) sections.push(grainOrientationSection);

  // Fabric notes
  const fabricSection = renderReadOnlySection('Fabric Notes', data?.fabricInfo?.notes, 'fabric-notes', true);
  if (fabricSection) sections.push(fabricSection);

  // Clastic deformation band notes
  const clasticSection = renderReadOnlySection('Clastic Deformation Band Notes', data?.clasticDeformationBandInfo?.notes, 'clastic-notes', true);
  if (clasticSection) sections.push(clasticSection);

  // Grain boundary notes
  const grainBoundarySection = renderReadOnlySection('Grain Boundary/Contact Notes', data?.grainBoundaryInfo?.notes, 'grain-boundary-notes', true);
  if (grainBoundarySection) sections.push(grainBoundarySection);

  // Intragrain notes
  const intragrainSection = renderReadOnlySection('Intragrain (Single Grain) Notes', data?.intraGrainInfo?.notes, 'intragrain-notes', true);
  if (intragrainSection) sections.push(intragrainSection);

  // Vein notes
  const veinSection = renderReadOnlySection('Vein Notes', data?.veinInfo?.notes, 'vein-notes', true);
  if (veinSection) sections.push(veinSection);

  // Pseudotachylyte notes
  const pseudotachylyteSection = renderReadOnlySection('Pseudotachylyte Notes', data?.pseudotachylyteInfo?.notes, 'pseudotachylyte-notes', true);
  if (pseudotachylyteSection) sections.push(pseudotachylyteSection);

  // Fold notes
  const foldSection = renderReadOnlySection('Fold Notes', data?.foldInfo?.notes, 'fold-notes', true);
  if (foldSection) sections.push(foldSection);

  // Faults/Shear zones notes
  const faultsSection = renderReadOnlySection('Faults/Shear Zones Notes', data?.faultsShearZonesInfo?.notes, 'faults-shear-zones-notes', true);
  if (faultsSection) sections.push(faultsSection);

  // Extinction microstructures notes
  const extinctionSection = renderReadOnlySection('Extinction Microstructures Notes', data?.extinctionMicrostructureInfo?.notes, 'extinction-microstructures-notes', true);
  if (extinctionSection) sections.push(extinctionSection);

  // Fracture notes
  const fractureSection = renderReadOnlySection('Fracture Notes', data?.fractureInfo?.notes, 'fracture-notes', true);
  if (fractureSection) sections.push(fractureSection);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Detailed Notes</Typography>
        <Link
          component="button"
          variant="body2"
          onClick={handleViewAllNotes}
          sx={{ cursor: 'pointer' }}
        >
          View All Notes
        </Link>
      </Box>
      <Stack spacing={1}>
        {sections}
      </Stack>

      {/* Unsaved Changes Dialog */}
      <Dialog
        open={showUnsavedDialog}
        onClose={handleDialogCancel}
      >
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to your notes. Would you like to save them before continuing?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogDiscard} color="error">
            Discard
          </Button>
          <Button onClick={handleDialogCancel}>
            Cancel
          </Button>
          <Button onClick={handleDialogSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
