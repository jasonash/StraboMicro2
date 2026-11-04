/**
 * Before every run: the e2e accounts exist with the known password (a dev
 * database restored from a backup loses them; seed.sql recreates them),
 * the server answers a real login, and nothing is left from earlier runs
 * (client_fixture.php wipe-e2e: projects, invitations, memberships).
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ACCOUNTS, PASSWORD, SERVER } from './lib/copy';

function fail(message: string): never {
  throw new Error(`\n\nE2E setup: ${message}\n`);
}

export default async function globalSetup(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'));
  try {
    execFileSync('docker', ['exec', '-i', 'strabo-postgres', 'psql', '-U', 'strabodbuser', '-d', 'strabospot', '-tAq', '-v', 'ON_ERROR_STOP=1'],
      { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    fail(`could not seed the e2e accounts (is the dev Docker stack running?)\n${String((err as Error).message).slice(0, 500)}`);
  }

  for (const a of Object.values(ACCOUNTS)) {
    const r = await fetch(`${SERVER}/jwtauth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, password: PASSWORD }),
    }).catch((err: Error) => fail(`${SERVER} does not answer: ${err.message}`));
    if (!r.ok) fail(`${a.email} cannot log in on ${SERVER} (HTTP ${r.status})`);
  }

  try {
    const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/client_fixture.php', 'wipe-e2e']).toString();
    const r = JSON.parse(out) as { removed: number; left: number };
    if (r.left !== 0) fail(`wipe-e2e left ${r.left} projects`);
  } catch (err) {
    fail(`could not wipe earlier e2e projects (server branch with client_fixture.php wipe-e2e?)\n${String((err as Error).message).slice(0, 500)}`);
  }
}
