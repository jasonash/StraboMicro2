/**
 * Finish Importing: what a micrograph needs, which go together, when pixels may
 * turn, the wizard's steps, and image types per micrograph
 * (src/utils/finishImporting.ts, imageTypeChoices.ts).
 *
 *   npm run test:finish-importing
 */

import { canRotate, finishGroup, finishSteps, goesStraightToItsDialog, needsOf, needsText } from '../src/utils/finishImporting';
import { effectiveImageType, imageTypeChoices, imageTypesComplete } from '../src/utils/imageTypeChoices';
import type { MicrographMetadata, ProjectMetadata } from '../src/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const m = (id: string, fields: Partial<MicrographMetadata> = {}): MicrographMetadata => ({ id, name: id, ...fields }) as MicrographMetadata;
const placed = { scalePixelsPerCentimeter: 1000, offsetInParent: { X: 0, Y: 0 }, rotation: 0 };
const project = (micrographs: MicrographMetadata[]): ProjectMetadata =>
  ({ id: 'p', datasets: [{ id: 'd', samples: [{ id: 's', micrographs }] }] }) as unknown as ProjectMetadata;

// Peter's state: three batch imported without instrument info, others finished
const ref = m('ref', { scalePixelsPerCentimeter: 3000 });
const amp = m('amp', { parentID: 'ref', needsInstrumentInfo: true });
const pl = m('pl', { parentID: 'ref', needsInstrumentInfo: true });
const talc = m('talc', { parentID: 'ref', needsInstrumentInfo: true });
const act = m('act', { parentID: 'ref', ...placed });
const peter = project([ref, act, amp, pl, talc]);

check('needs of an imported child', JSON.stringify(needsOf(amp)) === '{"instrument":true,"scale":true,"location":true}', needsOf(amp));
check('needs text', needsText(amp) === 'Needs instrument info, location', needsText(amp));
check('group: the incomplete ones on the parent', finishGroup(peter, 'amp').map((x) => x.id).join() === 'amp,pl,talc');
check('the clicked one is always in its group', finishGroup(project([ref, amp]), 'ref').map((x) => x.id).join() === 'ref');
const steps = finishSteps(peter, [amp, pl, talc], { showList: true, skipRotation: false });
check('all the steps for several', steps.join() === 'Micrographs,Rotate / Flip,Instrument & Image Info,Instrument Data,Placement', steps);
const one = finishSteps(peter, [amp], { showList: false, skipRotation: false });
check('one: no Placement step (its own dialog)', one.join() === 'Rotate / Flip,Instrument & Image Info,Instrument Data', one);
check('from Batch Import: no list, no rotation', finishSteps(peter, [amp, pl], { showList: false, skipRotation: true }).join() === 'Instrument & Image Info,Instrument Data,Placement');
check('one with instrument info goes straight', goesStraightToItsDialog([m('x', { parentID: 'ref' })]));
check('one without goes to the wizard', !goesStraightToItsDialog([amp]));
check('several go to the wizard', !goesStraightToItsDialog([m('x', { parentID: 'ref' }), m('y', { parentID: 'ref' })]));

// The bug: bulk placement leaves a placed micrograph that needs instrument info
const placedNoInfo = m('b', { parentID: 'ref', needsInstrumentInfo: true, ...placed });
const q = project([ref, placedNoInfo]);
check('placed: no turning', !canRotate(q, placedNoInfo));
check('placed, needs instrument info: no Rotate step', finishSteps(q, [placedNoInfo], { showList: false, skipRotation: false }).join() === 'Instrument & Image Info,Instrument Data');
check('unplaced: may turn', canRotate(peter, amp));
check('spots: no turning', !canRotate(peter, m('z', { spots: [{ id: 's' }] } as unknown as Partial<MicrographMetadata>)));
check('children: no turning', !canRotate(peter, ref));
check('in a pair: no turning', !canRotate(peter, m('z', { siblingImageId: 'y' })));

// Reference micrographs
const r1 = m('r1', { needsInstrumentInfo: true });
const r2 = m('r2', { needsInstrumentInfo: true });
const rp = project([r1, r2, ref]);
check('references group by sample, without finished ones', finishGroup(rp, 'r1').map((x) => x.id).join() === 'r1,r2');
check('references: Scale step', finishSteps(rp, [r1, r2], { showList: true, skipRotation: false }).join() === 'Micrographs,Rotate / Flip,Instrument & Image Info,Instrument Data,Scale');

// Hidden secondary siblings stay out
const xpl = m('xpl', { parentID: 'ref', isPrimarySibling: false, needsInstrumentInfo: true });
check('hidden XPL left out', finishGroup(project([ref, amp, xpl]), 'amp').map((x) => x.id).join() === 'amp');

// Image types
const optical = { instrumentType: 'Optical Microscopy', otherInstrumentType: '', dataType: '', imageType: '' };
check('list for optical', imageTypeChoices('Optical Microscopy', '').kind === 'list');
check('elements for SEM EDS', imageTypeChoices('Scanning Electron Microscopy (SEM)', 'Energy Dispersive X-ray Spectroscopy (EDS)').kind === 'elements');
check('none when the data type is the image type', imageTypeChoices('Scanning Electron Microscopy (SEM)', 'Backscatter Electron (BSE)').kind === 'none');
check('nothing chosen: not complete', !imageTypesComplete(optical, {}, ['a', 'b']));
check('common choice: complete', imageTypesComplete({ ...optical, imageType: 'Plane Polarized Light' }, {}, ['a', 'b']));
check('one row only: not complete', !imageTypesComplete(optical, { a: 'Cross Polarized Light' }, ['a', 'b']));
check('each row its own: complete', imageTypesComplete(optical, { a: 'Cross Polarized Light', b: 'Plane Polarized Light' }, ['a', 'b']));
check('a row cleared: not complete', !imageTypesComplete({ ...optical, imageType: 'Plane Polarized Light' }, { a: '' }, ['a', 'b']));
check('own type wins', effectiveImageType('Plane Polarized Light', { a: 'Cross Polarized Light' }, 'a') === 'Cross Polarized Light');
check('else the common one', effectiveImageType('Plane Polarized Light', {}, 'b') === 'Plane Polarized Light');
check('Other needs only its name', imageTypesComplete({ ...optical, instrumentType: 'Other', otherInstrumentType: 'Mine' }, {}, ['a']));
check('no instrument: not complete', !imageTypesComplete({ ...optical, instrumentType: '' }, {}, ['a']));

console.log(`${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
