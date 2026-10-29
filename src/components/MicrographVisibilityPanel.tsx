/**
 * View > Micrograph Visibility... (Cmd/Ctrl+Shift+V; Jason + Peter,
 * 2026-10-29): a panel in the top-left corner of the viewer that lists every
 * associated micrograph placed under the micrograph in the viewer, indented
 * as in the tree, to show or hide them quickly. Show All / Hide All act on the
 * rows the name filter leaves; "Show only this one" hides the others, and the
 * Up/Down arrow keys then step through the rows one at a time (a stack of
 * element maps over its BSE image). Each row has the micrograph's opacity.
 *
 * Showing and hiding is the tree's eye (isMicroVisible), each person's own
 * view, never synced; opacity is the micrograph's opacity, as in the tree.
 * Rows: src/utils/micrographVisibility.ts.
 */

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Box, Button, IconButton, Paper, Slider, TextField, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LayersIcon from '@mui/icons-material/Layers';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { useAppStore } from '@/store';
import { filterRows, showOnlyUpdates, visibilityFor, visibilityRows } from '@/utils/micrographVisibility';

/** Height/width of the viewer's rulers (TiledViewer RULER_SIZE) */
const RULER_SIZE = 30;

export function MicrographVisibilityPanel() {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const micrographIndex = useAppStore((state) => state.micrographIndex);
  const panelOpen = useAppStore((state) => state.micrographVisibilityPanelOpen);
  const setPanelOpen = useAppStore((state) => state.setMicrographVisibilityPanelOpen);
  const setMicrographsVisible = useAppStore((state) => state.setMicrographsVisible);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const showRulers = useAppStore((state) => state.showRulers);
  const [filter, setFilter] = useState('');
  /** The row shown alone ("Show only this one"); the arrow keys step from it */
  const [onlyId, setOnlyId] = useState<string | null>(null);
  /** Opacity while a slider is dragged (saved when it is let go) */
  const [dragging, setDragging] = useState<{ id: string; value: number } | null>(null);

  const rows = useMemo(() => visibilityRows(project, activeMicrographId), [project, activeMicrographId]);
  const shown = filterRows(rows, filter);

  if (!project || !panelOpen) return null;

  const inset = (showRulers ? RULER_SIZE : 0) + 8;
  const viewerName = activeMicrographId ? micrographIndex.get(activeMicrographId)?.name : null;

  const showOnly = (id: string) => {
    setMicrographsVisible(showOnlyUpdates(rows, id));
    setOnlyId(id);
  };

  // Up/Down step "Show only this one" through the listed rows
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.target instanceof HTMLElement && event.target.closest('input, .MuiSlider-root')) return;
    if (shown.length === 0) return;
    event.preventDefault();
    const at = onlyId ? shown.findIndex((r) => r.id === onlyId) : -1;
    const next = event.key === 'ArrowDown'
      ? (at + 1) % shown.length
      : (at <= 0 ? shown.length : at) - 1;
    showOnly(shown[next].id);
  };

  return (
    <Paper
      role="dialog"
      aria-label="Micrograph Visibility"
      elevation={8}
      onKeyDown={handleKeyDown}
      sx={{
        position: 'absolute',
        top: inset,
        left: inset,
        zIndex: 111,
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
        <LayersIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
          Micrograph Visibility
        </Typography>
        <IconButton size="small" aria-label="Close Micrograph Visibility" onClick={() => setPanelOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="caption" sx={{ px: 2, pb: 1, color: 'text.secondary' }}>
        Micrographs placed on {viewerName || 'this micrograph'}. Showing and hiding is your own view: collaborators
        keep theirs. After "Show only this one", the Up and Down arrow keys step through them.
      </Typography>

      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ px: 2, pb: 2, color: 'text.secondary' }}>
          No micrographs are placed on {viewerName || 'this micrograph'}.
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 1 }}>
            <TextField
              size="small"
              placeholder="Filter by name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Filter by name' } }}
              sx={{ flex: 1 }}
            />
            <Button size="small" onClick={() => { setMicrographsVisible(visibilityFor(shown, true)); setOnlyId(null); }}>
              Show All
            </Button>
            <Button size="small" onClick={() => { setMicrographsVisible(visibilityFor(shown, false)); setOnlyId(null); }}>
              Hide All
            </Button>
          </Box>
          <Box sx={{ overflowY: 'auto', px: 1, pb: 1 }}>
            {shown.length === 0 && (
              <Typography variant="body2" sx={{ px: 1, py: 1, color: 'text.secondary' }}>
                No micrographs match the filter.
              </Typography>
            )}
            {shown.map((row) => {
              const opacity = dragging?.id === row.id ? dragging.value : row.opacity;
              return (
                <Box
                  key={row.id}
                  data-testid="visibility-row"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    pl: 1 + row.depth * 2,
                    pr: 1,
                    borderRadius: 0.5,
                    bgcolor: row.id === onlyId ? 'action.selected' : 'transparent',
                  }}
                >
                  <IconButton
                    size="small"
                    aria-label={`${row.visible ? 'Hide' : 'Show'} ${row.name}`}
                    onClick={() => { setMicrographsVisible(visibilityFor([row], !row.visible)); setOnlyId(null); }}
                  >
                    {row.visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                  </IconButton>
                  <Typography
                    variant="body2"
                    noWrap
                    title={row.name}
                    sx={{ flex: 1, minWidth: 0, color: row.visible ? 'text.primary' : 'text.secondary' }}
                  >
                    {row.name}
                  </Typography>
                  <Tooltip title="Show only this one">
                    <IconButton size="small" aria-label={`Show only ${row.name}`} onClick={() => showOnly(row.id)}>
                      <CenterFocusStrongIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(_e, value) => setDragging({ id: row.id, value: typeof value === 'number' ? value : value[0] })}
                    onChangeCommitted={(_e, value) => {
                      updateMicrographMetadata(row.id, { opacity: typeof value === 'number' ? value : value[0] });
                      setDragging(null);
                    }}
                    slotProps={{ input: { 'aria-label': `Opacity of ${row.name}` } }}
                    sx={{ width: 72, mx: 1 }}
                  />
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Paper>
  );
}
