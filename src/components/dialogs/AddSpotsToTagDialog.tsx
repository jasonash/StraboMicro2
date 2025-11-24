/**
 * Add Spots to Tag Dialog
 *
 * Modal dialog for selecting spots to add/remove from a tag.
 * Shows a hierarchical tree of samples → micrographs → spots with checkboxes.
 *
 * Matches the legacy JavaFX addSpotsMicrographsToTag.java functionality,
 * but simplified to only handle spots (not micrographs) per project requirements.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  Collapse,
  IconButton,
  FormControlLabel,
} from '@mui/material';
import { ExpandMore, ChevronRight } from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { Tag, Spot, MicrographMetadata, SampleMetadata } from '@/types/project-types';

interface AddSpotsToTagDialogProps {
  open: boolean;
  onClose: () => void;
  tag: Tag;
}

// Track which spots have been added/removed
interface SpotChange {
  spotId: string;
  hasTag: boolean;
}

export function AddSpotsToTagDialog({
  open,
  onClose,
  tag,
}: AddSpotsToTagDialogProps) {
  const project = useAppStore((state) => state.project);
  const addTagToSpot = useAppStore((state) => state.addTagToSpot);
  const removeTagFromSpot = useAppStore((state) => state.removeTagFromSpot);
  const spotIndex = useAppStore((state) => state.spotIndex);

  // Track expansion state for samples and micrographs
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());
  const [expandedMicrographs, setExpandedMicrographs] = useState<Set<string>>(new Set());

  // Track spot selection changes (only save changes, not current state)
  const [spotChanges, setSpotChanges] = useState<Map<string, SpotChange>>(new Map());

  // Helper to check if a spot currently has this tag
  const spotHasTag = (spot: Spot): boolean => {
    return (spot.tags || []).includes(tag.id);
  };

  // Get the effective state of a spot (original state XOR changes)
  const getSpotEffectiveState = (spot: Spot): boolean => {
    const change = spotChanges.get(spot.id);
    if (change !== undefined) {
      return change.hasTag;
    }
    return spotHasTag(spot);
  };

  // Build flat list of all spots for counting
  const allSpots = useMemo(() => {
    return Array.from(spotIndex.values());
  }, [spotIndex]);

  // Count of spots that will have this tag after applying changes
  const spotsWithTagCount = useMemo(() => {
    return allSpots.filter(spot => getSpotEffectiveState(spot)).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpots, spotChanges, tag.id]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSpotChanges(new Map());
      // Expand all samples and micrographs by default
      const sampleIds = new Set<string>();
      const micrographIds = new Set<string>();

      project?.datasets?.forEach(dataset => {
        dataset.samples?.forEach(sample => {
          sampleIds.add(sample.id);
          sample.micrographs?.forEach(micrograph => {
            if ((micrograph.spots?.length || 0) > 0) {
              micrographIds.add(micrograph.id);
            }
          });
        });
      });

      setExpandedSamples(sampleIds);
      setExpandedMicrographs(micrographIds);
    }
  }, [open, project]);

  const toggleSampleExpanded = (sampleId: string) => {
    setExpandedSamples(prev => {
      const next = new Set(prev);
      if (next.has(sampleId)) {
        next.delete(sampleId);
      } else {
        next.add(sampleId);
      }
      return next;
    });
  };

  const toggleMicrographExpanded = (micrographId: string) => {
    setExpandedMicrographs(prev => {
      const next = new Set(prev);
      if (next.has(micrographId)) {
        next.delete(micrographId);
      } else {
        next.add(micrographId);
      }
      return next;
    });
  };

  const handleSpotToggle = (spot: Spot) => {
    const currentEffectiveState = getSpotEffectiveState(spot);
    const newState = !currentEffectiveState;

    // Check if this change brings us back to original state
    const originalState = spotHasTag(spot);

    setSpotChanges(prev => {
      const next = new Map(prev);
      if (newState === originalState) {
        // No change from original - remove from changes
        next.delete(spot.id);
      } else {
        // Changed from original - track the change
        next.set(spot.id, { spotId: spot.id, hasTag: newState });
      }
      return next;
    });
  };

  const handleSubmit = () => {
    // Apply all changes
    spotChanges.forEach((change) => {
      if (change.hasTag) {
        addTagToSpot(tag.id, change.spotId);
      } else {
        removeTagFromSpot(tag.id, change.spotId);
      }
    });

    onClose();
  };

  const hasChanges = spotChanges.size > 0;

  if (!project) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Assign Spots to "{tag.name}"
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check spots to add to this tag, uncheck to remove.
          {spotsWithTagCount > 0 && ` (${spotsWithTagCount} spot${spotsWithTagCount !== 1 ? 's' : ''} selected)`}
        </Typography>

        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          {project.datasets?.map(dataset => (
            dataset.samples?.map(sample => (
              <SampleSection
                key={sample.id}
                sample={sample}
                expanded={expandedSamples.has(sample.id)}
                expandedMicrographs={expandedMicrographs}
                onToggleExpanded={() => toggleSampleExpanded(sample.id)}
                onToggleMicrographExpanded={toggleMicrographExpanded}
                getSpotEffectiveState={getSpotEffectiveState}
                onSpotToggle={handleSpotToggle}
              />
            ))
          ))}

          {/* Show message if no spots exist */}
          {allSpots.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No spots found in this project. Create spots first.
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!hasChanges}
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================================================
// SAMPLE SECTION COMPONENT
// ============================================================================

