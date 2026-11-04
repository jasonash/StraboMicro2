/**
 * Sync API client (/microsync/v1 on the StraboSpot server)
 *
 * Thin wrapper over fetch: JSON in and out, bearer token, resumable chunked
 * uploads. Expected answers (2xx and 4xx) come back as { status, data }; the
 * caller decides what a 409 means. Conditions that stop syncing for now
 * throw a SyncError with a kind:
 *   offline     - no connection (network error)
 *   auth        - no token, or the server rejected it (401)
 *   disabled    - sync is switched off on the server (503 sync_disabled)
 *   old_server  - the server has no sync API (404 on ping)
 *   server      - any other 5xx
 *   access_removed - I was removed from the project or left it (403
 *                 access_removed, or access_changed when this push was
 *                 parked for the owner); data: left, removedBy, parked, project.
 *                 Also when the owner deleted the project from StraboSpot
 *                 (410 project_deleted, 17ac): this copy stops and becomes
 *                 separate the same way; data: error 'project_deleted', byMe,
 *                 deletedBy, deletedAt, restorableUntil, project
 */

const fs = require('fs');
const crypto = require('crypto');

class SyncError extends Error {
  /**
   * @param {'offline' | 'auth' | 'disabled' | 'old_server' | 'server' | 'access_removed'} kind
   * @param {string} message
   * @param {{ status?: number, data?: unknown, notSent?: boolean }} [details]
   *   notSent: offline, and the request never left this computer (no network,
   *   no such host, connection refused), so the server cannot have it
   */
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
    this.status = details.status;
    this.data = details.data;
    this.notSent = details.notSent === true;
  }
}

/** Network errors raised before a request is on its way */
const NOT_SENT_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT',
]);

/** fetch's error (TypeError 'fetch failed' with the cause): was nothing sent? */
function neverSent(err) {
  const cause = err && err.cause;
  const code = cause && (cause.code || (cause.errors && cause.errors[0] && cause.errors[0].code));
  return typeof code === 'string' && NOT_SENT_CODES.has(code);
}

/** SHA-256 of a file, streamed. */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * How long a connection may stay silent (spec v3 §11.2; found in the gap 4
 * test 2026-10-05: with the network gone mid-download nothing failed for
 * minutes, until the network came back). answerMs: for the answer to begin,
 * plus the request body at minBytesPerSecond; stallMs: between pieces of an
 * answer. Either one turns into 'offline', which the callers retry.
 */
const TIMEOUTS = { answerMs: 60_000, stallMs: 30_000, minBytesPerSecond: 50 * 1024 };

/** An AbortSignal that fires unless fed again within the time given */
function watchdog(ms) {
  const ctrl = new AbortController();
  let timer = null;
  let limit = ms;
  let fired = false;
  const feed = (next) => {
    limit = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      ctrl.abort(new Error(`nothing for ${Math.round(limit / 1000)} s`));
    }, next);
  };
  feed(ms);
  return {
    signal: ctrl.signal,
    feed,
    stop: () => { if (timer) clearTimeout(timer); timer = null; },
    fired: () => fired,
    why: () => `nothing for ${Math.round(limit / 1000)} s`,
  };
}

/**
 * getAccessToken returns null when nobody is logged in (or may throw a
 * SyncError, e.g. offline). refreshAccessToken, when given, is called once
 * after a 401 and the request is retried with the new token (spec v3 §11.2).
 * clientId, when given, goes with file ref changes as it goes with pushes,
 * so the server can tell this computer's ref changes from those of another
 * computer of the same account (without it, every copy of the account takes
 * them for its own and never pulls them).
 * @param {{ restServer: string, getAccessToken: () => Promise<string | null>,
 *   refreshAccessToken?: () => Promise<string | null>, fetchImpl?: typeof fetch,
 *   clientId?: string, timeouts?: Partial<typeof TIMEOUTS> }} options
 */
