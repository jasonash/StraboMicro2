/**
 * BreadcrumbsBar — Micrograph hierarchy navigation
 *
 * Shows the ancestor chain for the current micrograph (for overlay hierarchies).
 * Clicking an ancestor navigates to that micrograph.
 */

import { useMemo } from 'react';
import { colors, fonts } from '../styles/theme';
import type { MicrographMetadata } from '../types/project-types';

interface BreadcrumbsBarProps {
  micrograph: MicrographMetadata | null;
  allMicrographs: MicrographMetadata[];
  selectedSpotName?: string | null;
  onNavigate: (micrographId: string) => void;
}

export function BreadcrumbsBar({ micrograph, allMicrographs, selectedSpotName, onNavigate }: BreadcrumbsBarProps) {
  // Build ancestor chain from root to current
  const chain = useMemo(() => {
    if (!micrograph) return [];
    const ancestors: MicrographMetadata[] = [];
    let current: MicrographMetadata | undefined = micrograph;
    while (current) {
      ancestors.unshift(current);
      current = current.parentID
        ? allMicrographs.find(m => m.id === current!.parentID)
        : undefined;
    }
    return ancestors;
  }, [micrograph, allMicrographs]);

  if (chain.length <= 1 && !selectedSpotName) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 12px',
      backgroundColor: colors.bgDark,
      borderBottom: `1px solid ${colors.border}`,
      fontSize: fonts.sizeSm,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {chain.map((item, i) => {
        const isLast = i === chain.length - 1 && !selectedSpotName;
        return (
          <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {i > 0 && <span style={{ color: colors.textDim }}>&rsaquo;</span>}
            {isLast ? (
              <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{item.name}</span>
            ) : (
              <span
                onClick={() => onNavigate(item.id)}
                style={{
                  color: colors.textLink,
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                {item.name}
              </span>
            )}
          </span>
        );
      })}
      {selectedSpotName && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: colors.textDim }}>&rsaquo;</span>
          <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{selectedSpotName}</span>
        </span>
      )}
    </div>
  );
}
