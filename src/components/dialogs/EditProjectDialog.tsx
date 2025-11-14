/**
 * Edit Project Dialog
 *
 * Allows editing of existing project metadata (name, dates, purpose, etc.)
 * Only edits project-level fields, not datasets/samples
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import './NewProjectWizard.css'; // Reuse wizard styles

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
  const updateDataset = useAppStore(state => state.updateDataset);

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

    // Update project using the store's updateDataset for the first dataset
    // Note: In the current data model, project metadata is stored at the root level
    // We'll need to update the project directly through a new store action
    // For now, we'll use a workaround by updating via the project reference

    // This is a temporary approach - ideally we'd have an updateProject action
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

    // Use loadProject to replace the current project with updated metadata
    const loadProject = useAppStore.getState().loadProject;
    const projectFilePath = useAppStore.getState().projectFilePath;
    loadProject(updatedProject, projectFilePath);

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen || !project) return null;

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-container" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>Edit Project</h2>
          <button className="wizard-close" onClick={onClose}>×</button>
        </div>

        <div className="wizard-body">
          <div className="wizard-form">
            <div className="form-row">
              <label>
                Project Name <span className="required">*</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Enter project name"
                />
              </label>
            </div>

            <div className="form-row-split">
              <label>
                Start Date
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => updateField('startDate', e.target.value)}
                />
              </label>
              <label>
                End Date
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => updateField('endDate', e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Purpose of Study
                <textarea
                  value={formData.purposeOfStudy}
                  onChange={(e) => updateField('purposeOfStudy', e.target.value)}
                  placeholder="Describe the purpose of this study"
                  rows={3}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Other Team Members
                <input
                  type="text"
                  value={formData.otherTeamMembers}
                  onChange={(e) => updateField('otherTeamMembers', e.target.value)}
                  placeholder="List other team members"
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Area of Interest
                <input
                  type="text"
                  value={formData.areaOfInterest}
                  onChange={(e) => updateField('areaOfInterest', e.target.value)}
                  placeholder="Geographic area or location"
                />
              </label>
            </div>

            <div className="form-row-split">
              <label>
                GPS Datum
                <input
                  type="text"
                  value={formData.gpsDatum}
                  onChange={(e) => updateField('gpsDatum', e.target.value)}
                  placeholder="e.g., WGS84"
                />
              </label>
              <label>
                Magnetic Declination
                <input
                  type="text"
                  value={formData.magneticDeclination}
                  onChange={(e) => updateField('magneticDeclination', e.target.value)}
                  placeholder="Declination value"
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Notes
                <textarea
                  value={formData.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Additional notes about the project"
                  rows={4}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="wizard-footer">
          <button className="button-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="button-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
