/**
 * StraboMicro Application Store
 *
 * Zustand store for managing application state including:
 * - Project data (ProjectMetadata hierarchy)
 * - Navigation state (active selections)
 * - Viewer state (zoom, pan, tool)
 * - UI preferences (persisted to file via Electron IPC)
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { temporal } from 'zundo';

/**
 * Custom storage adapter that uses Electron IPC to persist state to a file
 * instead of localStorage. This ensures persistence works correctly in
 * packaged builds where file:// localStorage can be unreliable.
 *
 * Falls back to localStorage when running outside Electron (e.g., in browser).
 */
const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Use Electron IPC if available
    if (window.api?.session) {
      try {
        const data = await window.api.session.getItem();
        if (data) {
          // The data is already a JSON string containing the full storage object
          const parsed = JSON.parse(data);
          return parsed[name] ? JSON.stringify(parsed[name]) : null;
        }
        return null;
      } catch (error) {
        console.error('[Store] Error loading from Electron storage:', error);
        return null;
      }
    }
    // Fall back to localStorage
    return localStorage.getItem(name);
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // Use Electron IPC if available
    if (window.api?.session) {
      try {
        // Load existing data to merge with
        let existingData: Record<string, unknown> = {};
        const existing = await window.api.session.getItem();
        if (existing) {
          existingData = JSON.parse(existing);
        }
        // Update with new value
        existingData[name] = JSON.parse(value);
        await window.api.session.setItem(JSON.stringify(existingData));
      } catch (error) {
        console.error('[Store] Error saving to Electron storage:', error);
      }
      return;
    }
    // Fall back to localStorage
    localStorage.setItem(name, value);
  },

  removeItem: async (name: string): Promise<void> => {
    // Use Electron IPC if available
    if (window.api?.session) {
      try {
        const existing = await window.api.session.getItem();
        if (existing) {
          const data = JSON.parse(existing);
          delete data[name];
          await window.api.session.setItem(JSON.stringify(data));
        }
      } catch (error) {
        console.error('[Store] Error removing from Electron storage:', error);
      }
      return;
    }
    // Fall back to localStorage
    localStorage.removeItem(name);
  },
};

// Create JSON storage with custom Electron backend
const getElectronStorage = () => electronStorage;
import {
  ProjectMetadata,
  DatasetMetadata,
  SampleMetadata,
  MicrographMetadata,
  Spot,
  GroupMetadata,
  Tag,
  SimpleCoord,
} from '@/types/project-types';
import * as turf from '@turf/turf';
import polygonClipping from 'polygon-clipping';
import {
  PointCountSession,
  PointCountSessionSummary,
  calculateSessionSummary,
} from '@/types/point-count-types';
import {
  updateMicrograph,
  updateSpot,
  buildMicrographIndex,
  buildSpotIndex,
  findSpotParentMicrograph,
  findMicrographById,
} from './helpers';
import type { TiledViewerRef } from '@/components/TiledViewer';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type DrawingTool = 'select' | 'point' | 'line' | 'polygon' | 'measure' | null;
export type SidebarTab = 'samples' | 'groups' | 'spots' | 'tags';
export type ThemeMode = 'dark' | 'light' | 'system';

interface AppState {
  // ========== PROJECT STATE ==========
  project: ProjectMetadata | null;
  projectFilePath: string | null;
  isDirty: boolean;

  // ========== NAVIGATION STATE ==========
  activeDatasetId: string | null;
  activeSampleId: string | null;
  activeMicrographId: string | null;
  activeSpotId: string | null; // Single active spot for properties panel
  micrographNavigationStack: string[]; // Stack of micrograph IDs for back navigation (drill-down)

  // ========== SELECTION STATE ==========
  selectedSpotIds: string[]; // Multi-selection for batch operations

  // ========== SPLIT MODE STATE ==========
  splitModeSpotId: string | null; // When set, user is drawing a split line on this spot

  // ========== VIEWER STATE ==========
  activeTool: DrawingTool;
  editingSpotId: string | null; // Spot currently being edited
  editingGeometry: Array<{ X: number; Y: number }> | null; // Draft geometry during editing (not saved)
  originalGeometry: Array<{ X: number; Y: number }> | null; // Backup of original geometry for cancel
  zoom: number;
  pan: { x: number; y: number };
  showSpotLabels: boolean;
  showMicrographOutlines: boolean;
  showRecursiveSpots: boolean;
  showArchivedSpots: boolean;
  showRulers: boolean;
  spotOverlayOpacity: number;
  viewerRef: React.RefObject<TiledViewerRef> | null;

  // ========== UI STATE (persisted) ==========
  sidebarTab: SidebarTab;
  detailsPanelOpen: boolean;
  theme: ThemeMode;

  // ========== SIDEBAR EXPANSION STATE (persisted) ==========
  expandedDatasets: string[];
  expandedSamples: string[];
  expandedMicrographs: string[];

  // ========== NAVIGATION GUARD (for unsaved changes warnings) ==========
  // Callback that returns true if navigation should proceed, false to block
  // Used by DetailedNotesPanel to intercept navigation when there are unsaved notes
  navigationGuard: (() => Promise<boolean>) | null;

  // ========== QUICK CLASSIFY STATE ==========
  /** Whether Quick Classify toolbar is visible */
  quickClassifyVisible: boolean;
  /** User-configured keyboard shortcuts for classification (key -> mineral name) */
  quickClassifyShortcuts: Record<string, string>;
  /** Whether Statistics Panel is visible */
  statisticsPanelVisible: boolean;
  /** Whether Batch Edit Spots dialog is visible */
  batchEditDialogOpen: boolean;

  // ========== POINT COUNT MODE STATE ==========
  /** Whether Point Count mode is active (separate from spots) */
  pointCountMode: boolean;
  /** Currently active Point Count session */
  activePointCountSession: PointCountSession | null;
  /** List of sessions for the current micrograph (summaries only, not full data) */
  pointCountSessionList: PointCountSessionSummary[];
  /** Index of the currently selected point in the session (-1 = none) */
  currentPointIndex: number;
  /** Whether lasso selection tool is active */
  lassoToolActive: boolean;
  /** Indices of points selected via lasso (for batch operations) */
  selectedPointIndices: number[];

  // ========== QUICK EDIT MODE STATE ==========
  /** Whether Quick Edit mode is active */
  quickEditMode: boolean;
  /** IDs of spots included in this Quick Edit session (in sorted order) */
  quickEditSpotIds: string[];
  /** Current index in quickEditSpotIds array */
  quickEditCurrentIndex: number;
  /** Set of spot IDs that have been reviewed (classified, skipped, or deleted) */
  quickEditReviewedIds: string[];
  /** Number of spots deleted during this session (for stats) */
  quickEditDeletedCount: number;
  /** Sort order for Quick Edit navigation */
  quickEditSortOrder: 'spatial' | 'size' | 'creation' | 'random';
  /** Filter applied when entering Quick Edit */
  quickEditFilter: 'all' | 'unclassified';

  // ========== GENERATION SETTINGS (persisted) ==========
  /** Last used point counting settings */
  lastPointCountSettings: {
    gridType: 'regular' | 'random' | 'stratified';
    pointCount: number;
    offsetByHalfSpacing: boolean;
    pointSize: number;
    color: string;
    opacity: number;
    namingPattern: string;
  } | null;
  /** Last used grain detection settings */
  lastGrainDetectionSettings: {
    sensitivity: number;
    minGrainSize: number;
    edgeContrast: number;
    simplifyOutlines: boolean;
    outputType: 'polygons' | 'points';
    presetName: string;
    color: string;
    opacity: number;
    namingPattern: string;
  } | null;

  // ========== COMPUTED INDEXES (for performance) ==========
  micrographIndex: Map<string, MicrographMetadata>;
  spotIndex: Map<string, Spot>;

  // ========== PROJECT ACTIONS ==========
  loadProject: (project: ProjectMetadata, filePath: string | null) => void;
  closeProject: () => void;
  saveProject: () => void;
  markDirty: () => void;
  markClean: () => void;

  // ========== NAVIGATION ACTIONS ==========
  selectDataset: (id: string | null) => void;
  selectSample: (id: string | null) => void;
  selectMicrograph: (id: string | null) => Promise<boolean>; // Returns true if navigation succeeded
  selectActiveSpot: (id: string | null) => Promise<boolean>; // Returns true if navigation succeeded
  drillDownToMicrograph: (id: string) => Promise<boolean>; // Navigate to child micrograph (pushes current to stack)
  navigateBack: () => Promise<boolean>; // Go back to previous micrograph in stack
  clearNavigationStack: () => void; // Clear the navigation stack

  // ========== SELECTION ACTIONS ==========
  selectSpot: (id: string, multiSelect?: boolean) => void;
  deselectSpot: (id: string) => void;
  clearSpotSelection: () => void;

  // ========== SPLIT MODE ACTIONS ==========
  setSplitModeSpotId: (spotId: string | null) => void;

  // ========== CRUD: DATASET ==========
  addDataset: (dataset: DatasetMetadata) => void;
  updateDataset: (id: string, updates: Partial<DatasetMetadata>) => void;
  deleteDataset: (id: string) => void;
  reorderDatasets: (orderedIds: string[]) => void;

