import { useState, useEffect, useCallback, useRef } from 'react';
import { Backdrop, CircularProgress, Typography, Box } from '@mui/material';
import * as Sentry from '@sentry/electron/renderer';
import MainLayout from './components/MainLayout';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { SerializedJsonModal } from './components/dialogs/SerializedJsonModal';
import { PreferencesDialog, getRestServerUrl } from './components/dialogs/PreferencesDialog';
import { LoginDialog } from './components/dialogs/LoginDialog';
import { AboutDialog } from './components/dialogs/AboutDialog';
import { LogViewerModal } from './components/dialogs/LogViewerModal';
import { SendErrorReportModal } from './components/dialogs/SendErrorReportModal';
import { ExportImagesDialog } from './components/dialogs/ExportImagesDialog';
import { RebuildTileCacheDialog } from './components/dialogs/RebuildTileCacheDialog';
import { ExportPDFDialog } from './components/dialogs/ExportPDFDialog';
import { ExportSmzDialog } from './components/dialogs/ExportSmzDialog';
import { TurnOnSyncDialog } from './components/dialogs/TurnOnSyncDialog';
import { VersionHistoryDialog } from './components/dialogs/VersionHistoryDialog';
import { StatisticsPanel } from './components/StatisticsPanel';
import { QuickClassifyToolbar } from './components/QuickClassifyToolbar';
import { ConfigureShortcutsDialog } from './components/dialogs/ConfigureShortcutsDialog';
import { ImportSmzDialog } from './components/dialogs/ImportSmzDialog';
import { DeepLinkOpenDialog } from './components/dialogs/DeepLinkOpenDialog';
import { OpenRemoteProjectDialog } from './components/dialogs/OpenRemoteProjectDialog';
import { SyncLinkPrompt } from './components/dialogs/SyncLinkPrompt';
import { SyncLinkChoiceDialog } from './components/dialogs/SyncLinkChoiceDialog';
import { SharedProjectDialog } from './components/dialogs/SharedProjectDialog';
import { CloseProjectDialog } from './components/dialogs/CloseProjectDialog';
import { ProjectPrepDialog } from './components/dialogs/ProjectPrepDialog';
import { PointCountDialog } from './components/dialogs/PointCountDialog';
import { GrainDetectionDialog } from './components/dialogs/GrainDetectionDialog';
import { ImageComparatorDialog } from './components/dialogs/ImageComparatorDialog';
import { GrainSizeAnalysisDialog } from './components/dialogs/GrainSizeAnalysisDialog';
import { StraboToolsDialog } from './components/dialogs/StraboToolsDialog';
import { MineralColorDialog } from './components/dialogs/MineralColorDialog';
import { QuickEditEntryDialog } from './components/dialogs/QuickEditEntryDialog';
import { QuickApplyPresetsDialog } from './components/dialogs/QuickApplyPresetsDialog';
import { StartupMessageDialog } from './components/dialogs/StartupMessageDialog';
import {
  IncompleteMicrographsDialog,
  findIncompleteMicrographs,
  IncompleteMicrograph,
} from './components/dialogs/IncompleteMicrographsDialog';
import UpdateNotification from './components/UpdateNotification';
import SyncDecisionsNotice from './components/SyncDecisionsNotice';
import SyncDecisionsDialog from './components/dialogs/SyncDecisionsDialog';
import { SyncOpenPrompt } from './components/dialogs/SyncOpenPrompt';
import { CopyOwnerDialog, type CopyOwnerPrompt } from './components/dialogs/CopyOwnerDialog';
import { SyncIntroDialog, type SyncIntroProject } from './components/dialogs/SyncIntroDialog';
import { CollaboratorsDialog } from './components/dialogs/CollaboratorsDialog';
import { InvitationsDialog } from './components/dialogs/InvitationsDialog';
import { useInvitationsStore, INVITES_RECHECK_MS } from '@/store/useInvitationsStore';
import { SyncIntroNotice } from './components/SyncIntroNotice';
import { useAppStore, undo, redo, setUndoBlockedHandler } from '@/store';
import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { syncNowFromUser, requestFirstSync, TURN_ON_SYNC_EVENT, COLLABORATE_EVENT } from '@/services/syncActions';
import { beginLinking, LINK_SYNC_EVENT, type LinkRequest } from '@/services/syncLinking';
import { useSyncStore } from '@/store/useSyncStore';
import { useTheme } from './hooks/useTheme';
import { useAutosave } from './hooks/useAutosave';
import { useProjectSync } from './hooks/useProjectSync';
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
  const [isExportImagesOpen, setIsExportImagesOpen] = useState(false);
  const [isRebuildTileCacheOpen, setIsRebuildTileCacheOpen] = useState(false);
  const [isExportPDFOpen, setIsExportPDFOpen] = useState(false);
  const [isExportSmzOpen, setIsExportSmzOpen] = useState(false);
  const [isTurnOnSyncOpen, setIsTurnOnSyncOpen] = useState(false);
  const [isCollaboratorsOpen, setIsCollaboratorsOpen] = useState(false);
  // Collaborate... on a local-only project turns sync on first (17d), then opens Collaborators
  const collaborateAfterTurnOn = useRef(false);

  // Another account's copy (16at opening it, 16ax it is open)
  const [ownerPrompt, setOwnerPrompt] = useState<CopyOwnerPrompt | null>(null);
  // "What's new: sync" (16aq): the projects it offers, null = not showing
  const [introProjects, setIntroProjects] = useState<SyncIntroProject[] | null>(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isIncompleteMicrographsOpen, setIsIncompleteMicrographsOpen] = useState(false);
  const [incompleteMicrographs, setIncompleteMicrographs] = useState<IncompleteMicrograph[]>([]);
  const [incompleteActionName, setIncompleteActionName] = useState('export');
  const [isImportSmzOpen, setIsImportSmzOpen] = useState(false);
  const [importSmzFilePath, setImportSmzFilePath] = useState<string | null>(null);
  const [deepLinkPkey, setDeepLinkPkey] = useState<string | null>(null);
  const [isRemoteProjectsOpen, setIsRemoteProjectsOpen] = useState(false);
  const [isSharedProjectOpen, setIsSharedProjectOpen] = useState(false);
  const [isCloseProjectOpen, setIsCloseProjectOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSendErrorReportOpen, setIsSendErrorReportOpen] = useState(false);
  const [isManualUpdateCheck, setIsManualUpdateCheck] = useState(false);
  const [isConfigureShortcutsOpen, setIsConfigureShortcutsOpen] = useState(false);
  const [isPointCountDialogOpen, setIsPointCountDialogOpen] = useState(false);
  const [isGrainDetectionDialogOpen, setIsGrainDetectionDialogOpen] = useState(false);
  const [isImageComparatorDialogOpen, setIsImageComparatorDialogOpen] = useState(false);
  const [isGrainSizeAnalysisDialogOpen, setIsGrainSizeAnalysisDialogOpen] = useState(false);
  const [isStraboToolsDialogOpen, setIsStraboToolsDialogOpen] = useState(false);
  const [straboToolsInitialMicrographId, setStraboToolsInitialMicrographId] = useState<string | null>(null);
  const [isQuickEditEntryDialogOpen, setIsQuickEditEntryDialogOpen] = useState(false);
  const [isQuickApplyPresetsDialogOpen, setIsQuickApplyPresetsDialogOpen] = useState(false);
  const [isMineralColorDialogOpen, setIsMineralColorDialogOpen] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProjectName, setLoadingProjectName] = useState('');
  const [isStartupMessageOpen, setIsStartupMessageOpen] = useState(false);
  const [startupMessage, setStartupMessage] = useState('');
  const [startupMessageUuid, setStartupMessageUuid] = useState('');
  const setSplitModeSpotId = useAppStore(state => state.setSplitModeSpotId);
  const closeProject = useAppStore(state => state.closeProject);
  const setStartupValidationComplete = useAppStore(state => state.setStartupValidationComplete);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);
  const setShowRulers = useAppStore(state => state.setShowRulers);
  const setSpotLabelMode = useAppStore(state => state.setSpotLabelMode);
  const setShowMicrographOutlines = useAppStore(state => state.setShowMicrographOutlines);
  const setShowRecursiveSpots = useAppStore(state => state.setShowRecursiveSpots);
  const setShowArchivedSpots = useAppStore(state => state.setShowArchivedSpots);
  const setQuickClassifyVisible = useAppStore(state => state.setQuickClassifyVisible);
  const setStatisticsPanelVisible = useAppStore(state => state.setStatisticsPanelVisible);
  const activeMicrographId = useAppStore(state => state.activeMicrographId);
  const micrographIndex = useAppStore(state => state.micrographIndex);
  const addSpot = useAppStore(state => state.addSpot);
  const updateMicrographMetadata = useAppStore(state => state.updateMicrographMetadata);
  const { checkAuthStatus, logout, user, loginPromptActive, loginPromptMessage, dismissLoginPrompt } = useAuthStore();

  // Initialize theme system
  useTheme();

  // Initialize autosave (5-minute timer when dirty)
  const { manualSave, ensureSaved, saveBeforeClose, saveBeforeSwitch } = useAutosave();

  // Push changes of a synced project (does nothing for local-only projects)
  useProjectSync();

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

  /**
   * Close the open project (saving it first) and open this one from disk.
   * Used by Open Remote Project; the Recent Projects menu does the same.
   */
  const openProjectById = useCallback(async (projectId: string) => {
    // Another account's copy does not open (16at); asked before the open project closes
    const check = await window.api?.projects.copyOwner(projectId, true);
    if (check?.owner) {
      const name = (await window.api?.projects.getAll())?.find((p) => p.id === projectId)?.name ?? null;
      setOwnerPrompt({ mode: 'open', projectId, projectName: name, owner: check.owner, ownCopy: false });
      return;
    }
    if (!(await saveBeforeSwitch())) return;
    closeProject();
    setLoadingProjectName('');
    setIsLoadingProject(true);
    try {
      const result = await window.api?.projects.load(projectId);
      if (result?.success && result.project) {
        setLoadingProjectName(result.project.name || '');
        await loadProjectWithPreparation(result.project, null);
      } else {
        alert(`Failed to load project: ${result?.error || 'Unknown error'}`);
      }
    } finally {
      setIsLoadingProject(false);
    }
  }, [saveBeforeSwitch, closeProject, loadProjectWithPreparation]);

  // Check auth status on app startup
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Fetch startup message from StraboSpot on mount
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`https://strabospot.org/micromessage.json?_=${Date.now()}`, { signal: controller.signal })
      .then(res => res.json())
      .then((data: { uuid?: string; message?: string }) => {
        clearTimeout(timeout);
        if (data.uuid && data.message && data.message.trim().length > 0) {
          const dismissedUuid = localStorage.getItem('startup-message:dismissed-uuid');
          if (dismissedUuid !== data.uuid) {
            setStartupMessage(data.message);
            setStartupMessageUuid(data.uuid);
            setIsStartupMessageOpen(true);
          }
        }
      })
      .catch(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // Ref to track if project validation has already run (persists across StrictMode remounts)
  const hasValidatedProject = useRef(false);

  // Validate persisted project on app startup
  // If the project folder was deleted, clear the session and show "No project loaded"
  useEffect(() => {
    const validatePersistedProject = async () => {
      // Guard against StrictMode double-execution
      if (hasValidatedProject.current) return;
      hasValidatedProject.current = true;

      try {
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
          // Fire-and-forget: clean up orphaned associated files on disk
          window.api.cleanupOrphanedAssociatedFiles(currentProject.id, currentProject).catch((error) => {
            console.error('[App] Failed to clean up orphaned associated files:', error);
          });
        }
      } catch (error) {
        console.error('[App] Error validating persisted project:', error);
      } finally {
        // Validation has settled (project valid, cleared, or nothing to check) —
        // unblock the Viewer's initial image load. This prevents the load from
        // racing a session-clear for a deleted project and logging a (harmless,
        // but Sentry-reported) ENOENT. See fix/gate-viewer-load-on-validation.
        setStartupValidationComplete(true);
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
    unsubscribers.push(window.api.onNewProject(async () => {
      // A dirty project must be saved (or the switch aborted) before the new
      // project replaces it — a never-saved project only enters Recent Projects
      // on its first save, so skipping this loses it entirely.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
      }
      setIsNewProjectDialogOpen(true);
    }));

    // Open Project menu item - opens file dialog for .smz files
    unsubscribers.push(window.api.onOpenProject(async () => {
      // saveBeforeSwitch prompts if dirty: OK saves, Cancel aborts the switch.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
      }

      setImportSmzFilePath(null); // Clear any previous file path
      setIsImportSmzOpen(true);
    }));

    // File association - open .smz from double-click or command line
    unsubscribers.push(window.api.onOpenSmzFile(async (filePath: string) => {
      console.log('[App] Received file association open request:', filePath);

      // saveBeforeSwitch prompts if dirty: OK saves, Cancel aborts the switch.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
      }

      // Set the file path and open the import dialog
      setImportSmzFilePath(filePath);
      setIsImportSmzOpen(true);
    }));

    // Deep link - "Open in StraboMicro" web link (strabomicro://open?p=<pkey>)
    unsubscribers.push(window.api.deepLink.onOpenProject(async (pkey: string) => {
      console.log('[App] Received deep link open request, pkey:', pkey);

      // saveBeforeSwitch prompts if dirty: OK saves, Cancel aborts the switch.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
      }

      // Ignore new links while a deep link dialog is already in flight; the
      // dialog's resolved name/size must stay consistent with its pkey.
      setDeepLinkPkey((prev) => prev ?? pkey);
    }));

    // Edit Project menu item
    unsubscribers.push(window.api.onEditProject(() => {
      setIsEditProjectDialogOpen(true);
    }));

    // Point Count menu item (Tools menu with Cmd+Shift+P)
    unsubscribers.push(window.api.onPointCount(() => {
      if (activeMicrographId) {
        setIsPointCountDialogOpen(true);
      } else {
        console.warn('[App] Point Count: No micrograph selected');
      }
    }));

    // Grain Detection menu item (Tools menu with Cmd+Shift+G)
    unsubscribers.push(window.api.onGrainDetection(() => {
      if (activeMicrographId) {
        setIsGrainDetectionDialogOpen(true);
      } else {
        console.warn('[App] Grain Detection: No micrograph selected');
      }
    }));

    // Image Comparator menu item (Tools menu)
    unsubscribers.push(window.api.onImageComparator(() => {
      setIsImageComparatorDialogOpen(true);
    }));

    // Grain Size Analysis menu item (Tools menu)
    unsubscribers.push(window.api.onGrainSizeAnalysis(() => {
      setIsGrainSizeAnalysisDialogOpen(true);
    }));

    // StraboTools menu item (Tools menu)
    unsubscribers.push(window.api.onStraboTools(() => {
      setStraboToolsInitialMicrographId(null);
      setIsStraboToolsDialogOpen(true);
    }));

    // Grain Size Analysis from PropertiesPanel summary
    const handleOpenGrainAnalysis = () => setIsGrainSizeAnalysisDialogOpen(true);
    window.addEventListener('open-grain-size-analysis', handleOpenGrainAnalysis);
    unsubscribers.push(() => window.removeEventListener('open-grain-size-analysis', handleOpenGrainAnalysis));

    // StraboTools from ProjectTree context menu
    const handleOpenStraboTools = (e: Event) => {
      const micrographId = (e as CustomEvent<string>).detail;
      setStraboToolsInitialMicrographId(micrographId || null);
      setIsStraboToolsDialogOpen(true);
    };
    window.addEventListener('open-strabo-tools', handleOpenStraboTools);
    unsubscribers.push(() => window.removeEventListener('open-strabo-tools', handleOpenStraboTools));

    // Configure Mineral Colors menu item (Tools menu)
    if (window.api.onConfigureMineralColors) {
      unsubscribers.push(window.api.onConfigureMineralColors(() => {
        setIsMineralColorDialogOpen(true);
      }));
    }

    // Spot Color Mode toggle (View menu)
    if (window.api.onSpotColorMode) {
      unsubscribers.push(window.api.onSpotColorMode((mode) => {
        console.log('[App] Spot color mode changed to:', mode);
        useAppStore.getState().setSpotColorMode(mode);
        window.api?.notifyViewPrefsChanged({ spotColorMode: mode });
      }));
    }

    // Clear All Spots menu item (Edit menu)
    unsubscribers.push(window.api.onClearAllSpots(() => {
      const currentMicrographId = useAppStore.getState().activeMicrographId;
      if (!currentMicrographId) {
        alert('No micrograph selected. Please select a micrograph first.');
        return;
      }

      // If viewing a secondary sibling (XPL), resolve to the primary (PPL) where spots are stored
      const currentMicro = useAppStore.getState().micrographIndex.get(currentMicrographId);
      const targetId = currentMicro?.isPrimarySibling === false && currentMicro?.siblingImageId
        ? currentMicro.siblingImageId
        : currentMicrographId;

      const targetMicro = useAppStore.getState().micrographIndex.get(targetId);
      const spotCount = targetMicro?.spots?.length || 0;

      if (spotCount === 0) {
        alert('No spots to clear on this micrograph.');
        return;
      }

      if (!confirm(`Are you sure you want to delete all ${spotCount} spots on this micrograph?`)) {
        return;
      }

      useAppStore.getState().clearAllSpots(targetId);
      console.log(`[App] Cleared ${spotCount} spots from micrograph ${targetId}`);
    }));

    // Quick Edit Spots menu item (Edit menu, Cmd+Shift+Q)
    unsubscribers.push(window.api.onQuickEditSpots(() => {
      const state = useAppStore.getState();
      if (!state.activeMicrographId) {
        alert('Please select a micrograph first.');
        return;
      }
      // If viewing a secondary sibling (XPL), resolve to the primary (PPL) where spots are stored
      const currentMicro = state.micrographIndex.get(state.activeMicrographId);
      const resolvedId = currentMicro?.isPrimarySibling === false && currentMicro?.siblingImageId
        ? currentMicro.siblingImageId
        : state.activeMicrographId;
      const micrograph = state.micrographIndex.get(resolvedId);
      if (!micrograph?.spots || micrograph.spots.length === 0) {
        alert('No spots on this micrograph.\n\nDraw some spots or use "Detect Grains" first.');
        return;
      }
      // Show entry dialog to configure filter/sort options
      setIsQuickEditEntryDialogOpen(true);
    }));

    // Batch Edit Spots menu item (Edit menu, Cmd+Shift+E)
    unsubscribers.push(window.api.onBatchEditSpots(() => {
      const selectedCount = useAppStore.getState().selectedSpotIds.length;
      if (selectedCount < 2) {
        alert('Please select 2 or more spots first.\n\nTip: Use Cmd+Click to select multiple spots, or Shift+Drag to lasso select.');
        return;
      }
      useAppStore.getState().setBatchEditDialogOpen(true);
    }));

    // Quick Spot Presets menu item (Tools menu)
    unsubscribers.push(window.api.onQuickApplyPresets(() => {
      setIsQuickApplyPresetsDialogOpen(true);
    }));

    // Merge Selected Spots menu item (Edit menu, Cmd+M)
    unsubscribers.push(window.api.onMergeSpots(() => {
      const state = useAppStore.getState();
      const selectedIds = state.selectedSpotIds;
      const activeSpotId = state.activeSpotId;

      // Include activeSpotId in selection if not already
      const allSelectedIds = activeSpotId && !selectedIds.includes(activeSpotId)
        ? [...selectedIds, activeSpotId]
        : selectedIds;

      if (allSelectedIds.length < 2) {
        alert('Please select 2 or more polygon spots to merge.\n\nTip: Use Cmd+Click to select multiple spots.');
        return;
      }

      // Check if all selected spots are polygons
      const polygonCount = allSelectedIds.filter(id => {
        const spot = state.spotIndex.get(id);
        return spot && (spot.points?.length ?? 0) >= 3;
      }).length;

      if (polygonCount < 2) {
        alert('Merge requires at least 2 polygon spots.\n\nPoints and lines cannot be merged.');
        return;
      }

      const result = state.mergeSpots(allSelectedIds);
      if (result) {
        console.log(`[App] Merged ${allSelectedIds.length} spots into ${result}`);
      } else {
        alert('Failed to merge spots. Make sure the selected spots are valid polygons.');
      }
    }));

    // Split Spot with Line menu item (Edit menu, Cmd+/)
    unsubscribers.push(window.api.onSplitSpot(() => {
      const state = useAppStore.getState();
      const activeSpotId = state.activeSpotId;

      if (!activeSpotId) {
        alert('Please select a polygon spot to split.');
        return;
      }

      const spot = state.spotIndex.get(activeSpotId);
      if (!spot || (spot.points?.length ?? 0) < 3) {
        alert('Only polygon spots can be split.\n\nSelect a polygon spot first.');
        return;
      }

      // Activate split line drawing mode
      setSplitModeSpotId(activeSpotId);
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
    setUndoBlockedHandler((message) => alert(message));
    unsubscribers.push(window.api.onUndo(() => {
      void undo();
    }));

    // Redo menu item
    unsubscribers.push(window.api.onRedo(() => {
      void redo();
    }));

    // Theme menu item
    unsubscribers.push(window.api.onThemeChange((theme) => {
      setTheme(theme);
    }));

    // View: Toggle Rulers menu item
    unsubscribers.push(window.api.onToggleRulers((checked) => {
      setShowRulers(checked);
      window.api?.notifyViewPrefsChanged({ showRulers: checked });
    }));

    // View: Spot Label Mode menu item
    unsubscribers.push(window.api.onSpotLabelMode((mode) => {
      setSpotLabelMode(mode);
      window.api?.notifyViewPrefsChanged({ spotLabelMode: mode });
    }));

    // View: Toggle Overlay Outlines menu item
    unsubscribers.push(window.api.onToggleOverlayOutlines((checked) => {
      setShowMicrographOutlines(checked);
      window.api?.notifyViewPrefsChanged({ showOverlayOutlines: checked });
    }));

    // View: Toggle Recursive Spots menu item
    unsubscribers.push(window.api.onToggleRecursiveSpots((checked) => {
      setShowRecursiveSpots(checked);
      window.api?.notifyViewPrefsChanged({ showRecursiveSpots: checked });
    }));

    // View: Toggle Archived Spots menu item
    unsubscribers.push(window.api.onToggleArchivedSpots((checked) => {
      setShowArchivedSpots(checked);
    }));

    // View: Point Count Statistics menu item - toggle the panel
    unsubscribers.push(window.api.onShowPointCountStatistics(() => {
      const currentVisible = useAppStore.getState().statisticsPanelVisible;
      setStatisticsPanelVisible(!currentVisible);
    }));

    // View: Toggle Quick Classify Toolbar menu item
    unsubscribers.push(window.api.onToggleQuickClassify(() => {
      // Get current state at time of callback to avoid stale closure
      const currentVisible = useAppStore.getState().quickClassifyVisible;
      setQuickClassifyVisible(!currentVisible);
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

    // File: Export Images menu item
    unsubscribers.push(window.api.onExportImages(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      setIsExportImagesOpen(true);
    }));

    // Tools: Rebuild Tile Cache menu item
    if (window.api.onRebuildTileCache) {
      unsubscribers.push(window.api.onRebuildTileCache(() => {
        if (!project) {
          alert('No project loaded. Please load a project first.');
          return;
        }
        setIsRebuildTileCacheOpen(true);
      }));
    }

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

    // File: Upload to Strabo Server... (local only) / Sync to Strabo Server... (synced: Sync Now, spec v3 16ai)
    unsubscribers.push(window.api?.onPushToServer(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      if (useSyncStore.getState().synced) {
        void syncNowFromUser();
        return;
      }
      collaborateAfterTurnOn.current = false;
      setIsTurnOnSyncOpen(true);
    }));

    // File: Collaborate... (17a, 17d)
    unsubscribers.push(window.api?.onCollaborate(() => {
      if (!project) {
        alert('No project loaded. Please load a project first.');
        return;
      }
      window.dispatchEvent(new CustomEvent(COLLABORATE_EVENT));
    }));

    // File: Open Remote Project menu item
    unsubscribers.push(window.api?.onOpenRemoteProject(async () => {
      // saveBeforeSwitch prompts if dirty: OK saves, Cancel aborts the switch.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
      }

      setIsRemoteProjectsOpen(true);
    }));

    // File: Open Shared Project menu item
    unsubscribers.push(window.api?.onOpenSharedProject(async () => {
      // saveBeforeSwitch prompts if dirty: OK saves, Cancel aborts the switch.
      const proceed = await saveBeforeSwitch();
      if (!proceed) {
        return;
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
    unsubscribers.push(window.api?.onSwitchProject((_event, projectId) => {
      console.log('[App] Switching to project:', projectId);
      void openProjectById(projectId);
    }));

    // Cleanup: remove all listeners when dependencies change or component unmounts
    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, [closeProject, setTheme, setShowRulers, setSpotLabelMode, setShowMicrographOutlines, logout, project, manualSave, saveBeforeSwitch, loadProjectWithPreparation, activeMicrographId, micrographIndex, addSpot, updateMicrographMetadata, openProjectById]);

  // The open copy belongs to another account (16ax): checked when a project
  // opens and after every login change main has recorded (a login, or the
  // startup check after a restored session)
  const openProjectId = useAppStore((state) => state.project?.id ?? null);
  const ownerLoginRunning = useRef(false);
  const checkOpenCopyOwner = useCallback(async () => {
    if (ownerLoginRunning.current) return;
    const current = useAppStore.getState().project;
    if (!current?.id || !window.api) {
      setOwnerPrompt((p) => (p?.mode === 'opened' ? null : p));
      return;
    }
    const r = await window.api.projects.copyOwner(current.id);
    if (useAppStore.getState().project?.id !== current.id) return;
    setOwnerPrompt((p) => {
      if (p?.mode === 'open') return p;
      return r.owner
        ? { mode: 'opened', projectId: current.id, projectName: current.name ?? null, owner: r.owner, ownCopy: r.ownCopy }
        : null;
    });
  }, []);
  useEffect(() => {
    void checkOpenCopyOwner();
  }, [openProjectId, checkOpenCopyOwner]);
  useEffect(() => window.api?.projects.onAccountsChanged(() => void checkOpenCopyOwner()), [checkOpenCopyOwner]);

  const logInAsCopyOwner = useCallback(async (p: CopyOwnerPrompt) => {
    setOwnerPrompt(null);
    ownerLoginRunning.current = true;
    let ok = false;
    try {
      if (useAuthStore.getState().isAuthenticated) await logout();
      const who = p.owner.email || p.owner.name || 'the owner of this copy';
      ok = await promptLogin(`Log in as ${who} to use this copy.`);
    } finally {
      ownerLoginRunning.current = false;
    }
    if (ok && p.mode === 'open') await openProjectById(p.projectId);
    else void checkOpenCopyOwner();
  }, [logout, openProjectById, checkOpenCopyOwner]);

  const dismissCopyOwner = useCallback(async (p: CopyOwnerPrompt) => {
    setOwnerPrompt(null);
    if (p.mode !== 'opened') return;
    if (!(await saveBeforeSwitch())) return;
    closeProject();
  }, [saveBeforeSwitch, closeProject]);

  // Turn sync on for the open project (the turn-on dialog's Start Syncing,
  // 16aj). The folder moves, so the project is saved and unloaded first,
  // then opened again from its new folder; the first upload starts when its
  // sync starts, in either mode, and shows on the chip.
  const turnOnSync = useCallback(async (mode: SyncMode) => {
    const api = window.api;
    const current = useAppStore.getState().project;
    if (!api || !current) return false;
    const saved = await ensureSaved();
    if (!saved.success) {
      alert(`The project could not be saved, so sync was not turned on.\n\n${saved.error ?? 'Unknown error'}`);
      return false;
    }
    closeProject();
    setLoadingProjectName(current.name || '');
    setIsLoadingProject(true);
    try {
      const result = await api.sync.turnOn(current.id, getRestServerUrl(), mode);
      if (result.ok) requestFirstSync(current.id);
      const loaded = await api.projects.load(current.id);
      if (loaded?.success && loaded.project) {
        await loadProjectWithPreparation(loaded.project, null);
      } else {
        alert(`Failed to load project: ${loaded?.error || 'Unknown error'}`);
      }
      if (!result.ok) alert(`Sync could not be turned on. The project stays on this computer only.\n\n${result.message}`);
      return result.ok && Boolean(loaded?.success);
    } finally {
      setIsLoadingProject(false);
    }
  }, [ensureSaved, closeProject, loadProjectWithPreparation]);

  // "What's new: sync" (16aq, 16ba): once per computer, when logged in (at
  // the first launch after the update, else at the first login after it).
  // Nothing to offer marks it shown; a failure (offline, sync switched off
  // on the server) leaves it for the next launch or login
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authPkey = useAuthStore((state) => state.user?.pkey ?? null);
  const startupValidationComplete = useAppStore((state) => state.startupValidationComplete);
  const introCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    const api = window.api;
    if (!api || !isAuthenticated || !authPkey || !startupValidationComplete) return;
    if (introCheckedFor.current === String(authPkey)) return;
    introCheckedFor.current = String(authPkey);
    void (async () => {
      const state = await api.sync.introStatus().catch(() => null);
      if (!state || state.shown) return;
      const r = await api.sync.introCandidates(getRestServerUrl()).catch(() => null);
      if (!r || !r.ok) {
        console.log('[App] Sync intro waits:', r && !r.ok ? r.message : 'no answer');
        return;
      }
      if (r.projects.length === 0) {
        await api.sync.introShown();
        return;
      }
      setIntroProjects(r.projects);
    })();
  }, [isAuthenticated, authPkey, startupValidationComplete]);

  const syncIntroSelected = useCallback(async (projectIds: string[], mode: SyncMode) => {
    const api = window.api;
    setIntroProjects(null);
    if (!api) return;
    await api.sync.introShown();
    const openId = useAppStore.getState().project?.id ?? null;
    const closed = projectIds.filter((id) => id !== openId);
    if (closed.length > 0) {
      const r = await api.sync.introEnqueue(closed, mode, getRestServerUrl());
      if (!r.ok) alert(`The projects could not be queued for syncing.\n\n${r.message}`);
    }
    // The open project goes through the normal turn-on path (its chip shows the upload)
    if (openId && projectIds.includes(openId)) await turnOnSync(mode);
  }, [turnOnSync]);

  const syncIntroNotNow = useCallback(() => {
    setIntroProjects(null);
    void window.api?.sync.introShown();
  }, []);

  // The intro waits while another dialog that appears at startup is up
  const linkOffer = useSyncStore((state) => state.linkOffer);
  const linkChoice = useSyncStore((state) => state.linkChoice);
  const syncOpenPrompt = useSyncStore((state) => state.openPrompt);
  const introBlocked = isStartupMessageOpen || ownerPrompt !== null || loginPromptActive || isLoadingProject ||
    linkOffer !== null || linkChoice !== null || syncOpenPrompt !== null;

  // Link the open local-only project to the same project on StraboSpot
  // (16an, 16am): saved and unloaded first (the folder moves), linked, the
  // first sync pushes my differences (or an adopted project's first upload),
  // then opened again
  const linkSync = useCallback(async ({ projectId, pid, mode, use }: LinkRequest) => {
    const api = window.api;
    const current = useAppStore.getState().project;
    if (!api || !current || current.id !== projectId) return;
    const saved = await manualSave();
    if (!saved.success) {
      alert(`The project could not be saved, so it was not connected to StraboSpot.\n\n${saved.error ?? 'Unknown error'}`);
      return;
    }
    closeProject();
    setLoadingProjectName(current.name || '');
    setIsLoadingProject(true);
    try {
      const result = await api.sync.link(projectId, getRestServerUrl(), pid, mode, use);
      if (result.ok) requestFirstSync(projectId);
      const loaded = await api.projects.load(projectId);
      if (loaded?.success && loaded.project) {
        await loadProjectWithPreparation(loaded.project, null);
      } else {
        alert(`Failed to load project: ${loaded?.error || 'Unknown error'}`);
      }
      if (!result.ok) alert(`This copy could not be connected to StraboSpot. It stays on this computer only.\n\n${result.message}`);
    } finally {
      setIsLoadingProject(false);
    }
  }, [manualSave, closeProject, loadProjectWithPreparation]);

  useEffect(() => {
    const onLink = (e: Event) => {
      if (e instanceof CustomEvent) void linkSync(e.detail as LinkRequest);
    };
    window.addEventListener(LINK_SYNC_EVENT, onLink);
    return () => window.removeEventListener(LINK_SYNC_EVENT, onLink);
  }, [linkSync]);

  // The chip's "Sync this project…" opens the turn-on dialog
  useEffect(() => {
    const open = () => {
      collaborateAfterTurnOn.current = false;
      setIsTurnOnSyncOpen(true);
    };
    window.addEventListener(TURN_ON_SYNC_EVENT, open);
    return () => window.removeEventListener(TURN_ON_SYNC_EVENT, open);
  }, []);

  // Collaborate... (menu, chip): a synced project opens Collaborators; a
  // local-only one turns sync on first, then continues there (17d)
  useEffect(() => {
    const open = () => {
      if (!useAppStore.getState().project) return;
      if (useSyncStore.getState().synced) {
        setIsCollaboratorsOpen(true);
        return;
      }
      collaborateAfterTurnOn.current = true;
      setIsTurnOnSyncOpen(true);
    };
    window.addEventListener(COLLABORATE_EVENT, open);
    return () => window.removeEventListener(COLLABORATE_EVENT, open);
  }, []);

  // Invitations waiting for this account (17f): the dialog at launch and
  // after each login, once the startup dialogs and the sync intro are done;
  // then every 30 minutes and on window focus, the header indicator only
  const invitesCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!window.api || !isAuthenticated || !authPkey || !startupValidationComplete) return;
    if (introProjects !== null || introBlocked) return;
    if (invitesCheckedFor.current === String(authPkey)) return;
    invitesCheckedFor.current = String(authPkey);
    void useInvitationsStore.getState().refresh(true);
  }, [isAuthenticated, authPkey, startupValidationComplete, introProjects, introBlocked]);
  useEffect(() => {
    if (isAuthenticated) return;
    invitesCheckedFor.current = null;
    useInvitationsStore.getState().clear();
  }, [isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const recheck = () => {
      if (Date.now() - useInvitationsStore.getState().lastCheckedAt >= INVITES_RECHECK_MS) {
        void useInvitationsStore.getState().refresh(false);
      }
    };
    const timer = setInterval(recheck, INVITES_RECHECK_MS);
    window.addEventListener('focus', recheck);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', recheck);
    };
  }, [isAuthenticated]);
  const invitationsOpen = useInvitationsStore((s) => s.dialogOpen);
  const invitations = useInvitationsStore((s) => s.invitations);

  // Debug > Sync: Download Synced Project (until Open Remote Project does
  // it, step 8 stage 4) and Debug > Sync Test
  useEffect(() => {
    if (!window.api?.onDebugSync) return;

    // Make a synced copy of a server project here, then open it
    const cloneFromServer = async (text: string | undefined) => {
      const api = window.api;
      const pid = Number((text ?? '').trim());
      if (!api || !Number.isInteger(pid) || pid <= 0) {
        alert('Copy a server project number (shown in the sync chip\'s popover in the other copy) first.');
        return;
      }
      if (!useAuthStore.getState().isAuthenticated) {
        alert('Log in first.');
        return;
      }
      setLoadingProjectName(`server project ${pid}`);
      setIsLoadingProject(true);
      try {
        const result = await api.sync.clone(pid, getRestServerUrl(), 'automatic');
        if (!result.ok) {
          alert(`The synced project could not be downloaded (${result.kind}): ${result.message}`);
          return;
        }
        if (useAppStore.getState().project) {
          const saved = await manualSave();
          if (!saved.success) {
            alert(`The open project could not be saved: ${saved.error ?? 'unknown error'}`);
            return;
          }
          closeProject();
        }
        const loaded = await api.projects.load(result.projectId);
        if (loaded?.success && loaded.project) {
          await loadProjectWithPreparation(loaded.project, null);
        } else {
          alert(`Failed to load project: ${loaded?.error || 'Unknown error'}`);
        }
      } finally {
        setIsLoadingProject(false);
      }
    };

    return window.api.onDebugSync((action, arg) => {
      void (async () => {
        if (action === 'clone') {
          await cloneFromServer(arg);
        } else if (action.startsWith('test-')) {
          const { runSyncTestScenario } = await import('@/services/syncTestScenarios');
          await runSyncTestScenario(action);
        }
      })();
    });
  }, [closeProject, manualSave, loadProjectWithPreparation]);

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
        isOpen={isLoginDialogOpen || loginPromptActive}
        onClose={() => {
          setIsLoginDialogOpen(false);
          if (loginPromptActive) {
            dismissLoginPrompt();
          }
        }}
        message={loginPromptActive ? loginPromptMessage : undefined}
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
        userEmail={user?.email}
      />
      <ExportImagesDialog
        open={isExportImagesOpen}
        onClose={() => setIsExportImagesOpen(false)}
        mode={{ kind: 'batch' }}
      />
      <RebuildTileCacheDialog
        open={isRebuildTileCacheOpen}
        onClose={() => setIsRebuildTileCacheOpen(false)}
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
      <TurnOnSyncDialog
        open={isTurnOnSyncOpen}
        projectId={project?.id ?? null}
        saveProject={ensureSaved}
        onClose={() => setIsTurnOnSyncOpen(false)}
        onStart={(mode, onServer) => {
          const id = useAppStore.getState().project?.id;
          const thenCollaborate = collaborateAfterTurnOn.current;
          collaborateAfterTurnOn.current = false;
          if (onServer && id) {
            void beginLinking({ projectId: id, pid: onServer.pid, syncFormat: onServer.syncFormat, updatedAt: onServer.updatedAt }, mode);
          } else {
            void turnOnSync(mode).then((ok) => {
              if (ok && thenCollaborate) setIsCollaboratorsOpen(true);
            });
          }
        }}
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
        onOpenProject={openProjectById}
        onImportComplete={(importedProject) => {
          // Load the imported project with image preparation
          loadProjectWithPreparation(importedProject, null);
        }}
      />
      <OpenRemoteProjectDialog
        open={isRemoteProjectsOpen}
        onClose={() => setIsRemoteProjectsOpen(false)}
        onOpenProject={openProjectById}
      />
      <DeepLinkOpenDialog
        open={deepLinkPkey !== null}
        pkey={deepLinkPkey ?? ''}
        onClose={() => setDeepLinkPkey(null)}
        onOpenProject={openProjectById}
        onImportComplete={(importedProject: any) => {
          // Load the imported project with image preparation
          loadProjectWithPreparation(importedProject, null);
        }}
      />
      <SharedProjectDialog
        open={isSharedProjectOpen}
        onClose={() => setIsSharedProjectOpen(false)}
        onOpenProject={openProjectById}
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
      <Backdrop
        open={isLoadingProject && !isPreparingProject}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1, flexDirection: 'column', gap: 2 }}
      >
        <CircularProgress size={48} />
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" color="white">
            {loadingProjectName ? `Opening "${loadingProjectName}"…` : 'Opening project…'}
          </Typography>
        </Box>
      </Backdrop>
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
      <SyncDecisionsNotice />
      <SyncIntroNotice />
      <SyncIntroDialog
        projects={introBlocked ? null : introProjects}
        openProjectId={project?.id ?? null}
        onSyncSelected={(ids, mode) => void syncIntroSelected(ids, mode)}
        onNotNow={syncIntroNotNow}
      />
      <CollaboratorsDialog
        open={isCollaboratorsOpen}
        projectId={project?.id ?? null}
        onClose={() => setIsCollaboratorsOpen(false)}
      />
      <InvitationsDialog
        invitations={introBlocked || !invitationsOpen ? null : invitations}
        onClose={() => useInvitationsStore.getState().closeDialog()}
        onAnswered={(pid) => useInvitationsStore.getState().remove(pid)}
        onOpenProject={(projectId) => void openProjectById(projectId)}
      />
      <SyncDecisionsDialog />
      <SyncOpenPrompt />
      <CopyOwnerDialog
        prompt={ownerPrompt}
        onLogInAsOwner={(p) => void logInAsCopyOwner(p)}
        onOpenOwnCopy={(p) => {
          setOwnerPrompt(null);
          void openProjectById(p.projectId);
        }}
        onDismiss={(p) => void dismissCopyOwner(p)}
      />
      <SyncLinkPrompt />
      <SyncLinkChoiceDialog />
      <PointCountDialog
        isOpen={isPointCountDialogOpen}
        onClose={() => setIsPointCountDialogOpen(false)}
        micrographId={activeMicrographId}
      />
      <GrainDetectionDialog
        isOpen={isGrainDetectionDialogOpen}
        onClose={() => setIsGrainDetectionDialogOpen(false)}
        micrographId={activeMicrographId}
      />
      <ImageComparatorDialog
        open={isImageComparatorDialogOpen}
        onClose={() => setIsImageComparatorDialogOpen(false)}
      />
      <StraboToolsDialog
        open={isStraboToolsDialogOpen}
        onClose={() => {
          setIsStraboToolsDialogOpen(false);
          setStraboToolsInitialMicrographId(null);
        }}
        initialMicrographId={straboToolsInitialMicrographId}
      />
      <GrainSizeAnalysisDialog
        open={isGrainSizeAnalysisDialogOpen}
        onClose={() => setIsGrainSizeAnalysisDialogOpen(false)}
      />
      <MineralColorDialog
        isOpen={isMineralColorDialogOpen}
        onClose={() => setIsMineralColorDialogOpen(false)}
      />
      <QuickEditEntryDialog
        isOpen={isQuickEditEntryDialogOpen}
        onClose={() => setIsQuickEditEntryDialogOpen(false)}
      />
      <QuickApplyPresetsDialog
        open={isQuickApplyPresetsDialogOpen}
        onClose={() => setIsQuickApplyPresetsDialogOpen(false)}
      />
      <StartupMessageDialog
        isOpen={isStartupMessageOpen}
        onClose={() => setIsStartupMessageOpen(false)}
        message={startupMessage}
        onDismiss={() => localStorage.setItem('startup-message:dismissed-uuid', startupMessageUuid)}
      />
      <StatisticsPanel />
      <QuickClassifyToolbar
        onOpenSettings={() => setIsConfigureShortcutsOpen(true)}
      />
      <ConfigureShortcutsDialog
        open={isConfigureShortcutsOpen}
        onClose={() => setIsConfigureShortcutsOpen(false)}
      />
    </>
  );
}

export default App;
