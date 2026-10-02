/**
 * Wording for collaboration roles (spec v3 §3.1), shared by the
 * Collaborators dialog and the invitation lists.
 */

export const ROLE_LABEL: Record<SyncRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  contributor: 'Contributor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<SyncRole, string> = {
  owner: 'Manages the project and its collaborators.',
  editor: 'Can add, change, and delete anything in the project.',
  contributor: 'Can add anything, and change or delete what they added.',
  viewer: 'Can see everything, but cannot change anything.',
};

/** The same, said to the person who has the role */
export const ROLE_FOR_ME: Record<SyncRole, string> = {
  owner: 'You manage the project and its collaborators.',
  editor: 'You can add, change, and delete anything in the project.',
  contributor: 'You can add anything, and change or delete what you added.',
  viewer: 'You can see everything, but cannot change anything.',
};

/** Roles the owner can give (the owner role moves only through a transfer) */
export const ASSIGNABLE_ROLES: SyncRole[] = ['editor', 'contributor', 'viewer'];

export function roleLabel(role: string): string {
  return role in ROLE_LABEL ? ROLE_LABEL[role as SyncRole] : role;
}

/** "an Editor", "a Viewer" */
export function withArticle(role: string): string {
  const label = roleLabel(role);
  return `${/^[AEIOU]/.test(label) ? 'an' : 'a'} ${label}`;
}
