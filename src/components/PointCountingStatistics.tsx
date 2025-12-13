/**
 * Point Counting Statistics Component
 *
 * Displays live modal analysis statistics including mineral percentages,
 * confidence intervals, and classification progress.
 */

import { useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Button,
  Stack,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Download,
  Info,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import {
  calculatePointCountStatisticsForMicrograph,
  calculateStatisticsFromSession,
  exportStatisticsToCSV,
  type PointCountStatistics as Stats,
} from '@/services/pointCounting';

// ============================================================================
// SIMPLE BAR CHART COMPONENT
// ============================================================================

interface BarChartProps {
  data: Array<{ name: string; percentage: number; color?: string }>;
  maxPercentage?: number;
}

function SimpleBarChart({ data, maxPercentage = 100 }: BarChartProps) {
  // Generate distinct colors for minerals
  const colors = [
    '#2196F3', // Blue
    '#4CAF50', // Green
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#F44336', // Red
    '#00BCD4', // Cyan
    '#795548', // Brown
    '#607D8B', // Blue Grey
    '#E91E63', // Pink
    '#CDDC39', // Lime
  ];

  return (
    <Box sx={{ width: '100%' }}>
      {data.map((item, index) => (
        <Box key={item.name} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {item.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.percentage.toFixed(1)}%
            </Typography>
          </Box>
          <Box
            sx={{
              width: '100%',
              height: 16,
              bgcolor: 'action.hover',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${(item.percentage / maxPercentage) * 100}%`,
                height: '100%',
                bgcolor: item.color || colors[index % colors.length],
                borderRadius: 1,
                transition: 'width 0.3s ease',
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PointCountingStatisticsProps {
  /** Micrograph ID to show statistics for (uses active if not provided) */
  micrographId?: string | null;
  /** Whether to show the export button */
  showExport?: boolean;
  /** Whether to show the full table or just the chart */
  compact?: boolean;
}

export function PointCountingStatistics({
  micrographId,
  showExport = true,
  compact = false,
}: PointCountingStatisticsProps) {
  // Store - basic state
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const micrographIndex = useAppStore((s) => s.micrographIndex);

  // Store - point count mode state
  const pointCountMode = useAppStore((s) => s.pointCountMode);
  const activeSession = useAppStore((s) => s.activePointCountSession);

  const targetMicrographId = micrographId ?? activeMicrographId;
  const micrograph = targetMicrographId ? micrographIndex.get(targetMicrographId) : null;
  const spots = micrograph?.spots ?? [];

  // Calculate statistics - from session when in point count mode, from spots otherwise
  const stats: Stats | null = useMemo(() => {
    // When in point count mode, use session data
    if (pointCountMode && activeSession) {
      return calculateStatisticsFromSession(activeSession);
    }

    // Otherwise use spots-based calculation
    if (!spots || spots.length === 0) return null;
    return calculatePointCountStatisticsForMicrograph(spots);
  }, [pointCountMode, activeSession, spots]);

  // Handle export
  const handleExport = useCallback(() => {
    if (!stats) return;

    const csv = exportStatisticsToCSV(stats);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Use session name in filename when in point count mode
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseName = pointCountMode && activeSession
      ? activeSession.name.replace(/[^a-zA-Z0-9-_]/g, '-')
      : 'point-count-statistics';
    a.download = `${baseName}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [stats, pointCountMode, activeSession]);

  // No stats to show
  if (!stats || stats.totalPoints === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography color="text.secondary" align="center">
          {pointCountMode
            ? 'No points in this session. Start a new session with Tools → Point Count.'
            : (
              <>
                No point count data available.
                <br />
                Start a session using Tools &rarr; Point Count...
              </>
            )}
        </Typography>
      </Paper>
    );
  }

  // No classified points yet
  if (stats.classifiedPoints === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Classification Progress
          </Typography>
          <LinearProgress variant="determinate" value={0} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            0 of {stats.totalPoints} points classified (0%)
          </Typography>
        </Box>
        <Typography color="text.secondary" align="center">
          {pointCountMode
            ? 'Click on the canvas to create points, then classify using the toolbar.'
            : 'Classify points to see modal statistics using the Quick Classify toolbar.'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Progress Section */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Classification Progress
        </Typography>
        <LinearProgress
          variant="determinate"
          value={stats.classificationProgress}
          sx={{ mb: 1, height: 8, borderRadius: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          {stats.classifiedPoints} of {stats.totalPoints} points classified (
          {stats.classificationProgress.toFixed(1)}%)
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Bar Chart */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Modal Composition
        </Typography>
        <SimpleBarChart
          data={stats.mineralStats.map((m) => ({
            name: m.name,
            percentage: m.percentage,
          }))}
        />
      </Box>

      {/* Detailed Table (if not compact) */}
      {!compact && stats.mineralStats.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">
                Detailed Statistics
              </Typography>
              <Tooltip title="95% confidence interval using Chayes method">
                <Info fontSize="small" color="action" />
              </Tooltip>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Mineral</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">%</TableCell>
                    <TableCell align="right">95% CI</TableCell>
                    <TableCell align="right">Range</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.mineralStats.map((mineral) => (
                    <TableRow key={mineral.name}>
                      <TableCell component="th" scope="row">
                        {mineral.name}
                      </TableCell>
                      <TableCell align="right">{mineral.count}</TableCell>
                      <TableCell align="right">
                        {mineral.percentage.toFixed(1)}%
                      </TableCell>
                      <TableCell align="right">
                        &plusmn;{mineral.confidenceInterval.toFixed(1)}%
                      </TableCell>
                      <TableCell align="right">
                        {mineral.percentageLow.toFixed(1)}&ndash;
                        {mineral.percentageHigh.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* Export Button */}
      {showExport && (
        <>
          <Divider sx={{ my: 2 }} />
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            onClick={handleExport}
            fullWidth
          >
            Export to CSV
          </Button>
        </>
      )}
    </Paper>
  );
}

export default PointCountingStatistics;
