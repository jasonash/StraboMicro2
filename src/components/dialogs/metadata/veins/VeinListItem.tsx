/**
 * Vein List Item Component
 *
 * Displays a single vein in the list view.
 * Shows mineralogy and all selected sub-types.
 */

import { Typography } from '@mui/material';
import { VeinData } from './VeinAddForm';

interface VeinListItemProps {
  vein: VeinData;
}

export function VeinListItem({ vein }: VeinListItemProps) {
  // Build display string
  let detailString = '';

  // Mineralogy
  if (vein.mineralogy) {
    detailString += vein.mineralogy + '; ';
  }

  // Crystal Shapes
  if (vein.crystalShapes && vein.crystalShapes.length > 0) {
    detailString += 'Shapes: ' + vein.crystalShapes.map(s => s.type).join(', ') + '; ';
  }

  // Growth Morphologies
  if (vein.growthMorphologies && vein.growthMorphologies.length > 0) {
    detailString += 'Growth: ' + vein.growthMorphologies.map(m => m.type).join(', ') + '; ';
  }

  // Inclusion Trails
  if (vein.inclusionTrails && vein.inclusionTrails.length > 0) {
    const trails = vein.inclusionTrails.map(t => {
      if (t.type === 'Fluid' && t.numericValue !== null && t.numericValue !== undefined) {
        return `${t.type} (${t.numericValue}${t.unit})`;
      }
      return t.type;
    });
    detailString += 'Inclusions: ' + trails.join(', ') + '; ';
  }

  // Kinematics
  if (vein.kinematics && vein.kinematics.length > 0) {
    const kinem = vein.kinematics.map(k => {
      if (k.type === 'Opening (Mode I)' && k.numericValue !== null && k.numericValue !== undefined) {
        return `${k.type} (${k.numericValue}${k.unit})`;
      }
      return k.type;
    });
    detailString += 'Kinematics: ' + kinem.join(', ') + '; ';
  }

  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {detailString}
    </Typography>
  );
}
