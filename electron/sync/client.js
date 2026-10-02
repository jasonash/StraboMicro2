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
 */

const fs = require('fs');
const crypto = require('crypto');

class SyncError extends Error {
  /**
   * @param {'offline' | 'auth' | 'disabled' | 'old_server' | 'server'} kind
   * @param {string} message
   * @param {{ status?: number, data?: unknown }} [details]
   */
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
    this.status = details.status;
    this.data = details.data;
  }
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
 * getAccessToken returns null when nobody is logged in (or may throw a
 * SyncError, e.g. offline). refreshAccessToken, when given, is called once
 * after a 401 and the request is retried with the new token (spec v3 §11.2).
 * @param {{ restServer: string, getAccessToken: () => Promise<string | null>,
 *   refreshAccessToken?: () => Promise<string | null>, fetchImpl?: typeof fetch }} options
 */
function createSyncClient({ restServer, getAccessToken, refreshAccessToken, fetchImpl = fetch }) {
  const base = `${String(restServer).replace(/\/+$/, '')}/microsync/v1`;

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
    let res;
    try {
      res = await fetchImpl(base + path, { method, headers, body: payload });
    } catch (err) {
      throw new SyncError('offline', `Could not reach the StraboSpot server (${err.message})`);
    }
    const text = await res.text();
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
      let res;
      try {
        res = await fetchImpl(`${base}/projects/${pid}/blobs/${sha256}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) {
        throw new SyncError('offline', `Could not reach the StraboSpot server (${err.message})`);
      }
      if (res.status === 401 && !retried && refreshAccessToken) {
        if (res.body) await res.body.cancel().catch(() => {});
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
        for await (const chunk of res.body) {
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
        // File system errors (disk full, permissions) are not connection problems
        if (err instanceof SyncError || (err && typeof err.code === 'string' && err.code.startsWith('E'))) throw err;
        throw new SyncError('offline', `Download interrupted (${err.message})`);
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

    async changes(pid, since, limit = 1000) {
      return expect(await request('GET', `/projects/${pid}/changes?since=${since}&limit=${limit}`), 200);
    },

    async setRef(pid, entityType, entityId, role, sha256) {
      return expect(await request('PUT', `/projects/${pid}/refs`, { json: { entityType, entityId, role, sha256 } }), 200, 201);
    },

    async deleteRef(pid, entityType, entityId, role) {
      const q = `entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&role=${encodeURIComponent(role)}`;
      return expect(await request('DELETE', `/projects/${pid}/refs?${q}`), 200, 404);
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
      const start = expect(await request('POST', `/projects/${pid}/uploads`, { json: { sha256: sha, size, kind } }), 200, 201);
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

module.exports = { createSyncClient, SyncError, hashFile };
