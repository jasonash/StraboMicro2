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
} from '@/types/project-types';
import {
  updateMicrograph,
  updateSpot,
  buildMicrographIndex,
  buildSpotIndex,
} from './helpers';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type DrawingTool = 'select' | 'point' | 'line' | 'polygon' | 'measure' | null;
export type SidebarTab = 'samples' | 'groups' | 'spots' | 'tags';

interface AppState {
  // ========== PROJECT STATE ==========
  project: ProjectMetadata | null;
  projectFilePath: string | null;
  isDirty: boolean;

  // ========== NAVIGATION STATE ==========
  activeDatasetId: string | null;
  activeSampleId: string | null;
  activeMicrographId: string | null;

  // ========== SELECTION STATE ==========
  selectedSpotIds: string[];

  // ========== VIEWER STATE ==========
  activeTool: DrawingTool;
  zoom: number;
  pan: { x: number; y: number };
  showSpotLabels: boolean;
  showMicrographOutlines: boolean;
  spotOverlayOpacity: number;

  // ========== UI STATE (persisted) ==========
  sidebarTab: SidebarTab;
  detailsPanelOpen: boolean;

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

  // ========== VIEWER ACTIONS ==========
  setActiveTool: (tool: DrawingTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setShowSpotLabels: (show: boolean) => void;
  setShowMicrographOutlines: (show: boolean) => void;
  setSpotOverlayOpacity: (opacity: number) => void;

  // ========== UI ACTIONS ==========
  setSidebarTab: (tab: SidebarTab) => void;
  setDetailsPanelOpen: (open: boolean) => void;
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

          selectedSpotIds: [],

          activeTool: 'select',
          zoom: 1,
          pan: { x: 0, y: 0 },
          showSpotLabels: true,
          showMicrographOutlines: true,
          spotOverlayOpacity: 0.7,

          sidebarTab: 'samples',
          detailsPanelOpen: true,

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
            selectedSpotIds: [],
            micrographIndex: new Map(),
            spotIndex: new Map(),
          }),

          saveProject: () => {
            // TODO: Implement actual file save via Electron IPC
            // For now, just mark as clean
            set({ isDirty: false });
          },

          markDirty: () => set({ isDirty: true }),

          markClean: () => set({ isDirty: false }),

          // ========== NAVIGATION ACTIONS ==========

          selectDataset: (id) => set({ activeDatasetId: id }),

          selectSample: (id) => set({ activeSampleId: id }),

          selectMicrograph: (id) => set({ activeMicrographId: id }),

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

          // ========== VIEWER ACTIONS ==========

          setActiveTool: (tool) => set({ activeTool: tool }),

          setZoom: (zoom) => set({ zoom }),

          setPan: (pan) => set({ pan }),

          setShowSpotLabels: (show) => set({ showSpotLabels: show }),

          setShowMicrographOutlines: (show) => set({ showMicrographOutlines: show }),

          setSpotOverlayOpacity: (opacity) => set({ spotOverlayOpacity: opacity }),

          // ========== UI ACTIONS ==========

          setSidebarTab: (tab) => set({ sidebarTab: tab }),

          setDetailsPanelOpen: (open) => set({ detailsPanelOpen: open }),
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
