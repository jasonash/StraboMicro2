/**
 * SpotsPanel — Hierarchical spot listing
 *
 * Shows all spots organized by Sample → Micrograph → Spot,
 * matching the desktop app's SpotsPanel structure.
 */

import { useState, useMemo, useCallback } from 'react';
import { Box, Typography, Collapse, Link } from '@mui/material';
import { ExpandMore, ChevronRight } from '@mui/icons-material';
import type { ProjectMetadata, SampleMetadata, MicrographMetadata, Spot } from '../types/project-types';

interface SpotsPanelProps {
  project: ProjectMetadata;
  onSpotClick: (spot: Spot, micrographId: string) => void;
}

export function SpotsPanel({ project, onSpotClick }: SpotsPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pb: 0.5, display: 'block', fontWeight: 600 }}>
        All Spots
      </Typography>
      {(project.datasets || []).map(dataset =>
        (dataset.samples || []).map(sample => (
          <SampleSection
            key={sample.id}
            sample={sample}
            expanded={expanded}
            onToggle={toggle}
            onSpotClick={onSpotClick}
          />
        ))
      )}
    </Box>
  );
}

function SampleSection({ sample, expanded, onToggle, onSpotClick }: {
  sample: SampleMetadata;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSpotClick: (spot: Spot, micrographId: string) => void;
}) {
  const isExpanded = expanded[sample.id] ?? true;
  const micrographs = sample.micrographs || [];

  // Build parent→children map
  const childMap = useMemo(() => {
    const map = new Map<string, MicrographMetadata[]>();
    for (const m of micrographs) {
      if (m.parentID) {
        const list = map.get(m.parentID) || [];
        list.push(m);
        map.set(m.parentID, list);
      }
    }
    return map;
  }, [micrographs]);

  const rootMicrographs = micrographs.filter(m => !m.parentID);

  return (
    <Box>
      {/* Sample header */}
      <Box
        onClick={() => onToggle(sample.id)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          px: 0.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 0.5,
          bgcolor: 'background.default',
          mx: 0.5,
          mt: 0.5,
        }}
      >
        {isExpanded ? <ExpandMore fontSize="small" sx={{ mr: 0.5 }} /> : <ChevronRight fontSize="small" sx={{ mr: 0.5 }} />}
        <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>
          {sample.label || sample.name}
        </Typography>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ pl: 1 }}>
          {rootMicrographs.map(micro => (
            <MicrographSection
              key={micro.id}
              micrograph={micro}
              childMap={childMap}
              isReference
              expanded={expanded}
              onToggle={onToggle}
              onSpotClick={onSpotClick}
              depth={0}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function MicrographSection({ micrograph, childMap, isReference, expanded, onToggle, onSpotClick, depth }: {
  micrograph: MicrographMetadata;
  childMap: Map<string, MicrographMetadata[]>;
  isReference: boolean;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSpotClick: (spot: Spot, micrographId: string) => void;
  depth: number;
}) {
  const isExpanded = expanded[micrograph.id] ?? true;
  const spots = micrograph.spots || [];
  const children = childMap.get(micrograph.id) || [];
  const displayName = isReference ? `${micrograph.name} (Reference)` : micrograph.name;

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      {/* Micrograph header */}
      <Box
        onClick={() => onToggle(micrograph.id)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 0.5,
        }}
      >
        {isExpanded ? <ExpandMore fontSize="small" sx={{ mr: 0.5 }} /> : <ChevronRight fontSize="small" sx={{ mr: 0.5 }} />}
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{displayName}</Typography>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ pl: 3 }}>
          {spots.length > 0 ? (
            spots.map(spot => (
              <Box
                key={spot.id}
                sx={{ py: 0.25, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 1 }}
              >
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => onSpotClick(spot, micrograph.id)}
                  sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, textAlign: 'left' }}
                >
                  {spot.name || 'Unnamed Spot'}
                </Link>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 0.25, px: 1 }}>
              No spots.
            </Typography>
          )}

          {children.map(child => (
            <MicrographSection
              key={child.id}
              micrograph={child}
              childMap={childMap}
              isReference={false}
              expanded={expanded}
              onToggle={onToggle}
              onSpotClick={onSpotClick}
              depth={depth + 1}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