  // ========== CRUD: SAMPLE ==========
  addSample: (datasetId: string, sample: SampleMetadata) => void;
  updateSample: (id: string, updates: Partial<SampleMetadata>) => void;
  deleteSample: (id: string) => void;
  reorderSamples: (datasetId: string, orderedIds: string[]) => void;

  // ========== CRUD: MICROGRAPH ==========
  addMicrograph: (sampleId: string, micrograph: MicrographMetadata) => void;
  updateMicrographMetadata: (id: string, updates: Partial<MicrographMetadata>) => void;
  deleteMicrograph: (id: string) => void;
  reorderMicrographs: (sampleId: string, parentId: string | null, orderedIds: string[]) => void;

  // ========== CRUD: SPOT ==========
  addSpot: (micrographId: string, spot: Spot) => void;
  /** Add multiple spots at once (for generation results) - more efficient than calling addSpot N times */
  addSpots: (micrographId: string, spots: Spot[]) => void;
  updateSpotData: (id: string, updates: Partial<Spot>) => void;
  /** Update multiple spots with the same changes (batch edit) */
  batchUpdateSpots: (spotIds: string[], updates: Partial<Spot>) => void;
  deleteSpot: (id: string) => void;
  /** Clear all spots from a specific micrograph */
  clearAllSpots: (micrographId: string) => void;
  /** Merge multiple polygon spots into a single spot */
  mergeSpots: (spotIds: string[]) => string | null;
  /** Split a polygon spot with a line, creating multiple spots */
  splitSpot: (spotId: string, splitLine: SimpleCoord[]) => string[] | null;

  // ========== QUICK CLASSIFY ACTIONS ==========
  /** Toggle Quick Classify toolbar visibility */
  setQuickClassifyVisible: (visible: boolean) => void;
  /** Update keyboard shortcut configuration */
  setQuickClassifyShortcuts: (shortcuts: Record<string, string>) => void;
  /** Toggle Statistics Panel visibility */
  setStatisticsPanelVisible: (visible: boolean) => void;
  /** Toggle Batch Edit dialog visibility */
  setBatchEditDialogOpen: (open: boolean) => void;

  // ========== POINT COUNT MODE ACTIONS ==========
  /** Enter Point Count mode with a session */
  enterPointCountMode: (session: PointCountSession) => void;
  /** Exit Point Count mode (auto-saves) */
  exitPointCountMode: () => Promise<void>;
  /** Classify a point with a mineral */
  classifyPoint: (pointId: string, mineral: string) => void;
  /** Clear classification from a point */
  clearPointClassification: (pointId: string) => void;
  /** Save the current point count session to disk */
  savePointCountSession: () => Promise<void>;
  /** Load session list for a micrograph */
  loadPointCountSessions: (micrographId: string) => Promise<void>;
  /** Set the current point index */
  setCurrentPointIndex: (index: number) => void;
  /** Navigate to next unclassified point */
  goToNextUnclassifiedPoint: () => void;
  /** Navigate to previous point */
  goToPreviousPoint: () => void;
  /** Update session name */
  updatePointCountSessionName: (name: string) => void;
  /** Toggle lasso tool mode */
  setLassoToolActive: (active: boolean) => void;
  /** Set selected point indices (from lasso selection) */
  setSelectedPointIndices: (indices: number[]) => void;
  /** Clear all selected points */
  clearSelectedPoints: () => void;
  /** Classify all selected points with a mineral (batch operation) */
  classifySelectedPoints: (mineral: string) => void;

  // ========== QUICK EDIT MODE ACTIONS ==========
  /** Enter Quick Edit mode with spots from current micrograph */
  enterQuickEditMode: (
    filter: 'all' | 'unclassified',
    sortOrder: 'spatial' | 'size' | 'creation' | 'random'
  ) => void;
  /** Exit Quick Edit mode */
  exitQuickEditMode: () => void;
  /** Navigate to next spot in Quick Edit */
  quickEditNext: () => void;
  /** Navigate to previous spot in Quick Edit */
  quickEditPrev: () => void;
  /** Navigate to specific index in Quick Edit */
  quickEditGoToIndex: (index: number) => void;
  /** Mark current spot as reviewed (for skip action) */
  quickEditMarkReviewed: () => void;
  /** Delete current spot and advance to next */
  quickEditDeleteCurrent: () => void;

  // ========== GENERATION SETTINGS ACTIONS ==========
  /** Update last used point counting settings */
  setLastPointCountSettings: (settings: AppState['lastPointCountSettings']) => void;
  /** Update last used grain detection settings */
  setLastGrainDetectionSettings: (settings: AppState['lastGrainDetectionSettings']) => void;

  // ========== CRUD: GROUP ==========
  createGroup: (group: GroupMetadata) => void;
  updateGroup: (id: string, updates: Partial<GroupMetadata>) => void;
  deleteGroup: (id: string) => void;
  addMicrographToGroup: (groupId: string, micrographId: string) => void;
  removeMicrographFromGroup: (groupId: string, micrographId: string) => void;
  setGroupExpanded: (groupId: string, expanded: boolean) => void;

