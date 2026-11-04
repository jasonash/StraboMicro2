/**
 * Project Sync Hook
 *
 * When a project opens, asks main whether it is synced; only then loads and
 * starts the sync controller (src/services/syncController.ts). A local-only
 * project costs one status call per open and nothing else (spec v3 §3.4).
 * A local-only project that is also on the server brings up the one-time
 * prompt (src/services/syncLinking.ts).
 * Closing or switching the project stops the controller. Main hears whether
 * the open project is synced, for the File menu wording (spec v3 14t).
 */

import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { useSyncStore } from '@/store/useSyncStore';

export function useProjectSync(): void {
  const projectId = useAppStore((state) => state.project?.id ?? null);
  const synced = useSyncStore((state) => state.synced);

  useEffect(() => {
    window.api?.sync?.notifyMenuState?.(synced);
  }, [synced]);

  useEffect(() => {
    if (!projectId || !window.api?.sync) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    void (async () => {
      try {
        const status = await window.api?.sync.status(projectId);
        if (cancelled || !status) return;
        if (!status.synced) {
          // On the server already? The one-time prompt (16an)
          const { offerLinkOnOpen } = await import('@/services/syncLinking');
          if (!cancelled) await offerLinkOnOpen(projectId);
          return;
        }
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
      useSyncStore.getState().update({ linkOffer: null, linkChoice: null, linking: null });
    };
  }, [projectId]);
}
