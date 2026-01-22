/**
 * Project Tree Component
 *
 * Displays the project hierarchy (Datasets → Samples → Micrographs) in a collapsible tree view.
 * Includes "Add" buttons at each level to trigger the appropriate dialog.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Stack,
  Avatar,
  CircularProgress,
  Menu,
  MenuItem,
  Popover,
  Slider,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
  Add,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Science,
  MoreVert,
  Visibility,
  VisibilityOff,
  DragIndicator,
  Close as CloseIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/store';
import { NewDatasetDialog } from './dialogs/NewDatasetDialog';
import { NewSampleDialog } from './dialogs/NewSampleDialog';
import { NewMicrographDialog } from './dialogs/NewMicrographDialog';
import { EditSampleDialog } from './dialogs/EditSampleDialog';
import { EditDatasetDialog } from './dialogs/EditDatasetDialog';
import { EditProjectDialog } from './dialogs/EditProjectDialog';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { AddMicrographToGroupsDialog } from './dialogs/AddMicrographToGroupsDialog';
import { EditMicrographDialog } from './dialogs/metadata/EditMicrographDialog';
import { EditMicrographLocationDialog } from './dialogs/EditMicrographLocationDialog';
import { BatchImportDialog } from './dialogs/BatchImportDialog';
import { SetScaleDialog } from './dialogs/SetScaleDialog';
import { LinkSiblingDialog } from './dialogs/LinkSiblingDialog';
import { AddSiblingXPLDialog } from './dialogs/AddSiblingXPLDialog';
import { findMicrographById } from '@/store/helpers';
import type { DatasetMetadata, SampleMetadata, MicrographMetadata } from '@/types/project-types';

/**
 * Micrograph Thumbnail Component
 * Loads and displays composite thumbnail (with overlays) for a micrograph
 */
interface MicrographThumbnailProps {
  micrographId: string;
  projectId: string;
  micrographName: string;
  width?: number;
  height?: number;
  /** Whether this micrograph needs scale to be set */
  needsScale?: boolean;
  /** Whether this micrograph needs location to be set (associated micrographs only) */
  needsLocation?: boolean;
}

