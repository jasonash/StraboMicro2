/**
 * TileQueueStatus Component
 *
 * Shows a small, non-intrusive status indicator in the corner of the screen
 * when background tile generation is in progress. This appears after the
 * initial preparation phase completes and the user is browsing.
 *
 * The indicator shows:
 * - A spinning icon to indicate activity
 * - Number of images being processed
 * - Current image name (truncated)
 */

import { Box, Typography, CircularProgress, Paper, Fade } from '@mui/material';

interface TileQueueStatusProps {
  isVisible: boolean;
  completedImages: number;
  totalImages: number;
  currentImageName: string;
}

export const TileQueueStatus: React.FC<TileQueueStatusProps> = ({
  isVisible,
  completedImages,
  totalImages,
  currentImageName,
}) => {
  // Don't show if not visible or no work to do
  if (!isVisible || totalImages === 0) {
    return null;
  }

  // Calculate remaining
  const remainingImages = totalImages - completedImages;

  return (
    <Fade in={isVisible}>
      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          px: 2,
          py: 1.5,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          maxWidth: 300,
          zIndex: 1000,
          bgcolor: 'background.paper',
        }}
      >
        <CircularProgress size={20} thickness={4} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight="medium">
            Generating tiles: {remainingImages} remaining
          </Typography>
          {currentImageName && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentImageName}
            </Typography>
          )}
        </Box>
      </Paper>
    </Fade>
  );
};

export default TileQueueStatus;
