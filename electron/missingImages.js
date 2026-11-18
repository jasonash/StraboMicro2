/**
 * Micrographs whose image file is missing (or empty) in a project folder.
 * Export as .smz and Turn On Sync used to leave such images out without a
 * word (Sentry ELECTRON-39, 2026-11-16); the dialogs now warn first
 * (src/utils/missingImages.ts has the wording).
 *
 * A legacy project (numeric id) may hold only uiImages/<id>, which export
 * uses in its place (smzExport.js resolveImagePathWithLegacyFallback), so
 * that counts as an image there.
 */

const fs = require('fs');
const path = require('path');

/** True when the file exists and has some bytes */
function hasFile(filePath) {
  try {
    return fs.statSync(filePath).size > 0;
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} folder - The project folder
 * @param {string} projectId
 * @param {Array<{ id: string, name: string }>} micrographs
 * @returns {Array<{ id: string, name: string }>} Those without an image file
 */
function missingImages(folder, projectId, micrographs) {
  const legacy = /^\d+$/.test(String(projectId));
  return (Array.isArray(micrographs) ? micrographs : []).filter((m) => {
    if (!m || typeof m.id !== 'string' || m.id === '' || /[/\\]/.test(m.id)) return false;
    if (hasFile(path.join(folder, 'images', m.id))) return false;
    return !(legacy && hasFile(path.join(folder, 'uiImages', m.id)));
  }).map((m) => ({ id: m.id, name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'Unnamed micrograph' }));
}

/**
 * The micrographs of a project.json object, in tree order
 * @param {object} project
 * @returns {Array<{ id: string, name: string }>}
 */
function micrographsOf(project) {
  const out = [];
  for (const dataset of (project && project.datasets) || []) {
    for (const sample of (dataset && dataset.samples) || []) {
      for (const m of (sample && sample.micrographs) || []) {
        if (m && typeof m.id === 'string' && m.id !== '') out.push({ id: m.id, name: typeof m.name === 'string' ? m.name : '' });
      }
    }
  }
  return out;
}

module.exports = { missingImages, micrographsOf };
