/**
 * Fracture List Item Component
 *
 * Displays a single fracture in the list view.
 * Matches legacy format (lines 505-528 in editFractureInfo.java):
 * "Multigranular; Quartz, Feldspar; Opening (Mode I) Aperture: 50 um; Sealed/Healed: No;"
 */

import { Typography } from '@mui/material';
import { FractureData } from './FractureAddForm';

interface FractureListItemProps {
  fracture: FractureData;
}

export function FractureListItem({ fracture }: FractureListItemProps) {
  // Build legacy-format display string
  let detailString = '';

  // Granularity
  detailString += fracture.granularity + '; ';

  // Mineralogy
  if (fracture.mineralogy) {
    detailString += fracture.mineralogy + '; ';
  }

  // Kinematics with measurements
  if (fracture.kinematicType === 'Opening') {
    detailString += fracture.kinematicType;
    if (fracture.openingAperture) {
      detailString += ' Aperture: ' + fracture.openingAperture + ' ' + fracture.openingApertureUnit;
    }
    detailString += '; ';
  } else if (fracture.kinematicType === 'Shear') {
    detailString += fracture.kinematicType;
    if (fracture.shearOffset) {
      detailString += ' Offset: ' + fracture.shearOffset + ' ' + fracture.shearOffsetUnit;
    }
    detailString += '; ';
  } else if (fracture.kinematicType === 'Hybrid') {
    detailString += fracture.kinematicType;
    if (fracture.hybridAperture) {
      detailString += ' Aperture: ' + fracture.hybridAperture + ' ' + fracture.hybridApertureUnit;
    }
    if (fracture.hybridOffset) {
      detailString += ' Offset: ' + fracture.hybridOffset + ' ' + fracture.hybridOffsetUnit;
    }
    detailString += '; ';
  }

  // Sealed/Healed
  detailString += fracture.sealedHealed ? 'Sealed/Healed: Yes; ' : 'Sealed/Healed: No; ';

  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {detailString}
    </Typography>
  );
}
