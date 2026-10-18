/**
 * Grain Spot status (docs/click-a-grain-design.md): while the tool is active,
 * a line at the bottom center of the viewer says what it is doing
 * ("Preparing grains...", "Click a grain") or why a click made no spot, and
 * the first time it asks to download the model. Rendered by Viewer.tsx.
 */

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { useCanCreate } from '@/hooks/usePermissions';
import { downloadModel, useGrainSpotStore } from '@/services/grainSpot/grainSpotEngine';
import { formatBytes } from '@/utils/formatBytes';

/** The status line's hint: how to click, and how to fix the last grain */
const CLICK_HINT = `Click a grain to outline it. Shift+click adds to the last grain, ${
  /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+click cuts from it.`;

export function GrainSpotStatus() {
  const activeTool = useAppStore((s) => s.activeTool);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const canDraw = useCanCreate();
  if (activeTool !== 'grain' || !activeMicrographId || !canDraw) return null;
  return <GrainSpotStatusContent />;
}

function GrainSpotStatusContent() {
  const phase = useGrainSpotStore((s) => s.phase);
  const percent = useGrainSpotStore((s) => s.percent);
  const totalBytes = useGrainSpotStore((s) => s.totalBytes);
  const error = useGrainSpotStore((s) => s.error);
  const note = useGrainSpotStore((s) => s.note);
  const lastPrepareMs = useGrainSpotStore((s) => s.lastPrepareMs);
  const backend = useGrainSpotStore((s) => s.backend);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  const busy = phase === 'loading' || phase === 'preparing' || phase === 'downloading';
  const text = phase === 'downloading' ? `Downloading the grain model… ${percent}%`
    : phase === 'loading' ? 'Loading the grain model…'
      : phase === 'preparing' ? 'Preparing grains…'
        : phase === 'error' ? `Grain Spot is not available: ${error ?? 'unknown error'}`
          : phase === 'needs-download' ? 'Grain Spot needs a one-time download'
            : note ?? CLICK_HINT;

  return (
    <>
      <Box
        data-testid="grain-spot-status"
        sx={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.5,
          bgcolor: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <Typography variant="caption" sx={{ color: 'var(--accent)', fontWeight: 600 }}>GRAIN</Typography>
        {busy && <CircularProgress size={12} />}
        <Typography variant="body2" sx={{ color: note && phase === 'ready' ? 'var(--warning, #f0ad4e)' : 'var(--text-secondary)' }}>
          {text}
        </Typography>
        {/* Where views are analyzed; the only part that takes the mouse (the line lies over the image), for its tooltip */}
        {backend && (
          <Typography
            variant="caption"
            data-testid="grain-spot-backend"
            title={lastPrepareMs !== null
              ? `Last view analyzed in ${(lastPrepareMs / 1000).toFixed(2)} s ${backend === 'webgpu' ? 'on the GPU (WebGPU)' : 'on the CPU'}`
              : backend === 'webgpu' ? 'Views are analyzed on the GPU (WebGPU)' : 'Views are analyzed on the CPU'}
            sx={{ ml: 0.5, px: 0.75, borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-secondary)', pointerEvents: 'auto', cursor: 'default' }}
          >
            {backend === 'webgpu' ? 'GPU' : 'CPU'}
          </Typography>
        )}
      </Box>

      <Dialog open={phase === 'needs-download' || phase === 'downloading'} maxWidth="xs" fullWidth>
        <DialogTitle>Download the Grain Model?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Grain Spot outlines a grain where you click. It needs a one-time download of the grain model
            ({totalBytes > 0 ? formatBytes(totalBytes) : 'about 60 MB'}, SAM 2.1 from Meta, open source). After that it works offline.
          </DialogContentText>
          {phase === 'downloading' && <LinearProgress variant="determinate" value={percent} sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveTool(null)} disabled={phase === 'downloading'}>Not Now</Button>
          <Button variant="contained" onClick={() => void downloadModel()} disabled={phase === 'downloading'}>
            {phase === 'downloading' ? `Downloading… ${percent}%` : 'Download'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
