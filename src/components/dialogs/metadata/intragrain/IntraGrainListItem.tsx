/**
 * Intra-Grain List Item Component
 *
 * Displays a summary of an intragranular structure entry.
 */

import { Box, Typography, Chip } from '@mui/material';
import { IntraGrainData } from './IntraGrainAddForm';

interface IntraGrainListItemProps {
  grain: IntraGrainData;
}

export function IntraGrainListItem({ grain }: IntraGrainListItemProps) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {grain.mineral}
      </Typography>

      {grain.grainTextures.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
            Textural Features ({grain.grainTextures.length}):
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {grain.grainTextures.map((texture, index) => (
              <Chip
                key={index}
                label={texture.type === 'Other' ? texture.otherType : texture.type}
                size="small"
                color={texture.sealedHealed ? 'success' : 'default'}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
