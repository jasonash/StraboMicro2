/**
 * Edit Project Dialog
 *
 * Allows editing of existing project metadata (name, dates, purpose, etc.)
 * Only edits project-level fields, not datasets/samples
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Stack,
  Grow,
} from '@mui/material';
import { useAppStore } from '@/store';

interface EditProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectMetadataForm {
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

export const EditProjectDialog: React.FC<EditProjectDialogProps> = ({ isOpen, onClose }) => {
  const project = useAppStore(state => state.project);

  const [formData, setFormData] = useState<ProjectMetadataForm>({
    name: '',
    startDate: '',
    endDate: '',
    purposeOfStudy: '',
    otherTeamMembers: '',
    areaOfInterest: '',
    gpsDatum: '',
    magneticDeclination: '',
    notes: '',
  });

  // Load current project data when dialog opens
  useEffect(() => {
    if (isOpen && project) {
      setFormData({
        name: project.name || '',
        startDate: project.startDate || '',
        endDate: project.endDate || '',
        purposeOfStudy: project.purposeOfStudy || '',
        otherTeamMembers: project.otherTeamMembers || '',
        areaOfInterest: project.areaOfInterest || '',
        gpsDatum: project.gpsDatum || '',
        magneticDeclination: project.magneticDeclination || '',
        notes: project.notes || '',
      });
    }
  }, [isOpen, project]);

  const updateField = (field: keyof ProjectMetadataForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!project) {
      alert('No project is currently loaded.');
      return;
    }

    if (!formData.name.trim()) {
      alert('Project name is required.');
      return;
    }

    // Validate date range
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      alert('Start date must be before end date.');
      return;
    }

    const updatedProject = {
      ...project,
      name: formData.name,
      startDate: formData.startDate,
      endDate: formData.endDate,
      purposeOfStudy: formData.purposeOfStudy,
      otherTeamMembers: formData.otherTeamMembers,
      areaOfInterest: formData.areaOfInterest,
      gpsDatum: formData.gpsDatum,
      magneticDeclination: formData.magneticDeclination,
      notes: formData.notes,
    };

    const loadProject = useAppStore.getState().loadProject;
    const projectFilePath = useAppStore.getState().projectFilePath;
    loadProject(updatedProject, projectFilePath);

    onClose();
  };

  if (!project) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionComponent={Grow}
      transitionDuration={300}
    >
      <DialogTitle>Edit Project</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            required
            label="Project Name"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              InputLabelProps={{ shrink: true }}
              value={formData.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              inputProps={{
                max: formData.endDate || '2100-12-31', // Date picker can't select after end date or year 2100
              }}
              helperText={formData.endDate && formData.startDate && formData.startDate > formData.endDate ? 'Start date must be before end date' : ''}
              error={!!(formData.endDate && formData.startDate && formData.startDate > formData.endDate)}
            />
            <TextField
              fullWidth
              type="date"
              label="End Date"
              InputLabelProps={{ shrink: true }}
              value={formData.endDate}
              onChange={(e) => updateField('endDate', e.target.value)}
              inputProps={{
                min: formData.startDate || undefined, // Date picker can't select before start date
                max: '2100-12-31', // Date picker can't select after year 2100
              }}
              helperText={formData.startDate && formData.endDate && formData.endDate < formData.startDate ? 'End date must be after start date' : ''}
              error={!!(formData.startDate && formData.endDate && formData.endDate < formData.startDate)}
            />
          </Box>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Purpose of Study"
            value={formData.purposeOfStudy}
            onChange={(e) => updateField('purposeOfStudy', e.target.value)}
          />
          <TextField
            fullWidth
            label="Other Team Members"
            value={formData.otherTeamMembers}
            onChange={(e) => updateField('otherTeamMembers', e.target.value)}
          />
          <TextField
            fullWidth
            label="Area of Interest"
            value={formData.areaOfInterest}
            onChange={(e) => updateField('areaOfInterest', e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="GPS Datum"
              value={formData.gpsDatum}
              onChange={(e) => updateField('gpsDatum', e.target.value)}
              placeholder="e.g., WGS84"
            />
            <TextField
              fullWidth
              label="Magnetic Declination"
              value={formData.magneticDeclination}
              onChange={(e) => updateField('magneticDeclination', e.target.value)}
            />
          </Box>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};
