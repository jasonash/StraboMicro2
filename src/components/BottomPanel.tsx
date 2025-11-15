import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * BottomPanel - Collapsible panel for detailed notes
 *
 * Displays project notes, sample notes, and other detailed information.
 * Height and collapse state managed by parent Viewer component.
 */
const BottomPanel: React.FC = () => {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Panel content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" color="text.primary" sx={{ fontWeight: 500 }}>
              Detailed Notes:
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (details)
            </Typography>
          </Box>
        </Box>

        {/* Project Notes Section */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Project Notes
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (edit)
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
            No project notes available
          </Typography>
        </Box>

        {/* Sample Notes Section */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Sample Notes
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (edit)
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
            No sample notes available
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default BottomPanel;
