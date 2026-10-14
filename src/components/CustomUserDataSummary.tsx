/**
 * Custom User Data in the right pane (docs/custom-user-data-design.md 12):
 * a spot's values as "header: value" rows, or for a micrograph a count and
 * the Show Custom User Data... button (table modal). Renders nothing when
 * there is no data.
 */

import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { useAppStore } from '@/store';
import { columnsWithValues, spotEntries, spotsInOrder } from '@/utils/customUserData';
import { CustomUserDataTableDialog } from './dialogs/CustomUserDataTableDialog';

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
  '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 8, margin: '6px 0' },
  '&.Mui-expanded': { minHeight: 32 },
  '& .MuiAccordionSummary-content.Mui-expanded': { margin: '6px 0' },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(228, 76, 101, 0.12)' : 'rgba(228, 76, 101, 0.08)',
  },
}));

interface CustomUserDataSummaryProps {
  micrographId?: string;
  spotId?: string;
}

export function CustomUserDataSummary({ micrographId, spotId }: CustomUserDataSummaryProps) {
  const project = useAppStore((s) => s.project);
  const spotIndex = useAppStore((s) => s.spotIndex);
  const [tableOpen, setTableOpen] = useState(false);

  const spot = spotId ? spotIndex.get(spotId) : undefined;
  const entries = useMemo(() => (spot ? spotEntries(project, spot) : []), [project, spot]);
  const micrographStats = useMemo(() => {
    if (spotId || !micrographId) return null;
    const spots = spotsInOrder(project, micrographId).map((p) => p.spot);
    const columns = columnsWithValues(project, spots);
    const withData = spots.filter((s) => columns.some((c) => (s.customUserData?.[c] ?? '') !== '')).length;
    return { columns: columns.length, spots: withData };
  }, [project, micrographId, spotId]);

  if (spotId) {
    if (entries.length === 0) return null;
    return (
      // Keyed: a spot's section starts open, a micrograph's closed (MUI keeps the first defaultExpanded)
      <StyledAccordion key={`spot-${spotId}`} disableGutters defaultExpanded>
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Custom User Data</Typography>
          <Chip label={entries.length} size="small" />
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {entries.map(([header, value]) => (
              <Box key={header} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, maxWidth: '50%', overflowWrap: 'anywhere' }}>
                  {header}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </StyledAccordion>
    );
  }

  if (!micrographId || !micrographStats) return null;
  const hasData = micrographStats.spots > 0;
  // The table stays open after Remove all empties the micrograph (it shows what was done)
  if (!hasData && !tableOpen) return null;
  return (
    <>
      {hasData && (
        <StyledAccordion key={`micrograph-${micrographId}`} disableGutters defaultExpanded={false}>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Custom User Data</Typography>
            <Chip label={micrographStats.spots === 1 ? '1 spot' : `${micrographStats.spots} spots`} size="small" />
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
              {micrographStats.columns === 1 ? '1 column' : `${micrographStats.columns} columns`} on{' '}
              {micrographStats.spots === 1 ? '1 spot' : `${micrographStats.spots} spots`} of this micrograph.
            </Typography>
            <Button
              size="small"
              variant="text"
              startIcon={<TableChartOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={() => setTableOpen(true)}
              sx={{ textTransform: 'none' }}
            >
              Show Custom User Data...
            </Button>
          </AccordionDetails>
        </StyledAccordion>
      )}
      {tableOpen && (
        <CustomUserDataTableDialog open={tableOpen} onClose={() => setTableOpen(false)} micrographId={micrographId} />
      )}
    </>
  );
}
