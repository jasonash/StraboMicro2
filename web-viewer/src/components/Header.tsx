/**
 * Header — Top bar with logo, project title, and download actions
 * Matches the desktop app's Header styling.
 */

import { useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { HttpTileLoader } from '../services/tileLoader';
import appIcon from '../assets/app-icon.png';

interface HeaderProps {
  projectName: string;
  tileLoader: HttpTileLoader;
}

export function Header({ projectName, tileLoader }: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
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
            color={copied ? 'success' : 'primary'}
            onClick={handleShare}
          >
            {copied ? 'Copied!' : 'Share'}
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
