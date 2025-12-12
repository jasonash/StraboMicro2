import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/electron/renderer';
import MainLayout from './components/MainLayout';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { SerializedJsonModal } from './components/dialogs/SerializedJsonModal';
import { PreferencesDialog } from './components/dialogs/PreferencesDialog';
import { LoginDialog } from './components/dialogs/LoginDialog';
import { AboutDialog } from './components/dialogs/AboutDialog';
import { LogViewerModal } from './components/dialogs/LogViewerModal';
import { SendErrorReportModal } from './components/dialogs/SendErrorReportModal';
import { PointCountStatisticsDialog } from './components/dialogs/PointCountStatisticsDialog';
import { ExportAllImagesDialog } from './components/dialogs/ExportAllImagesDialog';
import { ExportPDFDialog } from './components/dialogs/ExportPDFDialog';
import { ExportSmzDialog } from './components/dialogs/ExportSmzDialog';
import { PushToServerDialog } from './components/dialogs/PushToServerDialog';
import { VersionHistoryDialog } from './components/dialogs/VersionHistoryDialog';
import { ImportSmzDialog } from './components/dialogs/ImportSmzDialog';
import { RemoteProjectsDialog } from './components/dialogs/RemoteProjectsDialog';
import { SharedProjectDialog } from './components/dialogs/SharedProjectDialog';
import { CloseProjectDialog } from './components/dialogs/CloseProjectDialog';
import { ProjectPrepDialog } from './components/dialogs/ProjectPrepDialog';
import { GenerateSpotsDialog } from './components/dialogs/GenerateSpotsDialog';
import {
  IncompleteMicrographsDialog,
  findIncompleteMicrographs,
  IncompleteMicrograph,
} from './components/dialogs/IncompleteMicrographsDialog';
import UpdateNotification from './components/UpdateNotification';
import { useAppStore, useTemporalStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from './hooks/useTheme';
import { useAutosave } from './hooks/useAutosave';
import { useProjectPreparation } from './hooks/useProjectPreparation';
import { ProjectMetadata, Spot } from '@/types/project-types';
import './App.css';

/**
 * Generate non-overlapping test spots for performance testing.
 * Uses a grid-based approach to place spots without overlap.
 * Creates a mix of points (33%), lines (33%), and polygons (34%).
 */
function generateTestSpots(count: number, imageWidth: number, imageHeight: number): Spot[] {
  const spots: Spot[] = [];

  // Use a grid to ensure no overlaps
  // Calculate grid dimensions to fit the requested count
  const cols = Math.ceil(Math.sqrt(count * (imageWidth / imageHeight)));
  const rows = Math.ceil(count / cols);

  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  // Leave padding within each cell to prevent edge touching
  const padding = Math.min(cellWidth, cellHeight) * 0.1;

  // Random colors for variety
  const colors = ['#cc3333', '#33cc33', '#3333cc', '#cc33cc', '#33cccc', '#cccc33', '#ff6600', '#0066ff'];

  let spotIndex = 0;
  for (let row = 0; row < rows && spotIndex < count; row++) {
    for (let col = 0; col < cols && spotIndex < count; col++) {
      const cellX = col * cellWidth + padding;
      const cellY = row * cellHeight + padding;
      const availableWidth = cellWidth - 2 * padding;
      const availableHeight = cellHeight - 2 * padding;

      // Decide spot type: 33% point, 33% line, 34% polygon
      const typeRoll = spotIndex % 3;
      const color = colors[spotIndex % colors.length];

      let spot: Spot;

      if (typeRoll === 0) {
        // Point spot - place at center of cell with some randomization
        const x = cellX + availableWidth * (0.3 + Math.random() * 0.4);
        const y = cellY + availableHeight * (0.3 + Math.random() * 0.4);

        spot = {
          id: crypto.randomUUID(),
          name: `Test Point ${spotIndex + 1}`,
          color,
          opacity: 70,
          showLabel: true,
          geometry: {
            type: 'Point' as const,
            coordinates: [x, y],
          },
        };
      } else if (typeRoll === 1) {
        // Line spot - draw a line within the cell
        const numPoints = 2 + Math.floor(Math.random() * 3); // 2-4 points
        const lineCoords: Array<[number, number]> = [];

        for (let i = 0; i < numPoints; i++) {
          const x = cellX + availableWidth * (0.1 + (i / (numPoints - 1)) * 0.8);
          const y = cellY + availableHeight * (0.2 + Math.random() * 0.6);
          lineCoords.push([x, y]);
        }

        spot = {
          id: crypto.randomUUID(),
          name: `Test Line ${spotIndex + 1}`,
          color,
          opacity: 80,
          showLabel: true,
          geometry: {
            type: 'LineString' as const,
            coordinates: lineCoords,
          },
        };
      } else {
        // Polygon spot - create a polygon within the cell
        // Use 4-6 vertices
        const numVertices = 4 + Math.floor(Math.random() * 3);
        const centerX = cellX + availableWidth / 2;
        const centerY = cellY + availableHeight / 2;
        const radiusX = availableWidth * 0.35;
        const radiusY = availableHeight * 0.35;

        const polyCoords: Array<[number, number]> = [];
        for (let i = 0; i < numVertices; i++) {
          const angle = (i / numVertices) * 2 * Math.PI - Math.PI / 2;
          // Add some randomization to make irregular polygons
          const rX = radiusX * (0.7 + Math.random() * 0.3);
          const rY = radiusY * (0.7 + Math.random() * 0.3);
          const x = centerX + Math.cos(angle) * rX;
          const y = centerY + Math.sin(angle) * rY;
          polyCoords.push([x, y]);
        }
        // Close the polygon
        polyCoords.push(polyCoords[0]);

        spot = {
          id: crypto.randomUUID(),
          name: `Test Polygon ${spotIndex + 1}`,
          color,
          opacity: 50,
          showLabel: true,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [polyCoords],
          },
        };
      }

      spots.push(spot);
      spotIndex++;
    }
  }

  return spots;
}

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isEditProjectDialogOpen, setIsEditProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isSerializedJsonModalOpen, setIsSerializedJsonModalOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isExportAllImagesOpen, setIsExportAllImagesOpen] = useState(false);
  const [isExportPDFOpen, setIsExportPDFOpen] = useState(false);
  const [isExportSmzOpen, setIsExportSmzOpen] = useState(false);
  const [isPushToServerOpen, setIsPushToServerOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isIncompleteMicrographsOpen, setIsIncompleteMicrographsOpen] = useState(false);
  const [incompleteMicrographs, setIncompleteMicrographs] = useState<IncompleteMicrograph[]>([]);
  const [incompleteActionName, setIncompleteActionName] = useState('export');
  const [isImportSmzOpen, setIsImportSmzOpen] = useState(false);
  const [importSmzFilePath, setImportSmzFilePath] = useState<string | null>(null);
  const [isRemoteProjectsOpen, setIsRemoteProjectsOpen] = useState(false);
  const [isSharedProjectOpen, setIsSharedProjectOpen] = useState(false);
  const [isCloseProjectOpen, setIsCloseProjectOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSendErrorReportOpen, setIsSendErrorReportOpen] = useState(false);
  const [isPointCountStatisticsOpen, setIsPointCountStatisticsOpen] = useState(false);
  const [isManualUpdateCheck, setIsManualUpdateCheck] = useState(false);
  const generateSpotsDialogOpen = useAppStore(state => state.generateSpotsDialogOpen);
  const generateSpotsTargetMicrographId = useAppStore(state => state.generateSpotsTargetMicrographId);
  const openGenerateSpotsDialog = useAppStore(state => state.openGenerateSpotsDialog);
  const closeGenerateSpotsDialog = useAppStore(state => state.closeGenerateSpotsDialog);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);
  const setShowRulers = useAppStore(state => state.setShowRulers);
  const setShowSpotLabels = useAppStore(state => state.setShowSpotLabels);
  const setShowMicrographOutlines = useAppStore(state => state.setShowMicrographOutlines);
  const setShowRecursiveSpots = useAppStore(state => state.setShowRecursiveSpots);
  const setShowArchivedSpots = useAppStore(state => state.setShowArchivedSpots);
  const activeMicrographId = useAppStore(state => state.activeMicrographId);
  const micrographIndex = useAppStore(state => state.micrographIndex);
  const addSpot = useAppStore(state => state.addSpot);
  const updateMicrographMetadata = useAppStore(state => state.updateMicrographMetadata);
  const { checkAuthStatus, logout, isAuthenticated } = useAuthStore();

  // Initialize theme system
  useTheme();

  // Initialize autosave (5-minute timer when dirty)
  const { manualSave, saveBeforeClose, saveBeforeSwitch } = useAutosave();

  // Initialize project preparation hook (for caching thumbnails on project load)
  const { prepareProject, isPreparingProject, preparationProgress } = useProjectPreparation();

  /**
   * Helper function to load a project with preparation
   * Prepares image cache (thumbnails + medium) before loading into store
   */
  const loadProjectWithPreparation = useCallback(async (
    projectData: ProjectMetadata,
    filePath: string | null,
    options?: { selectFirstMicrograph?: boolean }
  ) => {
    // Prepare images (generates thumbnails/medium for uncached images)
    // This shows a progress dialog if there are uncached images
    await prepareProject(projectData);

    // Load project into store
    useAppStore.getState().loadProject(projectData, filePath);

    // Optionally select the first reference micrograph
    if (options?.selectFirstMicrograph !== false) {
      const datasets = projectData.datasets || [];
      for (const dataset of datasets) {
        for (const sample of dataset.samples || []) {
          const referenceMicrograph = (sample.micrographs || []).find(
            (m) => !m.parentID
          );
          if (referenceMicrograph) {
            setTimeout(() => {
              useAppStore.getState().selectMicrograph(referenceMicrograph.id);
            }, 100);
            return;
          }
        }
      }
    }
  }, [prepareProject]);

  // Check auth status on app startup
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Ref to track if project validation has already run (persists across StrictMode remounts)
  const hasValidatedProject = useRef(false);

  // Validate persisted project on app startup
  // If the project folder was deleted, clear the session and show "No project loaded"
  useEffect(() => {
    const validatePersistedProject = async () => {
      // Guard against StrictMode double-execution
      if (hasValidatedProject.current) return;
      hasValidatedProject.current = true;

      if (!window.api?.validateProjectExists) return;

      const currentProject = useAppStore.getState().project;
      if (!currentProject?.id) return;

      console.log('[App] Validating persisted project:', currentProject.id);
      const result = await window.api.validateProjectExists(currentProject.id);

      if (!result.exists) {
        console.warn('[App] Project folder not found, clearing session:', result.reason);
        // Clear the project from state
        closeProject();
        // Clear persisted session
        await window.api.session.clear();
        // Show user-friendly message
        alert(`The previously opened project could not be found on disk.\n\nReason: ${result.reason}\n\nPlease open or create a new project.`);
      } else {
        console.log('[App] Project folder validated successfully');
      }
    };

    validatePersistedProject();
  }, []); // Run once on mount

  // Update window title and notify main process when project changes
  useEffect(() => {
    if (!window.api) return;

    if (project && project.name) {
      window.api.setWindowTitle(`StraboMicro - ${project.name}`);
      window.api.notifyProjectChanged(project.id);
    } else {
      window.api.setWindowTitle('StraboMicro');
      window.api.notifyProjectChanged(null);
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
    const unsubscribeBeforeClose = window.api?.onBeforeClose(async () => {
      console.log('[App] Received before-close event from main process');
      await saveBeforeClose();
      console.log('[App] Save complete, signaling ready to close');
      window.api?.signalCloseReady();
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

    // Open Project menu item - opens file dialog for .smz files
    unsubscribers.push(window.api.onOpenProject(async () => {
      // Check for unsaved changes first
      const isDirty = useAppStore.getState().isDirty;
      const currentProject = useAppStore.getState().project;

      if (isDirty && currentProject) {
        const shouldContinue = window.confirm(
          'You have unsaved changes. Save before opening a new project?'
        );
        if (shouldContinue) {
          await saveBeforeSwitch();
        }
      }

      setImportSmzFilePath(null); // Clear any previous file path
      setIsImportSmzOpen(true);
    }));

    // File association - open .smz from double-click or command line
    unsubscribers.push(window.api.onOpenSmzFile(async (filePath: string) => {
      console.log('[App] Received file association open request:', filePath);

      // Check for unsaved changes first
      const isDirty = useAppStore.getState().isDirty;
      const currentProject = useAppStore.getState().project;

      if (isDirty && currentProject) {
        const shouldContinue = window.confirm(
          'You have unsaved changes. Save before opening a new project?'
        );
        if (shouldContinue) {
          await saveBeforeSwitch();
        }
      }

      // Set the file path and open the import dialog
      setImportSmzFilePath(filePath);
      setIsImportSmzOpen(true);
    }));

    // Edit Project menu item
    unsubscribers.push(window.api.onEditProject(() => {
      setIsEditProjectDialogOpen(true);
    }));

    // Generate Spots menu item (Edit menu with Cmd+Shift+G)
    unsubscribers.push(window.api.onGenerateSpots(() => {
      if (activeMicrographId) {
        openGenerateSpotsDialog(activeMicrographId);
      } else {
        console.warn('[App] Generate Spots: No micrograph selected');
      }
    }));

    // Clear All Spots menu item (Edit menu)
    unsubscribers.push(window.api.onClearAllSpots(() => {
      const currentMicrographId = useAppStore.getState().activeMicrographId;
      if (!currentMicrographId) {
        alert('No micrograph selected. Please select a micrograph first.');
        return;
      }

      const micrograph = useAppStore.getState().micrographIndex.get(currentMicrographId);
      const spotCount = micrograph?.spots?.length || 0;

      if (spotCount === 0) {
        alert('No spots to clear on this micrograph.');
        return;
      }

      if (!confirm(`Are you sure you want to delete all ${spotCount} spots on this micrograph?\n\nThis action cannot be undone.`)) {
        return;
      }

      useAppStore.getState().clearAllSpots(currentMicrographId);
      console.log(`[App] Cleared ${spotCount} spots from micrograph ${currentMicrographId}`);
    }));

    // Debug: Show Project Structure
    unsubscribers.push(window.api.onShowProjectDebug(() => {
      setIsDebugModalOpen(true);
    }));

    // Debug: Show Serialized JSON
    unsubscribers.push(window.api.onShowSerializedJson(() => {
      setIsSerializedJsonModalOpen(true);
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

    // View: Toggle Overlay Outlines menu item
    unsubscribers.push(window.api.onToggleOverlayOutlines((checked) => {
      setShowMicrographOutlines(checked);
    }));

    // View: Toggle Recursive Spots menu item
    unsubscribers.push(window.api.onToggleRecursiveSpots((checked) => {
      setShowRecursiveSpots(checked);
    }));

    // View: Toggle Archived Spots menu item
    unsubscribers.push(window.api.onToggleArchivedSpots((checked) => {
      setShowArchivedSpots(checked);
    }));

    // View: Point Count Statistics menu item
    unsubscribers.push(window.api.onShowPointCountStatistics(() => {
      setIsPointCountStatisticsOpen(true);
    }));

    // Account: Login menu item
    unsubscribers.push(window.api.onLoginRequest(() => {
      setIsLoginDialogOpen(true);
    }));

    // Account: Logout menu item
    unsubscribers.push(window.api.onLogoutRequest(async () => {
      await logout();
    }));

    // Help: About menu item
    unsubscribers.push(window.api.onShowAbout(() => {
      setIsAboutOpen(true);
    }));

    // Help: View Error Logs menu item
    unsubscribers.push(window.api.onShowLogs(() => {
      setIsLogViewerOpen(true);
    }));

    // Help: Send Error Report menu item
    unsubscribers.push(window.api.onSendErrorReport(() => {
      setIsSendErrorReportOpen(true);
    }));

    // Help: Check for Updates menu item
    unsubscribers.push(window.api.onCheckForUpdates(() => {
      setIsManualUpdateCheck(true);
    }));

    // Debug: Trigger test error in renderer (only wired in development)
    unsubscribers.push(window.api.onDebugTriggerTestError(() => {
      console.log('[Debug] Triggering test error in renderer process...');
      const error = new Error('Test error from renderer process - triggered via Debug menu');
      Sentry.captureException(error);
      console.log('[Debug] Error sent to Sentry');
    }));

    // Debug: Generate 100 test spots on current micrograph
    unsubscribers.push(window.api.onDebugGenerateTestSpots(() => {
      if (!activeMicrographId) {
        alert('No micrograph selected. Please select a micrograph first.');
        return;
      }
      const micrograph = micrographIndex.get(activeMicrographId);
      if (!micrograph) {
        alert('Could not find micrograph data.');
        return;
      }

      const imageWidth = micrograph.imageWidth || micrograph.width || 2000;
      const imageHeight = micrograph.imageHeight || micrograph.height || 2000;

      console.log(`[Debug] Generating 100 test spots on micrograph ${activeMicrographId} (${imageWidth}x${imageHeight})`);

      // Generate 100 non-overlapping spots using a grid-based approach
      const spots = generateTestSpots(100, imageWidth, imageHeight);

      // Add each spot to the micrograph
      for (const spot of spots) {
        addSpot(activeMicrographId, spot);
      }

      console.log(`[Debug] Generated ${spots.length} test spots`);
    }));

    // Debug: Clear all spots on current micrograph
    unsubscribers.push(window.api.onDebugClearAllSpots(() => {
      // Get fresh state from store (don't use stale closure references)
      const currentMicrographId = useAppStore.getState().activeMicrographId;
      const currentProject = useAppStore.getState().project;

      if (!currentMicrographId) {
        alert('No micrograph selected. Please select a micrograph first.');
        return;
      }

      // Find the micrograph directly from project data (micrographIndex may be stale)
      let spotCount = 0;
      if (currentProject) {
        for (const dataset of currentProject.datasets || []) {
          for (const sample of dataset.samples || []) {
            for (const micrograph of sample.micrographs || []) {
              if (micrograph.id === currentMicrographId) {
                spotCount = micrograph.spots?.length || 0;
                break;
              }
            }
          }
        }
      }

      if (spotCount === 0) {
        alert('No spots to clear on this micrograph.');
        return;
      }

      if (!confirm(`Are you sure you want to delete all ${spotCount} spots on this micrograph?`)) {
        return;
      }

      console.log(`[Debug] Clearing ${spotCount} spots from micrograph ${currentMicrographId}`);

      // Clear spots by updating the micrograph with an empty spots array
      updateMicrographMetadata(currentMicrographId, { spots: [] });

      console.log('[Debug] All spots cleared');
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
      // Check for incomplete micrographs before allowing export
      const incomplete = findIncompleteMicrographs(project);
      if (incomplete.length > 0) {
        setIncompleteMicrographs(incomplete);
        setIncompleteActionName('export');
        setIsIncompleteMicrographsOpen(true);
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
      // Check for incomplete micrographs before allowing upload
      const incomplete = findIncompleteMicrographs(project);
      if (incomplete.length > 0) {
        setIncompleteMicrographs(incomplete);
        setIncompleteActionName('upload');
        setIsIncompleteMicrographsOpen(true);
        return;
      }
      setIsPushToServerOpen(true);
    }));

    // File: Open Remote Project menu item
    unsubscribers.push(window.api?.onOpenRemoteProject(async () => {
      // Check for unsaved changes first
      const isDirty = useAppStore.getState().isDirty;
      const currentProject = useAppStore.getState().project;

      if (isDirty && currentProject) {
        const shouldContinue = window.confirm(
          'You have unsaved changes. Save before opening a remote project?'
        );
        if (shouldContinue) {
          await saveBeforeSwitch();
        }
      }

      setIsRemoteProjectsOpen(true);
    }));

    // File: Open Shared Project menu item
    unsubscribers.push(window.api?.onOpenSharedProject(async () => {
      // Check for unsaved changes first
      const isDirty = useAppStore.getState().isDirty;
      const currentProject = useAppStore.getState().project;

      if (isDirty && currentProject) {
        const shouldContinue = window.confirm(
          'You have unsaved changes. Save before opening a shared project?'
        );
        if (shouldContinue) {
          await saveBeforeSwitch();
        }
      }

      setIsSharedProjectOpen(true);
    }));

    // File: Close Project menu item
    unsubscribers.push(window.api?.onCloseProject(() => {
      if (!project) {
        alert('No project loaded.');
        return;
      }
      setIsCloseProjectOpen(true);
    }));

    // File: View Version History menu item
    unsubscribers.push(window.api?.onViewVersionHistory(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsVersionHistoryOpen(true);
    }));

    // File: Switch Project (from Recent Projects menu)
    unsubscribers.push(window.api?.onSwitchProject(async (_event, projectId) => {
      console.log('[App] Switching to project:', projectId);

      // Check for unsaved changes
      const canSwitch = await saveBeforeSwitch();
      if (!canSwitch) {
        console.log('[App] Switch cancelled - save failed');
        return;
      }

      // Close current project
      closeProject();

      // Load the new project
      try {
        const result = await window.api?.projects.load(projectId);
        if (result?.success && result.project) {
          // Load with preparation (prepares image cache before loading into store)
          await loadProjectWithPreparation(result.project, null);
          console.log('[App] Project loaded successfully:', result.project.name);
        } else {
          console.error('[App] Failed to load project:', result?.error);
          alert(`Failed to load project: ${result?.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('[App] Error loading project:', error);
        alert(`Error loading project: ${error}`);
      }
    }));

    // Cleanup: remove all listeners when dependencies change or component unmounts
    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, [closeProject, setTheme, setShowRulers, setShowSpotLabels, setShowMicrographOutlines, logout, project, manualSave, saveBeforeSwitch, loadProjectWithPreparation, activeMicrographId, micrographIndex, addSpot, updateMicrographMetadata, openGenerateSpotsDialog]);

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
      <SerializedJsonModal
        isOpen={isSerializedJsonModalOpen}
        onClose={() => setIsSerializedJsonModalOpen(false)}
      />
      <PreferencesDialog
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
      />
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
      />
      <AboutDialog
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
      <LogViewerModal
        open={isLogViewerOpen}
        onClose={() => setIsLogViewerOpen(false)}
      />
      <SendErrorReportModal
        open={isSendErrorReportOpen}
        onClose={() => setIsSendErrorReportOpen(false)}
        isLoggedIn={isAuthenticated}
        onLoginRequest={() => setIsLoginDialogOpen(true)}
      />
      <PointCountStatisticsDialog
        isOpen={isPointCountStatisticsOpen}
        onClose={() => setIsPointCountStatisticsOpen(false)}
        micrographId={activeMicrographId}
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
      <IncompleteMicrographsDialog
        open={isIncompleteMicrographsOpen}
        onClose={() => setIsIncompleteMicrographsOpen(false)}
        micrographs={incompleteMicrographs}
        actionName={incompleteActionName}
      />
      <VersionHistoryDialog
        open={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        projectId={project?.id ?? ''}
      />
      <ImportSmzDialog
        open={isImportSmzOpen}
        onClose={() => {
          setIsImportSmzOpen(false);
          setImportSmzFilePath(null); // Clear the file path when closing
        }}
        initialFilePath={importSmzFilePath}
        onImportComplete={(importedProject) => {
          // Load the imported project with image preparation
          loadProjectWithPreparation(importedProject, null);
        }}
      />
      <RemoteProjectsDialog
        open={isRemoteProjectsOpen}
        onClose={() => setIsRemoteProjectsOpen(false)}
        onImportComplete={(importedProject: any) => {
          // Load the imported project with image preparation
          loadProjectWithPreparation(importedProject, null);
        }}
      />
      <SharedProjectDialog
        open={isSharedProjectOpen}
        onClose={() => setIsSharedProjectOpen(false)}
        onImportComplete={(importedProject: any) => {
          // Load the imported project with image preparation
          loadProjectWithPreparation(importedProject, null);
        }}
      />
      <CloseProjectDialog
        open={isCloseProjectOpen}
        projectId={project?.id || null}
        projectName={project?.name || null}
        onClose={() => setIsCloseProjectOpen(false)}
        onConfirm={() => {
          // Clear the project from the store after successful deletion
          closeProject();
        }}
      />
      <ProjectPrepDialog
        open={isPreparingProject}
        totalImages={preparationProgress.totalImages}
        completedImages={preparationProgress.completedImages}
        currentImageName={preparationProgress.currentImageName}
        currentTile={preparationProgress.currentTile}
        totalTiles={preparationProgress.totalTiles}
      />
      <UpdateNotification
        manualCheck={isManualUpdateCheck}
        onManualCheckComplete={() => setIsManualUpdateCheck(false)}
      />
      <GenerateSpotsDialog
        isOpen={generateSpotsDialogOpen}
        onClose={closeGenerateSpotsDialog}
        micrographId={generateSpotsTargetMicrographId}
      />
    </>
  );
}

export default App;
