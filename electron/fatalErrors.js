/**
 * What the main process does with an uncaught error (Sentry's onFatalError).
 *
 * Sentry ELECTRON-34 (2026-11-04): the fetch built into Node 24 (undici
 * 7.30.1) throws AssertionError "assert(!this.paused)" from a socket 'end'
 * handler when a server closes the connection while a download waits for a
 * slow disk. Nothing can catch it, so Electron showed "A JavaScript error
 * occurred in the main process". The download itself still completes once
 * the error is caught (checked by npm run test:download-close). The fix is
 * undici 8 from npm, loaded on the first line of main.js so every fetch in
 * the main process uses it; this is the safety net in case the built-in one
 * ever runs again (e.g. that line moved down). Every other error shows the
 * same box Sentry shows by default.
 */

/**
 * The undici assertion above, and nothing else
 * @param {unknown} error
 */
function isUndiciPausedAssert(error) {
  if (!(error instanceof Error)) return false;
  const code = /** @type {{ code?: unknown }} */ (error).code;
  return (
    code === 'ERR_ASSERTION' &&
    error.message.includes('assert(!this.paused)') &&
    typeof error.stack === 'string' &&
    error.stack.includes('undici')
  );
}

/**
 * For Sentry.init({ onFatalError }). Called after the event was sent.
 * @param {Error} error
 * @param {{ dialog: { showErrorBox: (title: string, content: string) => void }, log: { warn: (...a: unknown[]) => void } }} deps
 * @returns {'ignored' | 'shown'}
 */
function handleFatalError(error, { dialog, log }) {
  if (isUndiciPausedAssert(error)) {
    log.warn('[Main] Ignored undici paused-parser assertion (connection closed during a slow download):', error.message);
    return 'ignored';
  }
  // Same as @sentry/electron's default (integrations/onuncaughtexception.js)
  console.error('Uncaught Exception:');
  console.error(error);
  const stack = error && error.stack !== undefined ? error.stack : `${error?.name}: ${error?.message}`;
  dialog.showErrorBox('A JavaScript error occurred in the main process', `Uncaught Exception:\n${stack}`);
  return 'shown';
}

module.exports = { isUndiciPausedAssert, handleFatalError };
