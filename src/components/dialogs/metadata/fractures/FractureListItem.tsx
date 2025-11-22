/**
 * Fracture List Item Component
 *
 * Displays a single fracture in the list view.
 * Shows key information: granularity, kinematics, and mineralogy.
 */

import { Box, Typography, Chip } from '@mui/material';
import { FractureData } from './FractureAddForm';

interface FractureListItemProps {
  fracture: FractureData;
}

export function FractureListItem({ fracture }: FractureListItemProps) {
  // Build summary text
  const kinematicSummary = (() => {
    switch (fracture.kinematicType) {
      case 'Opening':
        return fracture.openingAperture
          ? `Opening (${fracture.openingAperture} ${fracture.openingApertureUnit})`
          : 'Opening';
      case 'Shear':
        return fracture.shearOffset
          ? `Shear (${fracture.shearOffset} ${fracture.shearOffsetUnit})`
          : 'Shear';
      case 'Hybrid':
        const parts = [];
        if (fracture.hybridAperture) {
          parts.push(`Aperture: ${fracture.hybridAperture} ${fracture.hybridApertureUnit}`);
        }
        if (fracture.hybridOffset) {
          parts.push(`Offset: ${fracture.hybridOffset} ${fracture.hybridOffsetUnit}`);
        }
        return parts.length > 0 ? `Hybrid (${parts.join(', ')})` : 'Hybrid';
      default:
        return 'Unknown';
    }
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Primary info */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          label={fracture.granularity || 'Unknown'}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {kinematicSummary}
        </Typography>
        {fracture.sealedHealed && (
          <Chip label="Sealed/Healed" size="small" color="success" variant="outlined" />
        )}
      </Box>

      {/* Mineralogy */}
      {fracture.minerals.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Minerals: {fracture.minerals.join(', ')}
        </Typography>
      )}
    </Box>
  );
}
