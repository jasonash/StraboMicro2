/**
 * How an account is named in short UI text (spec v3 16az, 16ba), shared by
 * the main process (Recent Projects labels) and the renderer (dialogs).
 */

/**
 * The first word of the account's name ("Jason" for "Jason Ash"), else the email.
 * @param {string | null | undefined} name
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function firstName(name, email) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first || String(email ?? '').trim() || 'another account';
}

/**
 * Label of a copy that belongs to this account: "Jason's copy".
 * @param {string | null | undefined} name
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function copyLabel(name, email) {
  return `${firstName(name, email)}'s copy`;
}
