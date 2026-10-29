/**
 * Micrograph visibility (the tree's eye, isMicroVisible) is each person's own
 * view (Jason, 2026-10-29: in a demo, hiding a micrograph hid it on the
 * collaborator's copy too). It is saved in the local project.json and kept
 * through pulls, but never sent: the other copy keeps showing it, and the
 * server never records it (electron/shared/entityModel.mjs per-user fields).
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { share, waitSettled } from '../lib/actions';
import { serverField } from '../lib/server';

function visible(copy: Copy, micrographId: string): Promise<boolean | null> {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    return m ? m.isMicroVisible !== false : null;`) as never) as Promise<boolean | null>;
}

function nameOf(copy: Copy, micrographId: string): Promise<string | null> {
  return copy.state(new Function('e', `return e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)})?.name ?? null`) as never) as Promise<string | null>;
}

/** isMicroVisible of a micrograph in the copy's project.json on disk */
async function savedVisibility(copy: Copy, projectId: string, micrographId: string): Promise<unknown> {
  const folder = await copy.state(new Function('e', `return window.api.getProjectFolderPaths(${JSON.stringify(projectId)}).then((p) => p?.projectPath ?? null)`) as never) as string | null;
  if (!folder) throw new Error('no project folder');
  const project = JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
  for (const d of project.datasets ?? []) for (const s of d.samples ?? []) for (const m of s.micrographs ?? []) {
    if (m.id === micrographId) return m.isMicroVisible;
  }
  return 'missing';
}

test('hiding a micrograph hides it only here: the other copy keeps it, a pulled edit keeps it hidden, the server never gets it', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const mapId = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Personal Visibility', [], {
    overviewId,
    micrographs: [{
      id: mapId, name: 'Map Al', parentID: overviewId, imageType: 'Backscattered Electron',
      width: 800, height: 600, imageWidth: 800, imageHeight: 600, opacity: 1, scalePixelsPerCentimeter: 20000,
      offsetInParent: { X: 0, Y: 0 }, rotation: 0,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    }],
  });
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  expect(await visible(ben, mapId)).toBe(true);

  await ana.caption('hides Map Al, then renames the overview (so a push certainly runs)');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.updateMicrographMetadata(${JSON.stringify(mapId)}, { isMicroVisible: false });
    st.updateMicrographMetadata(${JSON.stringify(overviewId)}, { name: 'Overview BSE' });`) as never);
  await waitSettled(ana);
  await expect.poll(() => nameOf(ben, overviewId), { timeout: 30_000 }).toBe('Overview BSE');
  await ben.caption('the rename arrived; Map Al is still shown here');
  expect(await visible(ben, mapId)).toBe(true);
  expect(serverField(p.id, 'micrograph', mapId, 'isMicroVisible')).toBeNull();

  await ben.caption('renames Map Al: Ana gets the name, and it stays hidden for her');
  await ben.state(new Function('e', `e.app.getState().updateMicrographMetadata(${JSON.stringify(mapId)}, { name: 'Map Al Ka' })`) as never);
  await waitSettled(ben);
  await expect.poll(() => nameOf(ana, mapId), { timeout: 30_000 }).toBe('Map Al Ka');
  expect(await visible(ana, mapId)).toBe(false);

  await ana.caption('hidden is saved in her own project.json');
  await waitSettled(ana);
  await expect.poll(() => savedVisibility(ana, p.id, mapId), { timeout: 30_000 }).toBe(false);
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});