  // ========== CRUD: TAG ==========
  createTag: (tag: Tag) => void;
  updateTag: (id: string, updates: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
  addTagToSpot: (tagId: string, spotId: string) => void;
  removeTagFromSpot: (tagId: string, spotId: string) => void;
  setTagExpanded: (tagId: string, expanded: boolean) => void;

  // ========== VIEWER ACTIONS ==========
  setActiveTool: (tool: DrawingTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setShowSpotLabels: (show: boolean) => void;
  setShowMicrographOutlines: (show: boolean) => void;
  setShowRecursiveSpots: (show: boolean) => void;
  setShowArchivedSpots: (show: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setSpotOverlayOpacity: (opacity: number) => void;
  setViewerRef: (ref: React.RefObject<TiledViewerRef> | null) => void;

  // ========== GEOMETRY EDITING ACTIONS ==========
  startEditingSpot: (spotId: string, geometry: Array<{ X: number; Y: number }>) => void;
  updateEditingGeometry: (geometry: Array<{ X: number; Y: number }>) => void;
  saveEditingGeometry: () => void;
  cancelEditingGeometry: () => void;

  // ========== UI ACTIONS ==========
  setSidebarTab: (tab: SidebarTab) => void;
  setDetailsPanelOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;

  // ========== SIDEBAR EXPANSION ACTIONS ==========
  setExpandedDatasets: (ids: string[]) => void;
  setExpandedSamples: (ids: string[]) => void;
  setExpandedMicrographs: (ids: string[]) => void;
  toggleDatasetExpanded: (id: string) => void;
  toggleSampleExpanded: (id: string) => void;
  toggleMicrographExpanded: (id: string) => void;

  // ========== NAVIGATION GUARD ACTIONS ==========
  setNavigationGuard: (guard: (() => Promise<boolean>) | null) => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      temporal(
        (set, get) => ({
          // ========== INITIAL STATE ==========
          project: null,
          projectFilePath: null,
          isDirty: false,

          activeDatasetId: null,
          activeSampleId: null,
          activeMicrographId: null,
          activeSpotId: null,
          micrographNavigationStack: [],

          selectedSpotIds: [],

          splitModeSpotId: null,

          activeTool: 'select',
          editingSpotId: null,
          editingGeometry: null,
          originalGeometry: null,
          zoom: 1,
          pan: { x: 0, y: 0 },
          showSpotLabels: true,
          showMicrographOutlines: true,
          showRecursiveSpots: false,
          showArchivedSpots: false,
          showRulers: true,
          spotOverlayOpacity: 0.7,
          viewerRef: null,

          sidebarTab: 'samples',
          detailsPanelOpen: true,
          theme: 'dark',

          expandedDatasets: [],
          expandedSamples: [],
          expandedMicrographs: [],

          navigationGuard: null,

          // Quick Classify state
          quickClassifyVisible: false,
          // Default mineral shortcuts for Quick Classify - common rock-forming minerals
          // Note: Non-mineral categories (matrix, void, lithic, opaque) are intentionally
          // excluded - the mineralogy schema only supports actual mineral names.
          // See PROJECT_STATUS.md for future schema expansion plans.
          quickClassifyShortcuts: {
            'q': 'quartz',
            'p': 'plagioclase',
            'k': 'k-feldspar',
            'o': 'olivine',
            'x': 'pyroxene',
            'a': 'amphibole',
            'h': 'hornblende',
            'b': 'biotite',
            'm': 'muscovite',
            'g': 'garnet',
            'c': 'calcite',
            'd': 'dolomite',
            'e': 'epidote',
            's': 'serpentine',
            'z': 'zircon',
            'u': 'unknown',
          },
          statisticsPanelVisible: false,
          batchEditDialogOpen: false,

          // Point Count mode state
          pointCountMode: false,
          activePointCountSession: null,
          pointCountSessionList: [],
          currentPointIndex: -1,
          lassoToolActive: false,
          selectedPointIndices: [],

          // Quick Edit mode state
          quickEditMode: false,
          quickEditSpotIds: [],
          quickEditCurrentIndex: -1,
          quickEditReviewedIds: [],
          quickEditDeletedCount: 0,
          quickEditSortOrder: 'spatial' as const,
          quickEditFilter: 'all' as const,

          // Generation settings (persisted defaults)
          lastPointCountSettings: null,
          lastGrainDetectionSettings: null,

          micrographIndex: new Map(),
          spotIndex: new Map(),

          // ========== PROJECT ACTIONS ==========

          loadProject: (project, filePath) => {
            const micrographIndex = buildMicrographIndex(project);
            const spotIndex = buildSpotIndex(project);

            set({
              project,
              projectFilePath: filePath,
              isDirty: false,
              activeDatasetId: project.datasets?.[0]?.id || null,
              activeSampleId: null,
              activeMicrographId: null,
              activeSpotId: null,
              micrographNavigationStack: [],
              selectedSpotIds: [],
              micrographIndex,
              spotIndex,
            });
          },

          closeProject: () => set({
            project: null,
            projectFilePath: null,
            isDirty: false,
            activeDatasetId: null,
            activeSampleId: null,
            activeMicrographId: null,
            activeSpotId: null,
            micrographNavigationStack: [],
            selectedSpotIds: [],
            micrographIndex: new Map(),
            spotIndex: new Map(),
          }),

          saveProject: async () => {
            const { project, isDirty } = get();

            if (!project) {
              console.warn('[Store] No project to save');
              return;
            }

            if (!isDirty) {
              console.log('[Store] Project is already clean, skipping save');
              return;
            }

            try {
              // Save project.json to disk (legacy format)
              if (window.api) {
                console.log(`[Store] Saving project.json for: ${project.id}`);
                await window.api.saveProjectJson(project, project.id);
                console.log('[Store] Successfully saved project.json');
                set({ isDirty: false });
              } else {
                console.warn('[Store] window.api not available, cannot save project');
              }
            } catch (error) {
              console.error('[Store] Error saving project:', error);
              throw error;
            }
          },

          markDirty: () => set({ isDirty: true }),

          markClean: () => set({ isDirty: false }),

          // ========== NAVIGATION ACTIONS ==========

          selectDataset: (id) => set({ activeDatasetId: id }),

          selectSample: (id) => set({ activeSampleId: id }),

          selectMicrograph: async (id) => {
            const { navigationGuard, activeMicrographId } = get();

            // Skip guard if selecting the same micrograph
            if (id === activeMicrographId) return true;

            // Check navigation guard if one is set
            if (navigationGuard) {
              const canProceed = await navigationGuard();
              if (!canProceed) return false;
            }

            set({
              activeMicrographId: id,
              activeSpotId: null,
              micrographNavigationStack: [], // Clear stack when selecting from sidebar
            });
            return true;
          },

          selectActiveSpot: async (id) => {
            const { navigationGuard, activeSpotId } = get();

            // Skip guard if selecting the same spot
            if (id === activeSpotId) return true;

            // Check navigation guard if one is set
            if (navigationGuard) {
              const canProceed = await navigationGuard();
              if (!canProceed) return false;
            }

            set({ activeSpotId: id });
            return true;
          },

          drillDownToMicrograph: async (id) => {
            const { activeMicrographId, micrographNavigationStack, navigationGuard } = get();
            if (!activeMicrographId || activeMicrographId === id) return true;

            // Check navigation guard if one is set
            if (navigationGuard) {
              const canProceed = await navigationGuard();
              if (!canProceed) return false;
            }

            // Push current micrograph onto stack and navigate to child
            set({
              activeMicrographId: id,
              activeSpotId: null,
              micrographNavigationStack: [...micrographNavigationStack, activeMicrographId],
            });
            return true;
          },

          navigateBack: async () => {
            const { micrographNavigationStack, navigationGuard } = get();
            if (micrographNavigationStack.length === 0) return true;

            // Check navigation guard if one is set
            if (navigationGuard) {
              const canProceed = await navigationGuard();
              if (!canProceed) return false;
            }

            // Pop the last micrograph from stack and navigate to it
            const newStack = [...micrographNavigationStack];
            const previousMicrographId = newStack.pop()!;

            set({
              activeMicrographId: previousMicrographId,
              activeSpotId: null,
              micrographNavigationStack: newStack,
            });
            return true;
          },

          clearNavigationStack: () => set({ micrographNavigationStack: [] }),

          // ========== SELECTION ACTIONS ==========

          selectSpot: (id, multiSelect = false) => {
            const { selectedSpotIds } = get();

            if (multiSelect) {
              // Toggle in multi-select mode
              const newSelection = selectedSpotIds.includes(id)
                ? selectedSpotIds.filter(sid => sid !== id)
                : [...selectedSpotIds, id];
              set({ selectedSpotIds: newSelection });
            } else {
              // Single selection
              set({ selectedSpotIds: [id] });
            }
          },

          deselectSpot: (id) => {
            const { selectedSpotIds } = get();
            set({ selectedSpotIds: selectedSpotIds.filter(sid => sid !== id) });
          },

          clearSpotSelection: () => set({ selectedSpotIds: [] }),

          // ========== SPLIT MODE ACTIONS ==========
          setSplitModeSpotId: (spotId) => set({ splitModeSpotId: spotId }),

          // ========== CRUD: DATASET ==========

          addDataset: (dataset) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            newProject.datasets = [...(newProject.datasets || []), dataset];

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          updateDataset: (id, updates) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const dataset = newProject.datasets?.find(d => d.id === id);

            if (dataset) {
              Object.assign(dataset, updates);
            }

            return { project: newProject, isDirty: true };
          }),

          deleteDataset: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            newProject.datasets = newProject.datasets?.filter(d => d.id !== id) || [];

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          reorderDatasets: (orderedIds) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            if (newProject.datasets) {
              // Create a map of datasets by ID for quick lookup
              const datasetMap = new Map(newProject.datasets.map(d => [d.id, d]));
              // Reorder datasets based on orderedIds
              const reorderedDatasets: typeof newProject.datasets = [];
              for (const id of orderedIds) {
                const dataset = datasetMap.get(id);
                if (dataset) {
                  reorderedDatasets.push(dataset);
                  datasetMap.delete(id);
                }
              }
              // Add any remaining datasets that weren't in orderedIds (shouldn't happen, but be safe)
              for (const dataset of datasetMap.values()) {
                reorderedDatasets.push(dataset);
              }
              newProject.datasets = reorderedDatasets;
            }

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          // ========== CRUD: SAMPLE ==========

          addSample: (datasetId, sample) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const dataset = newProject.datasets?.find(d => d.id === datasetId);

            if (dataset) {
              dataset.samples = [...(dataset.samples || []), sample];
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          updateSample: (id, updates) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            for (const dataset of newProject.datasets || []) {
              const sample = dataset.samples?.find(s => s.id === id);
              if (sample) {
                Object.assign(sample, updates);
                break;
              }
            }

            return { project: newProject, isDirty: true };
          }),

          deleteSample: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            for (const dataset of newProject.datasets || []) {
              dataset.samples = dataset.samples?.filter(s => s.id !== id) || [];
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          reorderSamples: (datasetId, orderedIds) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            const dataset = newProject.datasets?.find(d => d.id === datasetId);
            if (dataset && dataset.samples) {
              // Create a map of samples by ID for quick lookup
              const sampleMap = new Map(dataset.samples.map(s => [s.id, s]));
              // Reorder samples based on orderedIds
              const reorderedSamples: typeof dataset.samples = [];
              for (const id of orderedIds) {
                const sample = sampleMap.get(id);
                if (sample) {
                  reorderedSamples.push(sample);
                  sampleMap.delete(id);
                }
              }
              // Add any remaining samples that weren't in orderedIds (shouldn't happen, but be safe)
              for (const sample of sampleMap.values()) {
                reorderedSamples.push(sample);
              }
              dataset.samples = reorderedSamples;
            }

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          // ========== CRUD: MICROGRAPH ==========

          addMicrograph: (sampleId, micrograph) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            for (const dataset of newProject.datasets || []) {
              const sample = dataset.samples?.find(s => s.id === sampleId);
              if (sample) {
                sample.micrographs = [...(sample.micrographs || []), micrograph];
                break;
              }
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          updateMicrographMetadata: (id, updates) => set((state) => {
            if (!state.project) return state;

            console.log('[Store] updateMicrographMetadata called:', { id, updates });

            const newProject = updateMicrograph(state.project, id, (micrograph) => {
              console.log('[Store] Before update:', {
                scaleX: micrograph.scaleX,
                scaleY: micrograph.scaleY,
                offsetInParent: micrograph.offsetInParent,
              });
              Object.assign(micrograph, updates);
              console.log('[Store] After update:', {
                scaleX: micrograph.scaleX,
                scaleY: micrograph.scaleY,
                offsetInParent: micrograph.offsetInParent,
              });
            });

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
            };
          }),

          deleteMicrograph: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            for (const dataset of newProject.datasets || []) {
              for (const sample of dataset.samples || []) {
                if (!sample.micrographs) continue;

                // Build set of IDs to delete: the target + all descendants
                const idsToDelete = new Set<string>();
                idsToDelete.add(id);

                // Recursively find all descendants
                let foundMore = true;
                while (foundMore) {
                  foundMore = false;
                  for (const m of sample.micrographs) {
                    if (m.parentID && idsToDelete.has(m.parentID) && !idsToDelete.has(m.id)) {
                      idsToDelete.add(m.id);
                      foundMore = true;
                    }
                  }
                }

                // Filter out all micrographs that are in the delete set
                sample.micrographs = sample.micrographs.filter(m => !idsToDelete.has(m.id));
              }
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          reorderMicrographs: (sampleId, parentId, orderedIds) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            // Find the sample
            for (const dataset of newProject.datasets || []) {
              const sample = dataset.samples?.find(s => s.id === sampleId);
              if (sample && sample.micrographs) {
                // Get all micrographs at this level (same parentId)
                const micrographsAtLevel = sample.micrographs.filter(m =>
                  parentId === null ? !m.parentID : m.parentID === parentId
                );

                // Create a map for quick lookup
                const micrographMap = new Map(micrographsAtLevel.map(m => [m.id, m]));

                // Reorder based on orderedIds
                const reorderedAtLevel: typeof micrographsAtLevel = [];
                for (const id of orderedIds) {
                  const micrograph = micrographMap.get(id);
                  if (micrograph) {
                    reorderedAtLevel.push(micrograph);
                    micrographMap.delete(id);
                  }
                }
                // Add any remaining (shouldn't happen, but be safe)
                for (const micrograph of micrographMap.values()) {
                  reorderedAtLevel.push(micrograph);
                }

                // Merge back: reordered level items + other level items
                // We need to maintain relative positions, so insert reordered items
                // where the first item of this level was originally
                const result: typeof sample.micrographs = [];
                let insertedReordered = false;

                for (const m of sample.micrographs) {
                  const isAtLevel = parentId === null ? !m.parentID : m.parentID === parentId;
                  if (isAtLevel) {
                    if (!insertedReordered) {
                      result.push(...reorderedAtLevel);
                      insertedReordered = true;
                    }
                    // Skip - already added in reorderedAtLevel
                  } else {
                    result.push(m);
                  }
                }
                // If no items at level were found (edge case), append at end
                if (!insertedReordered) {
                  result.push(...reorderedAtLevel);
                }

                sample.micrographs = result;
                break;
              }
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
            };
          }),

          // ========== CRUD: SPOT ==========

          addSpot: (micrographId, spot) => set((state) => {
            if (!state.project) return state;

            const newProject = updateMicrograph(state.project, micrographId, (micrograph) => {
              micrograph.spots = [...(micrograph.spots || []), spot];
            });

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          addSpots: (micrographId, spots) => set((state) => {
            if (!state.project || spots.length === 0) return state;

            const newProject = updateMicrograph(state.project, micrographId, (micrograph) => {
              micrograph.spots = [...(micrograph.spots || []), ...spots];
            });

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          updateSpotData: (id, updates) => set((state) => {
            if (!state.project) return state;

            const newProject = updateSpot(state.project, id, (spot) => {
              Object.assign(spot, updates);
            });

            return {
              project: newProject,
              isDirty: true,
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          batchUpdateSpots: (spotIds, updates) => set((state) => {
            if (!state.project || spotIds.length === 0) return state;

            const spotIdSet = new Set(spotIds);
            const newProject = structuredClone(state.project);

            // Update all matching spots in all micrographs
            for (const dataset of newProject.datasets || []) {
              for (const sample of dataset.samples || []) {
                for (const micrograph of sample.micrographs || []) {
                  if (micrograph.spots) {
                    for (const spot of micrograph.spots) {
                      if (spotIdSet.has(spot.id)) {
                        Object.assign(spot, updates);
                      }
                    }
                  }
                }
              }
            }

            return {
              project: newProject,
              isDirty: true,
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          deleteSpot: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            for (const dataset of newProject.datasets || []) {
              for (const sample of dataset.samples || []) {
                for (const micrograph of sample.micrographs || []) {
                  micrograph.spots = micrograph.spots?.filter(s => s.id !== id) || [];
                }
              }
            }

            return {
              project: newProject,
              isDirty: true,
              selectedSpotIds: state.selectedSpotIds.filter(sid => sid !== id),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          clearAllSpots: (micrographId) => set((state) => {
            if (!state.project) return state;

            const newProject = updateMicrograph(state.project, micrographId, (micrograph) => {
              // Get spot IDs being deleted to clean up selection
              const deletedSpotIds = new Set((micrograph.spots || []).map(s => s.id));
              micrograph.spots = [];
              return deletedSpotIds;
            });

            // Get the deleted spot IDs from the old project
            const oldMicrograph = state.micrographIndex.get(micrographId);
            const deletedSpotIds = new Set((oldMicrograph?.spots || []).map(s => s.id));

            return {
              project: newProject,
              isDirty: true,
              selectedSpotIds: state.selectedSpotIds.filter(sid => !deletedSpotIds.has(sid)),
              spotIndex: buildSpotIndex(newProject),
            };
          }),

          mergeSpots: (spotIds) => {
            const state = get();
            if (!state.project || spotIds.length < 2) return null;

            // Get all spots to merge
            const spots: Spot[] = [];
            let micrographId: string | null = null;

            for (const spotId of spotIds) {
              const spot = state.spotIndex.get(spotId);
              if (!spot) {
                console.warn(`[Store] Spot ${spotId} not found for merge`);
                return null;
              }
              spots.push(spot);

              // Find which micrograph this spot belongs to
              // Use the project data directly (not the index) to avoid stale references
              if (!micrographId) {
                const parentMicrograph = findSpotParentMicrograph(state.project, spotId);
                if (parentMicrograph) {
                  micrographId = parentMicrograph.id;
                }
              }
            }

            if (!micrographId) {
              console.warn('[Store] Could not find micrograph for spots');
              return null;
            }

            // Filter to only polygon spots
            const polygonSpots = spots.filter(s => {
              const points = s.points || [];
              return points.length >= 3; // Polygons need at least 3 points
            });

            if (polygonSpots.length < 2) {
              console.warn('[Store] Need at least 2 polygon spots to merge');
              return null;
            }

            try {
              // Convert spots to Turf polygons
              const turfPolygons = polygonSpots.map(spot => {
                const points = spot.points || [];
                const coords = points.map(p => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0] as [number, number]);
                // Close the ring if not already closed
                if (coords.length > 0) {
                  const first = coords[0];
                  const last = coords[coords.length - 1];
                  if (first[0] !== last[0] || first[1] !== last[1]) {
                    coords.push([first[0], first[1]]);
                  }
                }
                return turf.polygon([coords]);
              });

              // Try union first - works well for overlapping polygons
              let merged = turfPolygons[0];
              let useConvexHull = false;

              for (let i = 1; i < turfPolygons.length; i++) {
                const result = turf.union(turf.featureCollection([merged, turfPolygons[i]]));
                if (result && result.geometry.type === 'Polygon') {
                  merged = result as ReturnType<typeof turf.polygon>;
                } else if (result && result.geometry.type === 'MultiPolygon') {
                  // Non-overlapping polygons produce MultiPolygon - use convex hull instead
                  useConvexHull = true;
                  break;
                }
              }

              // If polygons don't overlap, use convex hull to create enclosing polygon
              if (useConvexHull) {
                // Collect all points from all polygons
                const allPoints: [number, number][] = [];
                for (const poly of turfPolygons) {
                  const coords = poly.geometry.coordinates[0];
                  for (const coord of coords) {
                    allPoints.push([coord[0], coord[1]]);
                  }
                }

                // Create convex hull from all points
                const points = turf.featureCollection(
                  allPoints.map(p => turf.point(p))
                );
                const hull = turf.convex(points);

                if (hull && hull.geometry.type === 'Polygon') {
                  merged = hull as ReturnType<typeof turf.polygon>;
                } else {
                  console.warn('[Store] Could not create convex hull');
                  return null;
                }
              }

              // Extract coordinates from merged polygon
              const mergedCoords = merged.geometry.coordinates[0];
              // Remove closing point (last == first)
              const newPoints: SimpleCoord[] = mergedCoords.slice(0, -1).map(coord => ({
                X: coord[0],
                Y: coord[1],
              }));

              // Create merged spot with properties from first spot
              const firstSpot = polygonSpots[0];
              const newSpotId = crypto.randomUUID();
              const newSpot: Spot = {
                id: newSpotId,
                name: `Merged (${polygonSpots.length} spots)`,
                color: firstSpot.color,
                opacity: firstSpot.opacity,
                points: newPoints,
                geometryType: 'Polygon',
                modifiedTimestamp: Date.now(),
                mergedFrom: spotIds,
                generationMethod: 'manual' as const,
                // Copy mineralogy from first spot if present
                mineralogy: firstSpot.mineralogy,
              };

              // Update project: remove old spots, add merged spot
              const newProject = structuredClone(state.project);

              for (const dataset of newProject.datasets || []) {
                for (const sample of dataset.samples || []) {
                  for (const micrograph of sample.micrographs || []) {
                    if (micrograph.id === micrographId && micrograph.spots) {
                      // Remove merged spots
                      micrograph.spots = micrograph.spots.filter(s => !spotIds.includes(s.id));
                      // Add new merged spot
                      micrograph.spots.push(newSpot);
                    }
                  }
                }
              }

              set({
                project: newProject,
                isDirty: true,
                selectedSpotIds: [newSpotId],
                activeSpotId: newSpotId,
                spotIndex: buildSpotIndex(newProject),
              });

              console.log(`[Store] Merged ${polygonSpots.length} spots into ${newSpotId}`);
              return newSpotId;
            } catch (error) {
              console.error('[Store] Error merging spots:', error);
              return null;
            }
          },

          splitSpot: (spotId, splitLine) => {
            const state = get();
            if (!state.project || splitLine.length < 2) return null;

            // Find the spot
            const spot = state.spotIndex.get(spotId);
            if (!spot) {
              console.warn(`[Store] Spot ${spotId} not found for split`);
              return null;
            }

            // Must be a polygon
            const points = spot.points || [];
            if (points.length < 3) {
              console.warn('[Store] Can only split polygon spots');
              return null;
            }

            // Find which micrograph this spot belongs to
            // Use the project data directly (not the index) to avoid stale references
            const parentMicrograph = findSpotParentMicrograph(state.project, spotId);
            if (!parentMicrograph) {
              console.warn('[Store] Could not find micrograph for spot');
              return null;
            }
            const micrographId = parentMicrograph.id;

            try {
              // Convert spot to Turf polygon
              const coords = points.map(p => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0] as [number, number]);
              // Close the ring
              if (coords.length > 0) {
                const first = coords[0];
                const last = coords[coords.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                  coords.push([first[0], first[1]]);
                }
              }
              const polygon = turf.polygon([coords]);

              // Convert split line coordinates
              const lineCoords = splitLine.map(p => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0] as [number, number]);

              console.log('[Store] Split line coords:', lineCoords);
              console.log('[Store] Polygon coords:', coords);

              // Strategy: Use polygon-clipping library to cut the polygon with a buffer
              // around the ENTIRE polyline (not just start-to-end)
              // This works with pixel coordinates (no geographic assumptions)

              // Buffer width in pixels
              const bufferWidth = 2;

              // Extend the line beyond the polygon bounds
              const bbox = turf.bbox(polygon);
              const diagonal = Math.sqrt(
                Math.pow(bbox[2] - bbox[0], 2) + Math.pow(bbox[3] - bbox[1], 2)
              ) * 2;

              // Helper to get perpendicular unit vector for a segment
              const getPerp = (p1: [number, number], p2: [number, number]): [number, number] => {
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) return [0, 1];
                return [-dy / len, dx / len]; // perpendicular
              };

              // Helper to get unit direction vector
              const getDir = (p1: [number, number], p2: [number, number]): [number, number] => {
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) return [1, 0];
                return [dx / len, dy / len];
              };

              // Extend the first and last points of the line beyond the polygon
              const extendedLineCoords = [...lineCoords];

              // Extend start
              if (extendedLineCoords.length >= 2) {
                const dir = getDir(extendedLineCoords[1], extendedLineCoords[0]);
                extendedLineCoords[0] = [
                  extendedLineCoords[0][0] + dir[0] * diagonal,
                  extendedLineCoords[0][1] + dir[1] * diagonal,
                ];
              }

              // Extend end
              if (extendedLineCoords.length >= 2) {
                const lastIdx = extendedLineCoords.length - 1;
                const dir = getDir(extendedLineCoords[lastIdx - 1], extendedLineCoords[lastIdx]);
                extendedLineCoords[lastIdx] = [
                  extendedLineCoords[lastIdx][0] + dir[0] * diagonal,
                  extendedLineCoords[lastIdx][1] + dir[1] * diagonal,
                ];
              }

              // Build cutting polygon by walking along both sides of the polyline
              // Left side (positive perpendicular offset)
              const leftSide: [number, number][] = [];
              // Right side (negative perpendicular offset) - will be reversed
              const rightSide: [number, number][] = [];

              for (let i = 0; i < extendedLineCoords.length; i++) {
                const curr = extendedLineCoords[i];
                let perp: [number, number];

                if (i === 0) {
                  // First point: use direction to next point
                  perp = getPerp(curr, extendedLineCoords[i + 1]);
                } else if (i === extendedLineCoords.length - 1) {
                  // Last point: use direction from previous point
                  perp = getPerp(extendedLineCoords[i - 1], curr);
                } else {
                  // Middle point: average of adjacent segment perpendiculars
                  const perp1 = getPerp(extendedLineCoords[i - 1], curr);
                  const perp2 = getPerp(curr, extendedLineCoords[i + 1]);
                  const avgX = (perp1[0] + perp2[0]) / 2;
                  const avgY = (perp1[1] + perp2[1]) / 2;
                  const avgLen = Math.sqrt(avgX * avgX + avgY * avgY);
                  perp = avgLen > 0 ? [avgX / avgLen, avgY / avgLen] : perp1;
                }

                leftSide.push([curr[0] + perp[0] * bufferWidth, curr[1] + perp[1] * bufferWidth]);
                rightSide.push([curr[0] - perp[0] * bufferWidth, curr[1] - perp[1] * bufferWidth]);
              }

              // Combine into cutting polygon: left side forward, then right side backward
              const cuttingPolygon: [number, number][] = [
                ...leftSide,
                ...rightSide.reverse(),
                leftSide[0], // Close the ring
              ];

              console.log('[Store] Cutting polygon points:', cuttingPolygon.length);

              // Use polygon-clipping to subtract the cutting polygon from the original
              // This works with raw pixel coordinates (no geographic assumptions)
              // polygon-clipping expects: Polygon = Ring[], Ring = [number, number][]
              const result = polygonClipping.difference(
                [coords],          // subject polygon (array of rings, first is exterior)
                [cuttingPolygon]   // clip polygon (the cutting line buffer)
              );

              console.log('[Store] polygon-clipping result:', result);
              console.log('[Store] Result polygon count:', result.length);

              // polygon-clipping returns MultiPolygon format: Array of polygons
              // Each polygon is an array of rings (first is exterior, rest are holes)
              if (result.length < 2) {
                console.warn('[Store] Split did not create multiple polygons - line may not fully cross the polygon');
                console.warn('[Store] Result length:', result.length);
                return null;
              }

              // Extract resulting polygons
              const newSpots: Spot[] = [];
              const newSpotIds: string[] = [];

              for (const poly of result) {
                // poly is an array of rings, first ring is the exterior
                const exteriorRing = poly[0];
                if (!exteriorRing || exteriorRing.length < 4) continue; // Need at least 3 points + closing

                // Remove closing point and convert to SimpleCoord
                const newPoints: SimpleCoord[] = exteriorRing.slice(0, -1).map(coord => ({
                  X: coord[0],
                  Y: coord[1],
                }));

                if (newPoints.length >= 3) {
                  const newId = crypto.randomUUID();
                  newSpotIds.push(newId);
                  newSpots.push({
                    id: newId,
                    name: `${spot.name} (split)`,
                    color: spot.color,
                    opacity: spot.opacity,
                    points: newPoints,
                    geometryType: 'Polygon',
                    modifiedTimestamp: Date.now(),
                    splitFrom: spotId,
                    generationMethod: 'manual' as const,
                    mineralogy: spot.mineralogy,
                  });
                }
              }

              if (newSpots.length < 2) {
                console.warn('[Store] Split produced less than 2 valid polygons');
                return null;
              }

              // Update project: remove old spot, add new spots
              const newProject = structuredClone(state.project);

              for (const dataset of newProject.datasets || []) {
                for (const sample of dataset.samples || []) {
                  for (const micrograph of sample.micrographs || []) {
                    if (micrograph.id === micrographId && micrograph.spots) {
                      // Remove original spot
                      micrograph.spots = micrograph.spots.filter(s => s.id !== spotId);
                      // Add new split spots
                      micrograph.spots.push(...newSpots);
                    }
                  }
                }
              }

              set({
                project: newProject,
                isDirty: true,
                selectedSpotIds: newSpotIds,
                activeSpotId: newSpotIds[0],
                spotIndex: buildSpotIndex(newProject),
              });

              console.log(`[Store] Split spot ${spotId} into ${newSpots.length} spots`);
              return newSpotIds;
            } catch (error) {
              console.error('[Store] Error splitting spot:', error);
              return null;
            }
          },

          // ========== CRUD: GROUP ==========

          createGroup: (group) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            newProject.groups = [...(newProject.groups || []), group];

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          updateGroup: (id, updates) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const group = newProject.groups?.find(g => g.id === id);

            if (group) {
              Object.assign(group, updates);
            }

            return { project: newProject, isDirty: true };
          }),

          deleteGroup: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            newProject.groups = newProject.groups?.filter(g => g.id !== id) || [];

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          addMicrographToGroup: (groupId, micrographId) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const group = newProject.groups?.find(g => g.id === groupId);

            if (group) {
              // Initialize micrographs array if it doesn't exist
              if (!group.micrographs) {
                group.micrographs = [];
              }
              // Only add if not already present
              if (!group.micrographs.includes(micrographId)) {
                group.micrographs.push(micrographId);
              }
            }

            return { project: newProject, isDirty: true };
          }),

          removeMicrographFromGroup: (groupId, micrographId) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const group = newProject.groups?.find(g => g.id === groupId);

            if (group && group.micrographs) {
              group.micrographs = group.micrographs.filter(id => id !== micrographId);
            }

            return { project: newProject, isDirty: true };
          }),

          setGroupExpanded: (groupId, expanded) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const group = newProject.groups?.find(g => g.id === groupId);

            if (group) {
              group.isExpanded = expanded;
            }

            return { project: newProject, isDirty: true };
          }),

          // ========== CRUD: TAG ==========

          createTag: (tag) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            newProject.tags = [...(newProject.tags || []), tag];

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          updateTag: (id, updates) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const tag = newProject.tags?.find(t => t.id === id);

            if (tag) {
              Object.assign(tag, updates);
            }

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          deleteTag: (id) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            // Remove tag from project.tags array
            newProject.tags = (newProject.tags || []).filter(t => t.id !== id);

            // Also remove tag ID from any spots that have it
            const datasets = newProject.datasets || [];
            for (const dataset of datasets) {
              const samples = dataset.samples || [];
              for (const sample of samples) {
                const micrographs = sample.micrographs || [];
                for (const micrograph of micrographs) {
                  const spots = micrograph.spots || [];
                  for (const spot of spots) {
                    if (spot.tags && spot.tags.includes(id)) {
                      spot.tags = spot.tags.filter(tagId => tagId !== id);
                    }
                  }
                }
              }
            }

            return {
              project: newProject,
              isDirty: true,
            };
          }),

          addTagToSpot: (tagId, spotId) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            // Find the spot and add tag ID to its tags array
            const datasets = newProject.datasets || [];
            for (const dataset of datasets) {
              const samples = dataset.samples || [];
              for (const sample of samples) {
                const micrographs = sample.micrographs || [];
                for (const micrograph of micrographs) {
                  const spots = micrograph.spots || [];
                  for (const spot of spots) {
                    if (spot.id === spotId) {
                      spot.tags = [...(spot.tags || []), tagId];
                      // Also rebuild spot index
                      const newSpotIndex = buildSpotIndex(newProject);
                      return {
                        project: newProject,
                        spotIndex: newSpotIndex,
                        isDirty: true,
                      };
                    }
                  }
                }
              }
            }

            return state;
          }),

          removeTagFromSpot: (tagId, spotId) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);

            // Find the spot and remove tag ID from its tags array
            const datasets = newProject.datasets || [];
            for (const dataset of datasets) {
              const samples = dataset.samples || [];
              for (const sample of samples) {
                const micrographs = sample.micrographs || [];
                for (const micrograph of micrographs) {
                  const spots = micrograph.spots || [];
                  for (const spot of spots) {
                    if (spot.id === spotId) {
                      spot.tags = (spot.tags || []).filter(id => id !== tagId);
                      // Also rebuild spot index
                      const newSpotIndex = buildSpotIndex(newProject);
                      return {
                        project: newProject,
                        spotIndex: newSpotIndex,
                        isDirty: true,
                      };
                    }
                  }
                }
              }
            }

            return state;
          }),

          setTagExpanded: (tagId, expanded) => set((state) => {
            if (!state.project) return state;

            const newProject = structuredClone(state.project);
            const tag = newProject.tags?.find(t => t.id === tagId);

            if (tag) {
              tag.isExpanded = expanded;
            }

            return { project: newProject, isDirty: true };
          }),

          // ========== VIEWER ACTIONS ==========

          setActiveTool: (tool) => set({ activeTool: tool }),

          setZoom: (zoom) => set({ zoom }),

          setPan: (pan) => set({ pan }),

          setShowSpotLabels: (show) => set({ showSpotLabels: show }),

          setShowMicrographOutlines: (show) => set({ showMicrographOutlines: show }),

          setShowRecursiveSpots: (show) => set({ showRecursiveSpots: show }),

          setShowArchivedSpots: (show) => set({ showArchivedSpots: show }),

          setShowRulers: (show) => set({ showRulers: show }),

          setSpotOverlayOpacity: (opacity) => set({ spotOverlayOpacity: opacity }),

          setViewerRef: (ref) => set({ viewerRef: ref }),

          // ========== GEOMETRY EDITING ACTIONS ==========

          startEditingSpot: (spotId, geometry) =>
            set({
              editingSpotId: spotId,
              editingGeometry: [...geometry], // Create copy of geometry
              originalGeometry: [...geometry], // Save backup for cancel
            }),

          updateEditingGeometry: (geometry) =>
            set({
              editingGeometry: [...geometry],
            }),

          saveEditingGeometry: () =>
            set((state) => {
              if (!state.project || !state.editingSpotId || !state.editingGeometry) {
                return state;
              }

              // Use structuredClone to create deep copy - ensures all nested arrays
              // get new references so React's useMemo detects changes
              const newProject = structuredClone(state.project);
              const spotId = state.editingSpotId;
              const points = state.editingGeometry;

              // Find the spot in the project and update it
              let spotFound = false;
              if (newProject.datasets) {
                for (const dataset of newProject.datasets) {
                  if (dataset.samples) {
                    for (const sample of dataset.samples) {
                      if (sample.micrographs) {
                        for (const micrograph of sample.micrographs) {
                          if (micrograph.spots) {
                            const spotIndex = micrograph.spots.findIndex((s) => s.id === spotId);
                            if (spotIndex !== -1) {
                              // Update the spot's points
                              micrograph.spots[spotIndex] = {
                                ...micrograph.spots[spotIndex],
                                points,
                                modifiedTimestamp: Date.now(),
                              };
                              spotFound = true;
                              break;
                            }
                          }
                        }
                        if (spotFound) break;
                      }
                    }
                    if (spotFound) break;
                  }
                }
              }

              return {
                project: newProject,
                isDirty: true,
                spotIndex: buildSpotIndex(newProject),
                // Clear editing state
                editingSpotId: null,
                editingGeometry: null,
                originalGeometry: null,
              };
            }),

          cancelEditingGeometry: () =>
            set({
              editingSpotId: null,
              editingGeometry: null,
              originalGeometry: null,
            }),

          // ========== UI ACTIONS ==========

          setSidebarTab: (tab) => set({ sidebarTab: tab }),

          setDetailsPanelOpen: (open) => set({ detailsPanelOpen: open }),

          setTheme: (theme) => set({ theme }),

          // ========== SIDEBAR EXPANSION ACTIONS ==========

          setExpandedDatasets: (ids) => set({ expandedDatasets: ids }),

          setExpandedSamples: (ids) => set({ expandedSamples: ids }),

          setExpandedMicrographs: (ids) => set({ expandedMicrographs: ids }),

          toggleDatasetExpanded: (id) => set((state) => {
            const expanded = new Set(state.expandedDatasets);
            if (expanded.has(id)) {
              expanded.delete(id);
            } else {
              expanded.add(id);
            }
            return { expandedDatasets: Array.from(expanded) };
          }),

          toggleSampleExpanded: (id) => set((state) => {
            const expanded = new Set(state.expandedSamples);
            if (expanded.has(id)) {
              expanded.delete(id);
            } else {
              expanded.add(id);
            }
            return { expandedSamples: Array.from(expanded) };
          }),

          toggleMicrographExpanded: (id) => set((state) => {
            const expanded = new Set(state.expandedMicrographs);
            if (expanded.has(id)) {
              expanded.delete(id);
            } else {
              expanded.add(id);
            }
            return { expandedMicrographs: Array.from(expanded) };
          }),

          // ========== NAVIGATION GUARD ACTIONS ==========

          setNavigationGuard: (guard) => set({ navigationGuard: guard }),

          // ========== QUICK CLASSIFY ACTIONS ==========

          setQuickClassifyVisible: (visible) => {
            // When showing Quick Classify, also show the Statistics Panel
            if (visible) {
              set({ quickClassifyVisible: true, statisticsPanelVisible: true });
            } else {
              set({ quickClassifyVisible: false });
            }
          },

          setQuickClassifyShortcuts: (shortcuts) => set({ quickClassifyShortcuts: shortcuts }),

          setStatisticsPanelVisible: (visible) => set({ statisticsPanelVisible: visible }),

          setBatchEditDialogOpen: (open) => set({ batchEditDialogOpen: open }),

          // ========== POINT COUNT MODE ACTIONS ==========

          enterPointCountMode: (session) => {
            // Find first unclassified point index
            const firstUnclassifiedIndex = session.points.findIndex(p => !p.mineral);
            const initialIndex = firstUnclassifiedIndex >= 0 ? firstUnclassifiedIndex : 0;

            // Set navigation guard to prevent accidental navigation during point counting
            const pointCountNavigationGuard = async (): Promise<boolean> => {
              // Show confirmation dialog
              const shouldExit = window.confirm(
                'You are in Point Count mode. Navigating away will exit Point Count mode.\n\n' +
                'Your progress will be saved automatically.\n\n' +
                'Do you want to exit Point Count mode?'
              );

              if (shouldExit) {
                // Exit point count mode (this will save the session)
                await get().exitPointCountMode();
                return true; // Allow navigation
              }

              return false; // Block navigation
            };

            set({
              pointCountMode: true,
              activePointCountSession: session,
              currentPointIndex: session.points.length > 0 ? initialIndex : -1,
              // Show Quick Classify toolbar and Statistics Panel
              quickClassifyVisible: true,
              statisticsPanelVisible: true,
              // Set navigation guard
              navigationGuard: pointCountNavigationGuard,
            });
          },

          exitPointCountMode: async () => {
            const { activePointCountSession, project } = get();

            // Auto-save session before exiting
            if (activePointCountSession && project && window.api?.pointCount) {
              try {
                // Update summary before saving
                const updatedSession = {
                  ...activePointCountSession,
                  summary: calculateSessionSummary(activePointCountSession.points),
                };
                await window.api.pointCount.saveSession(project.id, updatedSession);
                console.log('[Store] Point count session saved on exit');
              } catch (error) {
                console.error('[Store] Error saving point count session:', error);
              }
            }

            set({
              pointCountMode: false,
              activePointCountSession: null,
              currentPointIndex: -1,
              quickClassifyVisible: false,
              statisticsPanelVisible: false,
              lassoToolActive: false,
              selectedPointIndices: [],
              // Clear navigation guard
              navigationGuard: null,
            });
          },

          classifyPoint: (pointId, mineral) => {
            const { activePointCountSession } = get();
            if (!activePointCountSession) return;

            const now = new Date().toISOString();
            const updatedPoints = activePointCountSession.points.map(p =>
              p.id === pointId
                ? { ...p, mineral, classifiedAt: now }
                : p
            );

            const updatedSession = {
              ...activePointCountSession,
              points: updatedPoints,
              updatedAt: now,
              summary: calculateSessionSummary(updatedPoints),
            };

            set({ activePointCountSession: updatedSession });
          },

          clearPointClassification: (pointId) => {
            const { activePointCountSession } = get();
            if (!activePointCountSession) return;

            const updatedPoints = activePointCountSession.points.map(p =>
              p.id === pointId
                ? { ...p, mineral: undefined, classifiedAt: undefined }
                : p
            );

            const updatedSession = {
              ...activePointCountSession,
              points: updatedPoints,
              updatedAt: new Date().toISOString(),
              summary: calculateSessionSummary(updatedPoints),
            };

            set({ activePointCountSession: updatedSession });
          },

          savePointCountSession: async () => {
            const { activePointCountSession, project } = get();
            if (!activePointCountSession || !project) {
              console.warn('[Store] No active point count session to save');
              return;
            }

            if (!window.api?.pointCount) {
              console.warn('[Store] Point count API not available');
              return;
            }

            try {
              const result = await window.api.pointCount.saveSession(
                project.id,
                activePointCountSession
              );
              if (result.success && result.session) {
                set({ activePointCountSession: result.session });
                console.log('[Store] Point count session saved');
              } else {
                console.error('[Store] Error saving point count session:', result.error);
              }
            } catch (error) {
              console.error('[Store] Error saving point count session:', error);
            }
          },

          loadPointCountSessions: async (micrographId) => {
            const { project } = get();
            if (!project) {
              console.warn('[Store] No project loaded');
              return;
            }

            if (!window.api?.pointCount) {
              console.warn('[Store] Point count API not available');
              return;
            }

            try {
              const result = await window.api.pointCount.listSessions(
                project.id,
                micrographId
              );
              if (result.success) {
                set({ pointCountSessionList: result.sessions });
                console.log(`[Store] Loaded ${result.sessions.length} point count sessions`);
              } else {
                console.error('[Store] Error loading point count sessions:', result.error);
                set({ pointCountSessionList: [] });
              }
            } catch (error) {
              console.error('[Store] Error loading point count sessions:', error);
              set({ pointCountSessionList: [] });
            }
          },

          setCurrentPointIndex: (index) => set({ currentPointIndex: index }),

          goToNextUnclassifiedPoint: () => {
            const { activePointCountSession, currentPointIndex } = get();
            if (!activePointCountSession) return;

            const points = activePointCountSession.points;
            const startIndex = currentPointIndex + 1;

            // Search from current position to end
            for (let i = startIndex; i < points.length; i++) {
              if (!points[i].mineral) {
                set({ currentPointIndex: i });
                return;
              }
            }

            // Wrap around and search from start
            for (let i = 0; i < startIndex && i < points.length; i++) {
              if (!points[i].mineral) {
                set({ currentPointIndex: i });
                return;
              }
            }

            // No unclassified points found, stay at current or go to first
            if (currentPointIndex < 0 && points.length > 0) {
              set({ currentPointIndex: 0 });
            }
          },

          goToPreviousPoint: () => {
            const { activePointCountSession, currentPointIndex } = get();
            if (!activePointCountSession || currentPointIndex <= 0) return;

            set({ currentPointIndex: currentPointIndex - 1 });
          },

          updatePointCountSessionName: (name) => {
            const { activePointCountSession } = get();
            if (!activePointCountSession) return;

            set({
              activePointCountSession: {
                ...activePointCountSession,
                name,
                updatedAt: new Date().toISOString(),
              },
            });
          },

          setLassoToolActive: (active) => {
            set({
              lassoToolActive: active,
              // Clear selection when deactivating lasso tool
              selectedPointIndices: active ? get().selectedPointIndices : [],
            });
          },

          setSelectedPointIndices: (indices) => set({ selectedPointIndices: indices }),

          clearSelectedPoints: () => set({ selectedPointIndices: [] }),

          classifySelectedPoints: (mineral) => {
            const { activePointCountSession, selectedPointIndices, goToNextUnclassifiedPoint } = get();
            if (!activePointCountSession || selectedPointIndices.length === 0) return;

            const now = new Date().toISOString();
            const updatedPoints = activePointCountSession.points.map((p, index) =>
              selectedPointIndices.includes(index)
                ? { ...p, mineral, classifiedAt: now }
                : p
            );

            const updatedSession = {
              ...activePointCountSession,
              points: updatedPoints,
              updatedAt: now,
              summary: calculateSessionSummary(updatedPoints),
            };

            set({
              activePointCountSession: updatedSession,
              selectedPointIndices: [], // Clear selection after classification
              lassoToolActive: false, // Deactivate lasso tool
            });

            // Navigate to next unclassified point
            // Use setTimeout to ensure state is updated first
            setTimeout(() => {
              goToNextUnclassifiedPoint();
            }, 10);
          },

          // ========== QUICK EDIT MODE ACTIONS ==========

          enterQuickEditMode: (filter, sortOrder) => {
            const { project, activeMicrographId } = get();
            if (!project || !activeMicrographId) return;

            const micrograph = findMicrographById(project, activeMicrographId);
            if (!micrograph?.spots || micrograph.spots.length === 0) return;

            // Filter spots based on filter option
            let spots = [...micrograph.spots];
            if (filter === 'unclassified') {
              spots = spots.filter((s) => {
                const minerals = s.mineralogy?.minerals;
                return !minerals || minerals.length === 0 || !minerals[0]?.name;
              });
            }

            if (spots.length === 0) return;

            // Sort spots based on sort order
            switch (sortOrder) {
              case 'spatial': {
                // Sort by position: left-to-right, then top-to-bottom
                const getSpotCentroid = (spot: Spot): { x: number; y: number } => {
                  const geoType = spot.geometryType || spot.geometry?.type;
                  if (geoType === 'point' || geoType === 'Point') {
                    if (Array.isArray(spot.geometry?.coordinates)) {
                      const coords = spot.geometry.coordinates as number[];
                      return { x: coords[0], y: coords[1] };
                    }
                    return { x: spot.points?.[0]?.X ?? 0, y: spot.points?.[0]?.Y ?? 0 };
                  }
                  // For lines and polygons, calculate centroid from points
                  const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
                    ? (geoType === 'polygon' || geoType === 'Polygon'
                        ? (spot.geometry.coordinates as number[][][])[0] || []
                        : (spot.geometry.coordinates as number[][]))
                    : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];
                  if (coords.length === 0) return { x: 0, y: 0 };
                  const xs = coords.map((c) => c[0]);
                  const ys = coords.map((c) => c[1]);
                  return {
                    x: (Math.min(...xs) + Math.max(...xs)) / 2,
                    y: (Math.min(...ys) + Math.max(...ys)) / 2,
                  };
                };

                // Calculate centroids for all spots first
                const centroids = spots.map((spot) => ({
                  spot,
                  centroid: getSpotCentroid(spot),
                }));

                // Find the vertical extent of all spots
                const ys = centroids.map((c) => c.centroid.y);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const verticalExtent = maxY - minY;

                // Create ~8 rows for natural reading order
                // Minimum row height of 50px to avoid too many rows for small images
                const numRows = 8;
                const rowHeight = Math.max(50, verticalExtent / numRows);

                spots.sort((a, b) => {
                  const centroidA = getSpotCentroid(a);
                  const centroidB = getSpotCentroid(b);
                  const rowA = Math.floor((centroidA.y - minY) / rowHeight);
                  const rowB = Math.floor((centroidB.y - minY) / rowHeight);
                  if (rowA !== rowB) return rowA - rowB;
                  return centroidA.x - centroidB.x;
                });
                break;
              }
              case 'size': {
                // Sort by polygon area (largest first)
                const getSpotArea = (spot: Spot): number => {
                  const geoType = spot.geometryType || spot.geometry?.type;
                  if (geoType !== 'polygon' && geoType !== 'Polygon') return 0;
                  const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
                    ? (spot.geometry.coordinates as number[][][])[0] || []
                    : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];
                  if (coords.length < 3) return 0;
                  // Shoelace formula for polygon area
                  let area = 0;
                  for (let i = 0; i < coords.length; i++) {
                    const j = (i + 1) % coords.length;
                    area += coords[i][0] * coords[j][1];
                    area -= coords[j][0] * coords[i][1];
                  }
                  return Math.abs(area / 2);
                };
                spots.sort((a, b) => getSpotArea(b) - getSpotArea(a));
                break;
              }
              case 'creation': {
                // Sort by creation timestamp (oldest first)
                spots.sort((a, b) => {
                  const timeA = a.date ? new Date(a.date).getTime() : 0;
                  const timeB = b.date ? new Date(b.date).getTime() : 0;
                  return timeA - timeB;
                });
                break;
              }
              case 'random': {
                // Fisher-Yates shuffle
                for (let i = spots.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [spots[i], spots[j]] = [spots[j], spots[i]];
                }
                break;
              }
            }

            const spotIds = spots.map((s) => s.id);

            // Pre-mark already-classified spots as "reviewed" so they don't count as remaining
            const alreadyClassifiedIds = spots
              .filter((s) => {
                const minerals = s.mineralogy?.minerals;
                return minerals && minerals.length > 0 && minerals[0]?.name;
              })
              .map((s) => s.id);

            set({
              quickEditMode: true,
              quickEditSpotIds: spotIds,
              quickEditCurrentIndex: 0,
              quickEditReviewedIds: alreadyClassifiedIds,
              quickEditDeletedCount: 0,
              quickEditSortOrder: sortOrder,
              quickEditFilter: filter,
              activeSpotId: spotIds[0],
              selectedSpotIds: [], // Clear multi-selection
              quickClassifyVisible: true, // Show the toolbar
              statisticsPanelVisible: true, // Show statistics
            });
          },

          exitQuickEditMode: () => {
            set({
              quickEditMode: false,
              quickEditSpotIds: [],
              quickEditCurrentIndex: -1,
              quickEditReviewedIds: [],
              quickEditDeletedCount: 0,
              quickClassifyVisible: false,
              statisticsPanelVisible: false,
            });
          },

          quickEditNext: () => {
            const { quickEditSpotIds, quickEditCurrentIndex } = get();
            if (quickEditSpotIds.length === 0) return;

            const nextIndex = quickEditCurrentIndex >= quickEditSpotIds.length - 1
              ? 0  // Wrap around
              : quickEditCurrentIndex + 1;

            set({
              quickEditCurrentIndex: nextIndex,
              activeSpotId: quickEditSpotIds[nextIndex],
            });
          },

          quickEditPrev: () => {
            const { quickEditSpotIds, quickEditCurrentIndex } = get();
            if (quickEditSpotIds.length === 0) return;

            const prevIndex = quickEditCurrentIndex <= 0
              ? quickEditSpotIds.length - 1  // Wrap around
              : quickEditCurrentIndex - 1;

            set({
              quickEditCurrentIndex: prevIndex,
              activeSpotId: quickEditSpotIds[prevIndex],
            });
          },

          quickEditGoToIndex: (index) => {
            const { quickEditSpotIds } = get();
            if (index < 0 || index >= quickEditSpotIds.length) return;

            set({
              quickEditCurrentIndex: index,
              activeSpotId: quickEditSpotIds[index],
            });
          },

          quickEditMarkReviewed: () => {
            const { quickEditSpotIds, quickEditCurrentIndex, quickEditReviewedIds, quickEditNext } = get();
            if (quickEditCurrentIndex < 0 || quickEditCurrentIndex >= quickEditSpotIds.length) return;

            const currentSpotId = quickEditSpotIds[quickEditCurrentIndex];
            if (!quickEditReviewedIds.includes(currentSpotId)) {
              set({
                quickEditReviewedIds: [...quickEditReviewedIds, currentSpotId],
              });
            }

            // Advance to next spot
            quickEditNext();
          },

          quickEditDeleteCurrent: () => {
            const {
              quickEditSpotIds,
              quickEditCurrentIndex,
              quickEditDeletedCount,
              quickEditReviewedIds,
              deleteSpot,
            } = get();

            if (quickEditCurrentIndex < 0 || quickEditCurrentIndex >= quickEditSpotIds.length) return;

            const currentSpotId = quickEditSpotIds[quickEditCurrentIndex];

            // Remove from quick edit list
            const newSpotIds = quickEditSpotIds.filter((id) => id !== currentSpotId);
            const newReviewedIds = quickEditReviewedIds.filter((id) => id !== currentSpotId);

            // Calculate new index
            let newIndex = quickEditCurrentIndex;
            if (newSpotIds.length === 0) {
              newIndex = -1;
            } else if (newIndex >= newSpotIds.length) {
              newIndex = newSpotIds.length - 1;
            }

            // Delete the actual spot
            deleteSpot(currentSpotId);

            // Update quick edit state
            set({
              quickEditSpotIds: newSpotIds,
              quickEditCurrentIndex: newIndex,
              quickEditDeletedCount: quickEditDeletedCount + 1,
              quickEditReviewedIds: newReviewedIds,
              activeSpotId: newIndex >= 0 ? newSpotIds[newIndex] : null,
            });

            // Exit if no spots remaining
            if (newSpotIds.length === 0) {
              get().exitQuickEditMode();
            }
          },

          // ========== GENERATION SETTINGS ACTIONS ==========

          setLastPointCountSettings: (settings) => set({ lastPointCountSettings: settings }),

          setLastGrainDetectionSettings: (settings) => set({ lastGrainDetectionSettings: settings }),
        }),
        {
          // Temporal (undo/redo) configuration
          limit: 50,
          equality: (a, b) => a.project === b.project,
        }
      ),
      {
        // Persistence configuration
        name: 'strabomicro-storage',
        // Use custom Electron storage instead of localStorage for reliable persistence
        storage: createJSONStorage(getElectronStorage),
        partialize: (state) => ({
          // Project data (metadata only, not large binary data)
          project: state.project,
          projectFilePath: state.projectFilePath,
          isDirty: state.isDirty,

          // Navigation state
          activeDatasetId: state.activeDatasetId,
          activeSampleId: state.activeSampleId,
          activeMicrographId: state.activeMicrographId,

          // UI preferences
          sidebarTab: state.sidebarTab,
          detailsPanelOpen: state.detailsPanelOpen,
          showSpotLabels: state.showSpotLabels,
          showMicrographOutlines: state.showMicrographOutlines,
          showRecursiveSpots: state.showRecursiveSpots,
          showArchivedSpots: state.showArchivedSpots,
          spotOverlayOpacity: state.spotOverlayOpacity,
          theme: state.theme,

          // Sidebar expansion state
          expandedDatasets: state.expandedDatasets,
          expandedSamples: state.expandedSamples,
          expandedMicrographs: state.expandedMicrographs,

          // Quick Classify settings
          quickClassifyShortcuts: state.quickClassifyShortcuts,

          // Generation settings
          lastPointCountSettings: state.lastPointCountSettings,
          lastGrainDetectionSettings: state.lastGrainDetectionSettings,
        }),
        // Rebuild indexes after rehydrating from file storage
        onRehydrateStorage: () => (state) => {
          if (state?.project) {
            // Rebuild the micrograph and spot indexes from the project data
            state.micrographIndex = buildMicrographIndex(state.project);
            state.spotIndex = buildSpotIndex(state.project);
            console.log('[Store] Rehydrated indexes - micrographs:', state.micrographIndex.size, 'spots:', state.spotIndex.size);
          }
          // Sync theme with main process menu after rehydration
          if (state?.theme && window.api?.notifyThemeChanged) {
            window.api.notifyThemeChanged(state.theme);
          }
        },
      }
    ),
    {
      // DevTools configuration
      name: 'StraboMicro',
    }
  )
);

