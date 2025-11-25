import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Tooltip } from '@mui/material';
import {
  Navigation as PointerIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Straighten as RulerIcon,
  MyLocation as CrosshairIcon,
} from '@mui/icons-material';
import straboLogo from '../assets/strabo-logo.png';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';

const Header: React.FC = () => {
  const viewerRef = useAppStore((state) => state.viewerRef);
  const { isAuthenticated, user } = useAuthStore();

  const handleRecenter = () => {
    if (viewerRef?.current) {
      viewerRef.current.fitToScreen();
    }
  };

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
            color="text.primary"
            sx={{ fontWeight: 300, letterSpacing: 0.5, fontSize: '1.75rem' }}
          >
            STRABOMICRO
          </Typography>
        </Box>

        {/* Center: User info */}
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {isAuthenticated && user ? (
            <Typography variant="body2" color="text.secondary">
              Signed in as{' '}
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
                {user.name ? `${user.name} (${user.email})` : user.email}
              </Box>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Not logged in. Log in above.
            </Typography>
          )}
        </Box>

        {/* Right: Toolbar buttons */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Pan and Select" placement="bottom">
            <IconButton color="inherit" size="small">
              <PointerIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom In" placement="bottom">
            <IconButton color="inherit" size="small">
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out" placement="bottom">
            <IconButton color="inherit" size="small">
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Measure Distance on Micrograph" placement="bottom">
            <IconButton color="inherit" size="small">
              <RulerIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Re-Center Micrograph" placement="bottom">
            <IconButton color="inherit" size="small" onClick={handleRecenter}>
              <CrosshairIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
