/**
 * The Collaborators dialog's way to the website's Collaborators page, where
 * pasted invitations and join links are (spec v3 17a-web): the owner gets
 * the button and it opens this project's page; other members do not.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { share, collaborators, catchExternalLinks } from '../lib/actions';

test('Open on StraboSpot takes the owner to this project\'s page; other members have no button', async ({ launch, project }) => {
  const p = await project('E2E Website Page');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const cleo = await launch('Cleo', ACCOUNTS.cleo);
  await share(ana, cleo, p.smzPath, p.id, p.name, 'Contributor');

  const links = await catchExternalLinks(ana);
  const pid = await ana.state((e) => e.sync.getState().pid);
  const dialog = await collaborators(ana);
  await dialog.getByRole('button', { name: 'Open on StraboSpot...' }).click();
  await expect.poll(links).toEqual([expect.stringMatching(new RegExp(`/micro_collaborators\\?project_id=${pid}$`))]);

  const other = await collaborators(cleo);
  await expect(other.getByRole('button', { name: 'Open on StraboSpot...' })).toHaveCount(0);
});
