/**
 * Grain Boundary List Item Component
 *
 * Displays a summary of a grain boundary entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { GrainBoundaryData } from './GrainBoundaryAddForm';

interface GrainBoundaryListItemProps {
  boundary: GrainBoundaryData;
}

export function GrainBoundaryListItem({ boundary }: GrainBoundaryListItemProps) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {boundary.typeOfBoundary}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body2">
          <strong>Phase 1:</strong> {boundary.phase1}
        </Typography>

        {boundary.phase2 && (
          <Typography variant="body2">
            <strong>Phase 2:</strong> {boundary.phase2}
          </Typography>
        )}

        {boundary.morphologies.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
              Morphologies:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {boundary.morphologies.map((morph, index) => (
                <Chip key={index} label={morph.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {boundary.descriptors.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
              Descriptors:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {boundary.descriptors.map((desc, index) => (
                <Chip
                  key={index}
                  label={`${desc.type} (${desc.subTypes.length})`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
