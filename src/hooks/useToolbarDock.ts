import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { PopoverOrigin } from '@mui/material';

type DockEdge = 'right' | 'bottom' | 'left' | 'top';

const STORAGE_KEY = 'toolbarDockEdge';
const CYCLE_ORDER: DockEdge[] = ['right', 'bottom', 'left', 'top'];

function readEdge(): DockEdge {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && CYCLE_ORDER.includes(stored as DockEdge)) {
    return stored as DockEdge;
  }
  return 'right';
}

// Shared module-level state so all hook consumers stay in sync
let currentEdge: DockEdge = readEdge();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): DockEdge {
  return currentEdge;
}

function setEdge(edge: DockEdge) {
  currentEdge = edge;
  localStorage.setItem(STORAGE_KEY, edge);
  listeners.forEach(l => l());
}

const TOOLTIP_PLACEMENT: Record<DockEdge, 'left' | 'right' | 'top' | 'bottom'> = {
  right: 'left',
  left: 'right',
  top: 'bottom',
  bottom: 'top',
};

const POSITION_STYLES: Record<DockEdge, React.CSSProperties> = {
  right: { right: 16, top: '50%', transform: 'translateY(-50%)' },
  left: { left: 16, top: '50%', transform: 'translateY(-50%)' },
  top: { top: 16, left: '50%', transform: 'translateX(-50%)' },
  bottom: { bottom: 16, left: '50%', transform: 'translateX(-50%)' },
};

const POPOVER_ANCHORS: Record<DockEdge, { anchor: PopoverOrigin; transform: PopoverOrigin }> = {
  right: {
    anchor: { vertical: 'center', horizontal: 'left' },
    transform: { vertical: 'center', horizontal: 'right' },
  },
  left: {
    anchor: { vertical: 'center', horizontal: 'right' },
    transform: { vertical: 'center', horizontal: 'left' },
  },
  top: {
    anchor: { vertical: 'bottom', horizontal: 'center' },
    transform: { vertical: 'top', horizontal: 'center' },
  },
  bottom: {
    anchor: { vertical: 'top', horizontal: 'center' },
    transform: { vertical: 'bottom', horizontal: 'center' },
  },
};

export function useToolbarDock() {
  const dockEdge = useSyncExternalStore(subscribe, getSnapshot);

  const cycleDock = useCallback(() => {
    const idx = CYCLE_ORDER.indexOf(currentEdge);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
    setEdge(next);
  }, []);

  const isHorizontal = dockEdge === 'top' || dockEdge === 'bottom';

  const positionStyle = POSITION_STYLES[dockEdge];
  const tooltipPlacement = TOOLTIP_PLACEMENT[dockEdge];
  const popoverAnchorOrigin = POPOVER_ANCHORS[dockEdge].anchor;
  const popoverTransformOrigin = POPOVER_ANCHORS[dockEdge].transform;

  return useMemo(() => ({
    dockEdge,
    cycleDock,
    isHorizontal,
    positionStyle,
    tooltipPlacement,
    popoverAnchorOrigin,
    popoverTransformOrigin,
  }), [dockEdge, cycleDock, isHorizontal, positionStyle, tooltipPlacement, popoverAnchorOrigin, popoverTransformOrigin]);
}
