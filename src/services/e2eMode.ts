/**
 * End-to-end test mode (tests/e2e): a development copy of the app started
 * with STRABO_E2E_DIR (electron/main.js). Never true in a packaged build:
 * main ignores the variable there, and Vite's production build drops it.
 *
 * Kept free of imports so any module can use e2eMs for its timers; the
 * test's hooks (stores reachable from the test) are in e2eHooks.ts, loaded
 * only under test.
 */

/** The test run's settings, or null outside a test run */
export const E2E: { server: string } | null =
  import.meta.env?.DEV && typeof window !== 'undefined' ? (window.api?.e2e ?? null) : null;

/**
 * A delay: the normal one, or the short one under test, so a scenario
 * does not wait out a 3 s debounce or a 5 minute poll.
 */
export function e2eMs(normal: number, underTest: number): number {
  return E2E ? underTest : normal;
}
