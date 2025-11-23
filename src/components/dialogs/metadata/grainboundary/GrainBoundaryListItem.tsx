/**
 * Grain Boundary List Item Component
 *
 * Displays a summary of a grain boundary entry.
 * Matches legacy JavaFX display format.
 */

import { Box, Typography, Chip } from '@mui/material';
import { GrainBoundaryData } from './GrainBoundaryAddForm';

interface GrainBoundaryListItemProps {
  boundary: GrainBoundaryData;
}

export function GrainBoundaryListItem({ boundary }: GrainBoundaryListItemProps) {
  const boundaryTypeLabel = boundary.typeOfBoundary === 'phase' ? 'Phase Boundary' :
                            boundary.typeOfBoundary === 'grain' ? 'Grain Boundary' :
                            boundary.typeOfBoundary;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {boundaryTypeLabel}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {/* Phase Information */}
        {boundary.phase1 && (
          <Typography variant="body2">
            <strong>Phase 1:</strong> {boundary.phase1}
          </Typography>
        )}

        {boundary.phase2 && (
          <Typography variant="body2">
            <strong>Phase 2:</strong> {boundary.phase2}
          </Typography>
        )}

        {/* Morphologies */}
        {boundary.morphologies.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              Morphologies:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {boundary.morphologies.map((morph, index) => (
                <Chip key={index} label={morph.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {/* Descriptors */}
        {boundary.descriptors.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              Descriptors:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {boundary.descriptors.map((desc, index) => (
                <Box key={index}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {desc.type}
                  </Typography>
                  {desc.subTypes && desc.subTypes.length > 0 && (
                    <Box sx={{ pl: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {desc.subTypes.map((subType, subIndex) => (
                        <Chip
                          key={subIndex}
                          label={subType.otherType ? `${subType.type}: ${subType.otherType}` : subType.type}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
