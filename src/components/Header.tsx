import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Tooltip,
  Popover,
  Button,
} from '@mui/material';
import {
  Navigation as PointerIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  MyLocation as CrosshairIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import appIcon from '../assets/app-icon.png';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { LoginDialog } from '@/components/dialogs/LoginDialog';

const Header: React.FC = () => {
  const viewerRef = useAppStore((state) => state.viewerRef);
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const { isAuthenticated, user, logout } = useAuthStore();

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [logoutAnchorEl, setLogoutAnchorEl] = useState<HTMLElement | null>(null);

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

  const handleAuthClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isAuthenticated) {
      setLogoutAnchorEl(event.currentTarget);
    } else {
      setLoginDialogOpen(true);
    }
  };

  const handleLogoutConfirm = async () => {
    setLogoutAnchorEl(null);
    await logout();
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
          <Tooltip title="Re-Center Micrograph" placement="bottom">
            <IconButton color="inherit" size="small" onClick={handleRecenter}>
              <CrosshairIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Right: User info - clickable */}
        <Box
          onClick={handleAuthClick}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            borderRadius: 1,
            px: 1.5,
            py: 0.5,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
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

        {/* Logout confirmation popover */}
        <Popover
          open={Boolean(logoutAnchorEl)}
          anchorEl={logoutAnchorEl}
          onClose={() => setLogoutAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 200 }}>
            <Typography variant="body2">
              Log out of StraboSpot?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                size="small"
                onClick={() => setLogoutAnchorEl(null)}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={handleLogoutConfirm}
              >
                Log Out
              </Button>
            </Box>
          </Box>
        </Popover>
      </Toolbar>

      {/* Login dialog - opened when clicking "Not logged in" */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
      />
    </AppBar>
  );
};

export default Header;
