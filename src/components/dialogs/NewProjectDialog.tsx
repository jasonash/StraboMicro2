/**
 * New Project Dialog
 *
 * Simple dialog for creating a new project with metadata only.
 * After creation, user can add datasets via the tree view.
 */

import { useState } from 'react';
import {
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
    if (!validateForm()) {
      return;
    }

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

      // Load project into store (null filePath = unsaved project)
      loadProject(project, null);

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
      alert('Failed to create project folders. Please check the console for details.');
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
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  max: getStartDateMax(),
                }}
                error={!!dateError}
                helperText={dateError}
                fullWidth
              />
              <TextField
                label="End Date"
                type="date"
                value={formData.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: getEndDateMin(),
                  max: '2100-12-31',
                }}
                error={!!dateError}
                fullWidth
              />
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
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!formData.name.trim()}
        >
          Create Project
        </Button>
      </DialogActions>
    </Dialog>
  );
}
