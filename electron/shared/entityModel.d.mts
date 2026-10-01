/** Types for entityModel.mjs (sync entity model shared by main and renderer). */

export type EntityType =
  | 'project' | 'dataset' | 'sample' | 'micrograph' | 'spot'
  | 'tag' | 'group' | 'preset' | 'point_count';

export interface EntityState {
  type: EntityType;
  id: string;
  parentType: EntityType | null;
  parentId: string | null;
  /** Entity JSON without child collections or per-user fields */
  body: Record<string, unknown>;
  /** Child ids per collection (types with children only) */
  childOrder?: Record<string, string[]>;
}

export const PARENT: Readonly<Record<EntityType, EntityType | null>>;
export const CHILD_KEYS: Readonly<Record<EntityType, Readonly<Record<string, EntityType>>>>;

export function perUserFields(type: EntityType): readonly string[];
export function entityKey(type: EntityType, id: string): string;
export function isEntityId(id: unknown): id is string;

export class ExplodeError extends Error {
  reason: 'bad_json' | 'bad_id' | 'duplicate_differs';
  details: Record<string, unknown>;
  constructor(reason: ExplodeError['reason'], message: string, details?: Record<string, unknown>);
}

export function normalizeProject(project: unknown): { project: Record<string, unknown>; duplicatesCollapsed: number };

export function explode(
  project: unknown,
  pointCounts?: unknown[]
): { entities: Record<string, EntityState>; order: string[]; duplicatesCollapsed: number };

export function normalizeChildOrder(
  type: EntityType,
  stored: Record<string, string[]> | undefined,
  liveByType: Partial<Record<EntityType, string[]>>
): Record<string, string[]>;

export function collectPerUserFields(project: unknown): Map<string, Record<string, unknown>>;

export function assemble(
  entities: Record<string, EntityState>,
  projectId: string,
  options?: { order?: string[]; perUser?: Map<string, Record<string, unknown>> }
): { project: Record<string, unknown>; pointCounts: Record<string, unknown>[] } | null;
