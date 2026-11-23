/**
 * What Edit > Undo / Redo (Ctrl+Z, Ctrl+Shift+Z) acts on.
 *
 * The menu item takes the key before the page sees it, so the page decides:
 *  - typing in a text field: the text (the field's own undo), in a dialog or not
 *  - a dialog is open (one that is closing does not count): nothing. The project behind a dialog must not change
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

/** A dialog root, reduced to what tells whether it is still showing */
export interface DialogRootInfo {
  /** MUI's MuiModal-hidden class: closed and kept mounted */
  hidden: boolean;
  /** Inline opacity of its .MuiDialog-container (MUI's Fade): '0' while closing and once closed */
  containerOpacity: string | null;
}

/**
 * Is this dialog still open? A closing dialog stays in the page for its fade
 * (about 0.2 s); it no longer counts, so Undo right after closing one works
 * (2026-11-23: e2e 17 and 31 picked Edit > Undo during the fade and nothing
 * happened).
 */
export function isDialogShowing(info: DialogRootInfo): boolean {
  if (info.hidden) return false;
  return info.containerOpacity !== '0';
}

/** Is any dialog open in the page (closing ones left out) */
export function anyDialogShowing(doc: Document = document): boolean {
  for (const root of doc.querySelectorAll('.MuiDialog-root')) {
    const container = root.querySelector('.MuiDialog-container');
    const info: DialogRootInfo = {
      hidden: root.classList.contains('MuiModal-hidden'),
      containerOpacity: container instanceof HTMLElement ? container.style.opacity : null,
    };
    if (isDialogShowing(info)) return true;
  }
  return false;
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
  return undoTarget(focus, anyDialogShowing(doc));
}
