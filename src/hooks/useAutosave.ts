/**
 * Autosave Hook
 *
 * Monitors the isDirty state and triggers autosave after 5 minutes of inactivity.
 * Also provides functions for save-on-switch and save-on-close scenarios.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store';

// Autosave interval in milliseconds (5 minutes)
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export function useAutosave() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirty = useAppStore((state) => state.isDirty);
  const project = useAppStore((state) => state.project);

  /**
   * Perform the actual save operation
   */
  const performSave = useCallback(async (isAutoSave: boolean = false) => {
    const currentProject = useAppStore.getState().project;
    const currentIsDirty = useAppStore.getState().isDirty;

    if (!currentProject || !currentIsDirty) {
      return { success: true, skipped: true };
    }

    try {
      // Save project.json
      const result = await window.api?.saveProjectJson(currentProject, currentProject.id);

      if (result?.success) {
        console.log(`[Autosave] Project saved${isAutoSave ? ' (auto)' : ''}: ${result.path}`);

        // Create a version snapshot
        const versionResult = await window.api?.versionHistory?.create(
          currentProject.id,
          currentProject,
          null, // Auto-saves don't have names
          null
        );

        if (versionResult?.success) {
          console.log(`[Autosave] Version created: ${versionResult.version}`);
        }

        // Update project index and refresh menu
        await window.api?.projects?.updateOpened(currentProject.id, currentProject.name || 'Untitled Project');
        await window.api?.projects?.refreshMenu();

        // Mark as clean
        useAppStore.getState().markClean();

        return { success: true };
      } else {
        console.error('[Autosave] Save failed');
        return { success: false, error: 'Save failed' };
      }
    } catch (error) {
      console.error('[Autosave] Error during save:', error);
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Clear the autosave timer
   */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Start or restart the autosave timer
   */
  const startTimer = useCallback(() => {
    clearTimer();

    timerRef.current = setTimeout(async () => {
      console.log('[Autosave] Timer fired, performing autosave...');
      await performSave(true);
      timerRef.current = null;
    }, AUTOSAVE_INTERVAL_MS);

    console.log('[Autosave] Timer started (5 minutes)');
  }, [clearTimer, performSave]);

  /**
   * Effect: Monitor isDirty and manage timer
   */
  useEffect(() => {
    if (isDirty && project) {
      // Start timer when project becomes dirty
      if (!timerRef.current) {
        startTimer();
      }
    } else {
      // Clear timer when project is clean or no project
      clearTimer();
    }

    return () => {
      clearTimer();
    };
  }, [isDirty, project, startTimer, clearTimer]);

  /**
   * Save before switching projects (call this before loading a new project)
   */
  const saveBeforeSwitch = useCallback(async (): Promise<boolean> => {
    const currentIsDirty = useAppStore.getState().isDirty;
    const currentProject = useAppStore.getState().project;

    if (!currentIsDirty || !currentProject) {
      return true; // Nothing to save, proceed with switch
    }

    // Show confirmation dialog
    const shouldSave = window.confirm(
      'You have unsaved changes. Would you like to save before switching projects?'
    );

    if (shouldSave) {
      const result = await performSave(false);
      return result.success;
    }

    // User chose not to save - mark as clean so switch can proceed
    useAppStore.getState().markClean();
    return true;
  }, [performSave]);

  /**
   * Save before closing app (call this on app close/beforeunload)
   */
  const saveBeforeClose = useCallback(async (): Promise<boolean> => {
    const currentIsDirty = useAppStore.getState().isDirty;
    const currentProject = useAppStore.getState().project;

    if (!currentIsDirty || !currentProject) {
      return true; // Nothing to save
    }

    // Perform save automatically on close
    console.log('[Autosave] Saving before close...');
    const result = await performSave(false);
    return result.success;
  }, [performSave]);

  /**
   * Manual save (resets the timer)
   */
  const manualSave = useCallback(async () => {
    clearTimer();
    const result = await performSave(false);

    // If still dirty after save attempt (shouldn't happen), restart timer
    if (useAppStore.getState().isDirty) {
      startTimer();
    }

    return result;
  }, [clearTimer, performSave, startTimer]);

  return {
    performSave,
    saveBeforeSwitch,
    saveBeforeClose,
    manualSave,
    clearTimer,
  };
}
