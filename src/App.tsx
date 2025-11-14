import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectWizard } from './components/dialogs/NewProjectWizard';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { useAppStore } from '@/store';
import './App.css';

// TypeScript type for window.api
declare global {
  interface Window {
    api: {
      onNewProject: (callback: () => void) => void;
      onOpenProject: (callback: () => void) => void;
      onShowProjectDebug: (callback: () => void) => void;
      onClearProject: (callback: () => void) => void;
      openTiffDialog: () => Promise<string | null>;
      loadTiffImage: (filePath: string) => Promise<{
        width: number;
        height: number;
        data: string;
        filePath: string;
        fileName: string;
      }>;
      setWindowTitle: (title: string) => void;
    };
  }
}

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);

  // Update window title when project changes
  useEffect(() => {
    if (!window.api) return;

    if (project && project.name) {
      window.api.setWindowTitle(`StraboMicro - ${project.name}`);
    } else {
      window.api.setWindowTitle('StraboMicro');
    }
  }, [project]);

  // Listen for menu events from Electron
  useEffect(() => {
    // Check if window.api is available (Electron context)
    if (!window.api) {
      console.warn('window.api not available - running outside Electron context');
      return;
    }

    // New Project menu item
    window.api.onNewProject(() => {
      setIsNewProjectDialogOpen(true);
    });

    // Open Project menu item (TODO: implement)
    window.api.onOpenProject(() => {
      console.log('Open Project clicked');
    });

    // Debug: Show Project Structure
    window.api.onShowProjectDebug(() => {
      setIsDebugModalOpen(true);
    });

    // Debug: Clear Project
    window.api.onClearProject(() => {
      if (confirm('Are you sure you want to clear the current project? This will remove it from localStorage.')) {
        closeProject();
        console.log('Project cleared');
      }
    });
  }, [closeProject]);

  return (
    <>
      <MainLayout />
      <NewProjectWizard
        isOpen={isNewProjectDialogOpen}
        onClose={() => setIsNewProjectDialogOpen(false)}
      />
      <ProjectDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
      />
    </>
  );
}

export default App;
