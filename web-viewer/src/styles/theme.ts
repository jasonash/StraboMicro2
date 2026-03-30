/**
 * Theme constants for the StraboMicro Web Viewer
 * Extracted from inline styles for consistency across components.
 */

export const colors = {
  // Backgrounds
  bg: '#1a1a2e',
  bgHeader: '#16213e',
  bgDark: '#111',
  bgHover: '#252545',
  bgActive: '#2a4a7f',
  bgInput: '#2a2a4a',

  // Borders
  border: '#333',
  borderActive: '#5b9aff',

  // Text
  textPrimary: '#fff',
  textSecondary: '#ccc',
  textMuted: '#888',
  textDim: '#666',
  textLink: '#5b9aff',

  // Accents
  accent: '#5b9aff',
  accentDim: '#3a6ab5',
  warning: '#e67e22',
  error: '#e74c3c',
  success: '#27ae60',

  // Spot colors
  spotSelected: '#ff4444',
  spotHover: '#ffff00',
} as const;

export const fonts = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"SF Mono", "Fira Code", "Consolas", monospace',
  sizeXs: '10px',
  sizeSm: '11px',
  sizeBase: '12px',
  sizeMd: '13px',
  sizeLg: '14px',
  sizeXl: '16px',
} as const;

export const spacing = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
} as const;