// ============================================================================
// UNDO/REDO HOOKS (from zundo temporal middleware)
// ============================================================================

export const useTemporalStore = useAppStore.temporal;

// ============================================================================
// DEBUG HELPERS (development only)
// ============================================================================

if (import.meta.env.DEV) {
  // Expose store to window for debugging in DevTools console
  (window as any).__STRABO_STORE__ = useAppStore;

  // Helper function to inspect current project
  (window as any).inspectProject = () => {
    const state = useAppStore.getState();
    console.log('=== PROJECT STATE ===');
    console.log('Project:', state.project);
    console.log('File Path:', state.projectFilePath);
    console.log('Is Dirty:', state.isDirty);
    console.log('Active Dataset ID:', state.activeDatasetId);
    console.log('Active Sample ID:', state.activeSampleId);
    console.log('Active Micrograph ID:', state.activeMicrographId);
    console.log('Active Spot ID:', state.activeSpotId);
    console.log('Selected Spot IDs:', state.selectedSpotIds);
    console.log('Micrograph Index Size:', state.micrographIndex.size);
    console.log('Spot Index Size:', state.spotIndex.size);
    return state.project;
  };

  // Helper to get full state
  (window as any).getStoreState = () => useAppStore.getState();

  console.log('🔍 Debug helpers available:');
  console.log('  - inspectProject() - View current project data');
  console.log('  - getStoreState() - Get full store state');
  console.log('  - __STRABO_STORE__ - Direct store access');
}
