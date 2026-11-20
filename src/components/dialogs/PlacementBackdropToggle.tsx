/**
 * PPL | XPL switch of the placement screens (rectangle, point, 3-point):
 * shows the other half of the parent's PPL/XPL pair behind the overlay
 * (src/hooks/usePlacementParent.ts). Nothing saved changes. X switches too,
 * as in the viewer, unless a text field has the focus.
 */

import { useEffect } from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip, CircularProgress } from '@mui/material';
import type { PlacementParent } from '@/hooks/usePlacementParent';
import { useLatest } from '@/hooks/useLatest';

interface Props {
  placementParent: PlacementParent;
  size?: 'small' | 'medium';
}

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PlacementBackdropToggle({ placementParent, size = 'small' }: Props) {
  const { backdrop, showPartner, partnerLoading } = placementParent;
  const latest = useLatest({ backdrop, showPartner });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'x' && e.key !== 'X') return;
      if (e.metaKey || e.ctrlKey || e.altKey || typingInField(e.target)) return;
      const { backdrop: b, showPartner: show } = latest.current;
      if (!b?.partner) return;
      e.preventDefault();
      show(!b.showingPartner);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latest]);

  if (!backdrop?.partner) return null;
  const value = backdrop.showingPartner ? 'partner' : 'parent';
  return (
    <Tooltip title={`Show the ${backdrop.showingPartner ? backdrop.parentLabel : backdrop.partnerLabel} image behind the overlay (X). Only the view changes.`}>
      <ToggleButtonGroup
        size={size}
        exclusive
        value={value}
        onChange={(_e, v: string | null) => {
          if (v) showPartner(v === 'partner');
        }}
        data-testid="placement-backdrop-toggle"
        data-showing={backdrop.showingPartner ? backdrop.partnerLabel : backdrop.parentLabel}
      >
        <ToggleButton value="parent" data-testid="placement-backdrop-parent">{backdrop.parentLabel}</ToggleButton>
        <ToggleButton value="partner" data-testid="placement-backdrop-partner">
          {backdrop.partnerLabel}
          {partnerLoading && <CircularProgress size={12} sx={{ ml: 0.75 }} />}
        </ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  );
}
