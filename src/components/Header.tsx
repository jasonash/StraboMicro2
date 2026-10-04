import React, { useEffect, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Tooltip,
  Popover,
  Button,
  Chip,
} from '@mui/material';
import {
  Navigation as PointerIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  MyLocation as CrosshairIcon,
  Logout as LogoutIcon,
  MailOutlined as MailOutlineIcon,
} from '@mui/icons-material';
import appIcon from '../assets/app-icon.png';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { LoginDialog } from '@/components/dialogs/LoginDialog';
import { SyncStatusChip } from '@/components/SyncStatusChip';
import { useInvitationsStore } from '@/store/useInvitationsStore';
import { LogoutSyncDialog } from '@/components/dialogs/LogoutSyncDialog';
import { checkBeforeLogout, queuedUploadsText, LOGOUT_REQUEST_EVENT, type LogoutCheck } from '@/services/syncActions';

const Header: React.FC = () => {
  const viewerRef = useAppStore((state) => state.viewerRef);
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const { isAuthenticated, user, offline, logout } = useAuthStore();
  const invitationCount = useInvitationsStore((s) => s.invitations.length);
  const openInvitations = useInvitationsStore((s) => s.openDialog);

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [logoutAnchorEl, setLogoutAnchorEl] = useState<HTMLElement | null>(null);
  // Intro uploads still queued, for the plain logout confirmation (16az)
  const [logoutQueued, setLogoutQueued] = useState(0);
  // Logout with the open project not fully synced (16as, 16az)
  const [logoutCheck, setLogoutCheck] = useState<Exclude<LogoutCheck, { kind: 'plain' }> | null>(null);

  // Account > Logout: unsynced changes in the open project ask first (16as);
  // otherwise it logs out at once, as the menu always did
  useEffect(() => {
    const onRequest = () => {
      void (async () => {
        if (!useAuthStore.getState().isAuthenticated) return;
        const check = await checkBeforeLogout();
        if (check.kind === 'plain') await useAuthStore.getState().logout();
        else setLogoutCheck(check);
      })();
    };
    window.addEventListener(LOGOUT_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(LOGOUT_REQUEST_EVENT, onRequest);
  }, []);

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

  const handleAuthClick = async (event: React.MouseEvent<HTMLElement>) => {
    if (isAuthenticated) {
      const anchor = event.currentTarget;
      const check = await checkBeforeLogout();
      if (check.kind === 'plain') {
        setLogoutQueued(check.queued);
        setLogoutAnchorEl(anchor);
      } else {
        setLogoutCheck(check);
      }
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
            sx={{
              color: 'text.primary',
              fontWeight: 300,
              letterSpacing: 0.5,
              fontSize: '1.75rem'
            }}>
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

        {/* Right: sync status of the open project, then the account */}
        <SyncStatusChip />

        {/* Invitations waiting for an answer (17f): stays until each is answered */}
        {isAuthenticated && invitationCount > 0 && (
          <Chip
            size="small"
            color="primary"
            icon={<MailOutlineIcon />}
            label={invitationCount === 1 ? '1 invitation' : `${invitationCount} invitations`}
            onClick={openInvitations}
            sx={{ ml: 1, '& .MuiChip-icon': { fontSize: 16 } }}
          />
        )}

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
            // Spec v3 16ar: the name (email in the tooltip), "· offline" without a connection
            <Tooltip
              placement="bottom-end"
              title={offline
                ? `${user.email}. StraboSpot cannot be reached right now; your work is kept on this computer and syncs when the connection returns.`
                : user.email}
            >
              <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                {user.name || user.email}
                {offline && (
                  <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                    {' · offline'}
                  </Box>
                )}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
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
            {queuedUploadsText(logoutQueued) && (
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 280 }}>
                {queuedUploadsText(logoutQueued)}
              </Typography>
            )}
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

      <LogoutSyncDialog
        check={logoutCheck}
        onClose={() => setLogoutCheck(null)}
        onLogout={logout}
      />

      {/* Login dialog - opened when clicking "Not logged in" */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
      />
    </AppBar>
  );
};

export default Header;
