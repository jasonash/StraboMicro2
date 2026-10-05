/**
 * The live channel (spec v3 17ah-17ay, R2): with the activity poll set to
 * 10 minutes, only the live channel can bring a change across in seconds.
 * An edit arrives on its own; a change made while the other copy has a
 * dialog open waits for it with "<name> made 1 change; it'll appear when
 * you close this dialog" (17ap); a removed member hears of it at once; the
 * live service stopping pauses live updates (the chip says so, 17ao) and
 * starting again catches up on what was missed.
 *
 * Needs the dev strabo-live container (`docker ps` lists it); the second
 * test stops and starts it.
 */

import { execFileSync } from 'child_process';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { share, waitSettled, spotField, editSpot, syncChip, collaborators, removeMember, separateCopyNotice } from '../lib/actions';

/** Polling every 10 minutes: anything arriving sooner came over the live channel */
const SLOW_POLL = { STRABO_E2E_POLL_MS: String(10 * 60_000) };

function waitLive(copy: Copy, live = true, timeout = 20_000) {
  return expect.poll(() => copy.state((e) => e.sync.getState().live), { timeout }).toBe(live);
}

function docker(...args: string[]): void {
  execFileSync('docker', args, { stdio: 'ignore' });
}

test('an edit arrives over the live channel; an open dialog holds it; removal is heard at once', async ({ launch, project }) => {
  const p = await project('E2E Live Channel');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana, { env: SLOW_POLL });
  const ben = await launch('Ben', ACCOUNTS.ben, { env: SLOW_POLL });
  await share(ana, ben, p.smzPath, p.id, p.name);
  await waitLive(ana);
  await waitLive(ben);

  // Ana renames a spot: it reaches Ben within seconds (the poll is 10 min away)
  await editSpot(ana, spot.id, { name: 'Live 1' });
  const t0 = Date.now();
  await ben.caption('waits for the change (live)');
  await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 10_000, intervals: [100] }).toBe('Live 1');
  const ms = Date.now() - t0;
  console.log(`[09] edit to arrival: ${ms} ms`);
  expect(ms).toBeLessThan(5_000);
  await waitSettled(ana);
  await waitSettled(ben);

  // Ben has a dialog open: Ana's next change waits for it, and Ben is told who made it
  const dialog = await collaborators(ben);
  await editSpot(ana, spot.id, { name: 'Live 2' });
  await ben.caption('has a dialog open while the change comes in');
  await expect.poll(() => ben.state((e) => e.sync.getState().notice), { timeout: 10_000 })
    .toBe(`${ACCOUNTS.ana.name} made 1 change; it'll appear when you close this dialog.`);
  expect(await spotField(ben, spot.id, 'name')).toBe('Live 1');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await ben.caption('closes the dialog: the change appears');
  await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 5_000 }).toBe('Live 2');
  await expect.poll(() => ben.state((e) => e.sync.getState().notice), { timeout: 5_000 }).toBe(null);
  await waitSettled(ben);

  // Ana removes Ben: Ben's copy hears of it at once, not on a poll
  await removeMember(ana, ben);
  const removedAt = Date.now();
  const text = await separateCopyNotice(ben, 'Removed From the Project');
  expect(text).toContain(ACCOUNTS.ana.name);
  expect(Date.now() - removedAt).toBeLessThan(20_000);

  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});

test('the live service stops: updates pause; it starts again: the copy catches up', async ({ launch, project }) => {
  const p = await project('E2E Live Restart');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana, { env: SLOW_POLL });
  const ben = await launch('Ben', ACCOUNTS.ben, { env: SLOW_POLL });
  await share(ana, ben, p.smzPath, p.id, p.name);
  await waitLive(ben);

  try {
    await ben.caption('the live service stops');
    docker('stop', 'strabo-live');
    await waitLive(ben, false);
    await syncChip(ben).click();
    await expect(ben.page.getByText('Live updates paused, checking every 30 s.')).toBeVisible();
    await expect(syncChip(ben)).toHaveText(/Synced/);
    await ben.page.keyboard.press('Escape');

    // Ana's change still goes up; Ben does not hear of it (the poll is 10 min away)
    await editSpot(ana, spot.id, { name: 'While down' });
    await waitSettled(ana);
    await ben.page.waitForTimeout(3_000);
    expect(await spotField(ben, spot.id, 'name')).toBe(spot.name);
  } finally {
    docker('start', 'strabo-live');
  }

  // Back: Ben reconnects (backoff) and pulls what it missed at once
  await ben.caption('the live service is back');
  await waitLive(ben, true, 40_000);
  await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 10_000 }).toBe('While down');
  await waitSettled(ben);
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});
