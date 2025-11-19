/**
 * Project Tree Component
 *
 * Displays the project hierarchy (Datasets → Samples → Micrographs) in a collapsible tree view.
 * Includes "Add" buttons at each level to trigger the appropriate dialog.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Collapse,
  Stack,
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
  Add,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Science,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import { NewDatasetDialog } from './dialogs/NewDatasetDialog';
import { NewSampleDialog } from './dialogs/NewSampleDialog';
import { NewMicrographDialog } from './dialogs/NewMicrographDialog';
import type { DatasetMetadata, SampleMetadata, MicrographMetadata } from '@/types/project-types';

export function ProjectTree() {
  const project = useAppStore((state) => state.project);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);

  // Dialog states
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [showNewSample, setShowNewSample] = useState(false);
  const [showNewMicrograph, setShowNewMicrograph] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [selectedParentMicrographId, setSelectedParentMicrographId] = useState<string | null>(null);

  // Expansion states
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());
  const [expandedMicrographs, setExpandedMicrographs] = useState<Set<string>>(new Set());

  // Auto-expand newly added datasets, samples, and micrographs
  useEffect(() => {
    if (!project?.datasets) return;

    const newExpandedDatasets = new Set(expandedDatasets);
    const newExpandedSamples = new Set(expandedSamples);

    // Expand all datasets by default
    project.datasets.forEach((dataset) => {
      newExpandedDatasets.add(dataset.id);

      // Expand all samples in each dataset
      dataset.samples?.forEach((sample) => {
        newExpandedSamples.add(sample.id);
      });
    });

    setExpandedDatasets(newExpandedDatasets);
    setExpandedSamples(newExpandedSamples);
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
    setShowNewSample(true);
  };

  const handleAddReferenceMicrograph = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    setSelectedParentMicrographId(null);
    setShowNewMicrograph(true);
  };

  const handleAddAssociatedMicrograph = (parentMicrographId: string) => {
    setSelectedSampleId(null);
    setSelectedParentMicrographId(parentMicrographId);
    setShowNewMicrograph(true);
  };

  const handleMicrographClick = (micrographId: string) => {
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

    return (
      <Box key={micrograph.id} sx={{ ml: level * 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{
            py: 0.5,
            px: 1,
            borderRadius: 1,
            cursor: 'pointer',
            backgroundColor: isActive ? 'action.selected' : 'transparent',
            '&:hover': {
              backgroundColor: isActive ? 'action.selected' : 'action.hover',
            },
          }}
          onClick={() => handleMicrographClick(micrograph.id)}
        >
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleMicrograph(micrograph.id);
              }}
              sx={{ p: 0 }}
            >
              {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 24 }} />
          )}
          <ImageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ flex: 1, fontSize: '0.875rem' }}>
            {micrograph.name || micrograph.imageFilename || 'Unnamed Micrograph'}
          </Typography>
        </Stack>

        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box sx={{ ml: 1 }}>
              {children.map((child) => renderMicrograph(child, allMicrographs, level + 1))}
              <Button
                size="small"
                startIcon={<Add />}
                onClick={() => handleAddAssociatedMicrograph(micrograph.id)}
                sx={{
                  ml: 2,
                  mt: 0.5,
                  textTransform: 'none',
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                }}
              >
                Add Associated Micrograph
              </Button>
            </Box>
          </Collapse>
        )}

        {!hasChildren && (
          <Button
            size="small"
            startIcon={<Add />}
            onClick={(e) => {
              e.stopPropagation();
              handleAddAssociatedMicrograph(micrograph.id);
            }}
            sx={{
              ml: (level + 1) * 2 + 2,
              textTransform: 'none',
              color: 'text.secondary',
              fontSize: '0.75rem',
            }}
          >
            Add Associated Micrograph
          </Button>
        )}
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
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 1 }}>
            {hasMicrographs &&
              buildMicrographHierarchy(sample.micrographs!, null).map((micrograph) =>
                renderMicrograph(micrograph, sample.micrographs!, 0)
              )}
            <Button
              size="small"
              startIcon={<Add />}
              onClick={() => handleAddReferenceMicrograph(sample.id)}
              sx={{
                ml: 2,
                mt: 0.5,
                textTransform: 'none',
                color: 'text.secondary',
                fontSize: '0.75rem',
              }}
            >
              Add Micrograph
            </Button>
          </Box>
        </Collapse>
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
        </Stack>

        <Collapse in={isExpanded}>
          <Box sx={{ ml: 1 }}>
            {hasSamples && dataset.samples!.map((sample) => renderSample(sample))}
            <Button
              size="small"
              startIcon={<Add />}
              onClick={() => handleAddSample(dataset.id)}
              sx={{
                ml: 2,
                mt: 0.5,
                textTransform: 'none',
                color: 'text.secondary',
                fontSize: '0.75rem',
              }}
            >
              Add Sample
            </Button>
          </Box>
        </Collapse>
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
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {project.name}
        </Typography>
      </Box>

      {/* Dataset tree */}
      <Box sx={{ p: 1 }}>
        {hasDatasets && project.datasets!.map((dataset) => renderDataset(dataset))}

        {/* Add Dataset button */}
        <Button
          size="small"
          startIcon={<Add />}
          onClick={handleAddDataset}
          sx={{
            ml: 1,
            mt: hasDatasets ? 1 : 0,
            textTransform: 'none',
            color: 'text.secondary',
            fontSize: '0.75rem',
          }}
        >
          Add Dataset
        </Button>
      </Box>

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
    </Box>
  );
}
