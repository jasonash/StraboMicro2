/**
 * Header — Top bar with logo, project title, and download actions
 * Matches the desktop app's Header styling.
 */

import { AppBar, Toolbar, Typography, Button, Box, Link } from '@mui/material';
import { HttpTileLoader } from '../services/tileLoader';
import appIcon from '../assets/app-icon.png';

interface HeaderProps {
  projectName: string;
  tileLoader: HttpTileLoader;
}

export function Header({ projectName, tileLoader }: HeaderProps) {

  return (
    <AppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
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

        {/* Center spacer + project name */}
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectName}
        </Typography>

        {/* Right: Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
          {/* Deep link into the installed desktop app. Browsers cannot tell
              whether the app is installed (deliberate anti-fingerprinting),
              so the button is always shown with a download fallback below.
              No target="_blank": the browser hands the strabomicro:// URI
              to the OS without leaving this page. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 0.5 }}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              disableElevation
              href={tileLoader.getDeepLinkUrl()}
            >
              Open in StraboMicro
            </Button>
            <Link
              href={tileLoader.getAppDownloadUrl()}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ fontSize: '0.65rem', lineHeight: 1.4, color: 'text.secondary', mt: 0.25 }}
            >
              Don't have StraboMicro? Download it
            </Link>
          </Box>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            href={tileLoader.getPdfUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            href={tileLoader.getSmzUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            SMZ
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            href={tileLoader.getShareUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
