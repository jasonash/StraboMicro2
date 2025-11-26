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
  ArrowUpward,
  ArrowDownward,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import { NewDatasetDialog } from './dialogs/NewDatasetDialog';
import { NewSampleDialog } from './dialogs/NewSampleDialog';
import { NewMicrographDialog } from './dialogs/NewMicrographDialog';
import { EditSampleDialog } from './dialogs/EditSampleDialog';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { AddMicrographToGroupsDialog } from './dialogs/AddMicrographToGroupsDialog';
import { EditMicrographDialog } from './dialogs/metadata/EditMicrographDialog';
import { EditMicrographLocationDialog } from './dialogs/EditMicrographLocationDialog';
import { BatchImportDialog } from './dialogs/BatchImportDialog';
import { SetScaleDialog } from './dialogs/SetScaleDialog';
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
}

function MicrographThumbnail({ micrographId, projectId, micrographName, width = 40, height = 40 }: MicrographThumbnailProps) {
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

  return (
    <Avatar
      variant="rounded"
      src={thumbnailDataUrl}
      alt={micrographName}
      sx={{
        width,
        height,
        objectFit: 'cover',
      }}
    />
  );
}

export function ProjectTree() {
  const project = useAppStore((state) => state.project);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const deleteSample = useAppStore((state) => state.deleteSample);
  const deleteMicrograph = useAppStore((state) => state.deleteMicrograph);

  // Dialog states
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [showNewSample, setShowNewSample] = useState(false);
  const [showNewMicrograph, setShowNewMicrograph] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [selectedParentMicrographId, setSelectedParentMicrographId] = useState<string | null>(null);

  // Edit/Delete dialog states
  const [showEditSample, setShowEditSample] = useState(false);
  const [editingSample, setEditingSample] = useState<SampleMetadata | null>(null);
  const [showEditMicrograph, setShowEditMicrograph] = useState(false);
  const [editingMicrographId, setEditingMicrographId] = useState<string | null>(null);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [editLocationMicrographId, setEditLocationMicrographId] = useState<string | null>(null);
  const [showAddToGroups, setShowAddToGroups] = useState(false);
  const [addToGroupsMicrograph, setAddToGroupsMicrograph] = useState<MicrographMetadata | null>(null);

  // Confirm dialog states
  const [showDeleteSampleConfirm, setShowDeleteSampleConfirm] = useState(false);
  const [deletingSample, setDeletingSample] = useState<SampleMetadata | null>(null);
  const [showDeleteMicrographConfirm, setShowDeleteMicrographConfirm] = useState(false);
  const [deletingMicrograph, setDeletingMicrograph] = useState<MicrographMetadata | null>(null);

  // Batch import dialog states
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportSampleId, setBatchImportSampleId] = useState<string | null>(null);
  const [batchImportParentMicrographId, setBatchImportParentMicrographId] = useState<string | null>(null);

  // Set scale dialog state (for batch-imported reference micrographs)
  const [showSetScale, setShowSetScale] = useState(false);
  const [setScaleMicrographId, setSetScaleMicrographId] = useState<string | null>(null);

  // Expansion states - Load from localStorage on mount
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sidebar-expanded-datasets');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sidebar-expanded-samples');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [expandedMicrographs, setExpandedMicrographs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sidebar-expanded-micrographs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Menu states
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
  const [datasetMenuAnchor, setDatasetMenuAnchor] = useState<{ [key: string]: HTMLElement | null }>({});
  const [sampleMenuAnchor, setSampleMenuAnchor] = useState<{ [key: string]: HTMLElement | null }>({});
  const [micrographOptionsAnchor, setMicrographOptionsAnchor] = useState<{ [key: string]: HTMLElement | null }>({});
  const [micrographAddAnchor, setMicrographAddAnchor] = useState<{ [key: string]: HTMLElement | null }>({});

  // Visibility states
  const [hiddenMicrographs, setHiddenMicrographs] = useState<Set<string>>(new Set());

  // Save expansion states to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('sidebar-expanded-datasets', JSON.stringify(Array.from(expandedDatasets)));
  }, [expandedDatasets]);

  useEffect(() => {
    localStorage.setItem('sidebar-expanded-samples', JSON.stringify(Array.from(expandedSamples)));
  }, [expandedSamples]);

  useEffect(() => {
    localStorage.setItem('sidebar-expanded-micrographs', JSON.stringify(Array.from(expandedMicrographs)));
  }, [expandedMicrographs]);

  // Auto-expand newly added datasets and samples (only if not already tracked)
  useEffect(() => {
    if (!project?.datasets) return;

    const newExpandedDatasets = new Set(expandedDatasets);
    const newExpandedSamples = new Set(expandedSamples);
    let changed = false;

    // Only expand datasets/samples that aren't already in our saved state
    project.datasets.forEach((dataset) => {
      if (!newExpandedDatasets.has(dataset.id)) {
        newExpandedDatasets.add(dataset.id);
        changed = true;
      }

      // Expand all samples in each dataset
      dataset.samples?.forEach((sample) => {
        if (!newExpandedSamples.has(sample.id)) {
          newExpandedSamples.add(sample.id);
          changed = true;
        }
      });
    });

    if (changed) {
      setExpandedDatasets(newExpandedDatasets);
      setExpandedSamples(newExpandedSamples);
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
        if (micrograph.scalePixelsPerCentimeter === undefined || micrograph.scalePixelsPerCentimeter === null) {
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
  const buildMicrographHierarchy = (micrographs: MicrographMetadata[], parentId: string | null = null): MicrographMetadata[] => {
    return micrographs.filter((m) => (m.parentID || null) === parentId);
  };

  const renderMicrograph = (
    micrograph: MicrographMetadata,
    allMicrographs: MicrographMetadata[],
    level: number
  ) => {
    const isExpanded = expandedMicrographs.has(micrograph.id);
    const isActive = micrograph.id === activeMicrographId;
    const children = buildMicrographHierarchy(allMicrographs, micrograph.id);
    const hasChildren = children.length > 0;
    const isReference = !micrograph.parentID;
    const isHidden = hiddenMicrographs.has(micrograph.id);

    // Use percentage-based sizing for responsive thumbnails
    // This allows thumbnails to shrink/grow with the sidebar width
    // No fixed pixel calculations needed - CSS will handle it automatically

    return (
      <Box key={micrograph.id} sx={{ ml: level * 2 }}>
        {/* Micrograph Container */}
        <Box
          sx={{
            mb: 1,
            p: 1,
            borderRadius: 1,
            backgroundColor: isActive ? 'action.selected' : 'transparent',
            '&:hover': {
              backgroundColor: isActive ? 'action.selected' : 'action.hover',
            },
            // Add left border for associated micrographs to show hierarchy
            borderLeft: !isReference ? 3 : 0,
            borderColor: !isReference ? 'primary.main' : 'transparent',
            // Slight background tint for associated micrographs
            bgcolor: isActive
              ? 'action.selected'
              : !isReference
                ? 'action.hover'
                : 'transparent',
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
                    maxWidth: 250 - (level * 30), // Still prefer smaller thumbs for deeper levels
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
                  />
                </Box>
              )}
            </Box>

            {/* Button Column - fixed width to prevent overflow */}
            <Stack direction="column" spacing={0.5} sx={{ flexShrink: 0, width: 40 }}>
              {/* Options Menu Button */}
              <IconButton
                size="small"
                onClick={(e) => {
                  setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: e.currentTarget });
                }}
                sx={{ p: 0.5 }}
              >
                <MoreVert fontSize="small" />
              </IconButton>

              {/* Add Menu Button */}
              <IconButton
                size="small"
                onClick={(e) => {
                  setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: e.currentTarget });
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
                    setHiddenMicrographs((prev) => {
                      const next = new Set(prev);
                      if (next.has(micrograph.id)) {
                        next.delete(micrograph.id);
                      } else {
                        next.add(micrograph.id);
                      }
                      return next;
                    });
                  }}
                  sx={{ p: 0.5 }}
                >
                  {isHidden ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              )}

              {/* Move Up Button */}
              <IconButton
                size="small"
                onClick={() => {
                  // TODO: Implement move up
                  console.log('Move up:', micrograph.id);
                }}
                sx={{ p: 0.5 }}
              >
                <ArrowUpward fontSize="small" />
              </IconButton>

              {/* Move Down Button */}
              <IconButton
                size="small"
                onClick={() => {
                  // TODO: Implement move down
                  console.log('Move down:', micrograph.id);
                }}
                sx={{ p: 0.5 }}
              >
                <ArrowDownward fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Box>

        {/* Children (Associated Micrographs) */}
        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box sx={{ ml: 2 }}>
              {children.map((child) => renderMicrograph(child, allMicrographs, level + 1))}
            </Box>
          </Collapse>
        )}

        {/* Options Menu */}
        <Menu
          anchorEl={micrographOptionsAnchor[micrograph.id]}
          open={Boolean(micrographOptionsAnchor[micrograph.id])}
          onClose={() => setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null })}
        >
          <MenuItem onClick={() => {
            setAddToGroupsMicrograph(micrograph);
            setShowAddToGroups(true);
            setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
          }}>
            Add to Group(s)
          </MenuItem>
          <MenuItem onClick={() => {
            setEditingMicrographId(micrograph.id);
            setShowEditMicrograph(true);
            setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
          }}>
            Edit Micrograph Metadata
          </MenuItem>
          {!isReference && (
            <>
              <MenuItem onClick={() => {
                setEditLocationMicrographId(micrograph.id);
                setShowEditLocation(true);
                setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
              }}>
                Edit Micrograph Location
              </MenuItem>
              <MenuItem onClick={() => {
                // TODO: Edit opacity - requires opacity slider dialog
                console.log('Edit opacity:', micrograph.id);
                setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
              }}>
                Edit Micrograph Opacity
              </MenuItem>
            </>
          )}
          <MenuItem onClick={() => {
            setDeletingMicrograph(micrograph);
            setShowDeleteMicrographConfirm(true);
            setMicrographOptionsAnchor({ ...micrographOptionsAnchor, [micrograph.id]: null });
          }}>
            Delete Micrograph
          </MenuItem>
        </Menu>

        {/* Add Menu */}
        <Menu
          anchorEl={micrographAddAnchor[micrograph.id]}
          open={Boolean(micrographAddAnchor[micrograph.id])}
          onClose={() => setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null })}
        >
          <MenuItem onClick={() => {
            handleAddAssociatedMicrograph(micrograph.id);
            setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null });
          }}>
            Add Associated Micrograph
          </MenuItem>
          <MenuItem onClick={() => {
            setBatchImportSampleId(null);
            setBatchImportParentMicrographId(micrograph.id);
            setShowBatchImport(true);
            setMicrographAddAnchor({ ...micrographAddAnchor, [micrograph.id]: null });
          }}>
            Batch Import Associated Micrographs
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  const renderSample = (sample: SampleMetadata) => {
    const isExpanded = expandedSamples.has(sample.id);
    const hasMicrographs = sample.micrographs && sample.micrographs.length > 0;

    return (
      <Box key={sample.id} sx={{ ml: 2 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.5, px: 1 }}>
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
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 1 }}>
            {hasMicrographs &&
              buildMicrographHierarchy(sample.micrographs!, null).map((micrograph) =>
                renderMicrograph(micrograph, sample.micrographs!, 0)
              )}
          </Box>
        </Collapse>

        {/* Sample Menu */}
        <Menu
          anchorEl={sampleMenuAnchor[sample.id]}
          open={Boolean(sampleMenuAnchor[sample.id])}
          onClose={() => setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null })}
        >
          <MenuItem onClick={() => {
            handleAddReferenceMicrograph(sample.id);
            setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
          }}>
            Add New Reference Micrograph
          </MenuItem>
          <MenuItem onClick={() => {
            setBatchImportSampleId(sample.id);
            setBatchImportParentMicrographId(null);
            setShowBatchImport(true);
            setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
          }}>
            Batch Import Reference Micrographs
          </MenuItem>
          <MenuItem onClick={() => {
            setEditingSample(sample);
            setShowEditSample(true);
            setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
          }}>
            Edit Sample Metadata
          </MenuItem>
          <MenuItem onClick={() => {
            setDeletingSample(sample);
            setShowDeleteSampleConfirm(true);
            setSampleMenuAnchor({ ...sampleMenuAnchor, [sample.id]: null });
          }}>
            Delete Sample
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  const renderDataset = (dataset: DatasetMetadata) => {
    const isExpanded = expandedDatasets.has(dataset.id);
    const hasSamples = dataset.samples && dataset.samples.length > 0;

    return (
      <Box key={dataset.id} sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.5, px: 1 }}>
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
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 1 }}>
            {hasSamples && dataset.samples!.map((sample) => renderSample(sample))}
          </Box>
        </Collapse>

        {/* Dataset Menu */}
        <Menu
          anchorEl={datasetMenuAnchor[dataset.id]}
          open={Boolean(datasetMenuAnchor[dataset.id])}
          onClose={() => setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: null })}
        >
          <MenuItem onClick={() => {
            handleAddSample(dataset.id);
            setDatasetMenuAnchor({ ...datasetMenuAnchor, [dataset.id]: null });
          }}>
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
          No project loaded. Create a new project to get started.
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
        </Stack>
      </Box>

      {/* Dataset tree */}
      <Box sx={{ p: 1 }}>
        {hasDatasets && project.datasets!.map((dataset) => renderDataset(dataset))}
      </Box>

      {/* Project Menu */}
      <Menu
        anchorEl={projectMenuAnchor}
        open={Boolean(projectMenuAnchor)}
        onClose={() => setProjectMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          handleAddDataset();
          setProjectMenuAnchor(null);
        }}>
          Add New Dataset
        </MenuItem>
      </Menu>

      {/* Dialogs */}
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

      {/* Delete Sample Confirmation */}
      <ConfirmDialog
        open={showDeleteSampleConfirm}
        title="Delete Sample"
        message={
          deletingSample ? (
            <>
              Are you sure you want to delete the sample "{deletingSample.sampleID || deletingSample.name}"?
              <br /><br />
              This will remove all micrographs and spots within this sample from the project.
              <br /><br />
              <strong>Note:</strong> Image files will remain on disk and can be re-added later.
              They will be excluded when exporting to .smz format.
            </>
          ) : ''
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
              <br /><br />
              {!deletingMicrograph.parentID ? (
                <>This is a <strong>reference micrograph</strong>. All associated micrographs and spots will also be removed.</>
              ) : (
                <>All spots on this micrograph will also be removed.</>
              )}
              <br /><br />
              <strong>Note:</strong> Image files will remain on disk and can be re-added later.
              They will be excluded when exporting to .smz format.
            </>
          ) : ''
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

                window.api?.generateCompositeThumbnail(freshProject.id, parentId, freshProject)
                  .then(() => {
                    console.log('[ProjectTree] Successfully regenerated parent composite thumbnail after child deletion');
                    window.dispatchEvent(new CustomEvent('thumbnail-generated', {
                      detail: { micrographId: parentId }
                    }));
                  })
                  .catch((error) => {
                    console.error('[ProjectTree] Failed to regenerate parent composite thumbnail:', error);
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
    </Box>
  );
}
