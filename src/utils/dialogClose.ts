/**
 * Dialog close helpers
 *
 * MUI 9 removed the Dialog `disableEscapeKeyDown` prop; the supported way to
 * block Escape is to inspect the `reason` passed to `onClose`.
 */

type DialogCloseReason = 'backdropClick' | 'escapeKeyDown';

/**
 * Build a Dialog `onClose` handler that ignores the Escape key while
 * `blockEscape` is true (e.g. during an export, download, or delete that
 * must not be interrupted). Backdrop clicks still reach `onClose`, matching
 * the old `disableEscapeKeyDown` behavior.
 */
export function closeUnlessEscapeBlocked(
  onClose: (() => void) | undefined,
  blockEscape: boolean
): (event: object, reason: DialogCloseReason) => void {
  return (_event, reason) => {
    if (blockEscape && reason === 'escapeKeyDown') return;
    onClose?.();
  };
}
