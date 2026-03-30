/**
 * StatRow — Label/value display row
 *
 * Used throughout the properties panel for metadata fields.
 */

import { colors, fonts } from '../../styles/theme';

interface StatRowProps {
  label: string;
  value?: string | number | boolean | null;
  unit?: string;
}

export function StatRow({ label, value, unit }: StatRowProps) {
  if (value === undefined || value === null || value === '') return null;

  const displayValue = typeof value === 'boolean'
    ? (value ? 'Yes' : 'No')
    : String(value);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '2px 0',
      fontSize: fonts.sizeBase,
      gap: '8px',
    }}>
      <span style={{ color: colors.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: colors.textSecondary, textAlign: 'right', wordBreak: 'break-word' }}>
        {displayValue}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}
