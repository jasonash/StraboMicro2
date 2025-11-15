import React from 'react';
import { Box, Typography, Divider } from '@mui/material';
import DrawingToolbar from './DrawingToolbar';

const Viewer: React.FC = () => {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Canvas area */}
      <Box sx={{ flex: 1, bgcolor: 'background.default', position: 'relative' }}>
        {/* Canvas will go here */}
        <DrawingToolbar />
      </Box>

      {/* Status bar */}
      <Box
        sx={{
          height: 32,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Scale: 10μm/px
        </Typography>
        <Divider orientation="vertical" flexItem />
        <Typography variant="body2" color="text.secondary">
          Zoom: 100%
        </Typography>
      </Box>
    </Box>
  );
};

export default Viewer;
