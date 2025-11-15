import React from 'react';
import { Box, Typography, Divider } from '@mui/material';

const Viewer: React.FC = () => {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Canvas area */}
      <Box sx={{ flex: 1, bgcolor: 'background.default' }}>
        {/* Canvas will go here */}
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
