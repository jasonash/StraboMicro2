/**
 * BreadcrumbsBar — Micrograph hierarchy navigation
 * Uses MUI components matching the desktop app's BreadcrumbsBar styling.
 */

import { useMemo } from 'react';
import { Box, Typography, Link } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import type { MicrographMetadata } from '../types/project-types';

interface BreadcrumbsBarProps {
  micrograph: MicrographMetadata | null;
  allMicrographs: MicrographMetadata[];
  selectedSpotName?: string | null;
  onNavigate: (micrographId: string) => void;
}

export function BreadcrumbsBar({ micrograph, allMicrographs, selectedSpotName, onNavigate }: BreadcrumbsBarProps) {
  const chain = useMemo(() => {
    if (!micrograph) return [];
    const ancestors: MicrographMetadata[] = [];
    let current: MicrographMetadata | undefined = micrograph;
    while (current) {
      ancestors.unshift(current);
      current = current.parentID ? allMicrographs.find(m => m.id === current!.parentID) : undefined;
    }
    return ancestors;
  }, [micrograph, allMicrographs]);

  if (chain.length === 0) return null;

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      px: 1.5,
      py: 0.5,
      bgcolor: 'background.default',
      borderBottom: 1,
      borderColor: 'divider',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {chain.map((item, i) => {
        const isLast = i === chain.length - 1 && !selectedSpotName;
        return (
          <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {i > 0 && <NavigateNextIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
            {isLast ? (
              <Typography variant="caption" sx={{ fontWeight: 500 }}>{item.name}</Typography>
            ) : (
              <Link
                component="button"
                variant="caption"
                onClick={() => onNavigate(item.id)}
                sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                {item.name}
              </Link>
            )}
          </Box>
        );
      })}
      {selectedSpotName && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <NavigateNextIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          <Typography variant="caption" sx={{ fontWeight: 500 }}>{selectedSpotName}</Typography>
        </Box>
      )}
    </Box>
  );
}
