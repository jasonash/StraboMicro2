/**
 * Extinction Microstructure List Item Component
 *
 * Displays a summary of an extinction microstructure entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { ExtinctionMicrostructureData } from './ExtinctionMicrostructureAddForm';

interface ExtinctionMicrostructureListItemProps {
  extinction: ExtinctionMicrostructureData;
}

export function ExtinctionMicrostructureListItem({ extinction }: ExtinctionMicrostructureListItemProps) {
  const totalFeatures =
    extinction.dislocations.length +
    extinction.subDislocations.length +
    extinction.heterogeneousExtinctions.length +
    extinction.subGrainStructures.length +
    extinction.extinctionBands.length +
    extinction.subWideExtinctionBands.length +
    extinction.subFineExtinctionBands.length;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {extinction.phase}
      </Typography>

      <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
        Total Features: {totalFeatures}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {extinction.dislocations.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ minWidth: 80 }}>
              Dislocations:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {extinction.dislocations.map((item, index) => (
                <Chip key={index} label={item.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {extinction.subGrainStructures.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ minWidth: 80 }}>
              Subgrains:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {extinction.subGrainStructures.map((item, index) => (
                <Chip key={index} label={item.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {extinction.heterogeneousExtinctions.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ minWidth: 80 }}>
              Heterogeneous:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {extinction.heterogeneousExtinctions.map((item, index) => (
                <Chip key={index} label={item.type} size="small" />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
