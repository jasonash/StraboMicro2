/**
 * Header — Top bar with project title and download actions
 * Uses MUI components matching the desktop app's AppBar styling.
 */

import { useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { HttpTileLoader } from '../services/tileLoader';

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
      <Toolbar variant="dense" sx={{ minHeight: 40, gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: 1 }}>
          STRABOMICRO
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectName}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
