/**
 * Link List Item Component
 *
 * Displays a single link in the list
 */

import { Box, Typography, Link as MuiLink } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { LinkData } from './LinkAddForm';

interface LinkListItemProps {
  link: LinkData;
}

export function LinkListItem({ link }: LinkListItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Open in external browser using Electron's shell API
    if (window.api?.openExternalLink) {
      window.api.openExternalLink(link.url);
    } else {
      // Fallback for non-Electron environments
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Box>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {link.label}
      </Typography>
      <MuiLink
        href={link.url}
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: '0.875rem',
          color: 'primary.main',
          textDecoration: 'none',
          cursor: 'pointer',
          '&:hover': {
            textDecoration: 'underline',
          },
        }}
      >
        {link.url}
        <OpenInNewIcon sx={{ fontSize: '0.875rem' }} />
      </MuiLink>
    </Box>
  );
}
