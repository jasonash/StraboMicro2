/**
 * Footer: the standalone viewer's "exported from StraboMicro" line, as in the
 * legacy viewer (config.js showFooter).
 */

import { Box, Link, Typography } from '@mui/material';

interface FooterProps {
  appDownloadUrl: string;
}

export function Footer({ appDownloadUrl }: FooterProps) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2, py: 0.5, flexShrink: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        The data presented above was exported from StraboMicro.{' '}
        <Link href={appDownloadUrl} target="_blank" rel="noopener noreferrer" underline="hover">
          Download StraboMicro
        </Link>
      </Typography>
    </Box>
  );
}
