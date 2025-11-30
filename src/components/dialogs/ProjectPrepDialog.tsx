/**
 * ProjectPrepDialog Component
 *
 * Shows a modal progress dialog during the project preparation phase.
 * This runs when loading a project with uncached images to generate
 * thumbnails and medium resolution previews for fast browsing.
 *
 * The dialog is modal (blocks interaction) because:
 * 1. User should wait for preparation to complete before browsing
 * 2. Prevents confusion from incomplete image loading
 * 3. Sets clear expectations about what's happening
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';

interface ProjectPrepDialogProps {
  open: boolean;
  totalImages: number;
  completedImages: number;
  currentImageName: string;
}

export const ProjectPrepDialog: React.FC<ProjectPrepDialogProps> = ({
  open,
  totalImages,
  completedImages,
  currentImageName,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track elapsed time
  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  // Calculate progress percentage
  const progress = totalImages > 0 ? (completedImages / totalImages) * 100 : 0;

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Estimate remaining time based on current progress
  const estimateRemaining = (): string => {
    if (completedImages === 0 || elapsedSeconds < 3) {
      return 'Calculating...';
    }
    const avgTimePerImage = elapsedSeconds / completedImages;
    const remainingImages = totalImages - completedImages;
    const estimatedSeconds = Math.round(avgTimePerImage * remainingImages);
    return formatTime(estimatedSeconds);
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      PaperProps={{
        sx: {
          borderRadius: 2,
          p: 1,
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={24} />
          <Typography variant="h6">Preparing Project Images</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Generating preview images for fast browsing...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Please don't close the app until this completes.
          </Typography>
        </Box>

        {/* Progress bar */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" fontWeight="medium">
              {completedImages} of {totalImages} images
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(progress)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8,
              borderRadius: 1,
              '& .MuiLinearProgress-bar': {
                borderRadius: 1,
              },
            }}
          />
        </Box>

        {/* Current file and time info */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Current:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentImageName || 'Starting...'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Time elapsed: {formatTime(elapsedSeconds)}
            </Typography>
            {completedImages > 0 && completedImages < totalImages && (
              <Typography variant="caption" color="text.secondary" display="block">
                Est. remaining: {estimateRemaining()}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectPrepDialog;
