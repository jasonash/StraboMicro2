/**
 * What the dev server recorded, read straight from its database: checks a
 * person cannot see in either copy (who uploaded what, and how often).
 */

import { execFileSync } from 'child_process';

function sql(query: string): string {
  return execFileSync('docker', ['exec', 'strabo-postgres', 'psql', '-U', 'strabodbuser', '-d', 'strabospot', '-tAq', '-c', query]).toString().trim();
}

/** Server project number of a project id (straboId), or null */
export function serverPid(projectId: string): number | null {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error(`Not a project id: ${projectId}`);
  const out = sql(`SELECT id FROM strabomicro.micro_projectmetadata WHERE strabo_id = '${projectId}'`);
  return out ? Number(out) : null;
}

/** Each logged change of a file ref of the project: role and who, oldest first */
export function refChanges(projectId: string): Array<{ role: string; entity: string; email: string }> {
  const pid = serverPid(projectId);
  if (pid === null) return [];
  const out = sql(`SELECT c.changed_paths::text, c.entity_id, u.email FROM strabomicro.micro_changes c JOIN users u ON u.pkey = c.user_pkey
    WHERE c.project_id = ${pid} AND c.changed_paths::text LIKE '%refs.%' ORDER BY c.seq`);
  return out ? out.split('\n').flatMap((line) => {
    const [paths, entity, email] = line.split('|');
    return paths.replace(/[{}]/g, '').split(',').filter((p) => p.startsWith('refs.')).map((p) => ({ role: p.slice(5), entity, email }));
  }) : [];
}

/** A field of an entity as the server last recorded it (its newest change), or null */
export function serverField(projectId: string, type: string, entityId: string, field: string): string | null {
  const pid = serverPid(projectId);
  if (pid === null || !/^[a-z]+$/.test(type) || !/^[0-9a-f-]{36}$/i.test(entityId) || !/^\w+$/.test(field)) return null;
  const out = sql(`SELECT after->'body'->>'${field}' FROM strabomicro.micro_changes
    WHERE project_id = ${pid} AND entity_type = '${type}' AND entity_id = '${entityId}' ORDER BY seq DESC LIMIT 1`);
  return out || null;
}

/** How many changes the server recorded for an entity with this op */
export function changeCount(projectId: string, type: string, entityId: string, op: string): number {
  const pid = serverPid(projectId);
  if (pid === null || !/^[a-z_]+$/.test(type + op) || !/^[0-9a-f-]{36}$/i.test(entityId)) return 0;
  return Number(sql(`SELECT count(*) FROM strabomicro.micro_changes
    WHERE project_id = ${pid} AND entity_type = '${type}' AND entity_id = '${entityId}' AND op = '${op}'`));
}
