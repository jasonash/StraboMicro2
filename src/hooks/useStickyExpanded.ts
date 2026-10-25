/**
 * Open/closed state of a right-pane section that survives the section being
 * drawn again (selecting a spot and going back to the micrograph) and app
 * restarts, like MetadataSummary's sections (localStorage
 * 'metadataSummaryExpanded'). Each section has its own key; storage failures
 * (private mode, blocked site data) just fall back to the default.
 */

import { useState } from 'react';

const STORAGE_KEY = 'rightPaneSectionExpanded';

function readAll(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function useStickyExpanded(
  key: string,
  defaultExpanded: boolean
): [boolean, (event: React.SyntheticEvent, isExpanded: boolean) => void] {
  const [expanded, setExpanded] = useState<boolean>(() => {
    const saved = readAll()[key];
    return typeof saved === 'boolean' ? saved : defaultExpanded;
  });

  const onChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [key]: isExpanded }));
    } catch {
      // Not saved: the section still opens and closes, it just won't be remembered
    }
  };

  return [expanded, onChange];
}