interface SampleSectionProps {
  sample: SampleMetadata;
  expanded: boolean;
  expandedMicrographs: Set<string>;
  onToggleExpanded: () => void;
  onToggleMicrographExpanded: (id: string) => void;
  getSpotEffectiveState: (spot: Spot) => boolean;
  onSpotToggle: (spot: Spot) => void;
}

function SampleSection({
  sample,
  expanded,
  expandedMicrographs,
  onToggleExpanded,
  onToggleMicrographExpanded,
  getSpotEffectiveState,
  onSpotToggle,
}: SampleSectionProps) {
  // Count total spots in this sample
  const totalSpots = sample.micrographs?.reduce(
    (acc, m) => acc + (m.spots?.length || 0),
    0
  ) || 0;

  if (totalSpots === 0) {
    return null; // Don't show samples with no spots
  }

  return (
    <Box sx={{ mb: 1 }}>
      {/* Sample Header */}
      <Box
        onClick={onToggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          px: 1,
          bgcolor: 'action.hover',
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
          {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {sample.sampleID || sample.name || 'Unnamed Sample'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          ({totalSpots} spot{totalSpots !== 1 ? 's' : ''})
        </Typography>
      </Box>

      {/* Sample Content */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 2 }}>
          {sample.micrographs?.map(micrograph => (
            <MicrographSection
              key={micrograph.id}
              micrograph={micrograph}
              expanded={expandedMicrographs.has(micrograph.id)}
              onToggleExpanded={() => onToggleMicrographExpanded(micrograph.id)}
              getSpotEffectiveState={getSpotEffectiveState}
              onSpotToggle={onSpotToggle}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// MICROGRAPH SECTION COMPONENT
// ============================================================================

interface MicrographSectionProps {
  micrograph: MicrographMetadata;
  expanded: boolean;
  onToggleExpanded: () => void;
  getSpotEffectiveState: (spot: Spot) => boolean;
  onSpotToggle: (spot: Spot) => void;
}

function MicrographSection({
  micrograph,
  expanded,
  onToggleExpanded,
  getSpotEffectiveState,
  onSpotToggle,
}: MicrographSectionProps) {
  const spots = micrograph.spots || [];

  if (spots.length === 0) {
    return null; // Don't show micrographs with no spots
  }

  const isReference = !micrograph.parentID;

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Micrograph Header */}
      <Box
        onClick={onToggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.25,
          px: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 0.5,
        }}
      >
        <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
          {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </IconButton>
        <Typography variant="body2">
          {micrograph.name || 'Unnamed Micrograph'}
          {isReference && ' (Reference)'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          ({spots.length} spot{spots.length !== 1 ? 's' : ''})
        </Typography>
      </Box>

      {/* Spots List */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 4 }}>
          {spots.map(spot => (
            <FormControlLabel
              key={spot.id}
              control={
                <Checkbox
                  checked={getSpotEffectiveState(spot)}
                  onChange={() => onSpotToggle(spot)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {spot.name || 'Unnamed Spot'}
                </Typography>
              }
              sx={{ display: 'flex', my: 0 }}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
