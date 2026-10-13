/**
 * Auto spot strip (docs/auto-spot-mode-design.md 5.4): at the top center of
 * the viewer, just below the top ruler, while auto spot mode is on and a
 * spot tool is active. Picks the preset auto spots are made with and shows
 * the next name. (Jason 2026-10-13: beside the toolbar it covered the area
 * being clicked; in the status line it went unnoticed.)
 */

import { useEffect } from 'react';
import { MenuItem, Select, Typography, Box, Tooltip } from '@mui/material';
import { useAppStore } from '@/store';
import { useCanCreate } from '@/hooks/usePermissions';
import { autoSpotDraft } from '@/utils/newSpot';
import { chosenPattern } from '@/utils/autoSpotName';
import type { PresetWithScope } from '@/types/preset-types';

export const ALT_KEY_NAME = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? 'Option' : 'Alt';

/** Presets offered in the strip: those with a spot name, plus the chosen one (a key may pick one without) */
export function autoSpotPresetOptions(all: PresetWithScope[], chosenId: string | null): PresetWithScope[] {
  return all.filter((p) => (p.spotNamePattern?.trim() ?? '') !== '' || p.id === chosenId);
}

/** The strip when auto spot mode applies (auto on, a spot tool, a micrograph, may create spots), else nothing */
export function AutoSpotStrip() {
  const autoSpotMode = useAppStore((s) => s.autoSpotMode);
  const activeTool = useAppStore((s) => s.activeTool);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const canDraw = useCanCreate();
  const spotTool = activeTool === 'point' || activeTool === 'line' || activeTool === 'polygon';
  if (!autoSpotMode || !spotTool || !activeMicrographId || !canDraw) return null;
  return <AutoSpotStripContent />;
}

/** Height of the viewer's rulers (TiledViewer RULER_SIZE) */
const RULER_SIZE = 30;

function AutoSpotStripContent() {
  const showRulers = useAppStore((s) => s.showRulers);
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const autoSpotPresetId = useAppStore((s) => s.autoSpotPresetId);
  const setAutoSpotPresetId = useAppStore((s) => s.setAutoSpotPresetId);
  const presetKeyBindings = useAppStore((s) => s.presetKeyBindings);
  // Subscribed so the list follows preset edits; read through getAllPresetsWithScope
  useAppStore((s) => s.globalPresets);
  const getAllPresetsWithScope = useAppStore((s) => s.getAllPresetsWithScope);

  const all = getAllPresetsWithScope();
  const preset = autoSpotPresetId ? all.find((p) => p.id === autoSpotPresetId) ?? null : null;
  const options = autoSpotPresetOptions(all, preset?.id ?? null);
  const draft = autoSpotDraft(project, activeMicrographId, preset);

  // Keys 1-9 choose the preset bound to them (only while the strip shows:
  // auto mode on and a spot tool active; Quick Classify ignores keys then)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!/^[1-9]$/.test(e.key) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const state = useAppStore.getState();
      const presetId = state.presetKeyBindings[e.key];
      if (!presetId || !state.getPresetById(presetId)) return;
      e.preventDefault();
      state.setAutoSpotPresetId(presetId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const keyOf = (presetId: string): string | null => {
    for (const [key, id] of Object.entries(presetKeyBindings)) if (id === presetId) return key;
    return null;
  };

  return (
    <Tooltip
      title={`Auto spot mode: each click (or closed line or polygon) is saved as ${draft.name}. ${ALT_KEY_NAME}+click opens the New Spot dialog; Esc stops.`}
      placement="bottom"
    >
      <Box
        className="auto-spot-strip"
        data-testid="auto-spot-strip"
        sx={{
          position: 'absolute',
          top: (showRulers ? RULER_SIZE : 0) + 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1.5,
          py: 0.5,
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
          renderValue={() => preset?.name ?? 'Default'}
          inputProps={{ 'aria-label': 'Auto spot preset' }}
          sx={{ minWidth: 80, fontSize: '0.85rem', '& .MuiSelect-select': { py: 0 } }}
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
