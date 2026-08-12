/**
 * Shared helpers for the .smz import flows.
 *
 * Three dialogs import .smz archives (ImportSmzDialog, RemoteProjectsDialog,
 * DeepLinkOpenDialog) and need identical semantics around two edge cases:
 * unloading the currently open project before a replace-import, and
 * deduplicating imported presets against global presets. These live here so
 * the flows cannot drift apart.
 */

import { useAppStore } from '../store/useAppStore';

/**
 * If the project about to be replaced by an import is the one currently open,
 * unload it first so the viewer doesn't keep reading image files while the
 * import deletes and rewrites them (the OneDrive replace-import incident).
 * The caller has already confirmed the local data will be replaced, so there
 * is nothing worth saving.
 *
 * @param incomingProjectId - Project id from the archive inspection
 * @returns true if the open project was unloaded
 */
export function unloadIfReplacingOpenProject(
  incomingProjectId: string | null | undefined
): boolean {
  if (!incomingProjectId) {
    return false;
  }

  const { project, closeProject } = useAppStore.getState();
  if (project?.id === incomingProjectId) {
    console.log('[ImportUtils] Unloading currently open project before replace-import');
    closeProject();
    return true;
  }

  return false;
}

interface HasPresets {
  presets?: Array<{ id: string }>;
}

/**
 * Deduplicate imported project presets against the user's global presets.
 * A project exported with global presets bundled would otherwise re-import
 * them as duplicates. Returns the (possibly unchanged) project data.
 */
export function dedupeImportedPresets<T extends HasPresets>(
  projectData: T,
  globalPresets: Array<{ id: string }>
): T {
  if (!projectData.presets || projectData.presets.length === 0 || globalPresets.length === 0) {
    return projectData;
  }

  const globalPresetIds = new Set(globalPresets.map((p) => p.id));
  const dedupedPresets = projectData.presets.filter((p) => !globalPresetIds.has(p.id));

  if (dedupedPresets.length === projectData.presets.length) {
    return projectData;
  }

  const removedCount = projectData.presets.length - dedupedPresets.length;
  console.log(
    `[ImportUtils] Removed ${removedCount} preset(s) that already exist in global presets`
  );

  return {
    ...projectData,
    presets: dedupedPresets.length > 0 ? dedupedPresets : undefined,
  };
}
