/**
 * Edit n Spots (Spot > Edit Selected Spots...) adds links to every selected
 * spot (Angus, 2026-10-28): appended to each spot's links, a URL a spot
 * already has is skipped, other fields untouched, one undo step. A link
 * filled in but not added asks first (Add and Apply / Apply Without It /
 * Back), like "Add before saving?" in Mineralogy.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph, editSpot } from '../lib/actions';

const PAPER = { label: 'Paper', url: 'https://doi.org/10.1000/paper' };
const DATA = { label: 'Data', url: 'https://example.org/data' };

type SpotSummary = { name: string; color: string; links: { label: string; url: string }[] };

function spotsSummary(copy: Copy, micrographId: string): Promise<SpotSummary[]> {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    return (m?.spots ?? []).map((s) => ({ name: s.name, color: s.color, links: s.links ?? [] }));`) as never) as Promise<SpotSummary[]>;
}

async function openBatchEdit(copy: Copy, spotIds: string[]) {
  await copy.state(new Function('e', `
    const s = e.app.getState();
    s.clearSpotSelection();
    for (const id of ${JSON.stringify(spotIds)}) s.selectSpot(id, true);`) as never);
  await copy.menu('Spot', 'Edit Selected Spots...');
  const dialog = copy.page.getByRole('dialog', { name: `Edit ${spotIds.length} Spots` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillLink(dialog: ReturnType<Copy['page']['getByRole']>, link: { label: string; url: string }) {
  await dialog.getByLabel('Link Label').fill(link.label);
  await dialog.getByLabel('Link URL').fill(link.url);
}

test('links are added to every selected spot, a URL already there is skipped, one undo step', async ({ launch, project }) => {
  const p = await project('E2E Batch Links', ['Grain 1', 'Grain 2', 'Grain 3']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const [g1, g2, g3] = p.spots;

  await editSpot(ana, g1.id, { links: [PAPER] });
  await ana.page.waitForTimeout(600); // its own undo step (bursts end after 300 ms quiet)

  await ana.caption('selects all three spots, opens Edit 3 Spots, adds two links');
  const dialog = await openBatchEdit(ana, [g1.id, g2.id, g3.id]);
  const apply = dialog.getByRole('button', { name: 'Apply to 3 Spots' });
  await dialog.getByRole('checkbox', { name: 'Links' }).check();
  await expect(apply).toBeDisabled(); // no link yet
  await fillLink(dialog, PAPER);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await fillLink(dialog, DATA);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByText(PAPER.url)).toBeVisible();
  await expect(dialog.getByText(DATA.url)).toBeVisible();
  await expect(dialog.getByLabel('Link Label')).toHaveValue('');

  await ana.caption('a link removed from the list is not applied');
  await fillLink(dialog, { label: 'Wrong', url: 'https://example.org/wrong' });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove Wrong' }).click();
  await expect(dialog.getByText('https://example.org/wrong')).toHaveCount(0);

  await apply.click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => spotsSummary(ana, p.micrographId)).toEqual([
    { name: 'Grain 1', color: '0x00ff00ff', links: [PAPER, DATA] },
    { name: 'Grain 2', color: '0x00ff00ff', links: [PAPER, DATA] },
    { name: 'Grain 3', color: '0x00ff00ff', links: [PAPER, DATA] },
  ]);

  await ana.caption('applying the same links again adds nothing');
  const again = await openBatchEdit(ana, [g1.id, g2.id]);
  await again.getByRole('checkbox', { name: 'Links' }).check();
  await fillLink(again, { label: 'Same paper', url: PAPER.url });
  await again.getByRole('button', { name: 'Add', exact: true }).click();
  await again.getByRole('button', { name: 'Apply to 2 Spots' }).click();
  await expect(again).toBeHidden();
  expect((await spotsSummary(ana, p.micrographId)).map((s) => s.links)).toEqual([[PAPER, DATA], [PAPER, DATA], [PAPER, DATA]]);

  await ana.caption('one Undo takes the links off all three spots');
  await ana.menu('Edit', 'Undo');
  await expect.poll(async () => (await spotsSummary(ana, p.micrographId)).map((s) => s.links)).toEqual([[PAPER], [], []]);
});

test('a link filled in but not added asks first', async ({ launch, project }) => {
  const p = await project('E2E Batch Links Ask', ['Grain 1', 'Grain 2']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const ids = p.spots.map((s) => s.id);

  await ana.caption('fills in a link without Add, Apply asks');
  let dialog = await openBatchEdit(ana, ids);
  await dialog.getByRole('checkbox', { name: 'Links' }).check();
  await fillLink(dialog, DATA);
  await dialog.getByRole('button', { name: 'Apply to 2 Spots' }).click();
  const ask = ana.page.getByRole('dialog', { name: 'Add before applying?' });
  await expect(ask.getByText(/You filled in the link Data but did not press Add/)).toBeVisible();

  await ana.caption('Back keeps the dialog and the text');
  await ask.getByRole('button', { name: 'Back' }).click();
  await expect(ask).toBeHidden();
  await expect(dialog.getByLabel('Link URL')).toHaveValue(DATA.url);

  await ana.caption('Add and Apply adds it');
  await dialog.getByRole('button', { name: 'Apply to 2 Spots' }).click();
  await ask.getByRole('button', { name: 'Add and Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await spotsSummary(ana, p.micrographId)).map((s) => s.links)).toEqual([[DATA], [DATA]]);

  await ana.caption('an unfinished link cannot be added; Apply Without It applies the rest');
  dialog = await openBatchEdit(ana, ids);
  await dialog.getByRole('checkbox', { name: 'Links' }).check();
  await fillLink(dialog, PAPER);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await fillLink(dialog, { label: 'Half', url: 'example.org' });
  await dialog.getByRole('button', { name: 'Apply to 2 Spots' }).click();
  await expect(ask.getByText(/needs a label and a URL beginning with http/)).toBeVisible();
  await expect(ask.getByRole('button', { name: 'Add and Apply' })).toBeDisabled();
  await ask.getByRole('button', { name: 'Apply Without It' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await spotsSummary(ana, p.micrographId)).map((s) => s.links)).toEqual([[DATA, PAPER], [DATA, PAPER]]);
});

test('Links is always in the Properties panel, like Notes and Associated Files; its pencil adds a link', async ({ launch, project }) => {
  const p = await project('E2E Links Section', ['Grain 1']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const pane = ana.page.getByText('Collected Data:').locator('..');
  const linksSummary = pane.getByRole('button', { name: /^Links/ });

  await ana.caption('a spot without links shows Links with No links');
  await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(p.spots[0].id)})`) as never);
  await expect(linksSummary).toBeVisible();
  await linksSummary.click();
  await expect(pane.getByText('No links', { exact: true })).toBeVisible();

  await ana.caption('the pencil opens Spot Links; a saved link shows with its count');
  await linksSummary.locator('[data-testid="EditIcon"]').click();
  const dialog = ana.page.getByRole('dialog', { name: 'Spot Links' });
  await fillLink(dialog, PAPER);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(linksSummary).toContainText('1 links');
  expect((await spotsSummary(ana, p.micrographId))[0].links).toEqual([PAPER]);

  await ana.caption('a micrograph without links shows Links too');
  await ana.state(new Function('e', `
    e.app.getState().selectActiveSpot(null);
    return e.app.getState().selectMicrograph(${JSON.stringify(p.micrographId)});`) as never);
  await expect(linksSummary).toBeVisible();
  await expect(linksSummary).not.toContainText('links');
});
