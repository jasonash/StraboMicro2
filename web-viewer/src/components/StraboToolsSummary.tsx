/**
 * StraboTools Summary — Read-only display of analysis results
 * Uses MUI Accordions matching the desktop app's styling.
 */

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Chip,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { StraboToolsResult } from '../types/project-types';

interface StraboToolsSummaryProps {
  straboTools: StraboToolsResult;
}

const StyledAccordion = styled(Accordion)(({ theme }) => ({
  '&:before': { display: 'none' },
  borderLeft: '3px solid transparent',
  transition: 'border-color 0.2s ease',
  '&.Mui-expanded': {
    borderLeftColor: theme.palette.primary.main,
  },
}));

const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  minHeight: 32,
  padding: '0 12px',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
    backgroundColor: theme.palette.action.hover,
  },
}));

const TOOL_NAMES: Record<string, string> = {
  'edge-fabric': 'Edge Fabric',
  'color-index': 'Color Index',
  'edge-detect': 'Edge Detect',
  'mode': 'Mode',
};

const PHASE_COLORS: [number, number, number][] = [
  [0, 0, 0], [230, 230, 230], [217, 115, 153], [50, 178, 50], [153, 153, 255], [50, 50, 204],
];
const PHASE_NAMES = ['Black', 'White', 'Pink', 'Green', 'Lavender', 'Blue'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ fontWeight: 500 }}>{value}</Typography>
    </Box>
  );
}

export function StraboToolsSummary({ straboTools: st }: StraboToolsSummaryProps) {
  const toolName = TOOL_NAMES[st.tool] || st.tool;
  const timestamp = st.timestamp ? new Date(st.timestamp).toLocaleDateString() : '';

  return (
    <StyledAccordion disableGutters elevation={0} defaultExpanded>
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>StraboTools</Typography>
        <Chip label={toolName} size="small" variant="outlined" />
        {timestamp && <Typography variant="caption" color="text.secondary">{timestamp}</Typography>}
      </StyledAccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 1, px: 1.5 }}>
        {st.tool === 'edge-fabric' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Row label="Azimuth" value={st.azimuth != null ? `${st.azimuth.toFixed(2)}\u00B0` : '\u2014'} />
            <Row label="Axial Ratio" value={st.axialRatio != null ? st.axialRatio.toFixed(2) : '\u2014'} />
          </Box>
        )}
        {st.tool === 'color-index' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Row label="Color Index" value={st.colorIndexPercentage != null ? `${st.colorIndexPercentage.toFixed(1)}%` : '\u2014'} />
            <Row label="Threshold" value={st.colorIndexThreshold != null ? String(st.colorIndexThreshold) : '\u2014'} />
            <Row label="Mode" value={st.colorIndexMode === 'adaptive' ? 'Adaptive' : 'Global'} />
          </Box>
        )}
        {st.tool === 'edge-detect' && <Row label="Threshold" value={st.edgeDetectThreshold != null ? String(st.edgeDetectThreshold) : '\u2014'} />}
        {st.tool === 'mode' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Row label="Phases" value={st.modeNumPhases != null ? String(st.modeNumPhases) : '\u2014'} />
            {st.modePhasePercentages?.map((pct, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: `rgb(${PHASE_COLORS[i][0]},${PHASE_COLORS[i][1]},${PHASE_COLORS[i][2]})`, border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary">{PHASE_NAMES[i]}: {pct.toFixed(1)}%</Typography>
              </Box>
            ))}
          </Box>
        )}
      </AccordionDetails>
    </StyledAccordion>
  );
}
