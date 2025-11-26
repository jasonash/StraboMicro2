/**
 * Orientation Form Component
 *
 * Reusable form for capturing micrograph orientation.
 * Used in:
 * - NewMicrographDialog (single reference micrograph creation)
 * - BatchImportDialog (batch reference micrograph import)
 *
 * Only applicable to REFERENCE micrographs. Associated micrographs do not have orientation data.
 */

import {
  TextField,
  Box,
  Stack,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';

export interface OrientationFormData {
  orientationMethod: 'unoriented' | 'trendPlunge' | 'fabricReference';
  topTrend: string;
  topPlunge: string;
  topReferenceCorner: 'left' | 'right';
  sideTrend: string;
  sidePlunge: string;
  sideReferenceCorner: 'top' | 'bottom';
  trendPlungeStrike: string;
  trendPlungeDip: string;
  fabricReference: 'xz' | 'yz' | 'xy';
  fabricStrike: string;
  fabricDip: string;
  fabricTrend: string;
  fabricPlunge: string;
  fabricRake: string;
  lookDirection: 'down' | 'up';
}

export const initialOrientationData: OrientationFormData = {
  orientationMethod: 'unoriented',
  topTrend: '',
  topPlunge: '',
  topReferenceCorner: 'left',
  sideTrend: '',
  sidePlunge: '',
  sideReferenceCorner: 'top',
  trendPlungeStrike: '',
  trendPlungeDip: '',
  fabricReference: 'xz',
  fabricStrike: '',
  fabricDip: '',
  fabricTrend: '',
  fabricPlunge: '',
  fabricRake: '',
  lookDirection: 'down',
};

interface OrientationFormProps {
  formData: OrientationFormData;
  onFormChange: <K extends keyof OrientationFormData>(field: K, value: OrientationFormData[K]) => void;
  micrographPreviewUrl?: string;
  isLoadingPreview?: boolean;
  conversionProgress?: { stage: string; percent: number } | null;
}

export const OrientationForm: React.FC<OrientationFormProps> = ({
  formData,
  onFormChange,
  micrographPreviewUrl,
  isLoadingPreview = false,
  conversionProgress,
}) => {
  return (
    <Stack spacing={3}>
      <Typography variant="h6">Orientation of Reference Micrograph</Typography>
      <Typography variant="body2" color="text.secondary">
        Thin Section Oriented by:
      </Typography>

      <RadioGroup
        value={formData.orientationMethod}
        onChange={(e) =>
          onFormChange(
            'orientationMethod',
            e.target.value as 'unoriented' | 'trendPlunge' | 'fabricReference'
          )
        }
      >
        <FormControlLabel
          value="unoriented"
          control={<Radio />}
          label="Unoriented Thin Section"
        />
        <FormControlLabel
          value="trendPlunge"
          control={<Radio />}
          label="Trend and Plunge of Edges/Strike and Dip of Surface"
        />
        <FormControlLabel
          value="fabricReference"
          control={<Radio />}
          label="Fabric Reference Frame (XZ, YZ, XY Thin Sections)"
        />
      </RadioGroup>

      {formData.orientationMethod === 'trendPlunge' && (
        <Stack spacing={3} sx={{ pl: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 600 }}>
            Provide TWO of THREE: Select the arrow on each edge that represents a lower hemisphere
            plunge, and enter the trend and plunge information and/or provide the strike and dip
            of the thin section.
          </Typography>

          {/* Main layout: Side fields on left, Image preview with arrows on right */}
          <Box sx={{ display: 'flex', gap: 5, alignItems: 'flex-start', mt: 2 }}>
            {/* Left side: Side Edge Trend and Plunge fields */}
            <Stack spacing={2} sx={{ width: 120, flexShrink: 0, mt: '80px' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                Trend:
              </Typography>
              <TextField
                type="number"
                value={formData.sideTrend}
                onChange={(e) => onFormChange('sideTrend', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                size="small"
              />

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>
                Plunge:
              </Typography>
              <TextField
                type="number"
                value={formData.sidePlunge}
                onChange={(e) => onFormChange('sidePlunge', e.target.value)}
                InputProps={{ endAdornment: '°' }}
                size="small"
              />
            </Stack>

            {/* Right side: Image preview with arrows */}
            <Box sx={{ position: 'relative', display: 'inline-block', mt: 10, ml: 8 }}>
              {/* Top Edge Trend and Plunge fields - positioned above image */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -100,
                  left: -35,
                  right: 0,
                  display: 'flex',
                  gap: 4,
                  justifyContent: 'center',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 60 }}>
                    Trend:
                  </Typography>
                  <TextField
                    type="number"
                    value={formData.topTrend}
                    onChange={(e) => onFormChange('topTrend', e.target.value)}
                    InputProps={{ endAdornment: '°' }}
                    size="small"
                    sx={{ width: 120 }}
                  />
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 'bold', minWidth: 60, ml: 2 }}
                  >
                    Plunge:
                  </Typography>
                  <TextField
                    type="number"
                    value={formData.topPlunge}
                    onChange={(e) => onFormChange('topPlunge', e.target.value)}
                    InputProps={{ endAdornment: '°' }}
                    size="small"
                    sx={{ width: 120 }}
                  />
                </Stack>
              </Box>
              {/* Top edge arrows - positioned at corners */}
              <RadioGroup
                row
                value={formData.topReferenceCorner}
                onChange={(e) =>
                  onFormChange('topReferenceCorner', e.target.value as 'left' | 'right')
                }
              >
                {/* Left corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: -45,
                    left: -5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Radio value="left" />
                  <Typography sx={{ fontSize: 28, lineHeight: 1 }}>→</Typography>
                </Box>
                {/* Right corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: -45,
                    right: -5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: 28, lineHeight: 1 }}>←</Typography>
                  <Radio value="right" />
                </Box>
              </RadioGroup>

              {/* Left edge arrows - positioned at corners */}
              <RadioGroup
                value={formData.sideReferenceCorner}
                onChange={(e) =>
                  onFormChange('sideReferenceCorner', e.target.value as 'top' | 'bottom')
                }
              >
                {/* Top corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -55,
                    top: -5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Radio value="top" />
                  <Typography sx={{ fontSize: 28, lineHeight: 1 }}>↓</Typography>
                </Box>
                {/* Bottom corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -55,
                    bottom: -5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: 28, lineHeight: 1 }}>↑</Typography>
                  <Radio value="bottom" />
                </Box>
              </RadioGroup>

              {/* Image preview */}
              {isLoadingPreview ? (
                <Box
                  sx={{
                    width: 300,
                    height: 300,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary">
                    {conversionProgress
                      ? `Converting image... ${conversionProgress.percent}%`
                      : 'Loading preview...'}
                  </Typography>
                  {conversionProgress && (
                    <Typography variant="caption" color="text.secondary">
                      {conversionProgress.stage === 'reading' && 'Reading image file...'}
                      {conversionProgress.stage === 'converting' && 'Converting to JPEG...'}
                      {conversionProgress.stage === 'complete' && 'Complete!'}
                    </Typography>
                  )}
                </Box>
              ) : micrographPreviewUrl ? (
                <Box
                  component="img"
                  src={micrographPreviewUrl}
                  alt="Micrograph preview"
                  sx={{
                    width: 300,
                    height: 300,
                    objectFit: 'contain',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 300,
                    height: 300,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No image loaded
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* Strike and Dip below the image */}
          <Box sx={{ display: 'flex', gap: 5, mt: 2 }}>
            {/* Spacer to match left side width */}
            <Box sx={{ width: 120, flexShrink: 0 }} />

            {/* Strike and Dip fields */}
            <Box sx={{ ml: '-20px' }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 60 }}>
                  Strike:
                </Typography>
                <TextField
                  type="number"
                  value={formData.trendPlungeStrike}
                  onChange={(e) => onFormChange('trendPlungeStrike', e.target.value)}
                  InputProps={{ endAdornment: '°' }}
                  size="small"
                  sx={{ width: 120 }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', minWidth: 40, ml: 2 }}>
                  Dip:
                </Typography>
                <TextField
                  type="number"
                  value={formData.trendPlungeDip}
                  onChange={(e) => onFormChange('trendPlungeDip', e.target.value)}
                  InputProps={{ endAdornment: '°' }}
                  size="small"
                  sx={{ width: 120 }}
                />
              </Stack>
            </Box>
          </Box>
        </Stack>
      )}

      {formData.orientationMethod === 'fabricReference' && (
        <Stack spacing={2} sx={{ pl: 4 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            Fabric Reference:{' '}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 'normal' }}
            >
              (X - Lineation, Y - Perpendicular to lineation within the foliation plane, Z - Pole
              to foliation)
            </Typography>
          </Typography>
          <RadioGroup
            row
            value={formData.fabricReference}
            onChange={(e) => onFormChange('fabricReference', e.target.value as 'xz' | 'yz' | 'xy')}
          >
            <FormControlLabel value="xz" control={<Radio />} label="XZ" />
            <FormControlLabel value="yz" control={<Radio />} label="YZ" />
            <FormControlLabel value="xy" control={<Radio />} label="XY" />
          </RadioGroup>

          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
            Foliation Orientation: (Geographic Coordinates)
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Strike"
              type="number"
              value={formData.fabricStrike}
              onChange={(e) => onFormChange('fabricStrike', e.target.value)}
              InputProps={{ endAdornment: '°' }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Dip"
              type="number"
              value={formData.fabricDip}
              onChange={(e) => onFormChange('fabricDip', e.target.value)}
              InputProps={{ endAdornment: '°' }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
            Lineation Orientation: (Geographic Coordinates)
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              label="Trend"
              type="number"
              value={formData.fabricTrend}
              onChange={(e) => onFormChange('fabricTrend', e.target.value)}
              InputProps={{ endAdornment: '°' }}
              helperText=" "
              sx={{ flex: 1 }}
            />
            <TextField
              label="Plunge"
              type="number"
              value={formData.fabricPlunge}
              onChange={(e) => onFormChange('fabricPlunge', e.target.value)}
              InputProps={{ endAdornment: '°' }}
              helperText=" "
              sx={{ flex: 1 }}
            />
            <Typography variant="body2" sx={{ px: 1, pt: 2 }}>
              OR
            </Typography>
            <TextField
              label="Rake"
              type="number"
              value={formData.fabricRake}
              onChange={(e) => onFormChange('fabricRake', e.target.value)}
              InputProps={{ endAdornment: '°' }}
              helperText="(RHR, 0-180)"
              sx={{ flex: 1 }}
            />
          </Stack>

          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
            Look Direction:
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            When looking at the Reference micrograph, are you looking toward the lower hemisphere
            or upper hemisphere in geographic coordinates?
          </Typography>
          <RadioGroup
            value={formData.lookDirection}
            onChange={(e) => onFormChange('lookDirection', e.target.value as 'down' | 'up')}
          >
            <FormControlLabel
              value="down"
              control={<Radio />}
              label="Looking down through the micrograph (Lower hemisphere)"
            />
            <FormControlLabel
              value="up"
              control={<Radio />}
              label="Looking up through the micrograph (Upper hemisphere)"
            />
          </RadioGroup>
        </Stack>
      )}
    </Stack>
  );
};

/**
 * Validates the orientation form data
 * @returns true if the orientation step is valid
 */
export const validateOrientationForm = (formData: OrientationFormData): boolean => {
  // Unoriented is always valid
  if (formData.orientationMethod === 'unoriented') {
    return true;
  }

  // Trend and Plunge of Edges: Need TWO of THREE sets
  if (formData.orientationMethod === 'trendPlunge') {
    const hasTopEdge = formData.topTrend !== '' && formData.topPlunge !== '';
    const hasSideEdge = formData.sideTrend !== '' && formData.sidePlunge !== '';
    const hasStrikeDip = formData.trendPlungeStrike !== '' && formData.trendPlungeDip !== '';

    const completedSets = [hasTopEdge, hasSideEdge, hasStrikeDip].filter(Boolean).length;
    return completedSets >= 2;
  }

  // Fabric Reference Frame
  if (formData.orientationMethod === 'fabricReference') {
    // Must have fabric reference selection (XZ, YZ, or XY)
    if (!formData.fabricReference) return false;

    // Need EITHER (Strike AND Dip) OR (Trend AND (Plunge OR Rake))
    const hasStrikeDip = formData.fabricStrike !== '' && formData.fabricDip !== '';
    const hasTrendPlunge = formData.fabricTrend !== '' && formData.fabricPlunge !== '';
    const hasTrendRake = formData.fabricTrend !== '' && formData.fabricRake !== '';

    return hasStrikeDip || hasTrendPlunge || hasTrendRake;
  }

  return false;
};
