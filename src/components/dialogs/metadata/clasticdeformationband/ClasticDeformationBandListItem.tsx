/**
 * Clastic Deformation Band List Item Component
 *
 * Displays a summary of a clastic deformation band entry.
 */

import { Box, Typography } from '@mui/material';
import { ClasticDeformationBandData } from './ClasticDeformationBandAddForm';

interface ClasticDeformationBandListItemProps {
  band: ClasticDeformationBandData;
}

export function ClasticDeformationBandListItem({ band }: ClasticDeformationBandListItemProps) {
  // Build type display strings
  const typeStrings = band.types.map(type => {
    let str = type.type;
    if (type.type === 'Dilation' && type.aperture !== null) {
      str += ` (Aperture: ${type.aperture} ${type.apertureUnit})`;
    }
    if (type.type === 'Shear' && type.offset !== null) {
      str += ` (Offset: ${type.offset} ${type.offsetUnit})`;
    }
    return str;
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {band.types.length > 0 && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Types: {typeStrings.join(', ')}
            </Typography>
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
