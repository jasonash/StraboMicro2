/**
 * Point Count Summary Component
 *
 * Read-only accordion that displays point count session results inline
 * in the PropertiesPanel when viewing a micrograph. Only renders when
 * point count sessions exist for the micrograph.
 */

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Stack,
  Chip,
  LinearProgress,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppStore } from '@/store';
import { getMineralColor } from '@/types/point-count-types';
import type { PointCountSessionSummary } from '@/types/point-count-types';

interface PointCountSummaryProps {
  micrographId: string;
}

// Styled Accordion matching MetadataSummary pattern
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
  transition: 'background-color 0.2s ease',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
  },
  '& .MuiAccordionSummary-content.Mui-expanded': {
    margin: '6px 0',
  },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(228, 76, 101, 0.12)'
      : 'rgba(228, 76, 101, 0.08)',
  },
}));

/**
 * Format a date string for compact display
 */
function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Mineral composition horizontal bar
 */
function CompositionBar({ composition, total }: { composition: Record<string, number>; total: number }) {
  if (total === 0) return null;

  const entries = Object.entries(composition).sort(([, a], [, b]) => b - a);

  return (
    <Box sx={{ display: 'flex', height: 12, borderRadius: 1, overflow: 'hidden', width: '100%' }}>
      {entries.map(([mineral, count]) => (
        <Box
          key={mineral}
          sx={{
            width: `${(count / total) * 100}%`,
            backgroundColor: getMineralColor(mineral),
            minWidth: count > 0 ? 2 : 0,
          }}
          title={`${mineral}: ${count} (${((count / total) * 100).toFixed(1)}%)`}
        />
      ))}
    </Box>
  );
}

/**
 * Single session summary display
 */
function SessionDetail({ session }: { session: PointCountSessionSummary }) {
  const progress = session.totalPoints > 0
    ? (session.classifiedCount / session.totalPoints) * 100
    : 0;

  const composition = session.modalComposition || {};
  const entries = Object.entries(composition).sort(([, a], [, b]) => b - a);

  return (
    <Stack spacing={0.5}>
      {/* Session header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {session.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDate(session.updatedAt)}
        </Typography>
      </Box>

      {/* Progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {session.classifiedCount}/{session.totalPoints}
        </Typography>
      </Box>

      {/* Composition bar */}
      {entries.length > 0 && (
        <CompositionBar composition={composition} total={session.classifiedCount} />
      )}

      {/* Mineral table */}
      {entries.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          {entries.map(([mineral, count]) => {
            const pct = session.classifiedCount > 0
              ? ((count / session.classifiedCount) * 100).toFixed(1)
              : '0.0';
            return (
              <Box
                key={mineral}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  py: 0.125,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: getMineralColor(mineral),
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {mineral}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {count}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 500, width: 40, textAlign: 'right' }}>
                  {pct}%
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}

export function PointCountSummary({ micrographId }: PointCountSummaryProps) {
  const pointCountSessionList = useAppStore((s) => s.pointCountSessionList);

  // Filter sessions for this micrograph
  const sessions = pointCountSessionList.filter((s) => s.micrographId === micrographId);

  if (sessions.length === 0) {
    return null;
  }

  // Sessions are already sorted by updatedAt descending from storage
  const mostRecent = sessions[0];
  const olderSessions = sessions.slice(1);

  return (
    <StyledAccordion disableGutters defaultExpanded={false}>
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Point Count Results</Typography>
        <Chip label={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`} size="small" />
      </StyledAccordionSummary>
      <AccordionDetails sx={{ py: 1 }}>
        <Stack spacing={1.5}>
          {/* Most recent session */}
          <SessionDetail session={mostRecent} />

          {/* Older sessions */}
          {olderSessions.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1, mb: 0.5 }}
              >
                Older Sessions:
              </Typography>
              <Stack spacing={1}>
                {olderSessions.map((session) => (
                  <Box key={session.id} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                    <SessionDetail session={session} />
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </StyledAccordion>
  );
}
