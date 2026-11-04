/**
 * Read-only wrapper for a shared project (collaboration 17h, 17i).
 *
 * Inside a read-only scope, through MUI theme defaults (they reach dialogs
 * too: portals keep the theme):
 *   - text, number, dropdown and autocomplete fields are read-only (text can
 *     still be selected and copied); checkboxes, radios, switches, sliders
 *     and toggle buttons are disabled
 *   - every dialog title gets the notice line (why it is view only)
 *   - the main button of a dialog's actions (Save, the contained one) is
 *     hidden; Cancel and Close keep working
 * Buttons elsewhere, canvases and menus check useCanEdit themselves; the
 * store's change guard puts back anything that still gets through.
 *
 * The scope always renders its providers, so a change of readOnly never
 * remounts what is inside (selection changes flip it often).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import { Alert } from '@mui/material';
import { usePermissions } from '@/hooks/usePermissions';

interface ReadOnlyState {
  readOnly: boolean;
  /** Why, as shown to the user */
  reason: string | null;
}

const ReadOnlyContext = createContext<ReadOnlyState>({ readOnly: false, reason: null });

/** Is this part of the screen view only (and why) */
export function useReadOnly(): ReadOnlyState {
  return useContext(ReadOnlyContext);
}

function readOnlyTheme(outer: Theme, reason: string): Theme {
  const quoted = JSON.stringify(reason);
  const components = {
    ...outer.components,
    MuiInputBase: { ...outer.components?.MuiInputBase, defaultProps: { ...outer.components?.MuiInputBase?.defaultProps, readOnly: true } },
    MuiAutocomplete: { ...outer.components?.MuiAutocomplete, defaultProps: { ...outer.components?.MuiAutocomplete?.defaultProps, readOnly: true } },
    MuiCheckbox: { ...outer.components?.MuiCheckbox, defaultProps: { ...outer.components?.MuiCheckbox?.defaultProps, disabled: true } },
    MuiRadio: { ...outer.components?.MuiRadio, defaultProps: { ...outer.components?.MuiRadio?.defaultProps, disabled: true } },
    MuiSwitch: { ...outer.components?.MuiSwitch, defaultProps: { ...outer.components?.MuiSwitch?.defaultProps, disabled: true } },
    MuiSlider: { ...outer.components?.MuiSlider, defaultProps: { ...outer.components?.MuiSlider?.defaultProps, disabled: true } },
    MuiToggleButton: { ...outer.components?.MuiToggleButton, defaultProps: { ...outer.components?.MuiToggleButton?.defaultProps, disabled: true } },
    MuiDialogTitle: {
      ...outer.components?.MuiDialogTitle,
      styleOverrides: {
        root: {
          '&::after': {
            content: quoted,
            display: 'block',
            marginTop: 4,
            fontSize: '0.8rem',
            fontWeight: 400,
            color: outer.palette.warning.main,
          },
        },
      },
    },
    MuiDialogActions: {
      ...outer.components?.MuiDialogActions,
      styleOverrides: { root: { '& .MuiButton-contained': { display: 'none' } } },
    },
  };
  return { ...outer, components } as Theme;
}

interface ReadOnlyScopeProps {
  readOnly: boolean;
  reason?: string | null;
  children: ReactNode;
}

export function ReadOnlyScope({ readOnly, reason = null, children }: ReadOnlyScopeProps) {
  const text = reason ?? 'View only.';
  const value = useMemo(() => ({ readOnly, reason: readOnly ? text : null }), [readOnly, text]);
  const theme = useMemo(() => (outer: Theme) => (readOnly ? readOnlyTheme(outer, text) : outer), [readOnly, text]);
  return (
    <ReadOnlyContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ReadOnlyContext.Provider>
  );
}

/** The notice line for panels (dialogs get it in their title) */
export function ReadOnlyNotice() {
  const { readOnly, reason } = useReadOnly();
  if (!readOnly || !reason) return null;
  return <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0 }}>{reason}</Alert>;
}

/**
 * The work area of a Viewer (17h): the tree, the canvas and the properties
 * panel (with what they open) are view only. The header (login, sync chip)
 * and App's own dialogs stay outside.
 */
export function ViewerScope({ children }: { children: ReactNode }) {
  const viewer = usePermissions().role === 'viewer';
  return (
    <ReadOnlyScope readOnly={viewer} reason={viewer ? "View only. You're a Viewer on this project." : null}>
      {children}
    </ReadOnlyScope>
  );
}

