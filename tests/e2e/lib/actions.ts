/**
 * What a person does in the app, step by step, through the real menus and
 * dialogs (labels as the app shows them). Each helper waits until the app
 * has finished, so scenarios read like the manual test scripts.
 */

import { expect } from '@playwright/test';
import { SERVER as SERVER_URL, type Copy } from './copy';

/** File > Open Local Project (.smz): Import, then Open Project */
export async function openSmz(copy: Copy, smzPath: string, projectId: string): Promise<void> {
  await copy.answerDialog({ kind: 'open', filePaths: [smzPath] });
  await copy.menu('File', 'Open Local Project (.smz)');
  const dialog = copy.page.getByRole('dialog', { name: 'Open Project' });
  await dialog.getByRole('button', { name: 'Import' }).click();
  await dialog.getByRole('button', { name: 'Open Project' }).click({ timeout: 60_000 });
  await expect.poll(() => copy.state((e) => e.app.getState().project?.id ?? null), { timeout: 30_000 }).toBe(projectId);
}

/** File > Upload to Strabo Server...: the turn-on dialog, Start Syncing; waits for the first upload */
export async function turnOnSync(copy: Copy, mode: 'Sync automatically' | 'Sync when I click' = 'Sync automatically'): Promise<void> {
  await copy.menu('File', 'Upload to Strabo Server...');
  const dialog = copy.page.getByRole('dialog', { name: 'Sync this project to StraboSpot' });
  await dialog.getByText(mode, { exact: true }).click();
  await copy.caption(`chooses '${mode}', Start Syncing`);
  await dialog.getByRole('button', { name: 'Start Syncing' }).click();
  await expect.poll(() => copy.state((e) => {
    const s = e.sync.getState();
    return s.synced && s.phase === 'ready' && s.pid !== null;
  }), { timeout: 90_000 }).toBe(true);
}

