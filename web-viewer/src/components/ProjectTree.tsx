/**
 * ProjectTree — Hierarchical project navigation
 * Uses MUI components matching the desktop app's ProjectTree styling.
 */

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { HttpTileLoader } from '../services/tileLoader';
import type { ProjectMetadata, DatasetMetadata, SampleMetadata, MicrographMetadata } from '../types/project-types';

interface ProjectTreeProps {
  project: ProjectMetadata;
  allMicrographs: MicrographMetadata[];
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}

export function ProjectTree({ project, allMicrographs, activeMicrographId, tileLoader, onSelectMicrograph }: ProjectTreeProps) {
  return (
    <Box>
      {(project.datasets || []).map(dataset => (
        <DatasetNode key={dataset.id} dataset={dataset} allMicrographs={allMicrographs}
          activeMicrographId={activeMicrographId} tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
      ))}
    </Box>
  );
}

function DatasetNode({ dataset, allMicrographs, activeMicrographId, tileLoader, onSelectMicrograph }: {
  dataset: DatasetMetadata; allMicrographs: MicrographMetadata[]; activeMicrographId: string | null;
  tileLoader: HttpTileLoader; onSelectMicrograph: (id: string) => void;
}) {
  return (
    <Box>
      {(dataset.samples || []).map(sample => (
        <SampleNode key={sample.id} sample={sample} allMicrographs={allMicrographs}
          activeMicrographId={activeMicrographId} tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
      ))}
    </Box>
  );
}

function SampleNode({ sample, allMicrographs, activeMicrographId, tileLoader, onSelectMicrograph }: {
  sample: SampleMetadata; allMicrographs: MicrographMetadata[]; activeMicrographId: string | null;
  tileLoader: HttpTileLoader; onSelectMicrograph: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const rootMicrographs = useMemo(() => {
    const ids = new Set((sample.micrographs || []).map(m => m.id));
    return allMicrographs.filter(m => ids.has(m.id) && !m.parentID);
  }, [sample, allMicrographs]);

  return (
    <Box>
      <Box
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          cursor: 'pointer',
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
          userSelect: 'none',
        }}
      >
        {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : <ChevronRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1, ml: 0.5 }}>
          {sample.label || sample.name}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {(sample.micrographs || []).length}
        </Typography>
      </Box>
      <Collapse in={isExpanded}>
        {rootMicrographs.map(micro => (
          <MicrographNode key={micro.id} micrograph={micro} allMicrographs={allMicrographs} depth={0}
            activeMicrographId={activeMicrographId} tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
        ))}
      </Collapse>
    </Box>
  );
}

function MicrographNode({ micrograph, allMicrographs, depth, activeMicrographId, tileLoader, onSelectMicrograph }: {
  micrograph: MicrographMetadata; allMicrographs: MicrographMetadata[]; depth: number;
  activeMicrographId: string | null; tileLoader: HttpTileLoader; onSelectMicrograph: (id: string) => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const children = useMemo(
    () => allMicrographs.filter(m => m.parentID === micrograph.id),
    [micrograph.id, allMicrographs]
  );

  const isActive = micrograph.id === activeMicrographId;
  const hasChildren = children.length > 0;

  useEffect(() => {
    tileLoader.loadCompositeThumbnail(micrograph.id).then(setThumbnailUrl);
  }, [micrograph.id, tileLoader]);

  return (
    <Box>
      <Box
        onClick={() => onSelectMicrograph(micrograph.id)}
        sx={{
          pl: `${12 + depth * 16}px`,
          pr: 1,
          py: 0.5,
          cursor: 'pointer',
          bgcolor: isActive ? 'rgba(228, 76, 101, 0.15)' : 'transparent',
          borderLeft: isActive ? '3px solid' : '3px solid transparent',
          borderLeftColor: isActive ? 'primary.main' : 'transparent',
          '&:hover': { bgcolor: isActive ? 'rgba(228, 76, 101, 0.15)' : 'action.hover' },
          transition: 'background-color 0.15s',
        }}
      >
        {/* Name row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              sx={{ p: 0, width: 16, height: 16 }}
            >
              {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          ) : (
            <Box sx={{ width: 16 }} />
          )}
          <Typography
            variant="body2"
            sx={{
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'text.primary' : 'text.secondary',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.8rem',
            }}
          >
            {micrograph.name}
          </Typography>
          {hasChildren && (
            <Typography variant="caption" color="text.disabled">{children.length}</Typography>
          )}
        </Box>

        {/* Thumbnail */}
        {thumbnailUrl && (
          <Box sx={{ ml: hasChildren ? '20px' : '16px' }}>
            <Box
              component="img"
              src={thumbnailUrl}
              alt={micrograph.name}
              sx={{
                width: Math.max(80, 160 - depth * 20),
                height: 'auto',
                borderRadius: '4px',
                border: isActive ? '2px solid' : '1px solid',
                borderColor: isActive ? 'primary.main' : 'divider',
                display: 'block',
              }}
            />
          </Box>
        )}
      </Box>

      {/* Children */}
      <Collapse in={isExpanded}>
        {children.map(child => (
          <MicrographNode key={child.id} micrograph={child} allMicrographs={allMicrographs}
            depth={depth + 1} activeMicrographId={activeMicrographId}
            tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
        ))}
      </Collapse>
    </Box>
  );
}
