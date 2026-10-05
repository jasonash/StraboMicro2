/**
 * Latency (spec v3 17av): from Ana's edit finishing to the value in Ben's
 * store, with the real timers (not the short test ones), on one machine.
 * Skipped unless E2E_LATENCY is set:
 *
 *   E2E_LATENCY=after npm run e2e -- 10-     # live channel, push 1 s after the edit (pass: median < 1.5 s, p95 < 3 s)
 *   E2E_LATENCY=before npm run e2e -- 10-    # as before it: 3 s debounce, polling (Ben's window focused: every 30 s)
 *
 * E2E_LATENCY_N sets the number of edits (default 20 after, 10 before).
 * The numbers go to the console and test-results/e2e/latency-<mode>.json.
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, turnOnSync, invite, acceptInvitationFromChip, waitSettled, spotField, editSpot } from '../lib/actions';

const MODE = process.env.E2E_LATENCY === 'before' ? 'before' : process.env.E2E_LATENCY === 'after' ? 'after' : null;
const N = Number(process.env.E2E_LATENCY_N) || (MODE === 'before' ? 10 : 20);

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** Bring a copy's window to the front (a focused window polls every 30 s, not 2 min) */
async function focus(copy: Copy): Promise<void> {
  await copy.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
}

test.describe(() => {
  test.skip(MODE === null, 'set E2E_LATENCY=after or before');
  test.setTimeout(N * 70_000 + 180_000);

  test(`edit to arrival, ${MODE ?? 'off'}`, async ({ launch, project }) => {
    const env = { STRABO_E2E_TIMERS: MODE === 'before' ? 'legacy' : 'real' };
    const p = await project(`E2E Latency ${MODE}`);
    const spot = p.spots[0];
    const ana = await launch('Ana', ACCOUNTS.ana, { env });
    const ben = await launch('Ben', ACCOUNTS.ben, { env });
    // share(), except that Ben checks for the invitation at once (the real recheck is every 5 min)
    await openSmz(ana, p.smzPath, p.id);
    await turnOnSync(ana);
    await invite(ana, ACCOUNTS.ben.email, 'Editor');
    await ben.state((e) => e.invitations.getState().refresh());
    await acceptInvitationFromChip(ben, p.name);
    await waitSettled(ana, 150_000);
    await waitSettled(ben, 150_000);
    if (MODE === 'after') {
      await expect.poll(() => ben.state((e) => e.sync.getState().live), { timeout: 30_000 }).toBe(true);
    }
    await focus(ben);

    const times: number[] = [];
    for (let i = 1; i <= N; i++) {
      const value = `Latency ${i}`;
      await editSpot(ana, spot.id, { name: value });
      const t0 = Date.now();
      await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 150_000, intervals: [50] }).toBe(value);
      times.push(Date.now() - t0);
      console.log(`[latency ${MODE}] ${i}/${N}: ${times[times.length - 1]} ms`);
      await waitSettled(ana, 150_000);
      await waitSettled(ben, 150_000);
    }

    const sorted = [...times].sort((a, b) => a - b);
    const report = {
      mode: MODE, n: N, medianMs: percentile(sorted, 50), p95Ms: percentile(sorted, 95),
      minMs: sorted[0], maxMs: sorted[sorted.length - 1], times, at: new Date().toISOString(),
    };
    console.log(`[latency ${MODE}] median ${report.medianMs} ms, p95 ${report.p95Ms} ms (min ${report.minMs}, max ${report.maxMs})`);
    const out = path.join('test-results', 'e2e', `latency-${MODE}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    if (MODE === 'after') {
      expect(report.medianMs).toBeLessThan(1_500);
      expect(report.p95Ms).toBeLessThan(3_000);
    }
  });
});
