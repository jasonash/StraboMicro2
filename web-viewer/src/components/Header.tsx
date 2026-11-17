/**
 * Header: top bar with logo, project title, and download actions
 * Matches the desktop app's Header styling.
 */

import { AppBar, Toolbar, Typography, Button, Box, Link } from '@mui/material';
import type { ReactNode } from 'react';
import type { ViewerLinks } from '../config/viewerConfig';
import appIcon from '../assets/app-icon.png';

interface HeaderProps {
  projectName: string;
  links: ViewerLinks;
  /** The StraboMicro logo and name (config.js showHeader in the standalone build) */
  showLogo: boolean;
  /** Compact layout: a short bar with a smaller logo */
  dense?: boolean;
  /** Compact layout: the Details button opens and closes the details panel */
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button size="small" variant="outlined" color="primary" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Button>
  );
}

export function Header({ projectName, links, showLogo, dense = false, detailsOpen = false, onToggleDetails }: HeaderProps) {

  return (
    <AppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary' }}>
      <Toolbar variant={dense ? 'dense' : 'regular'} sx={{ gap: dense ? 1 : 2, ...(dense ? { minHeight: 44, px: 1.5 } : {}) }}>
        {/* Left: Logo and Title */}
        {showLogo && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: -1 }}>
          <img
            src={appIcon}
            alt="StraboMicro Logo"
            style={{ height: dense ? '22px' : '32px', width: 'auto', borderRadius: '25%' }}
          />
          <Typography
            variant="h5"
            component="h1"
            sx={{
              color: 'text.primary',
              fontWeight: 300,
              letterSpacing: 0.5,
              fontSize: dense ? '1.05rem' : '1.75rem'
            }}>
            STRABOMICRO
          </Typography>
        </Box>}

        {/* Center spacer + project name */}
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
          {projectName}
        </Typography>

        {/* Right: Action buttons. Top-aligned so all buttons share one
            baseline; the deep link's fallback caption hangs below its
            button without pushing it off the row. Each button appears only
            when its link exists (src/config/viewerConfig.ts viewerLinks). */}
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'flex-start' }}>
          {/* Deep link into the installed desktop app (server build only).
              Browsers cannot tell whether the app is installed (deliberate
              anti-fingerprinting), so the button is always shown with a
              download fallback below. No target="_blank": the browser hands
              the strabomicro:// URI to the OS without leaving this page. */}
          {links.openInApp && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 0.5 }}>
              <Button size="small" variant="outlined" color="primary" href={links.openInApp}>
                Open in StraboMicro
              </Button>
              <Link
                href={links.appDownload}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ fontSize: '0.65rem', lineHeight: 1.4, color: 'text.secondary', mt: 0.25 }}
              >
                Don't have StraboMicro? Download it
              </Link>
            </Box>
          )}
          {links.pdf && <LinkButton href={links.pdf}>PDF</LinkButton>}
          {links.smz && <LinkButton href={links.smz}>SMZ</LinkButton>}
          {links.share && <LinkButton href={links.share}>Share</LinkButton>}
          {onToggleDetails && (
            <Button
              size="small"
              variant={detailsOpen ? 'contained' : 'outlined'}
              color="primary"
              onClick={onToggleDetails}
              aria-pressed={detailsOpen}
            >
              Details
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
