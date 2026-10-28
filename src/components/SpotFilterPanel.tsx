/**
 * View > Filter Spots... (Cmd/Ctrl+Shift+F; Angus, 2026-10-28): a panel in
 * the top-left corner of the viewer that dims or hides spots by the data
 * sections they have (src/utils/spotDataSections.ts). It does not block the
 * app, so the image updates while the filter is set. While a filter is on, a
 * notice in the bottom-left corner says how many spots match, with Edit and
 * Clear, so hidden spots are never mistaken for deleted ones.
 *
 * The filter is a view setting on this computer only: never saved in the
 * project, cleared when the project closes.
 */

import { useMemo } from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { useAppStore } from '@/store';
import {
  SPOT_DATA_SECTIONS,
  describeSpotFilter,
  isSpotFilterOn,
  spotMatchesFilter,
  type SectionChoice,
  type SpotDataSectionId,
} from '@/utils/spotDataSections';

/** Height/width of the viewer's rulers (TiledViewer RULER_SIZE) */
const RULER_SIZE = 30;

type RowChoice = 'any' | SectionChoice;

/** Spots on the active micrograph that match, of those drawn (archived only when shown) */
function useMatchCount(): { matching: number; total: number } | null {
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const micrographIndex = useAppStore((state) => state.micrographIndex);
  const showArchivedSpots = useAppStore((state) => state.showArchivedSpots);
  const spotFilter = useAppStore((state) => state.spotFilter);
  return useMemo(() => {
    const micrograph = activeMicrographId ? micrographIndex.get(activeMicrographId) : undefined;
    if (!micrograph) return null;
    const spots = (micrograph.spots ?? []).filter((spot) => !spot.archived || showArchivedSpots);
    return { matching: spots.filter((spot) => spotMatchesFilter(spot, spotFilter)).length, total: spots.length };
  }, [activeMicrographId, micrographIndex, showArchivedSpots, spotFilter]);
}

function countText(count: { matching: number; total: number }): string {
  return `${count.matching} of ${count.total} ${count.total === 1 ? 'spot' : 'spots'} on this micrograph match`;
}

export function SpotFilterPanel() {
  const project = useAppStore((state) => state.project);
  const spotFilter = useAppStore((state) => state.spotFilter);
  const setSpotFilter = useAppStore((state) => state.setSpotFilter);
  const clearSpotFilter = useAppStore((state) => state.clearSpotFilter);
  const panelOpen = useAppStore((state) => state.spotFilterPanelOpen);
  const setPanelOpen = useAppStore((state) => state.setSpotFilterPanelOpen);
  const showRulers = useAppStore((state) => state.showRulers);
  const count = useMatchCount();

  if (!project) return null;

  const filterOn = isSpotFilterOn(spotFilter);
  const inset = (showRulers ? RULER_SIZE : 0) + 8;

  const setChoice = (id: SpotDataSectionId, choice: RowChoice) => {
    const sections = { ...spotFilter.sections };
    if (choice === 'any') delete sections[id];
    else sections[id] = choice;
    setSpotFilter({ ...spotFilter, sections });
  };

  return (
    <>
      {panelOpen && (
        <Paper
          role="dialog"
          aria-label="Filter Spots"
          elevation={8}
          sx={{
            position: 'absolute',
            top: inset,
            left: inset,
            zIndex: 110,
            width: 400,
            maxWidth: `calc(100% - ${inset + 16}px)`,
            maxHeight: `calc(100% - ${inset + 64}px)`,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1.5, pb: 0.5 }}>
            <FilterAltIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
              Filter Spots
            </Typography>
            <IconButton size="small" aria-label="Close Filter Spots" onClick={() => setPanelOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Typography variant="caption" sx={{ px: 2, pb: 1, color: 'text.secondary' }}>
            Show the spots that have (or do not have) data in these sections. With several choices, a spot must meet all of them.
          </Typography>

          <Box sx={{ overflowY: 'auto', px: 1 }}>
            {SPOT_DATA_SECTIONS.map((section) => {
              const choice: RowChoice = spotFilter.sections[section.id] ?? 'any';
              return (
                <Box
                  key={section.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.25,
                    borderRadius: 0.5,
                    bgcolor: choice === 'any' ? 'transparent' : 'action.selected',
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: choice === 'any' ? 400 : 600 }}>
                    {section.label}
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={choice}
                    aria-label={section.label}
                    onChange={(_, value: RowChoice | null) => {
                      if (value) setChoice(section.id, value);
                    }}
                    sx={{ '& .MuiToggleButton-root': { py: 0.125, px: 1, textTransform: 'none', fontSize: '0.75rem' } }}
                  >
                    <ToggleButton value="any">Any</ToggleButton>
                    <ToggleButton value="has">Has</ToggleButton>
                    <ToggleButton value="without">Doesn't have</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              );
            })}
          </Box>

          <Box sx={{ borderTop: '1px solid var(--border)', mt: 1, px: 2, py: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                Spots that don't match
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={spotFilter.others}
                aria-label="Spots that don't match"
                onChange={(_, value: 'dim' | 'hide' | null) => {
                  if (value) setSpotFilter({ ...spotFilter, others: value });
                }}
                sx={{ '& .MuiToggleButton-root': { py: 0.125, px: 1.5, textTransform: 'none', fontSize: '0.75rem' } }}
              >
                <ToggleButton value="dim">Dim</ToggleButton>
                <ToggleButton value="hide">Hide</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" data-testid="spot-filter-count" sx={{ flex: 1, color: 'text.secondary' }}>
                {filterOn && count ? countText(count) : 'No filter: every spot is shown.'}
              </Typography>
              <Button size="small" onClick={clearSpotFilter} disabled={!filterOn}>
                Clear
              </Button>
              <Button size="small" variant="contained" onClick={() => setPanelOpen(false)}>
                Done
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {filterOn && (
        <Box
          data-testid="spot-filter-notice"
          sx={{
            position: 'absolute',
            bottom: 16,
            left: (showRulers ? RULER_SIZE : 0) + 8,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 1,
            pr: 0.5,
            py: 0.25,
            bgcolor: 'var(--bg-tertiary)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          <FilterAltIcon fontSize="small" sx={{ color: 'var(--accent)' }} />
          <Tooltip title={`Filter: ${describeSpotFilter(spotFilter)}`} placement="top">
            <Typography variant="body2" sx={{ cursor: 'help' }}>
              Filtered{count ? `: ${count.matching} of ${count.total} ${count.total === 1 ? 'spot' : 'spots'} match` : ''}
            </Typography>
          </Tooltip>
          {!panelOpen && (
            <Button size="small" onClick={() => setPanelOpen(true)} sx={{ minWidth: 0 }}>
              Edit
            </Button>
          )}
          <Button size="small" onClick={clearSpotFilter} sx={{ minWidth: 0 }}>
            Clear
          </Button>
        </Box>
      )}
    </>
  );
}
