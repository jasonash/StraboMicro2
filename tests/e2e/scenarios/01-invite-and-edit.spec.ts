/**
 * The basic collaboration loop with two people, each in their own copy:
 * Ana syncs a project and invites Ben as an Editor while Ben's app is
 * already open (the header chip must appear without a restart), Ben
 * accepts and opens it, then each edits a spot and the other copy gets it.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { openSmz, turnOnSync, invite, acceptInvitationFromChip, waitSettled, spotField } from '../lib/actions';
import { refChanges } from '../lib/server';

test('invite an editor while their app is open, edit both ways', async ({ launch, project }) => {
  const p = await project('E2E Invite and Edit');
  const garnet = p.spots[0];
  const quartz = p.spots[1];

  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);

  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await invite(ana, ACCOUNTS.ben.email, 'Editor');

  await acceptInvitationFromChip(ben, p.name);
  expect(await ben.state((e) => e.app.getState().project?.id)).toBe(p.id);
  expect(await ben.state((e) => e.sync.getState().role)).toBe('editor');
  expect(await spotField(ben, garnet.id, 'name')).toBe('Garnet 1');

  // Ana renames a spot: Ben's copy gets it without doing anything
  await ana.caption(`renames '${garnet.name}' to 'Garnet rim'`);
  await ana.state(new Function('e', `e.app.getState().updateSpotData(${JSON.stringify(garnet.id)}, { name: 'Garnet rim' })`) as never);
  await waitSettled(ana);
  await ben.caption('waits for the change');
  await expect.poll(() => spotField(ben, garnet.id, 'name'), { timeout: 30_000 }).toBe('Garnet rim');

  // And back: Ben edits a different spot, Ana gets it
  await ben.caption(`renames '${quartz.name}' to 'Quartz vein'`);
  await ben.state(new Function('e', `e.app.getState().updateSpotData(${JSON.stringify(quartz.id)}, { name: 'Quartz vein' })`) as never);
  await waitSettled(ben);
  await expect.poll(() => spotField(ana, quartz.id, 'name'), { timeout: 30_000 }).toBe('Quartz vein');

  await waitSettled(ana);
  await waitSettled(ben);
  // Files went up once, by Ana; joining and editing sent none (the tile
  // archives of the two copies used to differ, so each re-sent its own)
  const refs = refChanges(p.id);
  expect(refs.filter((r) => r.email !== ACCOUNTS.ana.email)).toEqual([]);
  expect(refs.filter((r) => r.role === 'tiles')).toHaveLength(1);
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});
