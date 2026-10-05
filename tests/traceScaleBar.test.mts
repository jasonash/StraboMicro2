/**
 * Trace Scale Bar and Drag (src/utils/traceScaleBar.ts): the traced line is
 * measured against the child's scale when it was drawn, so a new scale does
 * not change the measured pixels and the two settle at once (the update loop
 * of Sentry 2026-10-05: "Maximum update depth exceeded").
 *
 *   npm run test:trace-scale-bar
 */

import { tracedLinePixels, scaleFromTracedBar, traceScaleNote, MAX_TRACE_SCALE, MIN_TRACE_SCALE } from '../src/utils/traceScaleBar.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const near = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// A child shown at scale 0.5 on its parent; a 100 px line over its scale bar
const line = { x1: 10, y1: 20, x2: 70, y2: 100 }; // 60, 80 -> 100 px
check('line length / scale when drawn', near(tracedLinePixels(line, 0.5), 200), tracedLinePixels(line, 0.5));
check('no usable scale -> null', tracedLinePixels(line, 0) === null && tracedLinePixels(line, NaN) === null);

// Parent 1000 px/cm, shown at half size; bar of 200 child px = 100 um
const parent = { parentScale: 1000, parentDisplayedWidth: 2000, parentOriginalWidth: 4000 };
const r = scaleFromTracedBar({ pixels: 200, physicalLength: 100, unit: 'μm', ...parent });
// child: 200 px / 0.01 cm = 20000 px/cm; parent shown: 500 px/cm -> 0.025
check('scale from the bar', r !== null && near(r.scale, 0.025) && !r.clamped, r);
check('mm and um agree', near(scaleFromTracedBar({ pixels: 200, physicalLength: 0.1, unit: 'mm', ...parent })!.scale, 0.025));
check('missing inputs -> null', scaleFromTracedBar({ pixels: 0, physicalLength: 100, unit: 'μm', ...parent }) === null &&
  scaleFromTracedBar({ pixels: 200, physicalLength: 0, unit: 'μm', ...parent }) === null &&
  scaleFromTracedBar({ pixels: 200, physicalLength: 100, unit: 'μm', ...parent, parentScale: 0 }) === null);
check('clamped high', scaleFromTracedBar({ pixels: 1, physicalLength: 1000, unit: 'cm', ...parent })!.scale === MAX_TRACE_SCALE);
check('clamped low', scaleFromTracedBar({ pixels: 1e9, physicalLength: 1, unit: 'μm', ...parent })!.scale === MIN_TRACE_SCALE);

// Jason's case (2026-10-05): overlay on parent PF-5 (23336 px/cm, shown at full size), 2853.4 px traced
const pf5 = { parentScale: 23336, parentDisplayedWidth: 1546, parentOriginalWidth: 1546 };
const at = (um: number) => scaleFromTracedBar({ pixels: 2853.4, physicalLength: um, unit: 'μm', ...pf5 })!;
check('11 um: 0.009x, no longer held at 0.01', near(at(11).scale, 23336 / (2853.4 / 0.0011)) && !at(11).clamped && at(11).scale < 0.01, at(11));
check('5 um: smaller again (0.004x)', at(5).scale < at(11).scale && !at(5).clamped, at(5));
check('34 um (its real bar): about 0.028x', Math.abs(at(34).scale - 0.0278) < 0.0005, at(34));
check('inside the limits: no note', traceScaleNote(at(11)) === null);
const tiny = scaleFromTracedBar({ pixels: 2853.4, physicalLength: 0.0001, unit: 'μm', ...pf5 })!;
check('outside the limits: held at the limit, and said', tiny.clamped && tiny.scale === MIN_TRACE_SCALE &&
  /make the overlay [0-9.e-]+x the parent's size, outside 0.0001x to 1000x\. Check the length and unit\./.test(traceScaleNote(tiny) ?? ''), traceScaleNote(tiny));

// The component's two effects as a loop: pixels from the line, scale from the pixels, again
function settle(measureWith: 'scale when drawn' | 'current scale', startScale: number, physicalLength: number) {
  let scale = startScale;
  const drawnAt = startScale;
  let pixels = '';
  for (let round = 1; round <= 60; round++) {
    const p = tracedLinePixels(line, measureWith === 'scale when drawn' ? drawnAt : scale)!.toFixed(1);
    const s = scaleFromTracedBar({ pixels: parseFloat(p), physicalLength, unit: 'μm', ...parent })!.scale;
    if (p === pixels && s === scale) return { rounds: round, scale };
    pixels = p;
    scale = s;
  }
  return { rounds: Infinity, scale };
}
const fixed = settle('scale when drawn', 0.5, 100);
check('measured against the scale when drawn: settles at once, right scale', fixed.rounds <= 2 && near(fixed.scale, 0.025), fixed);
const old = settle('current scale', 0.5, 100);
check('the old way (current scale) runs away to a limit or never settles', old.rounds > 2 && (old.rounds === Infinity || old.scale === MIN_TRACE_SCALE || old.scale === MAX_TRACE_SCALE), old);

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
