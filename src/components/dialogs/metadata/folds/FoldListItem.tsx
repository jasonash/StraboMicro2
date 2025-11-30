/**
 * Fold List Item Component
 *
 * Displays a single fold in the list view.
 * Matches legacy format (lines 416-496 in editFoldInfo.java)
 */

import { Typography } from '@mui/material';
import { FoldData } from './FoldAddForm';

interface FoldListItemProps {
  fold: FoldData;
}

export function FoldListItem({ fold }: FoldListItemProps) {
  // Build legacy-format display string (lines 416-496 in editFoldInfo.java)
  let detailString = '';

  // Inter-limb angles (comma-separated)
  if (fold.interLimbAngle && fold.interLimbAngle.length > 0) {
    const angles = fold.interLimbAngle.map(angle => {
      if (angle === 'Other' && fold.interLimbAngleOther) {
        return fold.interLimbAngleOther;
      }
      return angle !== 'Other' ? angle : null;
    }).filter(a => a !== null);

    if (angles.length > 0) {
      detailString += angles.join(', ') + '; ';
    }
  }

  // Closure
  if (fold.closure) {
    if (fold.closure === 'Other' && fold.closureOther) {
      detailString += fold.closureOther + '; ';
    } else if (fold.closure !== 'Other') {
      detailString += fold.closure + '; ';
    }
  }

  // Orientation of Axial Trace
  if (fold.orientationAxialTrace) {
    detailString += fold.orientationAxialTrace + '; ';
  }

  // Symmetry
  if (fold.symmetry) {
    detailString += fold.symmetry + '; ';
  }

  // Vergence
  if (fold.vergence) {
    detailString += fold.vergence + '; ';
  }

  // Wavelength
  if (fold.wavelength !== null && fold.wavelength !== 0) {
    detailString += 'Wavelength: ' + fold.wavelength + fold.wavelengthUnit + '; ';
  }

  // Amplitude
  if (fold.amplitude !== null && fold.amplitude !== 0) {
    detailString += 'Amplitude: ' + fold.amplitude + fold.amplitudeUnit + '; ';
  }

  // Fold Style
  if (fold.foldStyle) {
    if (fold.foldStyle === 'Other' && fold.foldStyleOther) {
      detailString += fold.foldStyleOther + '; ';
    } else if (fold.foldStyle !== 'Other') {
      detailString += fold.foldStyle + '; ';
    }
  }

  // Fold Continuity
  if (fold.foldContinuity) {
    if (fold.foldContinuity === 'Other' && fold.foldContinuityOther) {
      detailString += fold.foldContinuityOther + '; ';
    } else if (fold.foldContinuity !== 'Other') {
      detailString += fold.foldContinuity + '; ';
    }
  }

  // Facing
  if (fold.facing) {
    if (fold.facing === 'Other' && fold.facingOther) {
      detailString += fold.facingOther + '; ';
    } else if (fold.facing !== 'Other') {
      detailString += fold.facing + '; ';
    }
  }

  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {detailString}
    </Typography>
  );
}
