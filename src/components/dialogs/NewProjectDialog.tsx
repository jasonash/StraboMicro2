/**
 * New Project Dialog
 *
 * Simplified workflow for creating a new StraboMicro project.
 * Collects minimal required information and creates project structure.
 */

import { useState } from 'react';
import { useAppStore } from '@/store';
import './NewProjectDialog.css';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ isOpen, onClose }) => {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const loadProject = useAppStore(state => state.loadProject);

  const handleCreate = () => {
    if (!projectName.trim()) return;

    // Create new project with minimal structure
    const newProject = {
      id: crypto.randomUUID(),
      name: projectName.trim(),
      description: description.trim() || undefined,
      datasets: [{
        id: crypto.randomUUID(),
        name: 'Default Dataset',
        samples: [{
          id: crypto.randomUUID(),
          name: 'Default Sample',
          micrographs: []
        }]
      }]
    };

    // Load into store (unsaved, no file path yet)
    loadProject(newProject, null);

    // Reset form and close
    setProjectName('');
    setDescription('');
    onClose();
  };

  const handleCancel = () => {
    setProjectName('');
    setDescription('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && projectName.trim()) {
      handleCreate();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleCancel}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="dialog-header">
          <h2>New Project</h2>
          <button className="dialog-close" onClick={handleCancel}>×</button>
        </div>

        <div className="dialog-body">
          <div className="form-group">
            <label htmlFor="projectName">
              Project Name <span className="required">*</span>
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              rows={4}
            />
          </div>

          <div className="dialog-hint">
            After creating the project, you'll be prompted to import your first micrograph.
          </div>
        </div>

        <div className="dialog-footer">
          <button className="button-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={handleCreate}
            disabled={!projectName.trim()}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};
