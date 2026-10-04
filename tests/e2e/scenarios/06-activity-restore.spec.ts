/**
 * Activity + Restore (spec v3 §6.3, 17m, 17n, 17u, 17v, 17w, 17ae): the
 * activity panel names who changed what, marks what is not in this copy
 * yet, and links to the full history on StraboSpot. Deleted items come
 * back with Restore: Owners and Editors for anyone's deletion (a cascade
 * comes back whole, its parent first), a Contributor only for their own.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, SERVER } from '../lib/copy';
import {
  share, setMode, editSpot, deleteSpot, addSpot, syncNow, waitSettled, spotField, micrograph, viewMicrograph,
  openActivity, activityPanel, activityLine, deleteMicrographFromTree, catchExternalLinks, spotIds,
} from '../lib/actions';

test("activity names the other person's changes, marks what is not in this copy yet, and links to the full history", async ({ launch, project }) => {
  const p = await project('E2E Activity');
  const [garnet] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  await setMode(ben, 'Sync when I click');

  await editSpot(ana, garnet.id, { name: 'Garnet rim' });
  await waitSettled(ana);
  await expect.poll(() => ben.state((e) => e.sync.getState().incoming), { timeout: 60_000 }).toBeGreaterThan(0);

  await openActivity(ben);
  const line = activityLine(ben, "Ana Ruiz changed Name of spot 'Garnet rim'");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line.getByText('Not in your copy yet')).toBeVisible();
  const waiting = activityPanel(ben).getByText('1 change is not in your copy yet.');
  await expect(waiting).toBeVisible();
  expect(await spotField(ben, garnet.id, 'name')).toBe('Garnet 1');

  await ben.caption('Sync Now in the activity panel');
  await activityPanel(ben).getByRole('button', { name: 'Sync Now' }).click();
  await expect.poll(() => spotField(ben, garnet.id, 'name'), { timeout: 60_000 }).toBe('Garnet rim');
  await expect(line.getByText('Not in your copy yet')).toHaveCount(0, { timeout: 30_000 });
  await expect(waiting).toHaveCount(0);

  // Ben's change shows on Ana's open panel by his name; her own as 'You'
  await openActivity(ana);
  await expect(activityLine(ana, "You changed Name of spot 'Garnet rim'")).toBeVisible({ timeout: 30_000 });
  await editSpot(ben, garnet.id, { notes: 'Inclusion-rich core' });
  await syncNow(ben);
  await waitSettled(ben);
  await expect(activityLine(ana, "Ben Ito changed Notes of spot 'Garnet rim'")).toBeVisible({ timeout: 60_000 });

  const links = await catchExternalLinks(ana);
  const pid = await ana.state((e) => e.sync.getState().pid);
  await ana.caption('Full history on StraboSpot…');
  await activityPanel(ana).getByRole('button', { name: 'Full history on StraboSpot…' }).click();
  await expect.poll(links).toEqual([`${SERVER}/micro_history?project_id=${pid}`]);
});

test("an editor restores the owner's deleted micrograph whole, and a spot deleted before it once the micrograph is back", async ({ launch, project }) => {
  const p = await project('E2E Restore Micrograph');
  const [garnet, quartz] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await deleteSpot(ana, quartz.id);
  await waitSettled(ana);
  await expect.poll(() => spotIds(ben, p.micrographId), { timeout: 60_000 }).toEqual([garnet.id]);
  await deleteMicrographFromTree(ana, 'Overview (Reference)');
  await waitSettled(ana);
  await expect.poll(() => micrograph(ben, p.micrographId), { timeout: 60_000 }).toBeNull();
  await waitSettled(ben);

  await openActivity(ben);
  const micLine = activityLine(ben, "Ana Ruiz deleted micrograph 'Overview' (1 spot)");
  const spotLine = activityLine(ben, "Ana Ruiz deleted spot 'Quartz 1'");
  await expect(micLine).toBeVisible({ timeout: 30_000 });
  await expect(spotLine).toBeVisible();

  // The spot first: what it was in is deleted too
  await ben.caption('restores the spot first');
  await spotLine.getByRole('button', { name: 'Restore' }).click();
  await expect(spotLine.getByText('What it was in is deleted too. Restore that first.')).toBeVisible({ timeout: 30_000 });
  expect(await micrograph(ben, p.micrographId)).toBeNull();

  await ben.caption('restores the micrograph');
  await micLine.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => spotIds(ben, p.micrographId), { timeout: 60_000 }).toEqual([garnet.id]);
  await expect(micLine.getByRole('button', { name: 'Restore' })).toHaveCount(0);
  await expect(activityLine(ben, "You restored micrograph 'Overview' (1 spot)")).toBeVisible({ timeout: 30_000 });

  await ben.caption('now the spot');
  await spotLine.getByRole('button', { name: 'Restore' }).click();
  const both = [garnet.id, quartz.id].sort();
  await expect.poll(() => spotIds(ben, p.micrographId), { timeout: 60_000 }).toEqual(both);
  await waitSettled(ben);

  await expect.poll(() => spotIds(ana, p.micrographId), { timeout: 60_000 }).toEqual(both);
  await waitSettled(ana, 120_000);
  await viewMicrograph(ana, p.micrographId);
  await viewMicrograph(ben, p.micrographId);
});

test("the owner restores a spot the editor deleted", async ({ launch, project }) => {
  const p = await project('E2E Restore Spot Owner');
  const [garnet, quartz] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await deleteSpot(ben, garnet.id);
  await waitSettled(ben);
  await expect.poll(() => spotIds(ana, p.micrographId), { timeout: 60_000 }).toEqual([quartz.id]);
  await waitSettled(ana);

  await openActivity(ana);
  const line = activityLine(ana, "Ben Ito deleted spot 'Garnet 1'");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await ana.caption("restores Ben's deletion");
  await line.getByRole('button', { name: 'Restore' }).click();
  const both = [garnet.id, quartz.id].sort();
  await expect.poll(() => spotIds(ana, p.micrographId), { timeout: 60_000 }).toEqual(both);
  await expect.poll(() => spotIds(ben, p.micrographId), { timeout: 60_000 }).toEqual(both);
  expect(await spotField(ben, garnet.id, 'name')).toBe('Garnet 1');
});

test("a Contributor can restore their own deletion but not the owner's", async ({ launch, project }) => {
  const p = await project('E2E Restore Contributor');
  const [, quartz] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name, 'Contributor');

  const mine = await addSpot(ben, p.micrographId, 'Ben grain');
  await waitSettled(ben);
  await expect.poll(async () => (await spotIds(ana, p.micrographId))?.includes(mine) ?? false, { timeout: 60_000 }).toBe(true);
  await deleteSpot(ben, mine);
  await waitSettled(ben);
  await deleteSpot(ana, quartz.id);
  await waitSettled(ana);
  await expect.poll(async () => (await spotIds(ben, p.micrographId))?.includes(quartz.id) ?? true, { timeout: 60_000 }).toBe(false);
  await expect.poll(async () => (await spotIds(ana, p.micrographId))?.includes(mine) ?? true, { timeout: 60_000 }).toBe(false);
  await waitSettled(ben);

  await openActivity(ben);
  const own = activityLine(ben, "You deleted spot 'Ben grain'");
  const owners = activityLine(ben, "Ana Ruiz deleted spot 'Quartz 1'");
  await expect(own).toBeVisible({ timeout: 30_000 });
  await expect(owners).toBeVisible();
  await expect(owners.getByRole('button', { name: 'Restore' })).toHaveCount(0);

  await ben.caption('restores his own spot');
  await own.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(async () => (await spotIds(ben, p.micrographId))?.includes(mine) ?? false, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => (await spotIds(ana, p.micrographId))?.includes(mine) ?? false, { timeout: 60_000 }).toBe(true);
  expect(await spotField(ana, mine, 'name')).toBe('Ben grain');
  expect(await spotIds(ana, p.micrographId)).not.toContain(quartz.id);
});
