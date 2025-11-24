/**
 * Spots Panel Component
 *
 * Displays the Spots tab content in the sidebar.
 * Shows all spots organized hierarchically by Sample → Micrograph → Spot.
 * Matches the legacy JavaFX FrontPageController.loadCurrentSpots() functionality.
 *
 * Structure:
 * - Sample (expandable)
 *   - Reference Micrograph (no parentID, expandable)
 *     - Spot links
 *     - Associated Micrograph (has parentID, expandable, nested recursively)
 *       - Spot links
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Collapse,
  Link,
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { SampleMetadata, MicrographMetadata, Spot } from '@/types/project-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a map of parent ID → child micrographs for efficient lookup
 */
function buildChildMicrographMap(micrographs: MicrographMetadata[]): Map<string, MicrographMetadata[]> {
  const map = new Map<string, MicrographMetadata[]>();

  for (const micrograph of micrographs) {
    if (micrograph.parentID) {
      const existing = map.get(micrograph.parentID) || [];
      existing.push(micrograph);
      map.set(micrograph.parentID, existing);
    }
  }

  return map;
}

// ============================================================================
// EXPANSION STATE MANAGEMENT
// ============================================================================

interface ExpansionState {
  samples: Record<string, boolean>;
  micrographs: Record<string, boolean>;
}

// ============================================================================
// SPOT ITEM COMPONENT
// ============================================================================

interface SpotItemProps {
  spot: Spot;
  micrographId: string;
  onClick: (spot: Spot, micrographId: string) => void;
}

function SpotItem({ spot, micrographId, onClick }: SpotItemProps) {
  return (
    <Box
      sx={{
        py: 0.25,
        '&:hover': { bgcolor: 'action.hover' },
        borderRadius: 0.5,
        px: 1,
      }}
    >
      <Link
        component="button"
        variant="body2"
        onClick={() => onClick(spot, micrographId)}
        sx={{
          textDecoration: 'none',
          '&:hover': { textDecoration: 'underline' },
          textAlign: 'left',
        }}
      >
        {spot.name || 'Unnamed Spot'}
      </Link>
    </Box>
  );
}

// ============================================================================
// MICROGRAPH SECTION COMPONENT (Recursive for associated micrographs)
// ============================================================================

interface MicrographSectionProps {
  micrograph: MicrographMetadata;
  allMicrographs: MicrographMetadata[];
  childMap: Map<string, MicrographMetadata[]>;
  isReference: boolean;
  expansionState: ExpansionState;
  onToggleExpand: (micrographId: string) => void;
  onSpotClick: (spot: Spot, micrographId: string) => void;
  depth: number;
}

