/**
 * Watch mode (npm run e2e:watch): the windows stay side by side, each step
 * shows a caption in its window and pauses, so a person can follow along.
 * E2E_PAUSE_MS sets the pause (default 1200 ms).
 */

export const WATCH = process.env.E2E_WATCH === '1';
const PAUSE_MS = Number(process.env.E2E_PAUSE_MS) || 1200;

export function pause(ms: number = PAUSE_MS): Promise<void> {
  return WATCH ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
