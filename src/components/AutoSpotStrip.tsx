/**
 * Auto spot strip (docs/auto-spot-mode-design.md 5.4): beside the drawing
 * toolbar while auto spot mode is on and a spot tool is active. Picks the
 * preset auto spots are made with and shows the next name.
 */

import { MenuItem, Select, Typography, Box, Tooltip } from '@mui/material';
import { useAppStore } from '@/store';
import { useToolbarDock } from '@/hooks/useToolbarDock';
import { autoSpotDraft } from '@/utils/newSpot';
import { chosenPattern } from '@/utils/autoSpotName';
import type { PresetWithScope } from '@/types/preset-types';

/** Distance from the docked edge: toolbar margin 16 + toolbar 54 + gap 8 */
const OFFSET = 78;

const STRIP_POSITION: Record<string, React.CSSProperties> = {
  right: { right: OFFSET, top: '50%', transform: 'translateY(-50%)' },
  left: { left: OFFSET, top: '50%', transform: 'translateY(-50%)' },
  top: { top: OFFSET, left: '50%', transform: 'translateX(-50%)' },
  bottom: { bottom: OFFSET, left: '50%', transform: 'translateX(-50%)' },
};

export const ALT_KEY_NAME = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? 'Option' : 'Alt';

/** Presets offered in the strip: those with a spot name, plus the chosen one (a key may pick one without) */
export function autoSpotPresetOptions(all: PresetWithScope[], chosenId: string | null): PresetWithScope[] {
  return all.filter((p) => (p.spotNamePattern?.trim() ?? '') !== '' || p.id === chosenId);
}

export function AutoSpotStrip() {
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const autoSpotPresetId = useAppStore((s) => s.autoSpotPresetId);
  const setAutoSpotPresetId = useAppStore((s) => s.setAutoSpotPresetId);
  const presetKeyBindings = useAppStore((s) => s.presetKeyBindings);
  // Subscribed so the list follows preset edits; read through getAllPresetsWithScope
  useAppStore((s) => s.globalPresets);
  const getAllPresetsWithScope = useAppStore((s) => s.getAllPresetsWithScope);
  const { dockEdge } = useToolbarDock();

  const all = getAllPresetsWithScope();
  const preset = autoSpotPresetId ? all.find((p) => p.id === autoSpotPresetId) ?? null : null;
  const options = autoSpotPresetOptions(all, preset?.id ?? null);
  const draft = autoSpotDraft(project, activeMicrographId, preset);

  const keyOf = (presetId: string): string | null => {
    for (const [key, id] of Object.entries(presetKeyBindings)) if (id === presetId) return key;
    return null;
  };

  return (
    <Tooltip
      title={`Auto spot mode: each click (or closed line or polygon) is saved as ${draft.name}. ${ALT_KEY_NAME}+click opens the New Spot dialog; Esc stops.`}
      placement="top"
    >
      <Box
        className="auto-spot-strip"
        data-testid="auto-spot-strip"
        style={STRIP_POSITION[dockEdge]}
        sx={{
          position: 'absolute',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1.5,
          py: 0.75,
          bgcolor: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          whiteSpace: 'nowrap',
        }}
      >
        <Typography variant="caption" sx={{ color: 'var(--accent)', fontWeight: 600 }}>
          AUTO
        </Typography>
        <Select
          size="small"
          variant="standard"
          value={preset?.id ?? ''}
          onChange={(e) => setAutoSpotPresetId(e.target.value === '' ? null : String(e.target.value))}
          displayEmpty
          inputProps={{ 'aria-label': 'Auto spot preset' }}
          sx={{ minWidth: 120, fontSize: '0.85rem' }}
        >
          <MenuItem value="">
            Default ({chosenPattern(null, project?.spotNamePattern)})
          </MenuItem>
          {options.map((p) => {
            const key = keyOf(p.id);
            return (
              <MenuItem key={p.id} value={p.id}>
                {key ? `${key} · ` : ''}
                {p.name}
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  {chosenPattern(p.spotNamePattern, project?.spotNamePattern)}
                </Typography>
              </MenuItem>
            );
          })}
        </Select>
        <Typography variant="body2" data-testid="auto-spot-next" sx={{ color: 'var(--text-secondary)' }}>
          Next: <strong>{draft.name}</strong>
        </Typography>
      </Box>
    </Tooltip>
  );
}
