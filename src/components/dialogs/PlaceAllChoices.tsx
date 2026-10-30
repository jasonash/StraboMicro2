/**
 * The ways to place all unplaced children of one micrograph together, equal
 * choices with the same wording wherever they are offered: clicking an unplaced
 * child with unplaced siblings (PlaceChildrenOffer) and the last screen of an
 * associated Batch Import (Jason, 2026-10-30).
 */

import { Box, Button, Stack, Typography } from '@mui/material';

export type PlaceAllHow = 'auto' | 'parent-area' | 'like-sibling';

/** One choice: a plain button with what it does underneath */
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

export function PlaceAllChoices({ count, parentName, hasPlacedSibling, onChoose }: {
  /** How many unplaced children the parent has */
  count: number;
  parentName: string;
  /** "Copy the placement..." needs a micrograph already placed on the parent */
  hasPlacedSibling: boolean;
  onChoose: (how: PlaceAllHow) => void;
}) {
  const one = count === 1;
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">{one ? 'The unplaced micrograph' : `All ${count} unplaced micrographs`}</Typography>
      <PlaceChoice
        label={one ? `Find it on ${parentName}...` : `Find each one on ${parentName}...`}
        detail="Automatic: matches features in the images and shows what it found before saving."
        onClick={() => onChoose('auto')}
      />
      <PlaceChoice
        label={`Cover the full area of ${parentName}...`}
        detail="For example, element maps collected with it."
        onClick={() => onChoose('parent-area')}
      />
      {hasPlacedSibling && (
        <PlaceChoice
          label="Copy the placement of a placed micrograph..."
          detail={one ? 'It gets that micrograph\'s location, scale and rotation.' : 'Each gets that micrograph\'s location, scale and rotation.'}
          onClick={() => onChoose('like-sibling')}
        />
      )}
    </Stack>
  );
}
