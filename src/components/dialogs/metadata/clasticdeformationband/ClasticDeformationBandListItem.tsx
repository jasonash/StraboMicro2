/**
 * Clastic Deformation Band List Item Component
 *
 * Displays a summary of a clastic deformation band entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { ClasticDeformationBandData } from './ClasticDeformationBandAddForm';

interface ClasticDeformationBandListItemProps {
  band: ClasticDeformationBandData;
}

export function ClasticDeformationBandListItem({ band }: ClasticDeformationBandListItemProps) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Deformation Band
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {band.types.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
              Types ({band.types.length}):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {band.types.map((type, index) => (
                <Chip key={index} label={type.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {band.thickness !== null && (
          <Typography variant="body2">
            <strong>Thickness:</strong> {band.thickness} {band.thicknessUnit}
          </Typography>
        )}

        {band.cements && (
          <Typography variant="body2">
            <strong>Cements:</strong> {band.cements}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
