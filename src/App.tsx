import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectWizard } from './components/dialogs/NewProjectWizard';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { useAppStore } from '@/store';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isEditProjectDialogOpen, setIsEditProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [debugWizardStep, setDebugWizardStep] = useState<number | undefined>(undefined);
  const [debugWizardData, setDebugWizardData] = useState<any>(undefined);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);

  const handleTestOrientationStep = () => {
    // Determine which step to jump to based on whether Instrument Settings would be shown
    // For "Optical Microscopy", Instrument Settings is not shown, so orientation is step 7 (index 7)
    const testStep = 7; // This will be step 7 or 8 depending on the steps array

    const testData = {
      name: 'Debug Test Project',
      datasetName: 'Test Dataset',
      sampleName: 'Test Sample',
      micrographFilePath: '/Volumes/8TB/Work/StraboMicro/Micro/ThinSections/good/C.tif',
      micrographFileName: 'C.tif',
      micrographWidth: 2048,
      micrographHeight: 2048,
      micrographName: 'Test Micrograph C',
      instrumentType: 'Optical Microscopy',
      orientationMethod: 'unoriented' as const,
    };

    setDebugWizardStep(testStep);
    setDebugWizardData(testData);
    setIsNewProjectDialogOpen(true);
  };

  // Initialize theme system
  useTheme();

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

    // Edit Project menu item
    window.api.onEditProject(() => {
      setIsEditProjectDialogOpen(true);
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

    // Theme menu item
    window.api.onThemeChange((theme) => {
      setTheme(theme);
    });
  }, [closeProject, setTheme]);

  return (
    <>
      <MainLayout />
      <NewProjectWizard
        isOpen={isNewProjectDialogOpen}
        onClose={() => {
          setIsNewProjectDialogOpen(false);
          setDebugWizardStep(undefined);
          setDebugWizardData(undefined);
        }}
        debugInitialStep={debugWizardStep}
        debugTestData={debugWizardData}
      />
      <EditProjectDialog
        isOpen={isEditProjectDialogOpen}
        onClose={() => setIsEditProjectDialogOpen(false)}
      />
      <ProjectDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        onTestOrientationStep={handleTestOrientationStep}
      />
    </>
  );
}

export default App;
