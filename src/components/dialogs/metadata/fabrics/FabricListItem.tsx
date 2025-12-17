/**
 * Fabric List Item Component
 *
 * Displays a compact summary of a fabric for the ListManager.
 */

import { Box, Typography, Chip } from '@mui/material';
import { FabricData } from './FabricAddForm';

interface FabricListItemProps {
  fabric: FabricData;
}

export function FabricListItem({ fabric }: FabricListItemProps) {
  // Build a readable summary of what defines the fabric
  const definedByText = fabric.fabricDefinedBy && fabric.fabricDefinedBy.length > 0
    ? fabric.fabricDefinedBy.join(', ')
    : 'Not specified';

  // Get human-readable labels
  const elementLabel = fabric.fabricElement
    ? fabric.fabricElement.charAt(0).toUpperCase() + fabric.fabricElement.slice(1)
    : '';
  const categoryLabel = fabric.fabricCategory
    ? fabric.fabricCategory.charAt(0).toUpperCase() + fabric.fabricCategory.slice(1)
    : '';
  const spacingLabel = fabric.fabricSpacing
    ? fabric.fabricSpacing.charAt(0).toUpperCase() + fabric.fabricSpacing.slice(1)
    : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Fabric Label (prominent) */}
      <Typography variant="subtitle1" fontWeight="bold">
        {fabric.fabricLabel || 'Unlabeled Fabric'}
      </Typography>

      {/* Type chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {elementLabel && (
          <Chip label={elementLabel} size="small" variant="outlined" />
        )}
        {categoryLabel && (
          <Chip label={categoryLabel} size="small" variant="outlined" />
        )}
        {spacingLabel && (
          <Chip label={spacingLabel} size="small" variant="outlined" />
        )}
      </Box>

      {/* Defined By */}
      <Typography variant="body2" color="text.secondary">
        <strong>Defined by:</strong> {definedByText}
      </Typography>

      {/* Show layer counts if applicable */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {fabric.fabricCompositionInfo && fabric.fabricCompositionInfo.layers.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {fabric.fabricCompositionInfo.layers.length} composition layer(s)
          </Typography>
        )}
        {fabric.fabricGrainSizeInfo && fabric.fabricGrainSizeInfo.layers.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {fabric.fabricGrainSizeInfo.layers.length} grain size layer(s)
          </Typography>
        )}
        {fabric.fabricGrainShapeInfo && fabric.fabricGrainShapeInfo.phases.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {fabric.fabricGrainShapeInfo.phases.length} phase(s)
          </Typography>
        )}
      </Box>
    </Box>
  );
}
