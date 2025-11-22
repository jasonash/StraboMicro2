/**
 * Pseudotachylyte List Item Component
 *
 * Displays a summary of a pseudotachylyte entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { PseudotachylyteData } from './PseudotachylyteAddForm';

interface PseudotachylyteListItemProps {
  pseudotachylyte: PseudotachylyteData;
}

export function PseudotachylyteListItem({ pseudotachylyte }: PseudotachylyteListItemProps) {
  const features = [];
  if (pseudotachylyte.hasMatrixGroundmass) features.push('Matrix/Groundmass');
  if (pseudotachylyte.hasCrystallites) features.push('Crystallites');
  if (pseudotachylyte.hasSurvivorClasts) features.push('Survivor Clasts');
  if (pseudotachylyte.hasSulphideOxide) features.push('Sulphide/Oxide');
  if (pseudotachylyte.hasFabric) features.push('Fabric');
  if (pseudotachylyte.hasInjectionFeatures) features.push('Injection Features');
  if (pseudotachylyte.hasChilledMargins) features.push('Chilled Margins');
  if (pseudotachylyte.hasVesciclesAmygdules) features.push('Vesicles/Amygdules');

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {pseudotachylyte.label}
      </Typography>

      {features.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
            Features:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {features.map((feature, index) => (
              <Chip key={index} label={feature} size="small" />
            ))}
          </Box>
        </Box>
      )}

      {pseudotachylyte.matrixGroundmassColor && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>Color:</strong> {pseudotachylyte.matrixGroundmassColor}
        </Typography>
      )}
    </Box>
  );
}