function MicrographThumbnail({
  micrographId,
  projectId,
  micrographName,
  width = 40,
  height = 40,
  needsScale = false,
  needsLocation = false,
}: MicrographThumbnailProps) {
  const needsSetup = needsScale || needsLocation;
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadThumbnail = useCallback(async () => {
    if (!window.api) return;

    setLoading(true);

    try {
      // Load thumbnail as base64 data URL from main process
      const dataUrl = await window.api.loadCompositeThumbnail(projectId, micrographId);

      if (dataUrl) {
        setThumbnailDataUrl(dataUrl);
      } else {
        setThumbnailDataUrl(null);
      }
    } catch (error) {
      console.error('[MicrographThumbnail] Error loading thumbnail:', error);
      setThumbnailDataUrl(null);
    } finally {
      setLoading(false);
    }
  }, [micrographId, projectId]);

  // Initial load
  useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail]);

  // Listen for thumbnail generation events
  useEffect(() => {
    const handleThumbnailGenerated = (event: Event) => {
      const customEvent = event as CustomEvent<{ micrographId: string }>;
      if (customEvent.detail.micrographId === micrographId) {
        console.log(`[MicrographThumbnail] Reloading thumbnail for ${micrographId}`);
        // Reload the thumbnail after a delay to ensure file is written and synced
        // Longer delay to account for file system sync
        setTimeout(() => {
          loadThumbnail();
        }, 500);
      }
    };

    const handleRebuildAll = () => {
      console.log(`[MicrographThumbnail] Rebuild all triggered, reloading ${micrographId}`);
      // Reload the thumbnail after a delay to ensure file is written
      setTimeout(() => {
        loadThumbnail();
      }, 500);
    };

    window.addEventListener('thumbnail-generated', handleThumbnailGenerated);
    window.addEventListener('rebuild-all-thumbnails', handleRebuildAll);

    return () => {
      window.removeEventListener('thumbnail-generated', handleThumbnailGenerated);
      window.removeEventListener('rebuild-all-thumbnails', handleRebuildAll);
    };
  }, [micrographId, loadThumbnail]);

  if (loading) {
    return (
      <Avatar
        variant="rounded"
        sx={{
          width,
          height,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={Math.min(width, height) / 2} thickness={4} />
      </Avatar>
    );
  }

  if (!thumbnailDataUrl) {
    // Fallback to icon if no thumbnail exists
    return (
      <Avatar
        variant="rounded"
        sx={{
          width,
          height,
          bgcolor: 'action.hover',
        }}
      >
        <ImageIcon fontSize="small" />
      </Avatar>
    );
  }

  // Build tooltip message for incomplete setup
  const tooltipMessage = needsSetup
    ? [
        needsScale && 'Scale not set',
        needsLocation && 'Location not set',
      ].filter(Boolean).join(' • ')
    : '';

  const thumbnail = (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Avatar
        variant="rounded"
        src={thumbnailDataUrl}
        alt={micrographName}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {needsSetup && (
        <Tooltip title={tooltipMessage} placement="top" arrow>
          <Box
            sx={{
              position: 'absolute',
              top: 6,
              right: 6,
              backgroundColor: 'warning.main',
              borderRadius: '50%',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 2,
            }}
          >
            <WarningIcon sx={{ fontSize: 18, color: 'warning.contrastText' }} />
          </Box>
        </Tooltip>
      )}
    </Box>
  );

  return thumbnail;
}

/**
 * Sortable wrapper for drag handle
 * Used to make items draggable within their sortable context
 */
interface SortableItemWrapperProps {
  id: string;
  children: React.ReactNode;
}

function SortableItemWrapper({ id, children }: SortableItemWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{ display: 'flex', alignItems: 'flex-start' }}>
      {/* Drag Handle - compact to save space */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          cursor: 'grab',
          p: 0.25,
          mt: 0.75,
          opacity: 0.35,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          '&:hover': {
            opacity: 1,
          },
          '&:active': {
            cursor: 'grabbing',
          },
        }}
        tabIndex={-1}
      >
        <DragIndicator sx={{ fontSize: 14 }} />
      </Box>
      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export function ProjectTree() {
  const project = useAppStore((state) => state.project);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const deleteDataset = useAppStore((state) => state.deleteDataset);
  const deleteSample = useAppStore((state) => state.deleteSample);
  const deleteMicrograph = useAppStore((state) => state.deleteMicrograph);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const reorderMicrographs = useAppStore((state) => state.reorderMicrographs);
  const reorderSamples = useAppStore((state) => state.reorderSamples);
  const reorderDatasets = useAppStore((state) => state.reorderDatasets);
  const unlinkSiblingImages = useAppStore((state) => state.unlinkSiblingImages);

  // Drag and drop sensors with activation constraint to distinguish from clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Dialog states
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [showNewSample, setShowNewSample] = useState(false);
  const [showNewMicrograph, setShowNewMicrograph] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [selectedParentMicrographId, setSelectedParentMicrographId] = useState<string | null>(null);

  // Edit/Delete dialog states
  const [showEditProject, setShowEditProject] = useState(false);
  const [showEditDataset, setShowEditDataset] = useState(false);
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [showEditSample, setShowEditSample] = useState(false);
  const [editingSample, setEditingSample] = useState<SampleMetadata | null>(null);
  const [showEditMicrograph, setShowEditMicrograph] = useState(false);
  const [editingMicrographId, setEditingMicrographId] = useState<string | null>(null);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [editLocationMicrographId, setEditLocationMicrographId] = useState<string | null>(null);
  const [showAddToGroups, setShowAddToGroups] = useState(false);
  const [addToGroupsMicrograph, setAddToGroupsMicrograph] = useState<MicrographMetadata | null>(
    null
  );

  // Confirm dialog states
  const [showDeleteDatasetConfirm, setShowDeleteDatasetConfirm] = useState(false);
  const [deletingDataset, setDeletingDataset] = useState<DatasetMetadata | null>(null);
  const [showDeleteSampleConfirm, setShowDeleteSampleConfirm] = useState(false);
  const [deletingSample, setDeletingSample] = useState<SampleMetadata | null>(null);
  const [showDeleteMicrographConfirm, setShowDeleteMicrographConfirm] = useState(false);
  const [deletingMicrograph, setDeletingMicrograph] = useState<MicrographMetadata | null>(null);

  // Batch import dialog states
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportSampleId, setBatchImportSampleId] = useState<string | null>(null);
  const [batchImportParentMicrographId, setBatchImportParentMicrographId] = useState<string | null>(
    null
  );

  // Set scale dialog state (for batch-imported reference micrographs)
  const [showSetScale, setShowSetScale] = useState(false);
  const [setScaleMicrographId, setSetScaleMicrographId] = useState<string | null>(null);

  // Link Sibling dialog state (for PPL/XPL pairing)
  const [showLinkSibling, setShowLinkSibling] = useState(false);
  const [linkSiblingMicrographId, setLinkSiblingMicrographId] = useState<string | null>(null);

  // Add Sibling XPL dialog state (for adding XPL after-the-fact)
  const [showAddSiblingXPL, setShowAddSiblingXPL] = useState(false);
  const [addSiblingXPLMicrographId, setAddSiblingXPLMicrographId] = useState<string | null>(null);

  // Opacity popover state (use position instead of element to avoid anchor disappearing)
  const [opacityAnchorPosition, setOpacityAnchorPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [opacityMicrographId, setOpacityMicrographId] = useState<string | null>(null);
  const [opacityValue, setOpacityValue] = useState<number>(1.0);

  // Batch opacity editing state (for all overlay children)
  const [batchOpacityAnchorPosition, setBatchOpacityAnchorPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [batchOpacityParentId, setBatchOpacityParentId] = useState<string | null>(null);
  const [batchOpacityValue, setBatchOpacityValue] = useState<number>(1.0);

  // Expansion states - from zustand store (persisted via session state)
  const expandedDatasetsArray = useAppStore((state) => state.expandedDatasets);
  const expandedSamplesArray = useAppStore((state) => state.expandedSamples);
  const expandedMicrographsArray = useAppStore((state) => state.expandedMicrographs);
  const setExpandedDatasetsStore = useAppStore((state) => state.setExpandedDatasets);
  const setExpandedSamplesStore = useAppStore((state) => state.setExpandedSamples);
  const setExpandedMicrographsStore = useAppStore((state) => state.setExpandedMicrographs);

  // Convert arrays to Sets for efficient lookup
  const expandedDatasets = new Set(expandedDatasetsArray);
  const expandedSamples = new Set(expandedSamplesArray);
  const expandedMicrographs = new Set(expandedMicrographsArray);

  // Helper functions to update expansion state
  const setExpandedDatasets = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (typeof updater === 'function') {
        const newSet = updater(expandedDatasets);
        setExpandedDatasetsStore(Array.from(newSet));
      } else {
        setExpandedDatasetsStore(Array.from(updater));
      }
    },
    [expandedDatasets, setExpandedDatasetsStore]
  );

  const setExpandedSamples = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (typeof updater === 'function') {
        const newSet = updater(expandedSamples);
        setExpandedSamplesStore(Array.from(newSet));
      } else {
        setExpandedSamplesStore(Array.from(updater));
      }
    },
    [expandedSamples, setExpandedSamplesStore]
  );

  const setExpandedMicrographs = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (typeof updater === 'function') {
        const newSet = updater(expandedMicrographs);
        setExpandedMicrographsStore(Array.from(newSet));
      } else {
        setExpandedMicrographsStore(Array.from(updater));
      }
    },
    [expandedMicrographs, setExpandedMicrographsStore]
  );

  // Track known IDs to avoid re-expanding items the user has collapsed
  // This is separate from expanded state - it tracks what we've "seen" before
  // These remain in localStorage since they're just for auto-expand behavior
  const [knownDatasetIds, setKnownDatasetIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sidebar-known-datasets');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [knownSampleIds, setKnownSampleIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sidebar-known-samples');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Menu states - Options (three-dot) menus
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
  const [datasetMenuAnchor, setDatasetMenuAnchor] = useState<{ [key: string]: HTMLElement | null }>(
    {}
  );
  const [sampleMenuAnchor, setSampleMenuAnchor] = useState<{ [key: string]: HTMLElement | null }>(
    {}
  );
  const [micrographOptionsAnchor, setMicrographOptionsAnchor] = useState<{
    [key: string]: HTMLElement | null;
  }>({});

  // Menu states - Add (plus) menus
  const [projectAddAnchor, setProjectAddAnchor] = useState<HTMLElement | null>(null);
  const [datasetAddAnchor, setDatasetAddAnchor] = useState<{ [key: string]: HTMLElement | null }>(
    {}
  );
  const [sampleAddAnchor, setSampleAddAnchor] = useState<{ [key: string]: HTMLElement | null }>(
    {}
  );
  const [micrographAddAnchor, setMicrographAddAnchor] = useState<{
    [key: string]: HTMLElement | null;
  }>({});

  // Save known IDs to localStorage (expansion state is now in zustand store)
  useEffect(() => {
    localStorage.setItem('sidebar-known-datasets', JSON.stringify(Array.from(knownDatasetIds)));
  }, [knownDatasetIds]);

  useEffect(() => {
    localStorage.setItem('sidebar-known-samples', JSON.stringify(Array.from(knownSampleIds)));
  }, [knownSampleIds]);

  // Auto-expand newly added datasets and samples (only ones we haven't seen before)
  useEffect(() => {
    if (!project?.datasets) return;

    const newExpandedDatasets = new Set(expandedDatasets);
    const newExpandedSamples = new Set(expandedSamples);
    const newKnownDatasets = new Set(knownDatasetIds);
    const newKnownSamples = new Set(knownSampleIds);
    let expandedChanged = false;
    let knownChanged = false;

    // Only expand datasets/samples that we haven't seen before
    project.datasets.forEach((dataset) => {
      if (!newKnownDatasets.has(dataset.id)) {
        // This is a new dataset - expand it and mark as known
        newExpandedDatasets.add(dataset.id);
        newKnownDatasets.add(dataset.id);
        expandedChanged = true;
        knownChanged = true;
      }

      // Check samples in each dataset
      dataset.samples?.forEach((sample) => {
        if (!newKnownSamples.has(sample.id)) {
          // This is a new sample - expand it and mark as known
          newExpandedSamples.add(sample.id);
          newKnownSamples.add(sample.id);
          expandedChanged = true;
          knownChanged = true;
        }
      });
    });

    if (expandedChanged) {
      setExpandedDatasets(newExpandedDatasets);
      setExpandedSamples(newExpandedSamples);
    }
    if (knownChanged) {
      setKnownDatasetIds(newKnownDatasets);
      setKnownSampleIds(newKnownSamples);
    }
  }, [project?.datasets]);

  const toggleDataset = (datasetId: string) => {
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(datasetId)) {
        next.delete(datasetId);
      } else {
        next.add(datasetId);
      }
      return next;
    });
  };

  const toggleSample = (sampleId: string) => {
    setExpandedSamples((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) {
        next.delete(sampleId);
      } else {
        next.add(sampleId);
      }
      return next;
    });
  };

  const toggleMicrograph = (micrographId: string) => {
    setExpandedMicrographs((prev) => {
      const next = new Set(prev);
      if (next.has(micrographId)) {
        next.delete(micrographId);
      } else {
        next.add(micrographId);
      }
      return next;
    });
  };

  const handleAddDataset = () => {
    setShowNewDataset(true);
  };

  const handleAddSample = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    // Ensure the dataset is expanded when adding a sample
    setExpandedDatasets((prev) => new Set(prev).add(datasetId));
    setShowNewSample(true);
  };

  const handleAddReferenceMicrograph = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    setSelectedParentMicrographId(null);
    // Ensure the sample is expanded when adding a reference micrograph
    setExpandedSamples((prev) => new Set(prev).add(sampleId));
    setShowNewMicrograph(true);
  };

  const handleAddAssociatedMicrograph = (parentMicrographId: string) => {
    setSelectedSampleId(null);
    setSelectedParentMicrographId(parentMicrographId);
    // Ensure the parent micrograph is expanded when adding an associated micrograph
    setExpandedMicrographs((prev) => new Set(prev).add(parentMicrographId));
    setShowNewMicrograph(true);
  };

  const handleMicrographClick = (micrographId: string) => {
    // Check if micrograph needs scale setup (batch-imported without scale)
    if (project) {
      const micrograph = findMicrographById(project, micrographId);
      if (micrograph) {
        // Check if micrograph has no scale set
        if (
          micrograph.scalePixelsPerCentimeter === undefined ||
          micrograph.scalePixelsPerCentimeter === null
        ) {
          const isAssociated = !!micrograph.parentID;

          if (isAssociated) {
            // For associated micrographs, use the location/scale dialog
            setEditLocationMicrographId(micrographId);
            setShowEditLocation(true);
          } else {
            // For reference micrographs, use the set scale dialog
            setSetScaleMicrographId(micrographId);
            setShowSetScale(true);
          }
          return;
        }
      }
    }

    // Normal selection if scale is set
    selectMicrograph(micrographId);
  };

  // Build hierarchy from flat micrograph array
  const buildMicrographHierarchy = (
    micrographs: MicrographMetadata[],
    parentId: string | null = null
  ): MicrographMetadata[] => {
    return micrographs.filter((m) => {
      // Filter by parent ID
      if ((m.parentID || null) !== parentId) return false;
      // Filter out secondary siblings (XPL images) - only show primary (PPL)
      // isPrimarySibling is true for primary (show), false for secondary (hide), null/undefined for no sibling
      if (m.isPrimarySibling === false) return false;
      return true;
    });
  };

  // Handle drag end for micrograph reordering
  const handleMicrographDragEnd = async (
    event: DragEndEvent,
    sampleId: string,
    parentId: string | null,
    items: MicrographMetadata[]
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((m) => m.id === active.id);
    const newIndex = items.findIndex((m) => m.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(items, oldIndex, newIndex);
    reorderMicrographs(
      sampleId,
      parentId,
      newOrder.map((m) => m.id)
    );

    // Regenerate parent's composite thumbnail if we reordered children under a parent
    if (parentId && project && window.api) {
      try {
        // Get updated project data for thumbnail generation
        const currentProject = useAppStore.getState().project;
        if (currentProject) {
          await window.api.generateCompositeThumbnail(currentProject.id, parentId, currentProject);
          // Dispatch event to notify thumbnail components to reload
          window.dispatchEvent(
            new CustomEvent('thumbnail-generated', { detail: { micrographId: parentId } })
          );
        }
      } catch (error) {
        console.error('[ProjectTree] Error regenerating parent thumbnail:', error);
      }
    }
  };

  // Handle drag end for sample reordering
  const handleSampleDragEnd = (
    event: DragEndEvent,
    datasetId: string,
    samples: SampleMetadata[]
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = samples.findIndex((s) => s.id === active.id);
    const newIndex = samples.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(samples, oldIndex, newIndex);
    reorderSamples(
      datasetId,
      newOrder.map((s) => s.id)
    );
  };

  // Keyboard shortcut handlers for moving items up/down
  const handleMicrographKeyDown = async (
    e: React.KeyboardEvent,
    micrographId: string,
    sampleId: string,
    parentId: string | null,
    siblings: MicrographMetadata[]
  ) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const currentIndex = siblings.findIndex((m) => m.id === micrographId);
    if (currentIndex === -1) return;

    let didReorder = false;

    if (e.key === 'ArrowUp' && currentIndex > 0) {
      e.preventDefault();
      const newOrder = arrayMove(siblings, currentIndex, currentIndex - 1);
      reorderMicrographs(
        sampleId,
        parentId,
        newOrder.map((m) => m.id)
      );
      didReorder = true;
    } else if (e.key === 'ArrowDown' && currentIndex < siblings.length - 1) {
      e.preventDefault();
      const newOrder = arrayMove(siblings, currentIndex, currentIndex + 1);
      reorderMicrographs(
        sampleId,
        parentId,
        newOrder.map((m) => m.id)
      );
      didReorder = true;
    }

    // Regenerate parent's composite thumbnail if we reordered children under a parent
    if (didReorder && parentId && window.api) {
      try {
        const currentProject = useAppStore.getState().project;
        if (currentProject) {
          await window.api.generateCompositeThumbnail(currentProject.id, parentId, currentProject);
          window.dispatchEvent(
            new CustomEvent('thumbnail-generated', { detail: { micrographId: parentId } })
          );
        }
      } catch (error) {
        console.error('[ProjectTree] Error regenerating parent thumbnail:', error);
      }
    }
  };

  const handleSampleKeyDown = (
    e: React.KeyboardEvent,
    sampleId: string,
    datasetId: string,
    samples: SampleMetadata[]
  ) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const currentIndex = samples.findIndex((s) => s.id === sampleId);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowUp' && currentIndex > 0) {
      e.preventDefault();
      const newOrder = arrayMove(samples, currentIndex, currentIndex - 1);
      reorderSamples(
        datasetId,
        newOrder.map((s) => s.id)
      );
    } else if (e.key === 'ArrowDown' && currentIndex < samples.length - 1) {
      e.preventDefault();
      const newOrder = arrayMove(samples, currentIndex, currentIndex + 1);
      reorderSamples(
        datasetId,
        newOrder.map((s) => s.id)
      );
    }
  };

  // Handle drag end for dataset reordering
  const handleDatasetDragEnd = (event: DragEndEvent, datasets: DatasetMetadata[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = datasets.findIndex((d) => d.id === active.id);
    const newIndex = datasets.findIndex((d) => d.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(datasets, oldIndex, newIndex);
    reorderDatasets(newOrder.map((d) => d.id));
  };

  const handleDatasetKeyDown = (
    e: React.KeyboardEvent,
    datasetId: string,
    datasets: DatasetMetadata[]
  ) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const currentIndex = datasets.findIndex((d) => d.id === datasetId);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowUp' && currentIndex > 0) {
      e.preventDefault();
      const newOrder = arrayMove(datasets, currentIndex, currentIndex - 1);
      reorderDatasets(newOrder.map((d) => d.id));
    } else if (e.key === 'ArrowDown' && currentIndex < datasets.length - 1) {
      e.preventDefault();
      const newOrder = arrayMove(datasets, currentIndex, currentIndex + 1);
      reorderDatasets(newOrder.map((d) => d.id));
    }
  };

  // Color-coded left borders by hierarchy depth (cycles: red → green → blue → red...)
  const LEVEL_COLORS = [
    '#e44c65', // Red - first level associated
    '#39c088', // Green - second level
    '#5480f1', // Blue - third level
  ];

  const getLevelColor = (level: number): string => {
    if (level <= 0) return 'transparent';
    // Cycle through colors: level 1 = red (index 0), level 2 = green (index 1), level 3 = blue (index 2), level 4 = red (index 0), etc.
    return LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];
  };

  const renderMicrograph = (
    micrograph: MicrographMetadata,
    allMicrographs: MicrographMetadata[],
    level: number,
    sampleId: string,
    siblings: MicrographMetadata[]
  ) => {
    const isExpanded = expandedMicrographs.has(micrograph.id);
    const isActive = micrograph.id === activeMicrographId;
    const children = buildMicrographHierarchy(allMicrographs, micrograph.id);
    const hasChildren = children.length > 0;
    const isReference = !micrograph.parentID;
    const isHidden = micrograph.isMicroVisible === false;
    const parentId = micrograph.parentID || null;

    // Check if micrograph needs setup (missing scale or location)
    const needsScale = !micrograph.scalePixelsPerCentimeter;
    // Location can be set via offsetInParent (scaled rectangle), pointInParent (approximate point), or affine placement
    const hasLocation = micrograph.offsetInParent || micrograph.pointInParent || micrograph.xOffset !== undefined || micrograph.placementType === 'affine';
    const needsLocation = !isReference && !hasLocation;
    const needsSetup = needsScale || needsLocation;

    // Use percentage-based sizing for responsive thumbnails
    // This allows thumbnails to shrink/grow with the sidebar width
    // No fixed pixel calculations needed - CSS will handle it automatically

    // Use uniform indentation - only indent at first associated level
    // Color-coded borders indicate depth instead of cumulative indentation

    return (
      <Box
        key={micrograph.id}
        sx={{ ml: 0 }}
        tabIndex={0}
        onKeyDown={(e) => handleMicrographKeyDown(e, micrograph.id, sampleId, parentId, siblings)}
      >
        {/* Micrograph Container */}
        <Box
          sx={{
            mb: 1,
            py: 1,
            pr: 1,
            borderRadius: 1,
            // Selected state: tinted coral/red background
            backgroundColor: isActive
              ? 'rgba(204, 51, 51, 0.20)'
              : !isReference
                ? 'action.hover'
                : 'transparent',
            '&:hover': {
              backgroundColor: isActive
                ? 'rgba(204, 51, 51, 0.25)'
                : 'action.hover',
            },
            // Color-coded left border for associated micrographs to show hierarchy depth
            borderLeft: !isReference ? 3 : 0,
            borderColor: getLevelColor(level),
          }}
        >
          {/* Micrograph Name with Expand/Collapse */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
            {hasChildren ? (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMicrograph(micrograph.id);
                }}
                sx={{ p: 0, width: 20, height: 20 }}
              >
                {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
              </IconButton>
            ) : (
              <Box sx={{ width: 20 }} />
            )}
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                fontSize: '0.875rem',
                fontWeight: isReference ? 600 : 400,
                cursor: 'pointer',
              }}
              onClick={() => handleMicrographClick(micrograph.id)}
            >
              {micrograph.name || micrograph.imageFilename || 'Unnamed Micrograph'}
              {isReference && ' (Reference)'}
            </Typography>
            {/* PPL/XPL indicator for micrographs with siblings */}
            {micrograph.siblingImageId && (
              <Tooltip title="Has PPL/XPL pair - Press X to toggle" placement="top">
                <Chip
                  label="PPL/XPL"
                  size="small"
                  sx={{
                    ml: 0.5,
                    height: 18,
                    fontSize: '0.65rem',
                    bgcolor: 'info.main',
                    color: 'info.contrastText',
                  }}
                />
              </Tooltip>
            )}
          </Stack>

          {/* Thumbnail + Button Column */}
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {/* Thumbnail - uses flex to fill available space */}
            <Box
              sx={{
                cursor: 'pointer',
                flex: 1,
                minWidth: 0, // Allow flexbox to shrink below content size
                maxWidth: '100%',
              }}
              onClick={() => handleMicrographClick(micrograph.id)}
            >
              {project && (
                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 250, // Uniform thumbnail size for all levels
                    '& > *': {
                      width: '100% !important',
                      height: 'auto !important',
                      aspectRatio: '5/3', // Maintain 0.6 aspect ratio (1/0.6 = 5/3)
                    },
                  }}
                >
                  <MicrographThumbnail
                    micrographId={micrograph.id}
                    projectId={project.id}
                    micrographName={micrograph.name || micrograph.imageFilename || 'Unnamed'}
                    needsScale={needsScale}
                    needsLocation={needsLocation}
                  />
                </Box>
              )}
            </Box>

            {/* Button Column - hidden when micrograph needs setup */}
            {!needsSetup ? (
              <Stack direction="column" spacing={0.5} sx={{ flexShrink: 0, width: 40 }}>
                {/* Options Menu Button */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    setMicrographOptionsAnchor({
                      ...micrographOptionsAnchor,
                      [micrograph.id]: e.currentTarget,
                    });
                  }}
                  sx={{ p: 0.5 }}
                >
                  <MoreVert fontSize="small" />
                </IconButton>

                {/* Add Menu Button */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    setMicrographAddAnchor({
                      ...micrographAddAnchor,
                      [micrograph.id]: e.currentTarget,
                    });
                  }}
                  sx={{ p: 0.5 }}
                >
                  <Add fontSize="small" />
                </IconButton>

                {/* Visibility Toggle Button - Only for associated micrographs */}
                {!isReference && (
                  <IconButton
                    size="small"
                    onClick={() => {
                      // Toggle visibility: if currently hidden (false), make visible (true); otherwise hide (false)
                      const newVisibility = micrograph.isMicroVisible === false ? true : false;
                      updateMicrographMetadata(micrograph.id, { isMicroVisible: newVisibility });
                    }}
                    sx={{ p: 0.5 }}
                  >
                    {isHidden ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                )}
              </Stack>
            ) : (
              // Placeholder to maintain consistent width when buttons are hidden
              <Box sx={{ flexShrink: 0, width: 40 }} />
            )}
          </Stack>
        </Box>

        {/* Children (Associated Micrographs) - with drag and drop support */}
        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box sx={{ ml: 0 }}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) =>
                  handleMicrographDragEnd(event, sampleId, micrograph.id, children)
                }
              >
                <SortableContext
                  items={children.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {children.map((child) => (
                    <SortableItemWrapper key={child.id} id={child.id}>
                      {renderMicrograph(child, allMicrographs, level + 1, sampleId, children)}
                    </SortableItemWrapper>
                  ))}
                </SortableContext>
              </DndContext>
            </Box>
          </Collapse>
        )}

        {/* Options Menu */}
        <Menu
          anchorEl={micrographOptionsAnchor[micrograph.id]}
          open={Boolean(micrographOptionsAnchor[micrograph.id])}
          onClose={() =>
            setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null })
          }
        >
          <MenuItem
            onClick={() => {
              setAddToGroupsMicrograph(micrograph);
              setShowAddToGroups(true);
              setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
            }}
          >
            Add to Group(s)
          </MenuItem>
          <MenuItem
            onClick={() => {
              setEditingMicrographId(micrograph.id);
              setShowEditMicrograph(true);
              setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
            }}
          >
            Edit Micrograph Metadata
          </MenuItem>
          {!isReference && (
            <>
              <MenuItem
                onClick={() => {
                  setEditLocationMicrographId(micrograph.id);
                  setShowEditLocation(true);
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Edit Micrograph Location
              </MenuItem>
              <MenuItem
                onClick={(event) => {
                  // Open opacity popover - capture position before menu closes
                  const rect = event.currentTarget.getBoundingClientRect();
                  setOpacityAnchorPosition({ top: rect.bottom, left: rect.left });
                  setOpacityMicrographId(micrograph.id);
                  setOpacityValue(micrograph.opacity ?? 1.0);
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Edit Micrograph Opacity
              </MenuItem>
            </>
          )}
          <MenuItem
            onClick={() => {
              setDeletingMicrograph(micrograph);
              setShowDeleteMicrographConfirm(true);
              setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
            }}
          >
            Delete Micrograph
          </MenuItem>
          {/* PPL/XPL Sibling Pairing */}
          {!micrograph.siblingImageId ? (
            <>
              <MenuItem
                onClick={() => {
                  setAddSiblingXPLMicrographId(micrograph.id);
                  setShowAddSiblingXPL(true);
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Add Corresponding XPL Image
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setLinkSiblingMicrographId(micrograph.id);
                  setShowLinkSibling(true);
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Link Sibling PPL/XPL Image
              </MenuItem>
            </>
          ) : (
            <MenuItem
              onClick={() => {
                unlinkSiblingImages(micrograph.id);
                setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
              }}
            >
              Unlink Sibling Image
            </MenuItem>
          )}
          {/* Show/Hide All Associated Micrographs - only if has children */}
          {hasChildren && (
            <>
              <MenuItem
                onClick={() => {
                  // Set isMicroVisible: true on all direct children
                  children.forEach((child) => {
                    updateMicrographMetadata(child.id, { isMicroVisible: true });
                  });
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Show All Associated Micrographs
              </MenuItem>
              <MenuItem
                onClick={() => {
                  // Set isMicroVisible: false on all direct children
                  children.forEach((child) => {
                    updateMicrographMetadata(child.id, { isMicroVisible: false });
                  });
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
                }}
              >
                Hide All Associated Micrographs
              </MenuItem>
            </>
          )}
          {/* Edit All Associated Micrographs Opacity - only if has overlay children */}
          {children.some((child) => child.offsetInParent) && (
            <MenuItem
              onClick={(event) => {
                // Get average opacity of all overlay children for initial value
                const overlayChildren = children.filter((child) => child.offsetInParent);
                const avgOpacity = overlayChildren.length > 0
                  ? overlayChildren.reduce((sum, child) => sum + (child.opacity ?? 1.0), 0) / overlayChildren.length
                  : 1.0;
                const rect = event.currentTarget.getBoundingClientRect();
                setBatchOpacityAnchorPosition({ top: rect.bottom, left: rect.left });
                setBatchOpacityParentId(micrograph.id);
                setBatchOpacityValue(avgOpacity);
                setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
              }}
            >
              Edit All Associated Micrographs Opacity
            </MenuItem>
          )}
        </Menu>

        {/* Add Menu */}
        <Menu
          anchorEl={micrographAddAnchor[micrograph.id]}
          open={Boolean(micrographAddAnchor[micrograph.id])}
          onClose={() => setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null })}
        >
          <MenuItem
            onClick={() => {
              handleAddAssociatedMicrograph(micrograph.id);
              setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null });
            }}
          >
            Add Associated Micrograph
          </MenuItem>
          <MenuItem
            onClick={() => {
              setBatchImportSampleId(null);
              setBatchImportParentMicrographId(micrograph.id);
              setShowBatchImport(true);
              setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null });
            }}
          >
            Batch Import Associated Micrographs
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  const renderSample = (
    sample: SampleMetadata,
    datasetId: string,
    allSamples: SampleMetadata[]
  ) => {
    const isExpanded = expandedSamples.has(sample.id);
    const hasMicrographs = sample.micrographs && sample.micrographs.length > 0;

    return (
      <Box
        key={sample.id}
        sx={{ ml: 0 }}
        tabIndex={0}
        onKeyDown={(e) => handleSampleKeyDown(e, sample.id, datasetId, allSamples)}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.5, pr: 1 }}>
          <IconButton size="small" onClick={() => toggleSample(sample.id)} sx={{ p: 0 }}>
            {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
          <Science fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
            {sample.name || sample.sampleID || 'Unnamed Sample'}
          </Typography>

          {/* Sample Options Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: e.currentTarget });
            }}
            sx={{ p: 0.5 }}
          >
            <MoreVert fontSize="small" />
          </IconButton>

          {/* Sample Add Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setSampleAddAnchor({ ...sampleAddAnchor, [sample.id]: e.currentTarget });
            }}
            sx={{ p: 0.5 }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 0 }}>
            {hasMicrographs &&
              (() => {
                const referenceMicrographs = buildMicrographHierarchy(sample.micrographs!, null);
                return (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) =>
                      handleMicrographDragEnd(event, sample.id, null, referenceMicrographs)
                    }
                  >
                    <SortableContext
                      items={referenceMicrographs.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {referenceMicrographs.map((micrograph) => (
                        <SortableItemWrapper key={micrograph.id} id={micrograph.id}>
                          {renderMicrograph(
                            micrograph,
                            sample.micrographs!,
                            0,
                            sample.id,
                            referenceMicrographs
                          )}
                        </SortableItemWrapper>
                      ))}
                    </SortableContext>
                  </DndContext>
                );
              })()}
          </Box>
        </Collapse>

        {/* Sample Options Menu */}
        <Menu
          anchorEl={sampleMenuAnchor[sample.id]}
          open={Boolean(sampleMenuAnchor[sample.id])}
          onClose={() => setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null })}
        >
          <MenuItem
            onClick={() => {
              setEditingSample(sample);
              setShowEditSample(true);
              setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
            }}
          >
            Edit Sample Metadata
          </MenuItem>
          <MenuItem
            onClick={() => {
              setDeletingSample(sample);
              setShowDeleteSampleConfirm(true);
              setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
            }}
          >
            Delete Sample
          </MenuItem>
        </Menu>

        {/* Sample Add Menu */}
        <Menu
          anchorEl={sampleAddAnchor[sample.id]}
          open={Boolean(sampleAddAnchor[sample.id])}
          onClose={() => setSampleAddAnchor({ ...sampleAddAnchor, [sample.id]: null })}
        >
          <MenuItem
            onClick={() => {
              handleAddReferenceMicrograph(sample.id);
              setSampleAddAnchor({ ...sampleAddAnchor, [sample.id]: null });
            }}
          >
            Add New Reference Micrograph
          </MenuItem>
          <MenuItem
            onClick={() => {
              setBatchImportSampleId(sample.id);
              setBatchImportParentMicrographId(null);
              setShowBatchImport(true);
              setSampleAddAnchor({ ...sampleAddAnchor, [sample.id]: null });
            }}
          >
            Batch Import Reference Micrographs
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  const renderDataset = (dataset: DatasetMetadata, allDatasets: DatasetMetadata[]) => {
    const isExpanded = expandedDatasets.has(dataset.id);
    const hasSamples = dataset.samples && dataset.samples.length > 0;

    return (
      <Box
        key={dataset.id}
        sx={{ mb: 1 }}
        tabIndex={0}
        onKeyDown={(e) => handleDatasetKeyDown(e, dataset.id, allDatasets)}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.5, pr: 1 }}>
          <IconButton size="small" onClick={() => toggleDataset(dataset.id)} sx={{ p: 0 }}>
            {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
          {isExpanded ? (
            <FolderOpen fontSize="small" sx={{ color: 'warning.main' }} />
          ) : (
            <Folder fontSize="small" sx={{ color: 'warning.main' }} />
          )}
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            {dataset.name}
          </Typography>

          {/* Dataset Options Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: e.currentTarget });
            }}
            sx={{ p: 0.5 }}
          >
            <MoreVert fontSize="small" />
          </IconButton>

          {/* Dataset Add Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setDatasetAddAnchor({ ...datasetAddAnchor, [dataset.id]: e.currentTarget });
            }}
            sx={{ p: 0.5 }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 0 }}>
            {hasSamples && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleSampleDragEnd(event, dataset.id, dataset.samples!)}
              >
                <SortableContext
                  items={dataset.samples!.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {dataset.samples!.map((sample) => (
                    <SortableItemWrapper key={sample.id} id={sample.id}>
                      {renderSample(sample, dataset.id, dataset.samples!)}
                    </SortableItemWrapper>
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </Box>
        </Collapse>

        {/* Dataset Options Menu */}
        <Menu
          anchorEl={datasetMenuAnchor[dataset.id]}
          open={Boolean(datasetMenuAnchor[dataset.id])}
          onClose={() => setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: null })}
        >
          <MenuItem
            onClick={() => {
              setEditingDatasetId(dataset.id);
              setShowEditDataset(true);
              setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: null });
            }}
          >
            Edit Dataset Metadata
          </MenuItem>
          <MenuItem
            onClick={() => {
              setDeletingDataset(dataset);
              setShowDeleteDatasetConfirm(true);
              setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: null });
            }}
          >
            Delete Dataset
          </MenuItem>
        </Menu>

        {/* Dataset Add Menu */}
        <Menu
          anchorEl={datasetAddAnchor[dataset.id]}
          open={Boolean(datasetAddAnchor[dataset.id])}
          onClose={() => setDatasetAddAnchor({ ...datasetAddAnchor, [dataset.id]: null })}
        >
          <MenuItem
            onClick={() => {
              handleAddSample(dataset.id);
              setDatasetAddAnchor({ ...datasetAddAnchor, [dataset.id]: null });
            }}
          >
            Add New Sample
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  if (!project) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No project loaded. Create or open a new project to get started.
        </Typography>
      </Box>
    );
  }

  const hasDatasets = project.datasets && project.datasets.length > 0;

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Project header */}
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, color: 'text.primary' }}>
            {project.name}
          </Typography>

          {/* Project Options Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setProjectMenuAnchor(e.currentTarget);
            }}
            sx={{ p: 0.5 }}
          >
            <MoreVert fontSize="small" />
          </IconButton>

          {/* Project Add Menu Button */}
          <IconButton
            size="small"
            onClick={(e) => {
              setProjectAddAnchor(e.currentTarget);
            }}
            sx={{ p: 0.5 }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Dataset tree */}
      <Box sx={{ p: 1 }}>
        {hasDatasets && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => handleDatasetDragEnd(event, project.datasets!)}
          >
            <SortableContext
              items={project.datasets!.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              {project.datasets!.map((dataset) => (
                <SortableItemWrapper key={dataset.id} id={dataset.id}>
                  {renderDataset(dataset, project.datasets!)}
                </SortableItemWrapper>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Box>

      {/* Project Options Menu */}
      <Menu
        anchorEl={projectMenuAnchor}
        open={Boolean(projectMenuAnchor)}
        onClose={() => setProjectMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setShowEditProject(true);
            setProjectMenuAnchor(null);
          }}
        >
          Edit Project Metadata
        </MenuItem>
      </Menu>

      {/* Project Add Menu */}
      <Menu
        anchorEl={projectAddAnchor}
        open={Boolean(projectAddAnchor)}
        onClose={() => setProjectAddAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            handleAddDataset();
            setProjectAddAnchor(null);
          }}
        >
          Add New Dataset
        </MenuItem>
      </Menu>

      {/* Dialogs */}
      <EditProjectDialog isOpen={showEditProject} onClose={() => setShowEditProject(false)} />
      <NewDatasetDialog isOpen={showNewDataset} onClose={() => setShowNewDataset(false)} />
      <NewSampleDialog
        isOpen={showNewSample}
        onClose={() => {
          setShowNewSample(false);
          setSelectedDatasetId(null);
        }}
        datasetId={selectedDatasetId}
      />
      <NewMicrographDialog
        isOpen={showNewMicrograph}
        onClose={() => {
          setShowNewMicrograph(false);
          setSelectedSampleId(null);
          setSelectedParentMicrographId(null);
        }}
        sampleId={selectedSampleId}
        parentMicrographId={selectedParentMicrographId}
      />

      {/* Edit Dataset Dialog */}
      {editingDatasetId && (
        <EditDatasetDialog
          isOpen={showEditDataset}
          onClose={() => {
            setShowEditDataset(false);
            setEditingDatasetId(null);
          }}
          datasetId={editingDatasetId}
        />
      )}

      {/* Edit Sample Dialog */}
      <EditSampleDialog
        isOpen={showEditSample}
        onClose={() => {
          setShowEditSample(false);
          setEditingSample(null);
        }}
        sample={editingSample}
      />

      {/* Edit Micrograph Dialog */}
      {editingMicrographId && (
        <EditMicrographDialog
          isOpen={showEditMicrograph}
          onClose={() => {
            setShowEditMicrograph(false);
            setEditingMicrographId(null);
          }}
          micrographId={editingMicrographId}
        />
      )}

      {/* Add Micrograph to Groups Dialog */}
      {addToGroupsMicrograph && (
        <AddMicrographToGroupsDialog
          open={showAddToGroups}
          onClose={() => {
            setShowAddToGroups(false);
            setAddToGroupsMicrograph(null);
          }}
          micrographId={addToGroupsMicrograph.id}
          micrographName={addToGroupsMicrograph.name || 'Unnamed Micrograph'}
        />
      )}

      {/* Edit Micrograph Location Dialog */}
      {editLocationMicrographId && (
        <EditMicrographLocationDialog
          open={showEditLocation}
          onClose={() => {
            setShowEditLocation(false);
            setEditLocationMicrographId(null);
          }}
          micrographId={editLocationMicrographId}
        />
      )}

      {/* Delete Dataset Confirmation */}
      <ConfirmDialog
        open={showDeleteDatasetConfirm}
        title="Delete Dataset"
        message={
          deletingDataset ? (
            <>
              Are you sure you want to delete the dataset "{deletingDataset.name}"?
              <br />
              <br />
              This will remove all samples, micrographs, and spots within this dataset from the project.
              <br />
              <br />
              <strong>Note:</strong> Image files will remain on disk and can be re-added later. They
              will be excluded when exporting to .smz format.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => {
          if (deletingDataset) {
            deleteDataset(deletingDataset.id);
          }
          setShowDeleteDatasetConfirm(false);
          setDeletingDataset(null);
        }}
        onCancel={() => {
          setShowDeleteDatasetConfirm(false);
          setDeletingDataset(null);
        }}
      />

      {/* Delete Sample Confirmation */}
      <ConfirmDialog
        open={showDeleteSampleConfirm}
        title="Delete Sample"
        message={
          deletingSample ? (
            <>
              Are you sure you want to delete the sample "
              {deletingSample.sampleID || deletingSample.name}"?
              <br />
              <br />
              This will remove all micrographs and spots within this sample from the project.
              <br />
              <br />
              <strong>Note:</strong> Image files will remain on disk and can be re-added later. They
              will be excluded when exporting to .smz format.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => {
          if (deletingSample) {
            deleteSample(deletingSample.id);
          }
          setShowDeleteSampleConfirm(false);
          setDeletingSample(null);
        }}
        onCancel={() => {
          setShowDeleteSampleConfirm(false);
          setDeletingSample(null);
        }}
      />

      {/* Delete Micrograph Confirmation */}
      <ConfirmDialog
        open={showDeleteMicrographConfirm}
        title="Delete Micrograph"
        message={
          deletingMicrograph ? (
            <>
              Are you sure you want to delete the micrograph "{deletingMicrograph.name}"?
              <br />
              <br />
              {!deletingMicrograph.parentID ? (
                <>
                  This is a <strong>reference micrograph</strong>. All associated micrographs and
                  spots will also be removed.
                </>
              ) : (
                <>All spots on this micrograph will also be removed.</>
              )}
              <br />
              <br />
              <strong>Note:</strong> Image files will remain on disk and can be re-added later. They
              will be excluded when exporting to .smz format.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => {
          if (deletingMicrograph) {
            const parentId = deletingMicrograph.parentID;
            deleteMicrograph(deletingMicrograph.id);

            // Regenerate parent's composite thumbnail if this was a child micrograph
            if (parentId && project) {
              setTimeout(() => {
                const freshProject = useAppStore.getState().project;
                if (!freshProject) return;

                window.api
                  ?.generateCompositeThumbnail(freshProject.id, parentId, freshProject)
                  .then(() => {
                    console.log(
                      '[ProjectTree] Successfully regenerated parent composite thumbnail after child deletion'
                    );
                    window.dispatchEvent(
                      new CustomEvent('thumbnail-generated', {
                        detail: { micrographId: parentId },
                      })
                    );
                  })
                  .catch((error) => {
                    console.error(
                      '[ProjectTree] Failed to regenerate parent composite thumbnail:',
                      error
                    );
                  });
              }, 0);
            }
          }
          setShowDeleteMicrographConfirm(false);
          setDeletingMicrograph(null);
        }}
        onCancel={() => {
          setShowDeleteMicrographConfirm(false);
          setDeletingMicrograph(null);
        }}
      />

      {/* Batch Import Dialog */}
      <BatchImportDialog
        isOpen={showBatchImport}
        onClose={() => {
          setShowBatchImport(false);
          setBatchImportSampleId(null);
          setBatchImportParentMicrographId(null);
        }}
        sampleId={batchImportSampleId}
        parentMicrographId={batchImportParentMicrographId}
      />

      {/* Set Scale Dialog (for batch-imported reference micrographs) */}
      {setScaleMicrographId && (
        <SetScaleDialog
          open={showSetScale}
          onClose={() => {
            setShowSetScale(false);
            setSetScaleMicrographId(null);
          }}
          micrographId={setScaleMicrographId}
        />
      )}

      {/* Link Sibling PPL/XPL Dialog */}
      <LinkSiblingDialog
        open={showLinkSibling}
        onClose={() => {
          setShowLinkSibling(false);
          setLinkSiblingMicrographId(null);
        }}
        micrographId={linkSiblingMicrographId}
      />

      {/* Add Sibling XPL Dialog */}
      <AddSiblingXPLDialog
        open={showAddSiblingXPL}
        onClose={() => {
          setShowAddSiblingXPL(false);
          setAddSiblingXPLMicrographId(null);
        }}
        pplMicrographId={addSiblingXPLMicrographId}
      />

      {/* Opacity Slider Popover */}
      <Popover
        open={Boolean(opacityAnchorPosition)}
        anchorReference="anchorPosition"
        anchorPosition={opacityAnchorPosition ?? undefined}
        onClose={() => {
          setOpacityAnchorPosition(null);
          setOpacityMicrographId(null);
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 2, width: 250 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2">Micrograph Opacity</Typography>
            <IconButton
              size="small"
              onClick={() => {
                setOpacityAnchorPosition(null);
                setOpacityMicrographId(null);
              }}
              sx={{ ml: 1, p: 0.5 }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Slider
              value={opacityValue}
              onChange={(_, newValue) => {
                // Only update local state while dragging (for UI feedback)
                setOpacityValue(newValue as number);
              }}
              onChangeCommitted={(_, newValue) => {
                // Commit to store only when user releases slider
                if (opacityMicrographId) {
                  updateMicrographMetadata(opacityMicrographId, { opacity: newValue as number });
                }
              }}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              sx={{ flex: 1 }}
            />
            <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
              {Math.round(opacityValue * 100)}%
            </Typography>
          </Box>
        </Box>
      </Popover>

      {/* Batch Opacity Slider Popover (for all overlay children) */}
      <Popover
        open={Boolean(batchOpacityAnchorPosition)}
        anchorReference="anchorPosition"
        anchorPosition={batchOpacityAnchorPosition ?? undefined}
        onClose={() => {
          setBatchOpacityAnchorPosition(null);
          setBatchOpacityParentId(null);
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 2, width: 300 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2">All Associated Micrographs Opacity</Typography>
            <IconButton
              size="small"
              onClick={() => {
                setBatchOpacityAnchorPosition(null);
                setBatchOpacityParentId(null);
              }}
              sx={{ ml: 1, p: 0.5 }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Slider
              value={batchOpacityValue}
              onChange={(_, newValue) => {
                // Only update local state while dragging (for UI feedback)
                setBatchOpacityValue(newValue as number);
              }}
              onChangeCommitted={(_, newValue) => {
                // Commit to store - update all overlay children
                if (batchOpacityParentId && project) {
                  // Find all micrographs in the project
                  const allMicrographs = project.datasets?.flatMap(d =>
                    d.samples?.flatMap(s => s.micrographs || []) || []
                  ) || [];
                  // Filter to overlay children of this parent (have offsetInParent)
                  const overlayChildren = allMicrographs.filter(
                    m => m.parentID === batchOpacityParentId && m.offsetInParent
                  );
                  // Update each overlay child's opacity
                  overlayChildren.forEach(child => {
                    updateMicrographMetadata(child.id, { opacity: newValue as number });
                  });
                }
              }}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              sx={{ flex: 1 }}
            />
            <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
              {Math.round(batchOpacityValue * 100)}%
            </Typography>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
