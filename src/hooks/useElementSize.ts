/**
 * Element Size Hook
 *
 * Tracks the rendered size of an element with a ResizeObserver. The observer
 * attaches through a callback ref, i.e. at the moment the element mounts, so
 * it works for content that mounts late (MUI Dialog content renders through a
 * portal, after the parent's own effects have already run). Measuring from an
 * effect or a requestAnimationFrame instead races that mount and can silently
 * leave the initial size in place.
 */

import { useCallback, useEffect, useState } from 'react';

interface ElementSize {
  width: number;
  height: number;
}

// Ignore degenerate sizes reported while a container is collapsed or animating in
const MIN_DIMENSION = 50;

export function useElementSize<T extends HTMLElement>(
  initialSize: ElementSize
): [(element: T | null) => void, ElementSize] {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>(initialSize);

  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const measure = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width <= MIN_DIMENSION || height <= MIN_DIMENSION) return;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return [ref, size];
}
