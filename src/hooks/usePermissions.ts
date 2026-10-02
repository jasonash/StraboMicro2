/**
 * The open project's role checks for screens (collaboration 17h, 17i):
 * usePermissions() for the current rules, useCanEdit(type, id) for one
 * existing entity, useCanCreate() for adding. currentPermissions() reads the
 * same outside React (the store's change guard, App.tsx).
 */

import { useSyncStore } from '@/store/useSyncStore';
import { canCreate, canEditEntity, creatorOf, type Permissions } from '@/utils/permissions';

function fromStore(s: ReturnType<typeof useSyncStore.getState>): Permissions {
  return { role: s.synced ? s.role : null, me: s.pkey !== null ? Number(s.pkey) : null, authors: s.authors };
}

export function currentPermissions(): Permissions {
  return fromStore(useSyncStore.getState());
}

export function usePermissions(): Permissions {
  const role = useSyncStore((s) => (s.synced ? s.role : null));
  const pkey = useSyncStore((s) => s.pkey);
  const authors = useSyncStore((s) => s.authors);
  return { role, me: pkey !== null ? Number(pkey) : null, authors };
}

/** Can I change or delete this existing entity (true for null: nothing to check) */
export function useCanEdit(type: string | null, id: string | null | undefined): boolean {
  const p = usePermissions();
  return !type || !id ? p.role !== 'viewer' : canEditEntity(p, type, id);
}

export function useCanCreate(): boolean {
  return canCreate(usePermissions());
}

/** Who created this entity when it was someone else (pkey), else null */
export function useCreator(type: string | null, id: string | null | undefined): number | null {
  const p = usePermissions();
  return !type || !id ? null : creatorOf(p, type, id);
}

/**
 * Why this entity is view only here, as shown to the user, or null when it
 * can be changed. type 'project' means the project settings.
 */
export function useReadOnlyReason(type: string | null, id: string | null | undefined): string | null {
  const p = usePermissions();
  const names = useSyncStore((s) => s.memberNames);
  if (p.role === 'viewer') return "View only. You're a Viewer on this project.";
  if (p.role !== 'contributor' || !type || !id) return null;
  if (type === 'project') return 'View only. Only the owner or an Editor can change the project settings.';
  const creator = creatorOf(p, type, id);
  if (creator === null) return null;
  return `View only. Added by ${names[creator] || 'another collaborator'}; only they or an Editor can change it.`;
}

