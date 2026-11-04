/**
 * The manual's annotated overview figure: the raw window capture with the four
 * panels outlined and named (as in the original figure).
 *   node annotate-overview.js <figures dir>
 */
const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

(async () => {
  const dir = process.argv[2];
  const r = JSON.parse(fs.readFileSync(path.join(dir, 'overview-raw.json'), 'utf8'));
  const raw = path.join(dir, 'overview-raw.png');
  const { width, height } = await sharp(raw).metadata();
  const k = width / r.vw; // device pixels per CSS pixel
  const band = Math.round(70 * k);
  const S = (v) => Math.round(v * k);
  const lw = r.left.w, rx = r.right.x, top = r.left.y, ny = r.notes ? r.notes.y - 12 : r.vh * 0.8;
  const t = 4 * k;
  const box = (x, y, w, h, c) => `<rect x="${S(x) + t / 2}" y="${S(y) + band + t / 2}" width="${S(w) - t}" height="${S(h) - t}" fill="none" stroke="${c}" stroke-width="${t}"/>`;
  const label = (x, y, txt, c) => `<text x="${x}" y="${y}" font-family="Helvetica, Arial" font-weight="bold" font-size="${Math.round(30 * k)}" fill="${c}" text-anchor="middle">${txt}</text>`;
  const W = width, H = height + 2 * band;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${box(0, top, lw, r.vh - top, '#0000ff')}
    ${box(lw, top, rx - lw, ny - top, '#ff0000')}
    ${box(lw, ny, rx - lw, r.vh - ny, '#33cc55')}
    ${box(rx, top, r.vw - rx, r.vh - top, '#fbb03b')}
    ${label(S(lw + (rx - lw) / 2), Math.round(band * 0.72), 'Micrograph Viewer', '#d00000')}
    ${label(S(lw / 2), H - Math.round(band * 0.3), 'Project Viewer Pane', '#0000cc')}
    ${label(S(lw + (rx - lw) / 2), H - Math.round(band * 0.3), 'Detailed Notes', '#22a040')}
    ${label(S(rx + (r.vw - rx) / 2), H - Math.round(band * 0.3), 'Metadata Pane', '#e0961e')}
  </svg>`;
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([{ input: raw, top: band, left: 0 }, { input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toFile(path.join(dir, 'StraboMicro2Overview.png'));
  fs.copyFileSync(raw, path.join(dir, 'StraboMicroOverview.png'));
  console.log('annotated');
})();
