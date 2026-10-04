/**
 * Two people editing at the same time (spec v3 step 7): what merges on its
 * own, what asks a decision, and that both copies end up the same. Ben goes
 * offline to make edits overlap the way they do for real (a laptop without
 * Wi-Fi), then comes back.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import {
  share, waitSettled, spotField, setOffline, editSpot, deleteSpot, reviewDecisions, syncChip, setMode, syncNow,
} from '../lib/actions';

test('edits to different fields of one spot merge without asking', async ({ launch, project }) => {
  const p = await project('E2E Merge Fields');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true);
  await editSpot(ana, spot.id, { name: 'Garnet core' });
  await waitSettled(ana);
  await editSpot(ben, spot.id, { notes: 'Inclusion-rich rim' });
  await setOffline(ben, false);
  await syncNow(ben);

  await waitSettled(ben);
  await expect.poll(() => spotField(ana, spot.id, 'notes'), { timeout: 30_000 }).toBe('Inclusion-rich rim');
  await waitSettled(ana);
  for (const copy of [ana, ben]) {
    expect(await spotField(copy, spot.id, 'name')).toBe('Garnet core');
    expect(await spotField(copy, spot.id, 'notes')).toBe('Inclusion-rich rim');
    expect(await copy.state((e) => e.sync.getState().conflicts)).toBe(0);
  }
});

for (const keep of ['theirs', 'mine'] as const) {
  test(`the same field changed by both asks a decision; Keep all ${keep}`, async ({ launch, project }) => {
    const p = await project(`E2E Conflict ${keep}`);
    const spot = p.spots[0];
    const ana = await launch('Ana', ACCOUNTS.ana);
    const ben = await launch('Ben', ACCOUNTS.ben);
    await share(ana, ben, p.smzPath, p.id, p.name);

    await setOffline(ben, true);
    await editSpot(ana, spot.id, { name: 'Garnet (Ana)' });
    await waitSettled(ana);
    await editSpot(ben, spot.id, { name: 'Garnet (Ben)' });
    await setOffline(ben, false);
    await syncNow(ben);

    const dialog = await reviewDecisions(ben);
    // Yours is Ben's name, Theirs is Ana's
    await expect(dialog.getByRole('radio', { name: /^Yours.*Garnet \(Ben\)/ })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /^Theirs.*Garnet \(Ana\)/ })).toBeVisible();
    await dialog.getByRole('button', { name: keep === 'theirs' ? 'Keep all theirs' : 'Keep all mine' }).click();
    await ben.caption(`keeps ${keep}, Apply`);
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(ben.page.getByText('All settled and synced.')).toBeVisible({ timeout: 30_000 });
    if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close' }).click();

    const expected = keep === 'theirs' ? 'Garnet (Ana)' : 'Garnet (Ben)';
    await waitSettled(ben);
    await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 30_000 }).toBe(expected);
    await waitSettled(ana);
    expect(await spotField(ben, spot.id, 'name')).toBe(expected);
    expect(await ben.state((e) => e.sync.getState().conflicts)).toBe(0);
  });
}

for (const answer of ['Restore with my changes', 'Delete it'] as const) {
  test(`a spot one deletes while the other edits it: ${answer}`, async ({ launch, project }) => {
    const p = await project(`E2E Delete vs Edit ${answer === 'Delete it' ? 'Delete' : 'Restore'}`);
    const spot = p.spots[0];
    const ana = await launch('Ana', ACCOUNTS.ana);
    const ben = await launch('Ben', ACCOUNTS.ben);
    await share(ana, ben, p.smzPath, p.id, p.name);

    await setOffline(ben, true);
    await deleteSpot(ana, spot.id);
    await waitSettled(ana);
    await editSpot(ben, spot.id, { notes: 'Measured before it was deleted' });
    await setOffline(ben, false);
    await syncNow(ben);

    const dialog = await reviewDecisions(ben);
    await expect(dialog.getByText(/They deleted .*You changed 1 of these since\./)).toBeVisible();
    await ben.caption(answer);
    await dialog.getByRole('button', { name: answer }).click();
    await expect(ben.page.getByText('All settled and synced.')).toBeVisible({ timeout: 30_000 });

    await waitSettled(ben);
    if (answer === 'Restore with my changes') {
      await expect.poll(() => spotField(ana, spot.id, 'notes'), { timeout: 30_000 }).toBe('Measured before it was deleted');
      expect(await spotField(ben, spot.id, 'notes')).toBe('Measured before it was deleted');
    } else {
      await waitSettled(ana);
      expect(await spotField(ben, spot.id, 'name')).toBeUndefined();
      expect(await spotField(ana, spot.id, 'name')).toBeUndefined();
    }
    await waitSettled(ana);
  });
}

test('Sync when I click: changes wait until Sync Now', async ({ launch, project }) => {
  const p = await project('E2E Manual Mode');
  const spot = p.spots[1];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setMode(ben, 'Sync when I click');
  await editSpot(ben, spot.id, { name: 'Quartz (manual)' });
  await expect(syncChip(ben)).toHaveText(/Manual · (1 to sync|changes to sync)/, { timeout: 15_000 });
  // Nothing goes up on its own
  await ana.caption('should not get it yet');
  await new Promise((r) => setTimeout(r, 4_000));
  expect(await spotField(ana, spot.id, 'name')).toBe('Quartz 1');

  await syncNow(ben);
  await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 30_000 }).toBe('Quartz (manual)');
  await expect(syncChip(ben)).toHaveText('Synced', { timeout: 15_000 });
});

test('edits made offline are queued and go up when the copy is back online', async ({ launch, project }) => {
  const p = await project('E2E Offline Queue');
  const [a, b] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true);
  await editSpot(ben, a.id, { name: 'Garnet (offline 1)' });
  await editSpot(ben, b.id, { name: 'Quartz (offline 2)' });
  await expect(syncChip(ben)).toHaveText(/^Offline/, { timeout: 30_000 });
  await setOffline(ben, false);
  // Automatic mode: no click; the retry brings it up
  await expect.poll(() => spotField(ana, b.id, 'name'), { timeout: 60_000 }).toBe('Quartz (offline 2)');
  expect(await spotField(ana, a.id, 'name')).toBe('Garnet (offline 1)');
  await waitSettled(ben);
  await expect(syncChip(ben)).toHaveText('Synced');
});
