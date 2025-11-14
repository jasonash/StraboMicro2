import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import './App.css';

// TypeScript type for window.api
declare global {
  interface Window {
    api: {
      onNewProject: (callback: () => void) => void;
      onOpenProject: (callback: () => void) => void;
      openTiffDialog: () => Promise<string | null>;
      loadTiffImage: (filePath: string) => Promise<{
        width: number;
        height: number;
        data: string;
        filePath: string;
        fileName: string;
      }>;
    };
  }
}

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);

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
  }, []);

  return (
    <>
      <MainLayout />
      <NewProjectDialog
        isOpen={isNewProjectDialogOpen}
        onClose={() => setIsNewProjectDialogOpen(false)}
      />
    </>
  );
}

export default App;
