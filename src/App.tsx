import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { useAppStore, useTemporalStore } from '@/store';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isEditProjectDialogOpen, setIsEditProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);
  const setShowRulers = useAppStore(state => state.setShowRulers);

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

    // Debug: Quick Load Image
    window.api.onQuickLoadImage(async () => {
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
    });

    // Load Sample Project
    window.api.onLoadSampleProject(() => {
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
    });

    // Reset Everything (Clean Test)
    window.api?.onResetEverything(async () => {
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
    });

    // Rebuild All Thumbnails
    window.api?.onRebuildAllThumbnails(async () => {
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
    });

    // Undo menu item
    window.api.onUndo(() => {
      const temporalState = useTemporalStore.getState();
      temporalState.undo();
      console.log('Undo performed');
    });

    // Redo menu item
    window.api.onRedo(() => {
      const temporalState = useTemporalStore.getState();
      temporalState.redo();
      console.log('Redo performed');
    });

    // Theme menu item
    window.api.onThemeChange((theme) => {
      setTheme(theme);
    });

    // View: Toggle Rulers menu item
    window.api.onToggleRulers((checked) => {
      setShowRulers(checked);
    });
  }, [closeProject, setTheme, setShowRulers]);

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
    </>
  );
}

export default App;
