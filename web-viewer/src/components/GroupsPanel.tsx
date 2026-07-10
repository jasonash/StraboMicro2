/**
 * GroupsPanel — Groups navigation for the sidebar
 * Read-only counterpart of the desktop app's GroupsPanel: collapsible groups
 * with clickable micrograph rows (name + composite thumbnail).
 */

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { HttpTileLoader } from '../services/tileLoader';
import type { ProjectMetadata, GroupMetadata, MicrographMetadata } from '../types/project-types';

interface GroupsPanelProps {
  project: ProjectMetadata;
  allMicrographs: MicrographMetadata[];
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}

export function GroupsPanel({ project, allMicrographs, activeMicrographId, tileLoader, onSelectMicrograph }: GroupsPanelProps) {
  const groups = project.groups || [];

  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
        No groups
      </Typography>
    );
  }

  return (
    <Box>
      {groups.map(group => (
        <GroupNode key={group.id} group={group} allMicrographs={allMicrographs}
          activeMicrographId={activeMicrographId} tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
      ))}
    </Box>
  );
}

function GroupNode({ group, allMicrographs, activeMicrographId, tileLoader, onSelectMicrograph }: {
  group: GroupMetadata; allMicrographs: MicrographMetadata[]; activeMicrographId: string | null;
  tileLoader: HttpTileLoader; onSelectMicrograph: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(group.isExpanded ?? true);

  const groupMicrographs = useMemo(() => {
    const byId = new Map(allMicrographs.map(m => [m.id, m]));
    return (group.micrographs || [])
      .map(id => byId.get(id))
      .filter((m): m is MicrographMetadata => m !== undefined);
  }, [group.micrographs, allMicrographs]);

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
          {group.name}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {groupMicrographs.length}
        </Typography>
      </Box>
      <Collapse in={isExpanded}>
        {groupMicrographs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', px: 2, py: 1, fontSize: '0.8rem' }}>
            No micrographs in this group
          </Typography>
        ) : (
          groupMicrographs.map(micro => (
            <GroupMicrographRow key={micro.id} micrograph={micro}
              isActive={micro.id === activeMicrographId}
              tileLoader={tileLoader} onSelectMicrograph={onSelectMicrograph} />
          ))
        )}
      </Collapse>
    </Box>
  );
}

function GroupMicrographRow({ micrograph, isActive, tileLoader, onSelectMicrograph }: {
  micrograph: MicrographMetadata; isActive: boolean;
  tileLoader: HttpTileLoader; onSelectMicrograph: (id: string) => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    tileLoader.loadCompositeThumbnail(micrograph.id).then(setThumbnailUrl);
  }, [micrograph.id, tileLoader]);

  return (
    <Box
      onClick={() => onSelectMicrograph(micrograph.id)}
      sx={{
        pl: '12px',
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
      <Typography
        variant="body2"
        sx={{
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'text.primary' : 'text.secondary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.8rem',
          mb: 0.25,
        }}
      >
        {micrograph.name || 'Unnamed Micrograph'}
      </Typography>

      {/* Thumbnail */}
      {thumbnailUrl && (
        <Box
          component="img"
          src={thumbnailUrl}
          alt={micrograph.name}
          sx={{
            width: 160,
            height: 'auto',
            borderRadius: '4px',
            border: isActive ? '2px solid' : '1px solid',
            borderColor: isActive ? 'primary.main' : 'divider',
            display: 'block',
          }}
        />
      )}
    </Box>
  );
}
