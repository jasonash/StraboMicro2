import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import {
  NearMe as PointerIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Edit as EditIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import straboLogo from '../assets/strabo-logo.png';

const Header: React.FC = () => {
  return (
    <AppBar position="static" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        {/* Left: Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: -1 }}>
          <img
            src={straboLogo}
            alt="StraboSpot Logo"
            style={{ height: '32px', width: 'auto', borderRadius: '25%' }}
          />
          <Typography
            variant="h5"
            component="h1"
            sx={{ fontWeight: 300, letterSpacing: 0.5 }}
          >
            STRABOMICRO
          </Typography>
        </Box>

        {/* Center: User info */}
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Logged in as user@example.com
          </Typography>
        </Box>

        {/* Right: Toolbar buttons */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton color="inherit" title="Pointer" size="small">
            <PointerIcon />
          </IconButton>
          <IconButton color="inherit" title="Zoom In" size="small">
            <ZoomInIcon />
          </IconButton>
          <IconButton color="inherit" title="Zoom Out" size="small">
            <ZoomOutIcon />
          </IconButton>
          <IconButton color="inherit" title="Draw" size="small">
            <EditIcon />
          </IconButton>
          <IconButton color="inherit" title="Settings" size="small">
            <SettingsIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
