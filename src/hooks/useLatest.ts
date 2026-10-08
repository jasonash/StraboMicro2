import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest value. For effects that call a callback
 * from props: list the ref, not the callback, so a parent that passes a new
 * function on every render does not re-run the effect (and an effect that
 * updates the parent does not loop: Sentry ELECTRON-2J, 2026-10-08).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
