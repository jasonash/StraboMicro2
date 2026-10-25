/**
 * Every store action that writes a new project keeps both lookup indexes on
 * that project (src/store/helpers.ts projectIndexes). Before, deleting or
 * editing spots rebuilt only spotIndex, so readers of micrographIndex (the
 * Grain Size summary and analysis) kept counting deleted grains.
 *
 *   npm run test:store-indexes
 */

import './nodeLocalStorage';
import { useAppStore } from '@/store/useAppStore';
import type { ProjectMetadata } from '@/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const square = (x: number, y: number) => [{ X: x, Y: y }, { X: x + 10, Y: y }, { X: x + 10, Y: y + 10 }, { X: x, Y: y + 10 }];
const grain = (id: string, x: number) => ({
  id, name: id, geometryType: 'polygon', points: square(x, 0), tags: ['T1'],
});

function project(): ProjectMetadata {
  return {
    id: 'P', name: 'p',
    tags: [{ id: 'T1', name: 't1' }, { id: 'T2', name: 't2' }],
    groups: [{ id: 'G1', name: 'g1', micrographs: ['M1'] }],
    datasets: [{
      id: 'D1', name: 'd',
      samples: [{
        id: 'A1', name: 's',
        micrographs: [{
          id: 'M1', name: 'm1', width: 1000, height: 1000, scalePixelsPerCentimeter: 1000,
          spots: [grain('S1', 0), grain('S2', 20), grain('S3', 40), grain('S4', 60)],
        }],
      }],
    }],
  } as unknown as ProjectMetadata;
}

/** Both indexes hold exactly the objects in the current project */
function indexesMatch(label: string) {
  const s = useAppStore.getState();
  const micros = s.project!.datasets![0].samples![0].micrographs!;
  const m = micros[0];
  check(`${label}: micrographIndex holds the project's micrograph`, s.micrographIndex.get(m.id) === m);
  const spots = m.spots || [];
  check(`${label}: spotIndex holds the project's spots`,
    spots.every((sp) => s.spotIndex.get(sp.id) === sp) && s.spotIndex.size === spots.length,
    { index: [...s.spotIndex.keys()], project: spots.map((sp) => sp.id) });
}
const indexedSpotIds = () => (useAppStore.getState().micrographIndex.get('M1')?.spots || []).map((s) => s.id);
const reset = () => useAppStore.getState().loadProject(project(), null);

reset();
indexesMatch('load');

// Jason's case (2026-10-25): delete every grain one by one
reset();
for (const id of ['S1', 'S2', 'S3', 'S4']) useAppStore.getState().deleteSpot(id);
check('deleteSpot x4: micrographIndex has no spots left', indexedSpotIds().length === 0, indexedSpotIds());
indexesMatch('deleteSpot');

reset();
useAppStore.getState().batchDeleteSpots(['S1', 'S2']);
check('batchDeleteSpots: micrographIndex drops them', JSON.stringify(indexedSpotIds()) === '["S3","S4"]', indexedSpotIds());
indexesMatch('batchDeleteSpots');

reset();
useAppStore.getState().clearAllSpots('M1');
check('clearAllSpots: micrographIndex empty', indexedSpotIds().length === 0, indexedSpotIds());
indexesMatch('clearAllSpots');

reset();
useAppStore.getState().updateSpotData('S1', { name: 'renamed' });
check('updateSpotData: micrographIndex sees the new name',
  useAppStore.getState().micrographIndex.get('M1')?.spots?.[0].name === 'renamed');
indexesMatch('updateSpotData');

reset();
useAppStore.getState().batchUpdateSpots(['S1', 'S2'], { color: '#ff0000' });
indexesMatch('batchUpdateSpots');

reset();
useAppStore.getState().startEditingSpot('S1', square(0, 0));
useAppStore.getState().updateEditingGeometry(square(500, 500));
useAppStore.getState().saveEditingGeometry();
indexesMatch('saveEditingGeometry');

reset();
useAppStore.getState().addTagToSpot('T2', 'S1');
indexesMatch('addTagToSpot');
useAppStore.getState().removeTagFromSpot('T2', 'S1');
indexesMatch('removeTagFromSpot');
useAppStore.getState().deleteTag('T1');
check('deleteTag: spots in micrographIndex lose the tag',
  (useAppStore.getState().micrographIndex.get('M1')?.spots || []).every((s) => !(s.tags || []).includes('T1')));
indexesMatch('deleteTag');
useAppStore.getState().createTag({ id: 'T3', name: 't3' } as never);
indexesMatch('createTag');
useAppStore.getState().updateTag('T3', { name: 't3b' } as never);
indexesMatch('updateTag');

reset();
useAppStore.getState().createGroup({ id: 'G2', name: 'g2', micrographs: [] } as never);
indexesMatch('createGroup');
useAppStore.getState().deleteGroup('G2');
indexesMatch('deleteGroup');
useAppStore.getState().reorderDatasets(['D1']);
indexesMatch('reorderDatasets');
useAppStore.getState().reorderSamples('D1', ['A1']);
indexesMatch('reorderSamples');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
