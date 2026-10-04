/**
 * Access changes (stage 4, 5c): leaving, removal, a role taken down while
 * the member had work not synced yet (parked for the owner), and the
 * owner's review of it, with both copies settling afterwards.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import {
  share, waitSettled, spotField, editSpot, setOffline, syncNow, leaveProject, separateCopyNotice, removeMember,
  changeRole, openParkedReview, setMode, addReferenceMicrograph, micrograph, reviewDecisions, syncChip,
} from '../lib/actions';

test('a member leaves and keeps a separate copy that no longer syncs', async ({ launch, project }) => {
  const p = await project('E2E Leave Keep');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await leaveProject(ben, true);
  const text = await separateCopyNotice(ben, 'You Left the Project');
  expect(text).toContain(`You left "${p.name}".`);
  expect(await ben.state((e) => e.sync.getState().synced)).toBe(false);
  expect(await spotField(ben, spot.id, 'name')).toBe('Garnet 1');

  // Ana's later work does not reach Ben's separate copy
  await editSpot(ana, spot.id, { name: 'After Ben left' });
  await waitSettled(ana);
  await ben.page.waitForTimeout(4_000);
  expect(await spotField(ben, spot.id, 'name')).toBe('Garnet 1');
  expect(await ben.state((e) => e.app.getState().project?.id)).not.toBe(p.id);
});

test('a member leaves and removes the copy from their computer', async ({ launch, project }) => {
  const p = await project('E2E Leave Remove');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await leaveProject(ben, false);
  await expect.poll(() => ben.state((e) => e.app.getState().project?.id ?? null), { timeout: 30_000 }).toBeNull();
});

// Back online, whichever request meets the removal first (the push, or
// the activity poll; in 'Sync when I click' only the poll runs) must still
// send Ben's work to the owner before his copy turns separate
for (const mode of ['Sync automatically', 'Sync when I click'] as const) {
test(`a removed member's unsynced work, a new micrograph included, goes to the owner for review (${mode})`, async ({ launch, project, runDir }) => {
  const p = await project(`E2E Removed With Work ${mode === 'Sync automatically' ? 'Auto' : 'Manual'}`);
  const spot = p.spots[1];
  const img = await writeImage(`${runDir}/images/unsent.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  if (mode === 'Sync when I click') await setMode(ben, mode);

  await setOffline(ben, true);
  await editSpot(ben, spot.id, { notes: 'Undulose extinction' });
  const m = await addReferenceMicrograph(ben, 'TX-01', img, 'Unsent micrograph');
  await removeMember(ana, ben);
  await setOffline(ben, false);

  const text = await separateCopyNotice(ben, 'Removed From the Project');
  expect(text).toContain(`${ACCOUNTS.ana.name} removed you from "${p.name}".`);
  expect(text).toContain('Your unsynced changes were sent to the project owner for review.');
  // Ben keeps his work in his own copy
  expect(await spotField(ben, spot.id, 'notes')).toBe('Undulose extinction');
  expect((await micrograph(ben, m))?.name).toBe('Unsent micrograph');

  const review = await openParkedReview(ana);
  await expect(review.getByText(`A new micrograph's image did not reach StraboSpot with it. Ask ${ACCOUNTS.ben.name} to send it as a .smz file.`)).toBeVisible();
  await ana.caption('accepts what can be accepted');
  await review.getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => spotField(ana, spot.id, 'notes'), { timeout: 30_000 }).toBe('Undulose extinction');
  await ana.caption('discards the rest');
  await review.getByRole('button', { name: 'Discard all' }).click();
  await expect(review.getByText('Nothing is waiting for your review.')).toBeVisible({ timeout: 30_000 });
  await review.getByRole('button', { name: 'Close' }).click();
  expect(await micrograph(ana, m)).toBeNull();
  await expect.poll(() => ana.state((e) => e.sync.getState().parkedCount), { timeout: 30_000 }).toBe(0);
  await waitSettled(ana);
});
}

for (const [ownerChoice, how] of [['Accept', 'no-network'], ['Discard', 'no-network'], ['Accept', 'dropped']] as const) {
  test(`an Editor turned Viewer with unsynced work (${how}): parked once, the owner chooses ${ownerChoice}, both copies settle`, async ({ launch, project }) => {
    const p = await project(`E2E Downgrade ${ownerChoice} ${how}`);
    const spot = p.spots[0];
    const ana = await launch('Ana', ACCOUNTS.ana);
    const ben = await launch('Ben', ACCOUNTS.ben);
    await share(ana, ben, p.smzPath, p.id, p.name);

    await setOffline(ben, true, how);
    await editSpot(ben, spot.id, { name: 'Garnet (Ben offline)' });
    await changeRole(ana, ben, 'Viewer');
    await setOffline(ben, false);
    await syncNow(ben);

    // Ben is told where it went
    const decisions = await reviewDecisions(ben);
    await expect(decisions.getByText('Your role in this project changed, so it was sent to the project owner for review.')).toBeVisible();
    await decisions.getByRole('button', { name: 'Close' }).click();
    await expect.poll(() => ben.state((e) => e.sync.getState().role), { timeout: 30_000 }).toBe('viewer');

    const review = await openParkedReview(ana);
    await expect(review.getByText('Garnet (Ben offline)').first()).toBeVisible();
    // Once, even when the interrupted push was sent again first
    await expect(review.getByRole('button', { name: `${ownerChoice} all` })).toHaveCount(1);
    expect(await ana.state((e) => e.sync.getState().parkedCount)).toBe(1);
    await review.getByRole('button', { name: `${ownerChoice} all` }).click();
    await expect(review.getByText('Nothing is waiting for your review.')).toBeVisible({ timeout: 30_000 });
    await review.getByRole('button', { name: 'Close' }).click();

    const expected = ownerChoice === 'Accept' ? 'Garnet (Ben offline)' : 'Garnet 1';
    await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 30_000 }).toBe(expected);
    await waitSettled(ana);
    // Ben's copy settles. Accepted: the turned-down row clears once his copy
    // matches (60b7d91). Discarded: the row stays until he discards it too (17aa)
    await syncNow(ben);
    if (ownerChoice === 'Discard') {
      await ben.page.waitForTimeout(2_000);
      expect(await ben.state((e) => e.sync.getState().refused)).toBe(1);
      const own = await reviewDecisions(ben);
      await ben.caption('Discard my change');
      await own.getByRole('button', { name: 'Discard my change' }).click();
      if (await own.isVisible()) await own.getByRole('button', { name: 'Close' }).click();
    }
    await expect.poll(() => ben.state((e) => e.sync.getState().refused), { timeout: 30_000 }).toBe(0);
    await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 30_000 }).toBe(expected);
    await waitSettled(ben);
    await expect(syncChip(ben)).toHaveText('Synced');
    expect(await ana.state((e) => e.sync.getState().parkedCount)).toBe(0);
  });
}
