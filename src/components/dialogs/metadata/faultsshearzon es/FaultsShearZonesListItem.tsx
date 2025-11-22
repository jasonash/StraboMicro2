/**
 * Faults/Shear Zones List Item Component
 *
 * Displays a summary of a fault/shear zone entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { FaultsShearZonesData } from './FaultsShearZonesAddForm';

interface FaultsShearZonesListItemProps {
  fault: FaultsShearZonesData;
}

export function FaultsShearZonesListItem({ fault }: FaultsShearZonesListItemProps) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Fault / Shear Zone
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {fault.shearSenses.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
              Shear Senses:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {fault.shearSenses.map((sense, index) => (
                <Chip key={index} label={sense.type} size="small" />
              ))}
            </Box>
          </Box>
        )}

        {fault.indicators.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
              Indicators:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {fault.indicators.map((indicator, index) => (
                <Chip key={index} label={indicator.type} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        {fault.offset !== null && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Offset:</strong> {fault.offset} {fault.offsetUnit}
          </Typography>
        )}

        {fault.width !== null && (
          <Typography variant="body2">
            <strong>Width:</strong> {fault.width} {fault.widthUnit}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
