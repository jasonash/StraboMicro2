/**
 * Default name of a stitched mosaic (image stitcher, design decision 25): the shared start of
 * the image file names plus "mosaic" ("TS-12_001.tif", "TS-12_002.tif" -> "TS-12 mosaic"); when
 * the names share nothing useful, the name of their folder plus "mosaic".
 * Pure (npm run test:stitch).
 */

function baseName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function folderName(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

export function mosaicName(filePaths: string[]): string {
  if (filePaths.length === 0) return 'Mosaic';
  const names = filePaths.map(baseName);
  let shared = names[0];
  for (const name of names) {
    let k = 0;
    while (k < shared.length && k < name.length && shared[k] === name[k]) k++;
    shared = shared.slice(0, k);
  }
  // Without the counter the names end in, and the separators before it. With one image, or the
  // same name twice, nothing tells a counter from the name: keep the digits.
  const allTheSame = names.every((n) => n === names[0]);
  let start = allTheSame ? shared : shared.replace(/\d+$/, '');
  start = start.replace(/[\s_\-.,(]+$/, '').trim();
  if (start.length >= 2) return `${start} mosaic`;
  const folder = folderName(filePaths[0]).trim();
  return folder ? `${folder} mosaic` : 'Mosaic';
}
