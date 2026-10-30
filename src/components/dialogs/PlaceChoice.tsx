/**
 * One choice of how to place micrographs: a plain button with what it does
 * underneath. No choice is highlighted (Jason, 2026-10-30).
 */

import { Box, Button, Typography } from '@mui/material';

export function PlaceChoice({ label, detail, onClick }: { label: string; detail?: string; onClick: () => void }) {
  return (
    <Box>
      <Button variant="outlined" fullWidth onClick={onClick} sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}>
        {label}
      </Button>
      {detail && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, ml: 1 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}