/** File > Collaborate...: invite by email with a role, then Close */
export async function invite(copy: Copy, email: string, role: 'Editor' | 'Contributor' | 'Viewer'): Promise<void> {
  await copy.menu('File', 'Collaborate...');
  const dialog = copy.page.getByRole('dialog', { name: 'Collaborators' });
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('combobox').click();
  await copy.page.getByRole('option', { name: role, exact: true }).click();
  await copy.caption(`invites ${email} as ${role}`);
  await dialog.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(dialog.getByText(`Invitation sent to ${email}.`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * The header chip ('1 invitation') opens the invitation; Accept, then Open.
 * Waits for the project to be open and synced in this copy.
 */
export async function acceptInvitationFromChip(copy: Copy, projectName: string): Promise<void> {
  const chip = copy.page.getByRole('button', { name: /^\d+ invitations?$/ });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await copy.caption('sees the invitation in the header');
  await chip.click();
  const dialog = copy.page.getByRole('dialog', { name: /You have (an invitation|invitations)/ });
  const row = dialog.getByRole('listitem').filter({ hasText: projectName });
  await row.getByRole('button', { name: 'Accept' }).click();
  await row.getByRole('button', { name: 'Open' }).click({ timeout: 90_000 });
  await expect.poll(() => copy.state((e) => {
    const s = e.sync.getState();
    return Boolean(s.synced && e.app.getState().project?.name);
  }), { timeout: 60_000 }).toBe(true);
}

/** Nothing waiting either way: no local changes to push, none to pull, no file downloads, not syncing */
export async function waitSettled(copy: Copy, timeout = 60_000): Promise<void> {
  await expect.poll(() => copy.state((e) => {
    const s = e.sync.getState();
    return { activity: s.activity, pending: s.pending ?? 0, incoming: s.incoming, downloads: s.downloads, problem: s.problem?.message ?? null };
  }), { timeout }).toEqual({ activity: 'idle', pending: 0, incoming: 0, downloads: 0, problem: null });
}

/** A spot's field as this copy has it */
export function spotField(copy: Copy, spotId: string, field: string): Promise<unknown> {
  return copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? [])
      for (const s of d.samples ?? [])
        for (const m of s.micrographs ?? [])
          for (const sp of m.spots ?? []) if (sp.id === ${JSON.stringify(spotId)}) return sp[${JSON.stringify(field)}] ?? null;
    return undefined;
  `) as (e: NonNullable<Window['__e2e']>) => unknown);
}

/** The header sync chip (its text follows the state: 'Synced', 'Manual · 2 to sync', ...) */
export function syncChip(copy: Copy) {
  return copy.page.getByTestId('sync-chip');
}

/** Sync chip > Sync Now */
export async function syncNow(copy: Copy): Promise<void> {
  await syncChip(copy).click();
  await copy.caption('Sync Now');
  await copy.page.getByRole('button', { name: 'Sync Now' }).click();
}

/** Sync chip > 'Sync automatically' or 'Sync when I click' */
export async function setMode(copy: Copy, mode: 'Sync automatically' | 'Sync when I click'): Promise<void> {
  await syncChip(copy).click();
  await copy.caption(`switches to '${mode}'`);
  await copy.page.getByRole('presentation').getByText(mode, { exact: true }).click();
  await expect.poll(() => copy.state((e) => e.sync.getState().mode)).toBe(mode === 'Sync automatically' ? 'automatic' : 'manual');
  await copy.page.keyboard.press('Escape');
}

/**
 * Take this copy off the network (or back): its main process cannot reach
 * the server, the way a laptop without Wi-Fi cannot. The sync client reads
 * the global fetch on every call.
 */
export async function setOffline(copy: Copy, offline: boolean): Promise<void> {
  await copy.caption(offline ? 'goes offline' : 'comes back online');
  await copy.app.evaluate((_electron, [offline, server]) => {
    const g = globalThis as unknown as { __e2eFetch?: typeof fetch; fetch: typeof fetch };
    if (!g.__e2eFetch) g.__e2eFetch = g.fetch;
    const real = g.__e2eFetch;
    g.fetch = offline
      ? (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith(server)) throw new TypeError('fetch failed');
        return real(input, init);
      }) as typeof fetch
      : real;
  }, [offline, SERVER_URL] as const);
}

/** The notice 'N sync changes need your decision' > Review: the decisions dialog */
export async function reviewDecisions(copy: Copy) {
  const notice = copy.page.getByText(/sync (change needs|changes need) your decision/);
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await copy.caption('reviews the decisions');
  await copy.page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'Sync needs your decision' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Change a spot the way the spot editor does (store action updateSpotData) */
export async function editSpot(copy: Copy, spotId: string, updates: Record<string, unknown>): Promise<void> {
  await copy.caption(`edits a spot: ${JSON.stringify(updates)}`);
  await copy.state(new Function('e', `e.app.getState().updateSpotData(${JSON.stringify(spotId)}, ${JSON.stringify(updates)})`) as never);
}

/** Delete a spot the way the spot menu does (store action deleteSpot) */
export async function deleteSpot(copy: Copy, spotId: string): Promise<void> {
  await copy.caption('deletes a spot');
  await copy.state(new Function('e', `e.app.getState().deleteSpot(${JSON.stringify(spotId)})`) as never);
}

/**
 * The usual start: the owner opens the project and syncs it, invites the
 * member with a role, the member accepts from the header chip; both settled.
 */
export async function share(owner: Copy, member: Copy, smzPath: string, projectId: string, projectName: string,
  role: 'Editor' | 'Contributor' | 'Viewer' = 'Editor'): Promise<void> {
  await openSmz(owner, smzPath, projectId);
  await turnOnSync(owner);
  await invite(owner, member.account.email, role);
  await acceptInvitationFromChip(member, projectName);
  await waitSettled(owner);
  await waitSettled(member);
}

/** The tree's + button on a row (dataset, sample or micrograph) by its name */
function treeAddButton(copy: Copy, rowName: string) {
  return copy.page.getByText(rowName, { exact: true }).locator('xpath=..').locator('button:has([data-testid="AddIcon"])');
}

/**
 * Sample + > Add New Reference Micrograph, through all eight steps of the
 * New Reference Micrograph dialog (Optical Microscopy, Plane Polarized
 * Light, unoriented, scale by Pixel Conversion Factor). Returns its id.
 */
export async function addReferenceMicrograph(copy: Copy, sampleName: string, imagePath: string, name: string): Promise<string> {
  const before = await copy.state((e) => {
    const ids: string[] = [];
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? []) for (const m of s.micrographs ?? []) ids.push(m.id);
    return ids;
  });
  await copy.caption(`adds micrograph '${name}' to ${sampleName}`);
  await treeAddButton(copy, sampleName).click();
  await copy.page.getByRole('menuitem', { name: 'Add New Reference Micrograph' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'New Reference Micrograph' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await copy.page.getByRole('option', { name: option, exact: true }).click();
  };

  await copy.answerDialog({ kind: 'open', filePaths: [imagePath] });
  await dialog.getByRole('button', { name: 'Browse...' }).click();
  await next.click(); // 1 Load Reference Micrograph
  await next.click(); // 2 Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // 3 Instrument & Image Information
  await next.click(); // 4 Instrument Data
  await dialog.getByLabel(/^Name/).fill(name);
  await next.click(); // 5 Micrograph Metadata
  await next.click(); // 6 Micrograph Orientation (unoriented)
  await dialog.getByText('Pixel Conversion Factor', { exact: true }).click();
  await next.click(); // 7 Set Micrograph Scale
  await dialog.getByLabel(/^Number of Pixels/).fill('1000');
  await dialog.getByLabel(/^Physical Length/).fill('1');
  await copy.caption('Finish');
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  let id = '';
  await expect.poll(async () => {
    const all = await copy.state((e) => {
      const out: Array<{ id: string; name: string }> = [];
      for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? []) for (const m of s.micrographs ?? []) out.push({ id: m.id, name: m.name ?? '' });
      return out;
    });
    id = all.find((m) => !before.includes(m.id) && m.name === name)?.id ?? '';
    return id;
  }, { timeout: 30_000 }).not.toBe('');
  return id;
}

/** Select a micrograph in the tree by name; wait until the viewer shows its image */
export async function viewMicrograph(copy: Copy, micrographId: string): Promise<void> {
  await copy.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(micrographId)})`) as never);
  await expect(copy.page.getByText('No micrograph loaded')).toHaveCount(0);
  await expect(copy.page.getByText('Loading image...')).toHaveCount(0, { timeout: 60_000 });
  expect(copy.consoleErrors.filter((l) => /Failed to load image|load-tiles|ENOENT/.test(l))).toEqual([]);
}

/** A micrograph as this copy has it (null when missing) */
export function micrograph(copy: Copy, micrographId: string): Promise<{ name: string; imagePath: string | null } | null> {
  return copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? [])
      for (const s of d.samples ?? [])
        for (const m of s.micrographs ?? []) if (m.id === ${JSON.stringify(micrographId)}) return { name: m.name ?? '', imagePath: m.imagePath ?? null };
    return null;
  `) as (e: NonNullable<Window['__e2e']>) => { name: string; imagePath: string | null } | null);
}
