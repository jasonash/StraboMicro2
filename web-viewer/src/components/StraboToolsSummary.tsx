/**
 * StraboTools Summary — Read-only display of analysis results
 *
 * Adapted from desktop app's StraboToolsSummary.tsx, using lightweight
 * CollapsibleSection instead of MUI Accordion.
 */

import { CollapsibleSection } from './ui/CollapsibleSection';
import { StatRow } from './ui/StatRow';
import { colors, fonts } from '../styles/theme';
import type { StraboToolsResult } from '../types/project-types';

interface StraboToolsSummaryProps {
  straboTools: StraboToolsResult;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'edge-fabric': 'Edge Fabric',
  'color-index': 'Color Index',
  'edge-detect': 'Edge Detect',
  'mode': 'Mode',
};

const PHASE_COLORS: [number, number, number][] = [
  [0, 0, 0],
  [230, 230, 230],
  [217, 115, 153],
  [50, 178, 50],
  [153, 153, 255],
  [50, 50, 204],
];

const PHASE_NAMES = ['Black', 'White', 'Pink', 'Green', 'Lavender', 'Blue'];

export function StraboToolsSummary({ straboTools: st }: StraboToolsSummaryProps) {
  const toolName = TOOL_DISPLAY_NAMES[st.tool] || st.tool;
  const timestamp = st.timestamp ? new Date(st.timestamp).toLocaleDateString() : '';

  return (
    <CollapsibleSection title={`StraboTools — ${toolName}`} defaultOpen>
      {timestamp && (
        <div style={{ fontSize: fonts.sizeSm, color: colors.textMuted, marginBottom: '4px' }}>
          Analyzed: {timestamp}
        </div>
      )}

      {st.tool === 'edge-fabric' && (
        <>
          <StatRow label="Azimuth" value={st.azimuth != null ? `${st.azimuth.toFixed(2)}\u00B0` : undefined} />
          <StatRow label="Axial Ratio" value={st.axialRatio != null ? st.axialRatio.toFixed(2) : undefined} />
        </>
      )}

      {st.tool === 'color-index' && (
        <>
          <StatRow label="Color Index" value={st.colorIndexPercentage != null ? `${st.colorIndexPercentage.toFixed(1)}%` : undefined} />
          <StatRow label="Threshold" value={st.colorIndexThreshold != null ? String(st.colorIndexThreshold) : undefined} />
          <StatRow label="Mode" value={st.colorIndexMode === 'adaptive' ? 'Adaptive' : 'Global'} />
        </>
      )}

      {st.tool === 'edge-detect' && (
        <StatRow label="Threshold" value={st.edgeDetectThreshold != null ? String(st.edgeDetectThreshold) : undefined} />
      )}

      {st.tool === 'mode' && (
        <>
          <StatRow label="Phases" value={st.modeNumPhases != null ? String(st.modeNumPhases) : undefined} />
          {st.modePhasePercentages?.map((pct, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px', marginTop: '2px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                backgroundColor: `rgb(${PHASE_COLORS[i][0]},${PHASE_COLORS[i][1]},${PHASE_COLORS[i][2]})`,
                border: `1px solid ${colors.border}`,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: fonts.sizeSm, color: colors.textMuted }}>
                {PHASE_NAMES[i]}: {pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </>
      )}
    </CollapsibleSection>
  );
}
