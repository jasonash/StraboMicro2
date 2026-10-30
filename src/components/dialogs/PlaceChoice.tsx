/**
 * One choice of how to place micrographs: a plain button with what it does
 * underneath. All choices look the same, so none stands out (Jason, 2026-10-30).
 */

import { Box, Button, Typography } from '@mui/material';

export function PlaceChoice({ label, detail, onClick }: { label: string; detail?: string; onClick: () => void }) {
  return (
    <Box>
      <Button variant="contained" onClick={onClick} sx={{ textTransform: 'none' }}>
        {label}
      </Button>
      {detail && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}