function MicrographSection({
  micrograph,
  allMicrographs,
  childMap,
  isReference,
  expansionState,
  onToggleExpand,
  onSpotClick,
  depth,
}: MicrographSectionProps) {
  const isExpanded = expansionState.micrographs[micrograph.id] ?? true;
  const spots = micrograph.spots || [];
  const children = childMap.get(micrograph.id) || [];

  // Build display name
  const displayName = isReference
    ? `${micrograph.name} (Reference)`
    : micrograph.name;

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      {/* Micrograph Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 0.5,
        }}
        onClick={() => onToggleExpand(micrograph.id)}
      >
        {isExpanded ? (
          <ExpandMore fontSize="small" sx={{ mr: 0.5 }} />
        ) : (
          <ChevronRight fontSize="small" sx={{ mr: 0.5 }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {displayName}
        </Typography>
      </Box>

      {/* Spots and Children */}
      <Collapse in={isExpanded}>
        <Box sx={{ pl: 3 }}>
          {/* Spot links */}
          {spots.length > 0 ? (
            spots.map((spot) => (
              <SpotItem
                key={spot.id}
                spot={spot}
                micrographId={micrograph.id}
                onClick={onSpotClick}
              />
            ))
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontStyle: 'italic', py: 0.25, px: 1 }}
            >
              No spots.
            </Typography>
          )}

          {/* Child (associated) micrographs - recursive */}
          {children.map((child) => (
            <MicrographSection
              key={child.id}
              micrograph={child}
              allMicrographs={allMicrographs}
              childMap={childMap}
              isReference={false}
              expansionState={expansionState}
              onToggleExpand={onToggleExpand}
              onSpotClick={onSpotClick}
              depth={depth + 1}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// SAMPLE SECTION COMPONENT
// ============================================================================

interface SampleSectionProps {
  sample: SampleMetadata;
  expansionState: ExpansionState;
  onToggleSampleExpand: (sampleId: string) => void;
  onToggleMicrographExpand: (micrographId: string) => void;
  onSpotClick: (spot: Spot, micrographId: string) => void;
}

function SampleSection({
  sample,
  expansionState,
  onToggleSampleExpand,
  onToggleMicrographExpand,
  onSpotClick,
}: SampleSectionProps) {
  const isExpanded = expansionState.samples[sample.id] ?? true;
  const micrographs = sample.micrographs || [];

  // Build map of parent → children
  const childMap = useMemo(() => buildChildMicrographMap(micrographs), [micrographs]);

  // Get reference micrographs (no parentID)
  const referenceMicrographs = useMemo(
    () => micrographs.filter((m) => !m.parentID),
    [micrographs]
  );

  // Display name: use sampleID if available, otherwise name
  const displayName = (sample.sampleID || sample.name || 'Unnamed Sample').toUpperCase();

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Sample Header */}
      <Box
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
        onClick={() => onToggleSampleExpand(sample.id)}
      >
        {isExpanded ? (
          <ExpandMore fontSize="small" sx={{ mr: 0.5 }} />
        ) : (
          <ChevronRight fontSize="small" sx={{ mr: 0.5 }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {displayName}
        </Typography>
      </Box>

      {/* Micrographs */}
      <Collapse in={isExpanded}>
        <Box sx={{ pl: 2, pt: 0.5 }}>
          {referenceMicrographs.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontStyle: 'italic', py: 0.25, px: 1 }}
            >
              No micrographs.
            </Typography>
          ) : (
            referenceMicrographs.map((micrograph) => (
              <MicrographSection
                key={micrograph.id}
                micrograph={micrograph}
                allMicrographs={micrographs}
                childMap={childMap}
                isReference={true}
                expansionState={expansionState}
                onToggleExpand={onToggleMicrographExpand}
                onSpotClick={onSpotClick}
                depth={0}
              />
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// MAIN SPOTS PANEL COMPONENT
// ============================================================================

export function SpotsPanel() {
  const project = useAppStore((state) => state.project);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);

  // Local expansion state for samples and micrographs
  const [expansionState, setExpansionState] = useState<ExpansionState>({
    samples: {},
    micrographs: {},
  });

  // Get all samples across all datasets
  const allSamples = useMemo(() => {
    if (!project) return [];

    const samples: SampleMetadata[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        samples.push(sample);
      }
    }
    return samples;
  }, [project]);

  // Toggle sample expansion
  const handleToggleSampleExpand = useCallback((sampleId: string) => {
    setExpansionState((prev) => ({
      ...prev,
      samples: {
        ...prev.samples,
        [sampleId]: !(prev.samples[sampleId] ?? true),
      },
    }));
  }, []);

  // Toggle micrograph expansion
  const handleToggleMicrographExpand = useCallback((micrographId: string) => {
    setExpansionState((prev) => ({
      ...prev,
      micrographs: {
        ...prev.micrographs,
        [micrographId]: !(prev.micrographs[micrographId] ?? true),
      },
    }));
  }, []);

  // Handle spot click - navigate to micrograph and select spot
  const handleSpotClick = useCallback(
    (spot: Spot, micrographId: string) => {
      selectMicrograph(micrographId);
      selectActiveSpot(spot.id);
    },
    [selectMicrograph, selectActiveSpot]
  );

  if (!project) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No project loaded
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          All Spots
        </Typography>
      </Box>

      {/* Spots List */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {allSamples.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No samples in project.
          </Typography>
        ) : (
          allSamples.map((sample) => (
            <SampleSection
              key={sample.id}
              sample={sample}
              expansionState={expansionState}
              onToggleSampleExpand={handleToggleSampleExpand}
              onToggleMicrographExpand={handleToggleMicrographExpand}
              onSpotClick={handleSpotClick}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
