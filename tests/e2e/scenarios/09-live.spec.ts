/**
 * The live channel (spec v3 17ah-17ay, R2): with the activity poll set to
 * 10 minutes, only the live channel can bring a change across in seconds.
 * An edit arrives on its own; a change made while the other copy has a
 * dialog open waits for it with "<name> made 1 change; it'll appear when
 * you close this dialog" (17ap); a removed member hears of it at once; the
 * live service stopping pauses live updates (the chip says so, 17ao) and
 * starting again catches up on what was missed. Presence (R3, 17al-17an):
 * the other person's badge in the header, on the micrograph they view in
 * the tree, "editing" on the spot they edit and a line at the top of the
 * same dialog here, "Here now" in Activity; gone when their app closes.
 *
 * Needs the dev strabo-live container (`docker ps` lists it); the second
 * test stops and starts it.
 */

import { execFileSync } from 'child_process';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import {
  share, waitSettled, spotField, editSpot, syncChip, collaborators, removeMember, separateCopyNotice, viewMicrograph, openActivity,
} from '../lib/actions';

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

/** Select a spot and open Add Data > Spot Data in the Properties panel (the Edit Spot dialog) */
async function openEditSpot(copy: Copy, spotId: string) {
  await copy.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(spotId)})`) as never);
  await copy.page.getByPlaceholder('Select or search data type...').click();
  await copy.caption('opens Spot Data');
  await copy.page.getByRole('option', { name: 'Spot Data' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'Edit Spot' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The line EditingScope puts at the top of a dialog's content (CSS ::before) */
function dialogLine(copy: Copy): Promise<string> {
  return copy.page.evaluate(() => {
    const el = document.querySelector('.MuiDialog-root .MuiDialogContent-root');
    const c = el ? getComputedStyle(el, '::before').content : 'none';
    return c === 'none' || c === 'normal' ? '' : JSON.parse(c);
  });
}

test('presence: badges, what they view and edit, Here now; gone when their app closes', async ({ launch, project }) => {
  const p = await project('E2E Presence');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  await waitLive(ana);
  await waitLive(ben);

  // Each sees the other's badge in the header, not their own
  await ben.caption("sees Ana's badge");
  await expect(ben.page.getByTestId('header-presence').getByTestId('presence-badge')).toHaveText(['AR'], { timeout: 10_000 });
  await expect(ana.page.getByTestId('header-presence').getByTestId('presence-badge')).toHaveText(['BI'], { timeout: 10_000 });

  // Ana views the micrograph: Ben's tree shows her badge on it
  await viewMicrograph(ana, p.micrographId);
  await expect(ben.page.getByTestId('presence-marks').getByTestId('presence-badge').filter({ hasText: 'AR' }).first())
    .toBeVisible({ timeout: 10_000 });

  // Ana edits a spot: Ben sees "editing" on it, and the line in his own dialog for it
  const anaDialog = await openEditSpot(ana, spot.id);
  await ben.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(spot.id)})`) as never);
  await ben.caption("sees Ana editing the spot");
  await expect(ben.page.getByTestId('presence-editing').first()).toBeVisible({ timeout: 10_000 });
  const benDialog = await openEditSpot(ben, spot.id);
  await expect.poll(() => dialogLine(ben), { timeout: 10_000 })
    .toBe(`${ACCOUNTS.ana.name} is editing this spot right now. You can still edit; if you both change the same field you'll be asked which to keep.`);
  await benDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(benDialog).toBeHidden();
  // Ana's dialog says Ben was editing it too while his was open; now he is not
  await expect.poll(() => dialogLine(ana), { timeout: 10_000 }).toBe('');
  await anaDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(anaDialog).toBeHidden();
  await ben.caption("Ana's 'editing' clears");
  await expect(ben.page.getByTestId('presence-editing')).toHaveCount(0, { timeout: 10_000 });

  // Activity: Here now
  const panel = await openActivity(ben);
  await expect(panel.getByTestId('here-now')).toContainText(ACCOUNTS.ana.name);

  // Ana closes the app: her badge goes
  await ana.caption('closes the app');
  await ana.close();
  await expect(ben.page.getByTestId('header-presence')).toHaveCount(0, { timeout: 15_000 });
  expect(await ben.unansweredDialogs()).toEqual([]);
});
