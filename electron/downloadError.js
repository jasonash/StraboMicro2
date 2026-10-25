/**
 * Plain messages for failed model downloads (FastSAM, Grain Spot).
 *
 * The raw errors say little: node-fetch gives "request to ... failed, reason: "
 * with an empty reason when a connection times out (Sentry ELECTRON-2Z, a user
 * in China, where huggingface.co is blocked), Node's own fetch gives "fetch
 * failed". So the message comes from WHERE the download stopped, not from the
 * error codes: could not connect, dropped partway, or the server said no. The
 * raw error stays on the returned error as `cause`, and `detail` spells out
 * the error chain for the log.
 *
 * @module downloadError
 */

/** "fetch failed <- connect ETIMEDOUT 18.1.2.3:443", following causes and AggregateError lists */
function errorDetail(error) {
  const parts = [];
  const seen = new Set();
  const walk = (e) => {
    if (!e || seen.has(e) || parts.length > 8) return;
    seen.add(e);
    if (e instanceof Error) {
      const code = e.code && !String(e.message).includes(e.code) ? `${e.code} ` : '';
      parts.push(`${code}${e.message || e.name}`.trim());
      if (Array.isArray(e.errors)) e.errors.forEach(walk);
      walk(e.cause);
    } else {
      parts.push(String(e));
    }
  };
  walk(error);
  return parts.join(' <- ');
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'the download server';
  }
}

/**
 * An Error with a plain message for a download that stopped.
 * @param {'connect'|'transfer'|'http'} stage - connect: the request never got an answer;
 *   transfer: the answer started and then the connection dropped; http: the server answered with an error status
 * @param {string} url - what was being downloaded
 * @param {{ cause?: unknown, status?: number }} [info]
 */
function downloadFailure(stage, url, { cause, status } = {}) {
  const host = hostOf(url);
  let message;
  if (stage === 'connect') {
    message = `Could not reach ${host}, where the model is downloaded from. Check the internet connection. Some networks and countries block ${host}; on those the download cannot work.`;
  } else if (stage === 'transfer') {
    message = `The connection to ${host} dropped partway through the download. Try again; a slow or unstable connection can cause this.`;
  } else {
    message = `${host} could not provide the model right now (HTTP ${status ?? 'error'}). Try again later.`;
  }
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.isDownloadFailure = true;
  error.detail = cause === undefined ? `HTTP ${status}` : errorDetail(cause);
  return error;
}

module.exports = { downloadFailure, errorDetail };
