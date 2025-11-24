/**
 * StraboMicro Application Store
 *
 * Zustand store for managing application state including:
 * - Project data (ProjectMetadata hierarchy)
 * - Navigation state (active selections)
 * - Viewer state (zoom, pan, tool)
 * - UI preferences (persisted to localStorage)
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import {
  ProjectMetadata,
  DatasetMetadata,
  SampleMetadata,
  MicrographMetadata,
  Spot,
  GroupMetadata,
} from '@/types/project-types';
import {
  updateMicrograph,
  updateSpot,
  buildMicrographIndex,
  buildSpotIndex,
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

  // ========== SELECTION STATE ==========
  selectedSpotIds: string[]; // Multi-selection for batch operations

  // ========== VIEWER STATE ==========
  activeTool: DrawingTool;
  editingSpotId: string | null; // Spot currently being edited
  editingGeometry: Array<{ X: number; Y: number }> | null; // Draft geometry during editing (not saved)
  originalGeometry: Array<{ X: number; Y: number }> | null; // Backup of original geometry for cancel
  zoom: number;
  pan: { x: number; y: number };
  showSpotLabels: boolean;
  showMicrographOutlines: boolean;
  showRulers: boolean;
  spotOverlayOpacity: number;
  viewerRef: React.RefObject<TiledViewerRef> | null;

  // ========== UI STATE (persisted) ==========
  sidebarTab: SidebarTab;
  detailsPanelOpen: boolean;
  theme: ThemeMode;

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
  selectMicrograph: (id: string | null) => void;
  selectActiveSpot: (id: string | null) => void;

  // ========== SELECTION ACTIONS ==========
  selectSpot: (id: string, multiSelect?: boolean) => void;
  deselectSpot: (id: string) => void;
  clearSpotSelection: () => void;

  // ========== CRUD: DATASET ==========
  addDataset: (dataset: DatasetMetadata) => void;
  updateDataset: (id: string, updates: Partial<DatasetMetadata>) => void;
  deleteDataset: (id: string) => void;

  // ========== CRUD: SAMPLE ==========
  addSample: (datasetId: string, sample: SampleMetadata) => void;
  updateSample: (id: string, updates: Partial<SampleMetadata>) => void;
  deleteSample: (id: string) => void;

  // ========== CRUD: MICROGRAPH ==========
  addMicrograph: (sampleId: string, micrograph: MicrographMetadata) => void;
  updateMicrographMetadata: (id: string, updates: Partial<MicrographMetadata>) => void;
  deleteMicrograph: (id: string) => void;

  // ========== CRUD: SPOT ==========
  addSpot: (micrographId: string, spot: Spot) => void;
  updateSpotData: (id: string, updates: Partial<Spot>) => void;
  deleteSpot: (id: string) => void;

  // ========== CRUD: GROUP ==========
  createGroup: (group: GroupMetadata) => void;
  updateGroup: (id: string, updates: Partial<GroupMetadata>) => void;
  deleteGroup: (id: string) => void;
  addMicrographToGroup: (groupId: string, micrographId: string) => void;
  removeMicrographFromGroup: (groupId: string, micrographId: string) => void;
  setGroupExpanded: (groupId: string, expanded: boolean) => void;

  // ========== VIEWER ACTIONS ==========
  setActiveTool: (tool: DrawingTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setShowSpotLabels: (show: boolean) => void;
  setShowMicrographOutlines: (show: boolean) => void;
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

          selectedSpotIds: [],

          activeTool: 'select',
          editingSpotId: null,
          editingGeometry: null,
          originalGeometry: null,
          zoom: 1,
          pan: { x: 0, y: 0 },
          showSpotLabels: true,
          showMicrographOutlines: true,
          showRulers: true,
          spotOverlayOpacity: 0.7,
          viewerRef: null,

          sidebarTab: 'samples',
          detailsPanelOpen: true,
          theme: 'dark',

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

          selectMicrograph: (id) => set({ activeMicrographId: id, activeSpotId: null }),

          selectActiveSpot: (id) => set({ activeSpotId: id }),

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

            const newProject = updateMicrograph(state.project, id, (micrograph) => {
              Object.assign(micrograph, updates);
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
                sample.micrographs = sample.micrographs?.filter(m => m.id !== id) || [];
              }
            }

            return {
              project: newProject,
              isDirty: true,
              micrographIndex: buildMicrographIndex(newProject),
              spotIndex: buildSpotIndex(newProject),
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

          // ========== VIEWER ACTIONS ==========

          setActiveTool: (tool) => set({ activeTool: tool }),

          setZoom: (zoom) => set({ zoom }),

          setPan: (pan) => set({ pan }),

          setShowSpotLabels: (show) => set({ showSpotLabels: show }),

          setShowMicrographOutlines: (show) => set({ showMicrographOutlines: show }),

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

              const newProject = { ...state.project };
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
          spotOverlayOpacity: state.spotOverlayOpacity,
          theme: state.theme,
        }),
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
