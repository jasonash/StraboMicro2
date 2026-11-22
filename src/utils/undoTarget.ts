/**
 * What Edit > Undo / Redo (Ctrl+Z, Ctrl+Shift+Z) acts on.
 *
 * The menu item takes the key before the page sees it, so the page decides:
 *  - typing in a text field: the text (the field's own undo), in a dialog or not
 *  - a dialog is open: nothing. The project behind a dialog must not change
 *    unseen (2026-11-22, Sentry ELECTRON-3A/3B: Ctrl+Z in New Micrograph's
 *    scale step undid "add sample" and "add dataset" behind the dialog, and
 *    Finish found no sample).
 *  - otherwise: the project's undo history
 */

export type UndoTarget = 'text' | 'project' | 'none';

/** The focused element, reduced to what the rule needs */
export interface FocusInfo {
  tagName: string;
  /** The type attribute of an <input> */
  type?: string | null;
  readOnly?: boolean;
  disabled?: boolean;
  isContentEditable?: boolean;
}

/** <input> types that hold text the user edits (and so have a text undo) */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);

export function isTextEditing(focus: FocusInfo | null): boolean {
  if (!focus) return false;
  if (focus.isContentEditable) return true;
  const tag = focus.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return false;
  if (focus.readOnly || focus.disabled) return false;
  if (tag === 'textarea') return true;
  return TEXT_INPUT_TYPES.has((focus.type ?? '').toLowerCase());
}

export function undoTarget(focus: FocusInfo | null, dialogOpen: boolean): UndoTarget {
  if (isTextEditing(focus)) return 'text';
  return dialogOpen ? 'none' : 'project';
}

/** The rule applied to the page as it is now */
export function currentUndoTarget(doc: Document = document): UndoTarget {
  const el = doc.activeElement;
  let focus: FocusInfo | null = null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    focus = { tagName: el.tagName, type: el.getAttribute('type'), readOnly: el.readOnly, disabled: el.disabled };
  } else if (el instanceof HTMLElement) {
    focus = { tagName: el.tagName, isContentEditable: el.isContentEditable };
  }
  return undoTarget(focus, doc.querySelector('.MuiDialog-root') !== null);
}
