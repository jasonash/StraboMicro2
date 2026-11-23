/**
 * Grain Size Analysis PDF (Claire's issue #64, 2026-11-23).
 *
 * One Letter page for one analysis: title and details, the size histogram
 * beside the statistics, the rose diagram beside its caption, and the By
 * Mineral table. The renderer draws the charts (with print colors) and sends
 * them as PNG data URLs with the text already worked out; this file only lays
 * the page out. Per-spot rows stay in Export CSV.
 *
 * Content shape (all strings already formatted):
 *   title, details: string[], histogramPng, rosePng (null: no rose),
 *   roseCaption: string[], roseNote (optional warning),
 *   stats: [{ heading, rows: [[label, value]] }],
 *   minerals: [{ mineral, count, mean, aspectRatio, orientation }]
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');

const PAGE = { width: 612, height: 792, margin: 50 };
const TEXT = '#222222';
const MUTED = '#666666';

/** PNG bytes from a data URL (null when it is not one) */
function pngFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  return m ? Buffer.from(m[1], 'base64') : null;
}

/**
 * Lay out the page into an open PDFKit document.
 * @param {PDFKit.PDFDocument} doc
 * @param {object} content
 */
function drawGrainAnalysisPage(doc, content) {
  const left = PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;

  // Title + details
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(16)
    .text(content.title || 'Grain Size Analysis', left, y, { width });
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  for (const line of content.details || []) {
    doc.text(line, left, y, { width });
    y = doc.y + 1;
  }
  y += 10;

  // Row 1: histogram (left) + statistics (right)
  const histWidth = 310;
  const histHeight = Math.round((histWidth * 300) / 520);
  const hist = pngFromDataUrl(content.histogramPng);
  if (hist) doc.image(hist, left, y, { width: histWidth, height: histHeight });
  const statsX = left + histWidth + 14;
  const statsWidth = width - histWidth - 14;
  let sy = y;
  for (const block of content.stats || []) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(String(block.heading).toUpperCase(), statsX, sy, { width: statsWidth });
    sy = doc.y + 1;
    for (const [label, value] of block.rows || []) {
      // The value takes whatever width its label leaves; a value too long for that goes on its own line
      doc.font('Helvetica').fontSize(9).fillColor(TEXT);
      const labelWidth = doc.widthOfString(String(label)) + 6;
      doc.text(label, statsX, sy, { width: statsWidth, lineBreak: false });
      doc.font('Helvetica-Bold');
      if (doc.widthOfString(String(value)) <= statsWidth - labelWidth) {
        doc.text(value, statsX + labelWidth, sy, { width: statsWidth - labelWidth, align: 'right', lineBreak: false });
      } else {
        sy += 11;
        doc.text(value, statsX, sy, { width: statsWidth, align: 'right', lineBreak: false });
      }
      sy += 12;
    }
    sy += 5;
  }
  y = Math.max(y + histHeight, sy) + 12;

  // Row 2: rose (left) + caption (right)
  const rose = pngFromDataUrl(content.rosePng);
  if (rose) {
    const roseSize = 210;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT).text('Orientation', left, y);
    y = doc.y + 4;
    doc.image(rose, left, y, { width: roseSize, height: roseSize });
    const capX = left + roseSize + 16;
    const capWidth = width - roseSize - 16;
    let cy = y + 6;
    if (content.roseNote) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#8a5a00').text(content.roseNote, capX, cy, { width: capWidth });
      cy = doc.y + 6;
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    for (const paragraph of content.roseCaption || []) {
      doc.text(paragraph, capX, cy, { width: capWidth, lineGap: 1 });
      cy = doc.y + 6;
    }
    y = Math.max(y + roseSize, cy) + 12;
  }

  // Row 3: By Mineral
  const minerals = content.minerals || [];
  if (minerals.length > 1) {
    if (y > PAGE.height - PAGE.margin - 40) {
      doc.addPage();
      y = PAGE.margin;
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT).text('By Mineral', left, y);
    y = doc.y + 4;
    const cols = [
      { key: 'mineral', label: 'Mineral', w: 0.34, align: 'left' },
      { key: 'count', label: 'Grains', w: 0.12, align: 'right' },
      { key: 'mean', label: 'Mean diameter', w: 0.2, align: 'right' },
      { key: 'aspectRatio', label: 'Mean aspect ratio', w: 0.18, align: 'right' },
      { key: 'orientation', label: 'Orientation', w: 0.16, align: 'right' },
    ];
    const row = (cells, bold) => {
      let x = left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(bold ? MUTED : TEXT);
      for (const c of cols) {
        doc.text(String(cells[c.key] ?? ''), x, y, { width: width * c.w - 4, align: c.align, lineBreak: false });
        x += width * c.w;
      }
      y += 12;
    };
    row(Object.fromEntries(cols.map((c) => [c.key, c.label])), true);
    doc.moveTo(left, y - 2).lineTo(left + width, y - 2).lineWidth(0.5).strokeColor('#cccccc').stroke();
    for (const m of minerals) {
      if (y > PAGE.height - PAGE.margin - 12) {
        doc.addPage();
        y = PAGE.margin;
      }
      row(m, false);
    }
  }
}

/**
 * Write the PDF to outputPath.
 * @param {string} outputPath
 * @param {object} content
 * @returns {Promise<void>}
 */
function writeGrainAnalysisPdf(outputPath, content) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: PAGE.margin,
        info: {
          Title: content.title || 'Grain Size Analysis',
          Author: 'StraboMicro',
          Creator: 'StraboMicro',
        },
      });
      const stream = fs.createWriteStream(outputPath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      doc.pipe(stream);
      drawGrainAnalysisPage(doc, content);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { writeGrainAnalysisPdf, drawGrainAnalysisPage, pngFromDataUrl };
