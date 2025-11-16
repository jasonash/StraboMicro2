/**
 * Theme Hook
 *
 * Manages theme state and system preference detection.
 * Applies the selected theme to the DOM and listens for system preference changes.
 */

import { useEffect, useState } from 'react';
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
 * Hook to get the current system preference and listen for changes
 */
function useSystemTheme(): 'dark' | 'light' {
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
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
  }, []);

  return systemTheme;
}

/**
 * Hook to initialize theme on mount and listen for system preference changes
 */
export function useTheme() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const systemTheme = useSystemTheme();

  // Compute effective theme based on current theme mode and system preference
  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    // Apply theme to CSS variables
    applyTheme(theme);

    // Notify Electron main process about theme change (for nativeTheme sync)
    if (window.api?.notifyThemeChanged) {
      window.api.notifyThemeChanged(theme);
    }
  }, [theme, systemTheme]); // Re-run when system theme changes too

  return {
    theme,
    setTheme,
    effectiveTheme,
  };
}
