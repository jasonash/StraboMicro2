import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { PreferencesDialog } from './components/dialogs/PreferencesDialog';
import { LoginDialog } from './components/dialogs/LoginDialog';
import { ExportAllImagesDialog } from './components/dialogs/ExportAllImagesDialog';
import { ExportPDFDialog } from './components/dialogs/ExportPDFDialog';
import { ExportSmzDialog } from './components/dialogs/ExportSmzDialog';
import { PushToServerDialog } from './components/dialogs/PushToServerDialog';
import { VersionHistoryDialog } from './components/dialogs/VersionHistoryDialog';
import { useAppStore, useTemporalStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from './hooks/useTheme';
import { useAutosave } from './hooks/useAutosave';
import './App.css';

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isEditProjectDialogOpen, setIsEditProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isExportAllImagesOpen, setIsExportAllImagesOpen] = useState(false);
  const [isExportPDFOpen, setIsExportPDFOpen] = useState(false);
  const [isExportSmzOpen, setIsExportSmzOpen] = useState(false);
  const [isPushToServerOpen, setIsPushToServerOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);
  const setShowRulers = useAppStore(state => state.setShowRulers);
  const setShowSpotLabels = useAppStore(state => state.setShowSpotLabels);
  const { checkAuthStatus, logout } = useAuthStore();

  // Initialize theme system
  useTheme();

  // Initialize autosave (5-minute timer when dirty)
  const { manualSave, saveBeforeClose } = useAutosave();

  // Check auth status on app startup
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Update window title when project changes
  useEffect(() => {
    if (!window.api) return;

    if (project && project.name) {
      window.api.setWindowTitle(`StraboMicro - ${project.name}`);
    } else {
      window.api.setWindowTitle('StraboMicro');
    }
  }, [project]);

  // Save before app close
  useEffect(() => {
    // Handle browser beforeunload (fallback)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isDirty = useAppStore.getState().isDirty;
      const currentProject = useAppStore.getState().project;

      if (isDirty && currentProject) {
        // Trigger save (async, but we do our best)
        saveBeforeClose();

        // Show browser confirmation dialog as fallback
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Handle Electron app close event
    const unsubscribeBeforeClose = window.api?.onBeforeClose(() => {
      console.log('[App] Received before-close event from main process');
      saveBeforeClose();
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubscribeBeforeClose?.();
    };
  }, [saveBeforeClose]);

  // Listen for menu events from Electron
  useEffect(() => {
    // Check if window.api is available (Electron context)
    if (!window.api) {
      console.warn('window.api not available - running outside Electron context');
      return;
    }

    // Collect all unsubscribe functions for cleanup
    const unsubscribers: Array<(() => void) | undefined> = [];

    // New Project menu item
    unsubscribers.push(window.api.onNewProject(() => {
      setIsNewProjectDialogOpen(true);
    }));

    // Open Project menu item (TODO: implement)
    unsubscribers.push(window.api.onOpenProject(() => {
      console.log('Open Project clicked');
    }));

    // Edit Project menu item
    unsubscribers.push(window.api.onEditProject(() => {
      setIsEditProjectDialogOpen(true);
    }));

    // Debug: Show Project Structure
    unsubscribers.push(window.api.onShowProjectDebug(() => {
      setIsDebugModalOpen(true);
    }));

    // Preferences menu item
    unsubscribers.push(window.api.onPreferences(() => {
      setIsPreferencesOpen(true);
    }));

    // Debug: Clear Project
    unsubscribers.push(window.api.onClearProject(() => {
      if (confirm('Are you sure you want to clear the current project? This will remove it from localStorage.')) {
        closeProject();
        console.log('Project cleared');
      }
    }));

    // Debug: Quick Load Image
    unsubscribers.push(window.api.onQuickLoadImage(async () => {
      try {
        console.log('=== Quick Load Image: Starting ===');

        // Step 1: Clear the current project/canvas first
        console.log('Step 1: Clearing current project...');
        closeProject();

        // Step 2: Clear all tile caches
        console.log('Step 2: Clearing tile cache...');
        if (window.api?.clearAllCaches) {
          const result = await window.api.clearAllCaches();
          console.log('Tile cache cleared:', result);
        }

        // Get cache stats to verify it's cleared
        if (window.api?.getCacheStats) {
          const stats = await window.api.getCacheStats();
          console.log('Cache stats after clear:', stats);
        }

        // Step 3: Prompt user to select an image file
        console.log('Step 3: Prompting for file selection...');
        const filePath = await window.api?.openTiffDialog();
        if (!filePath) {
          console.log('No file selected, aborting');
          return;
        }
        console.log('File selected:', filePath);

        // Step 4: Load image metadata
        console.log('Step 4: Loading image metadata...');
        const imageData = await window.api?.loadTiffImage(filePath);
        if (!imageData) {
          console.log('Failed to load image metadata');
          return;
        }
        console.log('Image metadata loaded:', {
          filename: imageData.filename,
          dimensions: `${imageData.width}x${imageData.height}`,
        });

        // Step 5: Create a minimal project with just this one micrograph
        console.log('Step 5: Creating minimal project structure...');
        const micrographId = crypto.randomUUID();
        const quickProject = {
          id: crypto.randomUUID(),
          name: 'Quick Load Project',
          projectLocation: 'local' as const,
          datasets: [
            {
              id: crypto.randomUUID(),
              name: 'Quick Dataset',
              samples: [
                {
                  id: crypto.randomUUID(),
                  name: 'Quick Sample',
                  label: 'Quick Sample',
                  sampleID: 'QUICK-001',
                  micrographs: [
                    {
                      id: micrographId,
                      name: imageData.filename,
                      imagePath: filePath,
                      imageFilename: imageData.filename,
                      imageWidth: imageData.width,
                      imageHeight: imageData.height,
                      width: imageData.width, // Legacy field
                      height: imageData.height, // Legacy field
                      opacity: 1.0,
                      polish: false,
                      polishDescription: '',
                      notes: 'Quick load for testing',
                      orientationInfo: { orientationMethod: 'unoriented' as const },
                      scalePixelsPerCentimeter: 100, // Placeholder
                      instrument: {},
                      isMicroVisible: true,
                      isFlipped: false,
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Step 6: Load the project (this will trigger the loading state in TiledViewer)
        console.log('Step 6: Loading project into store...');
        useAppStore.getState().loadProject(quickProject, null);

        // Step 7: Select the micrograph (this triggers TiledViewer to load the image)
        console.log('Step 7: Selecting micrograph...');
        setTimeout(() => {
          useAppStore.getState().selectMicrograph(micrographId);
          console.log('=== Quick Load Image: Complete ===');
        }, 100); // Slight delay to ensure project is loaded

      } catch (error) {
        console.error('Quick Load Image failed:', error);
        alert('Failed to load image: ' + (error as Error).message);
      }
    }));

    // Load Sample Project
    unsubscribers.push(window.api.onLoadSampleProject(() => {
      console.log('Loading sample project...');

      const sampleProject = {
        id: crypto.randomUUID(),
        name: 'Sample Geological Project 2025',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        purposeOfStudy: 'Microstructural analysis and fabric characterization',
        otherTeamMembers: 'Dr. Jane Smith, Dr. Bob Wilson',
        areaOfInterest: 'Western Alps, France',
        gpsDatum: 'WGS84',
        magneticDeclination: '2.5',
        notes: 'Sample project for testing the new wizard system',
        datasets: [
          {
            id: crypto.randomUUID(),
            name: 'Field Season 2025',
            samples: [
              {
                id: crypto.randomUUID(),
                name: 'Alpine Shear Zone Sample 1',
                label: 'ASZ-001',
                sampleID: 'ASZ-001',
                longitude: 6.8652,
                latitude: 45.9237,
                mainSamplingPurpose: 'fabric___micro',
                sampleDescription: 'Mylonitic quartzite from main shear zone',
                materialType: 'intact_rock',
                lithology: 'Quartzite',
                sampleNotes: 'Well-developed S-C fabric, strong lineation',
                micrographs: [],
              },
              {
                id: crypto.randomUUID(),
                name: 'Alpine Shear Zone Sample 2',
                label: 'ASZ-002',
                sampleID: 'ASZ-002',
                longitude: 6.8658,
                latitude: 45.9240,
                mainSamplingPurpose: 'petrology',
                sampleDescription: 'Garnet-bearing micaschist',
                materialType: 'intact_rock',
                lithology: 'Micaschist',
                sampleNotes: 'Contains 3-5mm garnet porphyroblasts',
                micrographs: [],
              },
            ],
          },
          {
            id: crypto.randomUUID(),
            name: 'Lab Analysis 2025',
            samples: [
              {
                id: crypto.randomUUID(),
                name: 'Reference Standard',
                label: 'REF-STD-001',
                sampleID: 'REF-STD-001',
                mainSamplingPurpose: 'geochemistry',
                sampleDescription: 'Laboratory reference standard for calibration',
                materialType: 'intact_rock',
                sampleNotes: 'Used for EPMA calibration',
                micrographs: [],
              },
            ],
          },
        ],
      };

      useAppStore.getState().loadProject(sampleProject, null);
      console.log('Sample project loaded successfully!');
    }));

    // Reset Everything (Clean Test)
    unsubscribers.push(window.api?.onResetEverything(async () => {
      console.log('Resetting everything for clean test...');

      try {
        const result = await window.api?.resetEverything();
        if (!result) return;
        console.log('Reset complete:', result);

        // Load the test project into the store
        useAppStore.getState().loadProject(result.project, null);

        alert(`✅ Reset Complete!\n\n${result.message}\n\nTest project loaded with 1 dataset and 1 sample (no images).`);
      } catch (error) {
        console.error('Error during reset:', error);
        alert(`❌ Error during reset: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }));

    // Rebuild All Thumbnails
    unsubscribers.push(window.api?.onRebuildAllThumbnails(async () => {
      const project = useAppStore.getState().project;

      if (!project) {
        alert('No project loaded');
        return;
      }

      console.log('Rebuilding all thumbnails...');

      try {
        const result = await window.api?.rebuildAllThumbnails(project.id, project);
        if (!result) return;

        console.log('Rebuild complete:', result.results);

        // Trigger refresh of all thumbnails
        window.dispatchEvent(new CustomEvent('rebuild-all-thumbnails'));

        const message = `✅ Thumbnail Rebuild Complete!\n\n` +
          `Total: ${result.results.total}\n` +
          `Succeeded: ${result.results.succeeded}\n` +
          `Failed: ${result.results.failed}`;

        alert(message);
      } catch (error) {
        console.error('Error rebuilding thumbnails:', error);
        alert(`❌ Error rebuilding thumbnails: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }));

    // Undo menu item
    unsubscribers.push(window.api.onUndo(() => {
      const temporalState = useTemporalStore.getState();
      temporalState.undo();
      console.log('Undo performed');
    }));

    // Redo menu item
    unsubscribers.push(window.api.onRedo(() => {
      const temporalState = useTemporalStore.getState();
      temporalState.redo();
      console.log('Redo performed');
    }));

    // Theme menu item
    unsubscribers.push(window.api.onThemeChange((theme) => {
      setTheme(theme);
    }));

    // View: Toggle Rulers menu item
    unsubscribers.push(window.api.onToggleRulers((checked) => {
      setShowRulers(checked);
    }));

    // View: Toggle Spot Labels menu item
    unsubscribers.push(window.api.onToggleSpotLabels((checked) => {
      setShowSpotLabels(checked);
    }));

    // Account: Login menu item
    unsubscribers.push(window.api.onLoginRequest(() => {
      setIsLoginDialogOpen(true);
    }));

    // Account: Logout menu item
    unsubscribers.push(window.api.onLogoutRequest(async () => {
      await logout();
    }));

    // File: Export All Images menu item
    unsubscribers.push(window.api.onExportAllImages(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsExportAllImagesOpen(true);
    }));

    // File: Export Project as JSON menu item
    unsubscribers.push(window.api?.onExportProjectJson(async () => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      try {
        const result = await window.api?.exportProjectJson(project);
        if (result?.success && result.filePath) {
          alert(`Project exported to:\n${result.filePath}`);
        }
      } catch (error) {
        console.error('Failed to export project:', error);
        alert('Failed to export project as JSON.');
      }
    }));

    // File: Export Project as PDF menu item
    unsubscribers.push(window.api?.onExportProjectPdf(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsExportPDFOpen(true);
    }));

    // File: Save Project menu item
    unsubscribers.push(window.api?.onSaveProject(async () => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      try {
        // Use manualSave which handles save + version + timer reset
        const result = await manualSave();
        if (!result.success) {
          alert('Failed to save project.');
        }
      } catch (error) {
        console.error('Failed to save project:', error);
        alert('Failed to save project.');
      }
    }));

    // File: Export as .smz menu item
    unsubscribers.push(window.api?.onExportSmz(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsExportSmzOpen(true);
    }));

    // File: Push to Server menu item
    unsubscribers.push(window.api?.onPushToServer(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsPushToServerOpen(true);
    }));

    // File: View Version History menu item
    unsubscribers.push(window.api?.onViewVersionHistory(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsVersionHistoryOpen(true);
    }));

    // Cleanup: remove all listeners when dependencies change or component unmounts
    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, [closeProject, setTheme, setShowRulers, setShowSpotLabels, logout, project, manualSave]);

  return (
    <>
      <MainLayout />
      <NewProjectDialog
        isOpen={isNewProjectDialogOpen}
        onClose={() => setIsNewProjectDialogOpen(false)}
      />
      <EditProjectDialog
        isOpen={isEditProjectDialogOpen}
        onClose={() => setIsEditProjectDialogOpen(false)}
      />
      <ProjectDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
      />
      <PreferencesDialog
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
      />
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
      />
      <ExportAllImagesDialog
        open={isExportAllImagesOpen}
        onClose={() => setIsExportAllImagesOpen(false)}
        projectId={project?.id ?? null}
        projectData={project}
      />
      <ExportPDFDialog
        open={isExportPDFOpen}
        onClose={() => setIsExportPDFOpen(false)}
        projectId={project?.id ?? null}
        projectData={project}
      />
      <ExportSmzDialog
        open={isExportSmzOpen}
        onClose={() => setIsExportSmzOpen(false)}
        projectId={project?.id ?? null}
        projectData={project}
      />
      <PushToServerDialog
        open={isPushToServerOpen}
        onClose={() => setIsPushToServerOpen(false)}
        projectId={project?.id ?? null}
        projectData={project}
      />
      <VersionHistoryDialog
        open={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        projectId={project?.id ?? ''}
      />
    </>
  );
}

export default App;
