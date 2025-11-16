/**
 * Theme Hook
 *
 * Manages theme state and system preference detection.
 * Applies the selected theme to the DOM and listens for system preference changes.
 */

import { useEffect } from 'react';
import { useAppStore, type ThemeMode } from '@/store/useAppStore';

/**
 * Applies the theme to the document root element
 */
export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;

  if (theme === 'system') {
    // Detect system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
}

/**
 * Gets the effective theme (resolves 'system' to 'dark' or 'light')
 */
export function getEffectiveTheme(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Hook to initialize theme on mount and listen for system preference changes
 */
export function useTheme() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  useEffect(() => {
    // Apply initial theme
    applyTheme(theme);

    // Notify Electron main process about theme change (for nativeTheme sync)
    if (window.api?.notifyThemeChanged) {
      window.api.notifyThemeChanged(theme);
    }

    // Listen for system preference changes (only if theme is 'system')
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        applyTheme('system'); // Re-apply system theme when preference changes
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      }
      // Fallback for older browsers
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    effectiveTheme: getEffectiveTheme(theme),
  };
}
