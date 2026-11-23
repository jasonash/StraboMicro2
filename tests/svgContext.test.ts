/**
 * Chart downloads as SVG (src/utils/svgContext.ts, src/services/grainCharts.ts):
 * the context's colors, fonts, arcs and transforms, and both Grain Size charts
 * as well-formed SVG (checked with xmllint).
 *
 *   npm run test:svg-context      (SVG_OUT=<folder> keeps the two charts there)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SvgContext, svgColor, svgFont, num } from '@/utils/svgContext';
import { histogramSvg, roseSvg } from '@/services/grainCharts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

// --- Colors and fonts ---------------------------------------------------------------
check('rgba -> color + opacity', JSON.stringify(svgColor('rgba(76, 175, 80, 0.7)')) === JSON.stringify({ color: '#4caf50', opacity: 0.7 }));
check('rgb', svgColor('rgb(0,0,0)').color === '#000000' && svgColor('rgb(0,0,0)').opacity === 1);
check('8-digit hex (class bands, 25%)', svgColor('#FFD70040').color === '#ffd700' && Math.abs(svgColor('#FFD70040').opacity - 0.251) < 0.001);
check('3-digit hex', svgColor('#333').color === '#333333');
check('names pass through', svgColor('white').color === 'white');
check('bold font', svgFont('bold 13px system-ui, sans-serif').includes('font-size="13"') && svgFont('bold 13px system-ui').includes('font-weight="bold"'));
check('plain font', !svgFont('10px system-ui').includes('bold'));
check('num: short, no -0', num(1.23456) === '1.235' && num(-0.0001) === '0');

// --- Shapes -------------------------------------------------------------------------
{
  const c = new SvgContext();
  c.fillStyle = '#ff0000';
  c.fillRect(1, 2, 3, 4);
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 2;
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(10, 0);
  c.stroke();
  const svg = c.toSvg(20, 20, null);
  check('rect filled', svg.includes('<rect x="1" y="2" width="3" height="4" fill="#ff0000"/>'), svg);
  check('dashed half-black line', svg.includes('<path d="M0 0L10 0" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="4 4"/>'), svg);
}
{
  // Quarter arc clockwise from 0 to 90 degrees (canvas y down): ends at the bottom
  const c = new SvgContext();
  c.beginPath();
  c.arc(50, 50, 10, 0, Math.PI / 2);
  c.stroke();
  const svg = c.toSvg(100, 100, null);
  check('quarter arc: start, small arc, clockwise sweep, end below', svg.includes('d="M60 50A10 10 0 0 1 50 60"'), svg);
  const d = new SvgContext();
  d.beginPath();
  d.arc(50, 50, 10, 0, 2 * Math.PI);
  d.stroke();
  const circle = d.toSvg(100, 100, null);
  check('full circle = two half arcs', circle.includes('d="M60 50A10 10 0 1 1 40 50A10 10 0 1 1 60 50"'), circle);
  const e = new SvgContext();
  e.beginPath();
  e.moveTo(50, 50);
  e.arc(50, 50, 10, -Math.PI / 2, -Math.PI / 4);
  e.closePath();
  e.fill();
  const petal = e.toSvg(100, 100, null);
  check('petal: centre, line to arc start, arc, close', /d="M50 50L50 40A10 10 0 0 1 57\.071 42\.929Z"/.test(petal), petal);
}
{
  // Rotated text keeps its transform; restore drops it
  const c = new SvgContext();
  c.save();
  c.translate(15, 150);
  c.rotate(-Math.PI / 2);
  c.textAlign = 'center';
  c.fillText('Count', 0, 0);
  c.restore();
  c.fillText('<a & b>', 5, 5);
  const svg = c.toSvg(100, 300, null);
  check('rotated label: matrix transform', svg.includes('text-anchor="middle"') && svg.includes('transform="matrix(0 -1 1 0 15 150)"'), svg);
  check('after restore: no transform, text escaped', svg.includes('<text x="5" y="5"') && svg.includes('&lt;a &amp; b&gt;') && svg.split('transform=').length === 2, svg);
}

// --- The two charts -----------------------------------------------------------------
const sizes = [12, 15, 18, 22, 25, 30, 31, 40, 55, 80, 120, 150];
const orientations = [10, 12, 15, 20, 22, 25, 30, 35, 170, 175, 5, 40];
const hist = histogramSvg({ sizes, rockType: 'sedimentary', useLogScale: false, showGrid: true });
const rose = roseSvg({ orientations });

const dir = process.env.SVG_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'svg-context-'));
fs.mkdirSync(dir, { recursive: true });
const histFile = path.join(dir, 'histogram.svg');
const roseFile = path.join(dir, 'rose.svg');
fs.writeFileSync(histFile, hist);
fs.writeFileSync(roseFile, rose);
for (const [label, file] of [['histogram', histFile], ['rose', roseFile]] as const) {
  try {
    execFileSync('xmllint', ['--noout', file], { stdio: 'pipe' });
    check(`${label}: well-formed XML`, true);
  } catch (error) {
    check(`${label}: well-formed XML`, false, String((error as { stderr?: Buffer }).stderr ?? error));
  }
}
check('histogram: size and white background', hist.includes('viewBox="0 0 520 300"') && hist.includes('<rect width="520" height="300" fill="#ffffff"/>'));
check('histogram: axis titles as text', hist.includes('>Equivalent Diameter</text>') && hist.includes('>Count</text>'));
check('histogram: bars', (hist.match(/fill="#4285f4" fill-opacity="0.8"/g) ?? []).length >= 5);
check('rose: angle labels', ['0°', '30°', '90°', '150°'].every((l) => rose.includes(`>${l}</text>`)));
check('rose: petals and mean line', rose.includes('fill="#4caf50" fill-opacity="0.7"') && rose.includes('stroke="#d32f2f"'));
check('rose: no rgba left anywhere', !/rgba?\(/.test(hist + rose));

if (process.env.SVG_OUT) console.log(`charts kept in ${dir}`);
else fs.rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? `\nALL PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
process.exit(failures === 0 ? 0 : 1);
