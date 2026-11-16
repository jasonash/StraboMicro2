/**
 * Micrographs whose image file is missing from this computer's project
 * folder, as a warning before the project leaves it (Export as .smz, Turn On
 * Sync). Both used to leave such images out without a word, so a copy that
 * had lost its images passed that on (Sentry ELECTRON-39, 2026-11-16). The
 * warning never refuses: the user may know the images are gone for good.
 * The list itself comes from the main process (electron/missingImages.js).
 */

/** A micrograph to check: its id (the image file's name) and its name */
export interface MicrographRef {
  id: string;
  name: string;
}

/** How many names the warning lists before "and N more" */
export const MISSING_IMAGES_LIST_LIMIT = 5;

/** Every micrograph of a project, in tree order */
export function micrographRefs(project: {
  datasets?: Array<{ samples?: Array<{ micrographs?: Array<{ id: string; name?: string | null }> | null }> | null }> | null;
} | null | undefined): MicrographRef[] {
  const out: MicrographRef[] = [];
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset?.samples ?? []) {
      for (const micrograph of sample?.micrographs ?? []) {
        if (micrograph && typeof micrograph.id === 'string' && micrograph.id !== '') {
          out.push({ id: micrograph.id, name: micrograph.name?.trim() || 'Unnamed micrograph' });
        }
      }
    }
  }
  return out;
}

export interface MissingImagesWarning {
  title: string;
  /** Names of the first MISSING_IMAGES_LIST_LIMIT micrographs */
  lines: string[];
  /** "and 3 more", or null */
  more: string | null;
  /** What going ahead means for them */
  note: string;
}

/** The warning, or null when every micrograph has its image */
export function missingImagesWarning(missing: MicrographRef[], purpose: 'export' | 'sync'): MissingImagesWarning | null {
  const n = missing.length;
  if (n === 0) return null;
  const shown = missing.slice(0, MISSING_IMAGES_LIST_LIMIT);
  const those = n === 1 ? 'that micrograph' : 'those micrographs';
  return {
    title: n === 1
      ? '1 micrograph has no image file on this computer'
      : `${n} micrographs have no image file on this computer`,
    lines: shown.map((m) => m.name),
    more: n > shown.length ? `and ${n - shown.length} more` : null,
    note: purpose === 'export'
      ? `The .smz file will not have ${n === 1 ? 'its image' : 'their images'}, so whoever opens it gets ${those} `
        + `without an image. If another copy of this project still has ${n === 1 ? 'the image' : 'the images'}, `
        + `export from that copy instead.`
      : `StraboSpot gets ${those} without an image. If another copy of this project still has `
        + `${n === 1 ? 'the image' : 'the images'}, sync that copy instead.`,
  };
}
