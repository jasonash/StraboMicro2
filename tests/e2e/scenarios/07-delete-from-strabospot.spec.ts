/**
 * Delete from StraboSpot (17ac): the owner's unsynced changes go up first,
 * the name must be typed, and the owner keeps a separate copy or removes
 * it. Every other copy (members', the owner's other computers) becomes a
 * separate copy with the notice 'Deleted From StraboSpot'; a member's
 * changes that had not synced stay in their copy.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import {
  share, setMode, waitSettled, spotField, editSpot, setOffline, separateCopyNotice, deleteFromStraboSpot, openSmz, turnOnSync, downloadRemote,
} from '../lib/actions';
import { serverField } from '../lib/server';

test("the owner deletes it and keeps a copy; the member's copy becomes separate with their unsynced change", async ({ launch, project }) => {
  const p = await project('E2E Delete Keep');
  const [garnet, quartz] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true);
  await editSpot(ben, quartz.id, { notes: 'Written offline' });
  // Ana syncs when she clicks: her last change goes up only because the
  // delete sends it first (17ac), so a restore of the project has it
  await setMode(ana, 'Sync when I click');
  await editSpot(ana, garnet.id, { name: 'Last before delete' });
  await expect.poll(() => ana.state((e) => e.sync.getState().pending ?? 0)).toBeGreaterThan(0);
  await deleteFromStraboSpot(ana, p.name, true);

  const anaText = await separateCopyNotice(ana, 'Deleted From StraboSpot');
  expect(anaText).toContain(`You deleted "${p.name}" from StraboSpot.`);
  expect(anaText).toContain('This is now your own copy on this computer; it no longer syncs with StraboSpot.');
  expect(anaText).toContain('You can restore the StraboSpot project from My StraboMicro Data on the StraboSpot website until');
  expect(await ana.state((e) => e.sync.getState().synced)).toBe(false);
  expect(await ana.state((e) => e.app.getState().project?.id)).not.toBe(p.id);
  expect(await spotField(ana, garnet.id, 'name')).toBe('Last before delete');
  // ... and it reached StraboSpot before the delete, so a restore has it
  expect(serverField(p.id, 'spot', garnet.id, 'name')).toBe('Last before delete');

  await setOffline(ben, false);
  const benText = await separateCopyNotice(ben, 'Deleted From StraboSpot');
  expect(benText).toContain(`${ACCOUNTS.ana.name} deleted "${p.name}" from StraboSpot.`);
  expect(benText).toContain('Your changes that had not synced are kept in this copy.');
  expect(benText).not.toContain('You can restore');
  expect(await ben.state((e) => e.sync.getState().synced)).toBe(false);
  expect(await ben.state((e) => e.app.getState().project?.id)).not.toBe(p.id);
  expect(await spotField(ben, quartz.id, 'notes')).toBe('Written offline');
});

test("a member with nothing unsynced gets the notice without the kept-changes line", async ({ launch, project }) => {
  const p = await project('E2E Delete Member Idle');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name, 'Viewer');

  await deleteFromStraboSpot(ana, p.name, true);
  await separateCopyNotice(ana, 'Deleted From StraboSpot');
  const benText = await separateCopyNotice(ben, 'Deleted From StraboSpot');
  expect(benText).toContain(`${ACCOUNTS.ana.name} deleted "${p.name}" from StraboSpot.`);
  expect(benText).not.toContain('Your changes that had not synced');
  expect(await ben.state((e) => e.sync.getState().synced)).toBe(false);
});

test("the owner deletes it and removes this copy; the copy on their other computer becomes separate", async ({ launch, project }) => {
  const p = await project('E2E Delete Remove');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ana2 = await launch('Ana laptop', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await downloadRemote(ana2, p.name, p.id);

  await editSpot(ana2, spot.id, { name: 'From the laptop' });
  await waitSettled(ana2);
  await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 60_000 }).toBe('From the laptop');

  await deleteFromStraboSpot(ana, p.name, false);
  await expect.poll(() => ana.state((e) => e.app.getState().project?.id ?? null), { timeout: 30_000 }).toBeNull();
  await expect(ana.page.getByRole('dialog', { name: 'Deleted From StraboSpot' })).toHaveCount(0);

  const text = await separateCopyNotice(ana2, 'Deleted From StraboSpot');
  expect(text).toContain(`You deleted "${p.name}" from StraboSpot.`);
  expect(await ana2.state((e) => e.sync.getState().synced)).toBe(false);
  expect(await ana2.state((e) => e.app.getState().project?.id)).not.toBe(p.id);
  expect(await spotField(ana2, spot.id, 'name')).toBe('From the laptop');
});