function createSyncClient({ restServer, getAccessToken, refreshAccessToken, fetchImpl = fetch, clientId, timeouts = {} }) {
  const base = `${String(restServer).replace(/\/+$/, '')}/microsync/v1`;
  const T = { ...TIMEOUTS, ...timeouts };

  /** How long the answer to a request carrying `bytes` may take to begin */
  const answerMs = (bytes) => T.answerMs + Math.ceil((bytes / T.minBytesPerSecond) * 1000);

  /** The body of an answer, aborted when no data comes for T.stallMs */
  async function readBody(res, dog) {
    if (!res.body) return Buffer.from(typeof res.text === 'function' ? await res.text() : ''); // test doubles
    const parts = [];
    dog.feed(T.stallMs);
    for await (const chunk of res.body) {
      dog.feed(T.stallMs);
      parts.push(Buffer.from(chunk));
    }
    return Buffer.concat(parts);
  }

  /**
   * @param {string} method
   * @param {string} path - Below /microsync/v1, starting with /
   * @param {{ json?: unknown, body?: Buffer, auth?: boolean }} [options]
   * @returns {Promise<{ status: number, data: any }>}
   */
  async function request(method, path, { json, body, auth = true } = {}, retried = false) {
    /** @type {Record<string, string>} */
    const headers = {};
    if (auth) {
      const token = retried && refreshAccessToken ? await refreshAccessToken() : await getAccessToken();
      if (!token) throw new SyncError('auth', 'Not logged in');
      headers.Authorization = `Bearer ${token}`;
    }
    let payload;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(json);
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/octet-stream';
      payload = body;
    }
    const dog = watchdog(answerMs(payload ? Buffer.byteLength(payload) : 0));
    let res;
    let text;
    try {
      try {
        res = await fetchImpl(base + path, { method, headers, body: payload, signal: dog.signal });
      } catch (err) {
        if (dog.fired()) throw new SyncError('offline', `No answer from the StraboSpot server (${dog.why()})`);
        throw new SyncError('offline', `Could not reach the StraboSpot server (${err.message})`, { notSent: neverSent(err) });
      }
      try {
        text = (await readBody(res, dog)).toString('utf8');
      } catch (err) {
        throw new SyncError('offline', dog.fired() ? `The answer from StraboSpot stopped (${dog.why()})` : `The answer from StraboSpot was cut off (${err.message})`);
      }
    } finally {
      dog.stop();
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }
    if (res.status === 401 && auth && !retried && refreshAccessToken) {
      return request(method, path, { json, body, auth }, true);
    }
    if (res.status === 401) throw new SyncError('auth', 'The server did not accept the login', { status: 401, data });
    if (res.status === 503 && data && data.error === 'sync_disabled') {
      throw new SyncError('disabled', 'Sync is not enabled on this server', { status: 503, data });
    }
    if (res.status >= 500) {
      throw new SyncError('server', `Server error ${res.status}${data && data.error ? ` (${data.error})` : ''}`, { status: res.status, data });
    }
    if (res.status === 403 && data && (data.error === 'access_removed' || data.error === 'access_changed')) {
      throw new SyncError('access_removed', data.message || 'You no longer have access to this project', { status: 403, data });
    }
    if (res.status === 410 && data && data.error === 'project_deleted') {
      throw new SyncError('access_removed', data.message || 'This project was deleted from StraboSpot', { status: 410, data });
    }
    return { status: res.status, data };
  }

  /** Throw unless the answer has one of the expected statuses. */
  function expect(result, ...statuses) {
    if (!statuses.includes(result.status)) {
      const reason = result.data && result.data.error ? result.data.error : JSON.stringify(result.data);
      throw new SyncError('server', `Unexpected answer ${result.status}: ${reason}`, result);
    }
    return result.data;
  }

  return {
    request,

    /** Sync API available? { ok, apiVersion }; throws old_server / disabled / offline. */
    async ping() {
      const r = await request('GET', '/ping', { auth: false });
      if (r.status === 404) throw new SyncError('old_server', 'This server has no sync support', r);
      return expect(r, 200);
    },

    /** Projects I own or am a member of; includeLegacy adds my not-yet-synced uploads. */
    async listProjects({ includeLegacy = false } = {}) {
      return expect(await request('GET', `/projects${includeLegacy ? '?includeLegacy=1' : ''}`), 200);
    },

    /** Create the server copy of a local project. 201 { pid, ... } or 409 { error: 'exists', pid, syncFormat, syncState }. */
    async createProject(straboId, name) {
      return request('POST', '/projects', { json: { straboId, name } });
    },

    async adopt(pid) {
      return expect(await request('POST', `/projects/${pid}/adopt`), 200, 201);
    },

    async cancelAdopt(pid) {
      return expect(await request('DELETE', `/projects/${pid}/adopt`), 200);
    },

    async ready(pid) {
      return expect(await request('POST', `/projects/${pid}/ready`), 200);
    },

    /**
     * Download a blob to destPath: streamed to a temporary file next to it,
     * checked against its SHA-256, then renamed into place (an existing file
     * is replaced only by a complete, verified one).
     * @param {number} pid
     * @param {string} sha256
     * @param {string} destPath
     * @param {{ onProgress?: (received: number, total: number) => void }} [options]
     * @returns {Promise<{ size: number }>}
     */
    async downloadFile(pid, sha256, destPath, { onProgress } = {}, retried = false) {
      const token = retried && refreshAccessToken ? await refreshAccessToken() : await getAccessToken();
      if (!token) throw new SyncError('auth', 'Not logged in');
      const dog = watchdog(T.answerMs);
      let res;
      try {
        res = await fetchImpl(`${base}/projects/${pid}/blobs/${sha256}`, { headers: { Authorization: `Bearer ${token}` }, signal: dog.signal });
      } catch (err) {
        dog.stop();
        if (dog.fired()) throw new SyncError('offline', `No answer from the StraboSpot server (${dog.why()})`);
        throw new SyncError('offline', `Could not reach the StraboSpot server (${err.message})`);
      }
      const done = () => dog.stop();
      if (res.status !== 200 || !res.body) {
        if (res.body) await res.body.cancel().catch(() => {});
        done();
      }
      if (res.status === 401 && !retried && refreshAccessToken) {
        return this.downloadFile(pid, sha256, destPath, { onProgress }, true);
      }
      if (res.status === 401) throw new SyncError('auth', 'The server did not accept the login', { status: 401 });
      if (res.status === 503) throw new SyncError('disabled', 'Sync is not enabled on this server', { status: 503 });
      if (res.status >= 500) throw new SyncError('server', `Server error ${res.status}`, { status: res.status });
      if (res.status !== 200 || !res.body) {
        throw new SyncError('server', `File ${sha256.slice(0, 12)} could not be downloaded (${res.status})`, { status: res.status });
      }
      const total = Number(res.headers.get('content-length')) || 0;
      const tmp = `${destPath}.download-${crypto.randomUUID()}`;
      await fs.promises.mkdir(require('path').dirname(destPath), { recursive: true });
      const hash = crypto.createHash('sha256');
      let received = 0;
      const out = fs.createWriteStream(tmp);
      try {
        dog.feed(T.stallMs);
        for await (const chunk of res.body) {
          dog.feed(T.stallMs);
          hash.update(chunk);
          received += chunk.length;
          if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
          if (onProgress) onProgress(received, total);
        }
        await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
        const got = hash.digest('hex');
        if (got !== sha256) throw new SyncError('server', `Downloaded file does not match (${got.slice(0, 12)} instead of ${sha256.slice(0, 12)})`);
        await require('../atomicFile').withRetry(() => fs.promises.rename(tmp, destPath));
      } catch (err) {
        out.destroy();
        await fs.promises.rm(tmp, { force: true });
        if (dog.fired()) throw new SyncError('offline', `Download stopped (${dog.why()})`);
        // File system errors (disk full, permissions) are not connection problems
        if (err instanceof SyncError || (err && typeof err.code === 'string' && err.code.startsWith('E'))) throw err;
        throw new SyncError('offline', `Download interrupted (${err.message})`);
      } finally {
        done();
      }
      return { size: received };
    },

    /** Every live entity (with version, normalized child order), blob and ref of a project. */
    async snapshot(pid) {
      return expect(await request('GET', `/projects/${pid}/snapshot`), 200);
    },

    async getProject(pid) {
      return expect(await request('GET', `/projects/${pid}`), 200);
    },

    /** { headSeq, results: [...] } */
    async push(pid, pushId, clientId, changes) {
      return expect(await request('POST', `/projects/${pid}/push`, { json: { pushId, clientId, changes } }), 200);
    },

    /**
     * Activity poll (spec v3 §6.3): changes others pushed since `since`, per user
     * (this client's own pushes left out), presence, parked pushes.
     * @returns {Promise<{ changed: false } | { changed: true, headSeq: number, pending: Array<{ user: { pkey: number, name?: string }, count: number }>, presence: object[], presenceHash: string, parkedCount: number }>}
     */
    async activity(pid, { since, clientId, viewing = null, state = 'active', presenceHash } = {}) {
      return expect(await request('POST', `/projects/${pid}/activity`, { json: { since, clientId, viewing, state, presenceHash } }), 200);
    },

    /** Members, my role and a pending transfer (Phase 2). */
    async members(pid) {
      return expect(await request('GET', `/projects/${pid}/members`), 200);
    },

    /** Invite by email (owner). 200/201, or a 4xx whose data.error says why (no_account, already_member, ...). */
    async invite(pid, email, role) {
      return request('POST', `/projects/${pid}/members`, { json: { email, role } });
    },

    async setMemberRole(pid, pkey, role) {
      return request('PATCH', `/projects/${pid}/members/${pkey}`, { json: { role } });
    },

    /** Delete the project from StraboSpot (owner, 17ac): kept 30 days, restorable from the website. */
    async deleteProject(pid) {
      return request('DELETE', `/projects/${pid}`);
    },

    /** Remove a member or withdraw an invitation (owner), or leave (my own pkey). */
    async removeMember(pid, pkey) {
      return request('DELETE', `/projects/${pid}/members/${pkey}`);
    },

    /** { invitations: [...], transfers: [...] } waiting for me */
    async invites() {
      return expect(await request('GET', '/invites'), 200);
    },

    async answerInvite(pid, accept) {
      return request('POST', `/invites/${pid}/${accept ? 'accept' : 'decline'}`);
    },

    /**
     * The activity panel's list (17v): newest first, no bookkeeping updates,
     * paged back with before (the seq of the last row); here = my own change
     * from this computer (clientId).
     * @returns {Promise<{ headSeq: number, more: boolean, changes: object[] }>}
     */
    async briefHistory(pid, { before = 0, limit = 200, clientId = '' } = {}) {
      const q = new URLSearchParams({ brief: '1', limit: String(limit), clientId });
      if (before > 0) q.set('before', String(before));
      return expect(await request('GET', `/projects/${pid}/history?${q}`), 200);
    },

    /** Parked pushes waiting for the owner's review (17o). */
    async parked(pid) {
      return expect(await request('GET', `/projects/${pid}/parked`), 200);
    },

    /** Record the owner's decisions on a parked push: { 'type:id': 'accepted' | 'discarded' }. */
    async reviewParked(pid, parkedId, decisions) {
      return expect(await request('POST', `/projects/${pid}/parked/${parkedId}/review`, { json: { decisions } }), 200);
    },

    async changes(pid, since, limit = 1000) {
      return expect(await request('GET', `/projects/${pid}/changes?since=${since}&limit=${limit}`), 200);
    },

    /**
     * Point an entity's file role at an uploaded file. { skipped: 'deleted' }
     * when the entity is not live on the server (deleted there, not pulled
     * yet); { skipped: 'forbidden' } when my role may not change it.
     */
    async setRef(pid, entityType, entityId, role, sha256) {
      const r = await request('PUT', `/projects/${pid}/refs`, { json: { entityType, entityId, role, sha256, ...(clientId ? { clientId } : {}) } });
      if (r.status === 404 && r.data && r.data.error === 'not_found') return { skipped: 'deleted' };
      if (r.status === 403 && r.data && r.data.error === 'forbidden') return { skipped: 'forbidden', reason: r.data.reason || '' };
      return expect(r, 200, 201);
    },

    async deleteRef(pid, entityType, entityId, role) {
      const q = `entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&role=${encodeURIComponent(role)}`
        + (clientId ? `&clientId=${encodeURIComponent(clientId)}` : '');
      const r = await request('DELETE', `/projects/${pid}/refs?${q}`);
      if (r.status === 403 && r.data && r.data.error === 'forbidden') return { skipped: 'forbidden' };
      return expect(r, 200, 404);
    },

    /**
     * Upload a file as a blob unless the server has it already. Resumes an
     * interrupted upload of the same file.
     * @param {number} pid
     * @param {string} filePath
     * @param {string} kind - image, thumbnail, tiles, tiles_affine, associated_file
     * @param {{ sha256?: string, onProgress?: (sent: number, total: number) => void }} [options]
     * @returns {Promise<{ sha256: string, size: number, uploaded: boolean }>}
     */
    async uploadFile(pid, filePath, kind, { sha256, onProgress } = {}) {
      const size = (await fs.promises.stat(filePath)).size;
      const sha = sha256 || await hashFile(filePath);
      const begin = await request('POST', `/projects/${pid}/uploads`, { json: { sha256: sha, size, kind } });
      // My role may not upload files (a Viewer): nothing sent, the caller skips it
      if (begin.status === 403 && begin.data && begin.data.error === 'forbidden') return { sha256: sha, size, uploaded: false, skipped: 'forbidden' };
      const start = expect(begin, 200, 201);
      if (start.complete) return { sha256: sha, size, uploaded: false };
      const chunkSize = Number(start.chunkSize);
      if (!start.uploadId || !(chunkSize > 0)) throw new SyncError('server', 'Upload could not start', { data: start });
      const handle = await fs.promises.open(filePath, 'r');
      try {
        let offset = Number(start.received) || 0;
        while (offset < size) {
          const length = Math.min(chunkSize, size - offset);
          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, offset);
          const r = await request('PUT', `/projects/${pid}/uploads/${start.uploadId}?offset=${offset}`, { body: buffer });
          if (r.status === 409 && r.data && Number.isFinite(Number(r.data.received))) {
            offset = Number(r.data.received); // the server has a different amount: continue from there
            continue;
          }
          expect(r, 200);
          offset += length;
          if (onProgress) onProgress(offset, size);
        }
      } finally {
        await handle.close();
      }
      const done = expect(await request('POST', `/projects/${pid}/uploads/${start.uploadId}/complete`), 200, 201);
      if (!done.complete) throw new SyncError('server', 'Upload did not complete', { data: done });
      return { sha256: sha, size, uploaded: true };
    },
  };
}

module.exports = { createSyncClient, SyncError, hashFile, TIMEOUTS };
