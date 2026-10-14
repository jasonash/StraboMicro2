/**
 * Save Custom User Data as .xlsx or .csv (the template, which carries the
 * current values): Tools > Custom User Data... and the micrograph's table.
 */

import type { ProjectMetadata } from '@/types/project-types';
import { instructionLines, templateTable } from '@/utils/customUserData';

export type CustomUserDataFormat = 'xlsx' | 'csv';

export type DownloadResult =
  | { status: 'saved'; filePath: string; rows: number }
  | { status: 'canceled' }
  | { status: 'failed'; error: string };

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Custom User Data';
}

/** Ask where to save, then write the whole project's (or one micrograph's) table */
export async function downloadCustomUserData(project: ProjectMetadata, micrographId: string | null,
  format: CustomUserDataFormat): Promise<DownloadResult> {
  const table = templateTable(project, micrographId);
  let micrographName = '';
  if (micrographId) {
    for (const d of project.datasets ?? []) for (const s of d.samples ?? []) {
      const m = s.micrographs?.find((x) => x.id === micrographId);
      if (m) micrographName = m.name || '';
    }
  }
  const base = micrographName ? `${project.name} - ${micrographName} - Custom User Data` : `${project.name} - Custom User Data`;
  const result = await window.api?.customUserData.save({ ...table, instructions: instructionLines() }, safeFileName(base), format);
  if (!result) return { status: 'failed', error: 'not available' };
  if (result.success && result.filePath) return { status: 'saved', filePath: result.filePath, rows: table.rows.length };
  if (result.canceled) return { status: 'canceled' };
  return { status: 'failed', error: result.error ?? 'unknown error' };
}
