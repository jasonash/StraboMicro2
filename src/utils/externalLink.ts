/**
 * Which links in project data the app opens outside itself. A link's address
 * is text anyone on a shared project can write, and the operating system runs
 * whatever handles its scheme (file:, smb:, custom app schemes), so only web
 * addresses become clickable; the Add Link form takes the same three schemes.
 * Main has its own check for every link it opens (open-external-link).
 * Pure function (npm run test:external-link).
 */

const WEB_SCHEMES = new Set(['http:', 'https:', 'ftp:']);

/** True for an http, https or ftp address */
export function isWebLink(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return WEB_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
