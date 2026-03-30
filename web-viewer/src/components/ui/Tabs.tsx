/**
 * Tabs — Lightweight tab bar component
 *
 * Replaces MUI Tabs from the desktop app.
 */

import { colors, fonts } from '../../styles/theme';

interface Tab {
  label: string;
  key: string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, activeKey, onChange }: TabsProps) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgDark,
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
              backgroundColor: 'transparent',
              color: isActive ? colors.textPrimary : colors.textMuted,
              fontSize: fonts.sizeBase,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
