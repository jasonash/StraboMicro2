/**
 * Spot shape types keep the legacy spelling ('point', 'line', 'polygon'; src/utils/spotGeometryType.ts).
 * Split (2025-12-13 to 2026-05-11) and Merge (until 2026-11-05) saved 'Polygon', so those
 * spots were left out of Grain Size Analysis and are not polygons to StraboMicro 1.
 *
 *   npm run test:spot-geometry-type
 */

import './nodeLocalStorage';
import { useAppStore } from '@/store/useAppStore';
import { normalizeGeometryType, isPolygonType, repairSpotGeometryTypes } from '@/utils/spotGeometryType';
import { calculateGrainMetrics } from '@/utils/grainMetrics';
import type { ProjectMetadata, Spot } from '@/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const square = (x: number, y: number) => [{ X: x, Y: y }, { X: x + 10, Y: y }, { X: x + 10, Y: y + 20 }, { X: x, Y: y + 20 }];
const spot = (id: string, type: string, x: number) => ({ id, name: id, geometryType: type, points: square(x, 0) });

function project(): ProjectMetadata {
  return {
    id: 'P', name: 'p',
    datasets: [{
      id: 'D1', name: 'd',
      samples: [{
        id: 'A1', name: 's',
        micrographs: [{
          id: 'M1', name: 'm1', width: 1000, height: 1000, scalePixelsPerCentimeter: 1000,
          spots: [
            spot('old-split', 'Polygon', 0),
            spot('drawn', 'polygon', 20),
            spot('geojson-line', 'LineString', 40),
            { id: 'pt', name: 'pt', geometryType: 'Point', points: [{ X: 5, Y: 5 }] },
            spot('weird', 'sketch', 60),
            { id: 'none', name: 'none', points: [{ X: 1, Y: 1 }] },
          ],
        }],
      }],
    }],
  } as unknown as ProjectMetadata;
}

// ---- helpers ----
check("'Polygon' -> 'polygon'", normalizeGeometryType('Polygon') === 'polygon');
check("'POLYGON' -> 'polygon'", normalizeGeometryType('POLYGON') === 'polygon');
check("'LineString' -> 'line'", normalizeGeometryType('LineString') === 'line');
check("'Point' -> 'point'", normalizeGeometryType('Point') === 'point');
check('unknown type unchanged', normalizeGeometryType('sketch') === 'sketch');
check('undefined unchanged', normalizeGeometryType(undefined) === undefined);
check('isPolygonType(Polygon)', isPolygonType('Polygon'));
check('isPolygonType(line) is false', !isPolygonType('line'));

// ---- grain metrics accept either spelling ----
check("grain metrics for a 'Polygon' spot", calculateGrainMetrics(spot('a', 'Polygon', 0) as unknown as Spot, 1000) !== null);

// ---- repair in place ----
const p = project();
const changed = repairSpotGeometryTypes(p);
const types = p.datasets![0].samples![0].micrographs![0].spots!.map((s) => s.geometryType);
check('repair reports the three misspelled spots', changed.join(',') === 'old-split,geojson-line,pt', changed);
check('repair spells them the legacy way', JSON.stringify(types) === JSON.stringify(['polygon', 'polygon', 'line', 'point', 'sketch', undefined]), types);
check('second repair changes nothing', repairSpotGeometryTypes(p).length === 0);

// ---- opening a project repairs it ----
useAppStore.getState().loadProject(project(), null);
const opened = useAppStore.getState().project!.datasets![0].samples![0].micrographs![0].spots!;
check('loadProject: old split spot is now polygon', opened[0].geometryType === 'polygon', opened[0].geometryType);
check('loadProject: spot index holds the repaired spot', useAppStore.getState().spotIndex.get('old-split')?.geometryType === 'polygon');

// ---- Merge and Split write the legacy spelling ----
const mergedId = useAppStore.getState().mergeSpots(['old-split', 'drawn']);
const merged = mergedId ? useAppStore.getState().spotIndex.get(mergedId) : undefined;
check('mergeSpots makes a spot', !!merged);
check("mergeSpots writes 'polygon'", merged?.geometryType === 'polygon', merged?.geometryType);

useAppStore.getState().loadProject(project(), null);
const splitIds = useAppStore.getState().splitSpot('drawn', [{ X: 15, Y: -5 }, { X: 35, Y: 25 }]) || [];
check('splitSpot makes two spots', splitIds.length === 2, splitIds);
for (const id of splitIds) {
  check(`splitSpot writes 'polygon' (${id})`, useAppStore.getState().spotIndex.get(id)?.geometryType === 'polygon');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
