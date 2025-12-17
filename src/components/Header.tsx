import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Tooltip } from '@mui/material';
import {
  Navigation as PointerIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Straighten as RulerIcon,
  MyLocation as CrosshairIcon,
} from '@mui/icons-material';
import appIcon from '../assets/app-icon.png';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';

const Header: React.FC = () => {
  const viewerRef = useAppStore((state) => state.viewerRef);
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const { isAuthenticated, user } = useAuthStore();

  const handleRecenter = () => {
    if (viewerRef?.current) {
      viewerRef.current.fitToScreen();
    }
  };

  const handleZoomIn = () => {
    if (viewerRef?.current) {
      viewerRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (viewerRef?.current) {
      viewerRef.current.zoomOut();
    }
  };

  const handlePointerTool = () => {
    setActiveTool(null); // Reset to pan/select mode
  };

  const handleMeasureTool = () => {
    setActiveTool('measure');
  };

  return (
    <AppBar position="static" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        {/* Left: Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: -1 }}>
          <img
            src={appIcon}
            alt="StraboMicro Logo"
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

        {/* Center: Toolbar buttons */}
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 0.5 }}>
          <Tooltip title="Pan and Select" placement="bottom">
            <IconButton
              color="inherit"
              size="small"
              onClick={handlePointerTool}
              sx={{
                bgcolor: !activeTool || activeTool === 'select' ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <PointerIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom In" placement="bottom">
            <IconButton color="inherit" size="small" onClick={handleZoomIn}>
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out" placement="bottom">
            <IconButton color="inherit" size="small" onClick={handleZoomOut}>
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Measure Distance" placement="bottom">
            <IconButton
              color="inherit"
              size="small"
              onClick={handleMeasureTool}
              sx={{
                bgcolor: activeTool === 'measure' ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <RulerIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Re-Center Micrograph" placement="bottom">
            <IconButton color="inherit" size="small" onClick={handleRecenter}>
              <CrosshairIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Right: User info */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isAuthenticated && user ? (
            <Typography variant="body2" color="text.secondary">
              Logged in as{' '}
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
                {user.name ? `${user.name} (${user.email})` : user.email}
              </Box>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Not logged in
            </Typography>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
