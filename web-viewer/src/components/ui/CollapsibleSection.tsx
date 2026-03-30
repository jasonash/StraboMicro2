/**
 * CollapsibleSection — Lightweight accordion component
 *
 * Replaces MUI Accordion from the desktop app.
 * Uses <details>/<summary> for native collapse behavior.
 */

import { type ReactNode } from 'react';
import { colors, fonts } from '../../styles/theme';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({ title, count, defaultOpen = false, children }: CollapsibleSectionProps) {
  return (
    <details open={defaultOpen} style={{
      borderLeft: `3px solid ${colors.accentDim}`,
      marginBottom: '1px',
      backgroundColor: colors.bg,
    }}>
      <summary style={{
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: fonts.sizeBase,
        fontWeight: 600,
        color: colors.textSecondary,
        backgroundColor: colors.bgDark,
        userSelect: 'none',
        listStyle: 'none',
      }}>
        <span style={{
          fontSize: fonts.sizeSm,
          color: colors.textMuted,
          transition: 'transform 0.15s',
        }}>&#9654;</span>
        <span style={{ flex: 1 }}>{title}</span>
        {count !== undefined && count > 0 && (
          <span style={{
            backgroundColor: colors.accentDim,
            color: colors.textPrimary,
            fontSize: fonts.sizeXs,
            padding: '1px 6px',
            borderRadius: '8px',
            minWidth: '18px',
            textAlign: 'center',
          }}>
            {count}
          </span>
        )}
      </summary>
      <div style={{
        padding: '8px 12px',
        fontSize: fonts.sizeBase,
        color: colors.textSecondary,
      }}>
        {children}
      </div>
    </details>
  );
}
