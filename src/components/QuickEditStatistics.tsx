/**
 * Quick Edit Statistics Component
 *
 * Displays live statistics during Quick Edit mode including:
 * - Total/Reviewed/Remaining counts
 * - Mineral distribution breakdown
 * - Deleted count
 * - Progress bar
 */

import { useMemo } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Divider,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';

// ============================================================================
// MINERAL BAR CHART
// ============================================================================

interface MineralBarProps {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

function MineralBar({ name, count, percentage, color }: MineralBarProps) {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {count} ({percentage.toFixed(1)}%)
        </Typography>
      </Box>
      <Box
        sx={{
          width: '100%',
          height: 12,
          bgcolor: 'action.hover',
          borderRadius: 0.5,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${percentage}%`,
            height: '100%',
            bgcolor: color,
            borderRadius: 0.5,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>
    </Box>
  );
}

// ============================================================================
// STAT ROW
// ============================================================================

interface StatRowProps {
  label: string;
  value: number | string;
  highlight?: boolean;
}

function StatRow({ label, value, highlight = false }: StatRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        py: 0.5,
        px: 1,
        bgcolor: highlight ? 'action.selected' : 'transparent',
        borderRadius: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: highlight ? 600 : 400 }}>
        {value}
      </Typography>
    </Box>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Color palette for minerals
const MINERAL_COLORS = [
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

export function QuickEditStatistics() {
  // Store state
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const quickEditMode = useAppStore((s) => s.quickEditMode);
  const quickEditSpotIds = useAppStore((s) => s.quickEditSpotIds);
  const quickEditReviewedIds = useAppStore((s) => s.quickEditReviewedIds);
  const quickEditDeletedCount = useAppStore((s) => s.quickEditDeletedCount);

  // Get active micrograph's spots
  const micrograph = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    return findMicrographById(project, activeMicrographId);
  }, [project, activeMicrographId]);

  const spots = useMemo(() => {
    return micrograph?.spots || [];
  }, [micrograph]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!quickEditMode) {
      return null;
    }

    const totalOriginal = quickEditSpotIds.length + quickEditDeletedCount;
    const reviewed = quickEditReviewedIds.length;
    const deleted = quickEditDeletedCount;
    // Remaining = spots in session that haven't been reviewed yet
    const remaining = quickEditSpotIds.length - reviewed;

    // Count minerals in the session
    const mineralCounts: Record<string, number> = {};
    let unclassifiedCount = 0;

    for (const spotId of quickEditSpotIds) {
      const spot = spots.find((s) => s.id === spotId);
      if (spot) {
        const mineralName = spot.mineralogy?.minerals?.[0]?.name;
        if (mineralName) {
          mineralCounts[mineralName] = (mineralCounts[mineralName] || 0) + 1;
        } else {
          unclassifiedCount++;
        }
      }
    }

    // classifiedCount = spots in session with a mineral assigned
    const classifiedCount = quickEditSpotIds.length - unclassifiedCount;
    const progressPercent = totalOriginal > 0
      ? Math.round(((reviewed + deleted) / totalOriginal) * 100)
      : 0;

    // Sort minerals by count (descending)
    const spotsInSession = quickEditSpotIds.length;
    const sortedMinerals = Object.entries(mineralCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count], index) => ({
        name,
        count,
        percentage: spotsInSession > 0 ? (count / spotsInSession) * 100 : 0,
        color: MINERAL_COLORS[index % MINERAL_COLORS.length],
      }));

    return {
      totalOriginal,
      remaining,
      reviewed,
      deleted,
      classifiedCount,
      unclassifiedCount,
      progressPercent,
      spotsInSession,
      minerals: sortedMinerals,
    };
  }, [quickEditMode, quickEditSpotIds, quickEditReviewedIds, quickEditDeletedCount, spots]);

  // Don't render if not in Quick Edit mode or no stats
  if (!quickEditMode || !stats) {
    return null;
  }

  return (
    <Box>
      {/* Progress Section */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Progress
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {stats.progressPercent}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={stats.progressPercent}
          sx={{
            height: 10,
            borderRadius: 1,
            bgcolor: 'grey.700',
            '& .MuiLinearProgress-bar': {
              bgcolor: stats.progressPercent === 100 ? 'success.main' : 'primary.main',
              borderRadius: 1,
            },
          }}
        />
      </Box>

      {/* Summary Stats */}
      <Box sx={{ mb: 2 }}>
        <StatRow label="Total (original)" value={stats.totalOriginal} />
        <StatRow label="Remaining" value={stats.remaining} highlight />
        <StatRow label="Reviewed" value={stats.reviewed} />
        <StatRow label="Deleted" value={stats.deleted} />
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Classification Stats */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Classification
        </Typography>
        <StatRow label="Classified" value={stats.classifiedCount} />
        <StatRow label="Unclassified" value={stats.unclassifiedCount} />
      </Box>

      {/* Mineral Breakdown */}
      {stats.minerals.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
              Mineral Distribution
            </Typography>
            {stats.minerals.map((mineral) => (
              <MineralBar
                key={mineral.name}
                name={mineral.name}
                count={mineral.count}
                percentage={mineral.percentage}
                color={mineral.color}
              />
            ))}
            {stats.unclassifiedCount > 0 && (
              <MineralBar
                name="(unclassified)"
                count={stats.unclassifiedCount}
                percentage={stats.spotsInSession > 0 ? (stats.unclassifiedCount / stats.spotsInSession) * 100 : 0}
                color="#666666"
              />
            )}
          </Box>
        </>
      )}

      {/* Empty state */}
      {stats.minerals.length === 0 && stats.unclassifiedCount > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No spots classified yet.
            <br />
            Use letter keys to classify.
          </Typography>
        </>
      )}
    </Box>
  );
}

export default QuickEditStatistics;
