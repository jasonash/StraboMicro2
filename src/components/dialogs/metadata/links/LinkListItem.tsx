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
  return (
    <Box>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {link.label}
      </Typography>
      <MuiLink
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: '0.875rem',
          color: 'primary.main',
          textDecoration: 'none',
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
