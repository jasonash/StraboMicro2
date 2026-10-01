/**
 * Project Sync Hook
 *
 * When a project opens, asks main whether it is synced; only then loads and
 * starts the sync controller (src/services/syncController.ts). A local-only
 * project costs one status call per open and nothing else (spec v3 §3.4).
 * Closing or switching the project stops the controller.
 */

import { useEffect } from 'react';
import { useAppStore } from '@/store';

export function useProjectSync(): void {
  const projectId = useAppStore((state) => state.project?.id ?? null);

  useEffect(() => {
    if (!projectId || !window.api?.sync) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    void (async () => {
      try {
        const status = await window.api?.sync.status(projectId);
        if (cancelled || !status?.synced) return;
        const { startProjectSync } = await import('@/services/syncController');
        if (cancelled) return;
        stop = startProjectSync(projectId, status);
      } catch (error) {
        console.error('[Sync] Could not start syncing the project:', error);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [projectId]);
}
