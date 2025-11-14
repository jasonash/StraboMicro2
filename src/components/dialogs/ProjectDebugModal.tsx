/**
 * Project Debug Modal
 *
 * Displays the current project structure in JSON format for debugging
 */

import { useAppStore } from '@/store';
import './ProjectDebugModal.css';

interface ProjectDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectDebugModal: React.FC<ProjectDebugModalProps> = ({ isOpen, onClose }) => {
  const project = useAppStore(state => state.project);
  const projectFilePath = useAppStore(state => state.projectFilePath);
  const isDirty = useAppStore(state => state.isDirty);

  const handleCopyToClipboard = () => {
    const jsonString = JSON.stringify(project, null, 2);
    navigator.clipboard.writeText(jsonString);
    alert('Project JSON copied to clipboard!');
  };

  if (!isOpen) return null;

  return (
    <div className="debug-modal-overlay" onClick={onClose}>
      <div className="debug-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="debug-modal-header">
          <h2>Project Structure (Debug)</h2>
          <button className="debug-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="debug-modal-body">
          <div className="debug-info-section">
            <h3>Project Info</h3>
            <div className="debug-info-row">
              <span className="debug-label">File Path:</span>
              <span className="debug-value">{projectFilePath || '(unsaved)'}</span>
            </div>
            <div className="debug-info-row">
              <span className="debug-label">Dirty:</span>
              <span className="debug-value">{isDirty ? 'Yes (unsaved changes)' : 'No'}</span>
            </div>
            <div className="debug-info-row">
              <span className="debug-label">Project Loaded:</span>
              <span className="debug-value">{project ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {project ? (
            <>
              <div className="debug-info-section">
                <h3>Project Structure (JSON)</h3>
                <button className="button-copy" onClick={handleCopyToClipboard}>
                  Copy to Clipboard
                </button>
              </div>
              <pre className="debug-json">
                {JSON.stringify(project, null, 2)}
              </pre>
            </>
          ) : (
            <div className="debug-no-project">
              <p>No project currently loaded.</p>
            </div>
          )}
        </div>

        <div className="debug-modal-footer">
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
