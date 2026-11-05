/**
 * Spot shape types as the legacy data model writes them: 'point', 'line', 'polygon'
 * (StraboMicro 1 compares with equals("polygon")).
 *
 * Split (2025-12-13 to 2026-05-11) and Merge (until 2026-11-05) saved 'Polygon' with a
 * capital P, the GeoJSON spelling. Those spots were left out of Grain Size Analysis and are
 * not polygons to StraboMicro 1. repairSpotGeometryTypes fixes them when a project opens.
 */

import type { ProjectMetadata } from '../types/project-types';

const CANONICAL: Record<string, string> = {
  point: 'point',
  line: 'line',
  linestring: 'line',
  polygon: 'polygon',
};

/** The legacy spelling of a shape type ('Polygon' -> 'polygon', 'LineString' -> 'line');
 *  anything unknown is returned unchanged. */
export function normalizeGeometryType(type: string | null | undefined): string | null | undefined {
  if (typeof type !== 'string') return type;
  return CANONICAL[type.toLowerCase()] ?? type;
}

/** True for a polygon spot, whichever spelling it was saved with */
export function isPolygonType(type: string | null | undefined): boolean {
  return normalizeGeometryType(type) === 'polygon';
}

/**
 * Rewrite every spot's geometryType to the legacy spelling, in place.
 * Returns the names of the spots that changed.
 */
export function repairSpotGeometryTypes(project: ProjectMetadata): string[] {
  const changed: string[] = [];
  for (const dataset of project.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const micrograph of sample.micrographs ?? []) {
        for (const spot of micrograph.spots ?? []) {
          const fixed = normalizeGeometryType(spot.geometryType);
          if (typeof fixed === 'string' && fixed !== spot.geometryType) {
            spot.geometryType = fixed;
            changed.push(spot.name || spot.id);
          }
        }
      }
    }
  }
  return changed;
}
