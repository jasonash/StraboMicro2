/**
 * New Project Dialog
 *
 * Simple dialog for creating a new project with metadata only.
 * After creation, user can add datasets via the tree view.
 *
 * "Where to keep this project" (collaboration spec v3, 16ak): on this
 * computer only, or also synced to StraboSpot (Sync automatically). Logged
 * in, it follows the preference (16al), and the first choice sets it.
 * Logged out, syncing needs the inline login first. A synced project is
 * saved and turned on before it loads (turning sync on moves the folder).
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Stack,
} from '@mui/material';
import { useAppStore } from '@/store';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { requestFirstSync } from '@/services/syncActions';
import { getRestServerUrl, getSyncNewProjectsPreference, setSyncNewProjectsPreference } from './PreferencesDialog';
import type { ProjectMetadata } from '@/types/project-types';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectFormData {
  name: string;
  startDate: string;
  endDate: string;
  purposeOfStudy: string;
  otherTeamMembers: string;
  areaOfInterest: string;
  gpsDatum: string;
  magneticDeclination: string;
  notes: string;
}

const initialFormData: ProjectFormData = {
  name: '',
  startDate: '',
  endDate: '',
  purposeOfStudy: '',
  otherTeamMembers: '',
  areaOfInterest: '',
  gpsDatum: 'WGS84',
  magneticDeclination: '',
  notes: '',
};

export function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const [dateError, setDateError] = useState<string>('');
  const loadProject = useAppStore((state) => state.loadProject);
  const loggedIn = useAuthStore((state) => state.isAuthenticated);
  /** '' = not chosen yet (logged in, preference never set: the user must pick) */
  const [keep, setKeep] = useState<'' | 'local' | 'sync'>('local');
  const [creating, setCreating] = useState(false);

  // Preselect when the dialog opens: the preference when logged in, this computer when logged out
  useEffect(() => {
    if (!isOpen) return;
    const pref = getSyncNewProjectsPreference();
    const loggedInNow = useAuthStore.getState().isAuthenticated;
    setKeep(!loggedInNow ? 'local' : pref === true ? 'sync' : pref === false ? 'local' : '');
  }, [isOpen]);

  const updateField = (field: keyof ProjectFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear date error when user changes dates
    if (field === 'startDate' || field === 'endDate') {
      setDateError('');
    }
  };

  const validateForm = (): boolean => {
    // Project name is required
    if (!formData.name.trim()) {
      return false;
    }

    // Validate date range if both dates are provided
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start > end) {
        setDateError('End date must be after start date');
        return false;
      }
    }

    setDateError('');
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm() || keep === '' || (keep === 'sync' && !loggedIn)) {
      return;
    }
    // The first choice made while logged in sets the preference (16ak)
    if (getSyncNewProjectsPreference() === null) setSyncNewProjectsPreference(keep === 'sync');

    // Create project structure
    const projectId = crypto.randomUUID();
    const project: ProjectMetadata = {
      id: projectId,
      name: formData.name,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      purposeOfStudy: formData.purposeOfStudy || undefined,
      otherTeamMembers: formData.otherTeamMembers || undefined,
      areaOfInterest: formData.areaOfInterest || undefined,
      gpsDatum: formData.gpsDatum || 'WGS84',
      magneticDeclination: formData.magneticDeclination ? parseFloat(formData.magneticDeclination).toString() : undefined,
      notes: formData.notes || undefined,
      datasets: [],
    };

    try {
      // Create project folder structure on disk
      if (window.api) {
        console.log(`[NewProjectDialog] Creating project folders for: ${projectId}`);
        const folderPaths = await window.api.createProjectFolders(projectId);
        console.log('[NewProjectDialog] Successfully created project folders:', folderPaths);
      }

      // Synced: save it and turn sync on before it loads (the folder moves).
      // If that fails, the project stays on this computer only.
      let syncProblem: string | null = null;
      if (keep === 'sync' && window.api) {
        setCreating(true);
        try {
          const saved = await window.api.saveProjectJson(project, projectId);
          if (!saved?.success) {
            syncProblem = 'The project could not be saved.';
          } else {
            const result = await window.api.sync.turnOn(projectId, getRestServerUrl(), 'automatic');
            if (result.ok) requestFirstSync(projectId);
            else syncProblem = result.message;
          }
        } finally {
          setCreating(false);
        }
      }

      // Load project into store (null filePath = unsaved project)
      loadProject(project, null);
      if (syncProblem) {
        alert(`The project was created on this computer only, because sync could not be turned on.\n\n${syncProblem}\n\n` +
          'You can turn sync on later from the sync status in the header.');
      }

      // Clear any existing version history for this project ID
      // (shouldn't exist, but just in case of ID collision)
      window.api?.versionHistory?.clear(projectId).catch((err: unknown) => {
        console.warn('[NewProjectDialog] Failed to clear version history:', err);
      });

      // Reset form and close
      setFormData(initialFormData);
      setDateError('');
      onClose();
    } catch (error) {
      console.error('[NewProjectDialog] Error creating project folders:', error);
      // Surface the underlying reason (e.g. a OneDrive-redirected Documents folder)
      // so the user gets something actionable rather than a generic failure.
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to create project folders.\n\n${message}`);
    }
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setDateError('');
    onClose();
  };

  // Calculate min/max dates for date pickers
  const getStartDateMax = () => {
    return formData.endDate || '2100-12-31';
  };

  const getEndDateMin = () => {
    return formData.startDate || '1900-01-01';
  };

  return (
    <Dialog
      open={isOpen}
      onClose={(_event, reason) => {
        // Prevent closing via backdrop or ESC
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          return;
        }
        handleCancel();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>New Project</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={3}>
            <TextField
              label="Project Name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
              fullWidth
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Date"
                type="date"
                value={formData.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
                error={!!dateError}
                helperText={dateError}
                fullWidth
                slotProps={{
                  htmlInput: {
                    max: getStartDateMax(),
                  },

                  inputLabel: { shrink: true }
                }} />
              <TextField
                label="End Date"
                type="date"
                value={formData.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
                error={!!dateError}
                fullWidth
                slotProps={{
                  htmlInput: {
                    min: getEndDateMin(),
                    max: '2100-12-31',
                  },

                  inputLabel: { shrink: true }
                }} />
            </Stack>

            <TextField
              label="Purpose of Study"
              value={formData.purposeOfStudy}
              onChange={(e) => updateField('purposeOfStudy', e.target.value)}
              multiline
              rows={2}
              fullWidth
            />

            <TextField
              label="Other Team Members"
              value={formData.otherTeamMembers}
              onChange={(e) => updateField('otherTeamMembers', e.target.value)}
              placeholder="Comma-separated list of names"
              fullWidth
            />

            <TextField
              label="Area of Interest"
              value={formData.areaOfInterest}
              onChange={(e) => updateField('areaOfInterest', e.target.value)}
              fullWidth
            />

            <TextField
              label="GPS Datum"
              value={formData.gpsDatum}
              onChange={(e) => updateField('gpsDatum', e.target.value)}
              fullWidth
            />

            <TextField
              label="Magnetic Declination"
              value={formData.magneticDeclination}
              onChange={(e) => updateField('magneticDeclination', e.target.value)}
              placeholder="e.g., 12.5"
              type="number"
              fullWidth
            />

            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              multiline
              rows={3}
              fullWidth
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Where to keep this project</Typography>
              <RadioGroup value={keep} onChange={(e) => setKeep(e.target.value === 'sync' ? 'sync' : 'local')}>
                <FormControlLabel value="local" control={<Radio size="small" />} label="On this computer only" />
                <FormControlLabel
                  value="sync"
                  control={<Radio size="small" />}
                  label="On this computer and synced to StraboSpot (backup, use on other computers, share with collaborators)"
                />
              </RadioGroup>
              {keep === 'sync' && !loggedIn && (
                <Alert
                  severity="info"
                  sx={{ mt: 1 }}
                  action={
                    <Button color="inherit" size="small" onClick={() => void promptLogin('Log in to sync this project to StraboSpot.')}>
                      Log in
                    </Button>
                  }
                >
                  Log in to StraboSpot to sync this project.
                </Alert>
              )}
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!formData.name.trim() || keep === '' || (keep === 'sync' && !loggedIn) || creating}
        >
          Create Project
        </Button>
      </DialogActions>
    </Dialog>
  );
}
