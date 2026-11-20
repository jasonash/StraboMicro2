/**
 * Hand-test package for placing BSE images on a PPL/XPL pair (Caroline Woods,
 * 2026-11-19): the synthetic images (tests/siblingPairFixtures.mts) and a
 * project with the pair already linked, scale set, nothing placed on it.
 *
 *   npm run make:pair-test-set [-- <folder>]   (default ~/Desktop/PPL_XPL_Test)
 *
 * Open "PPL XPL Placement Test.smz" (File > Open Local Project), then add the
 * images in BSE/ to the PPL as associated micrographs and place them with the
 * PPL | XPL switch. truth.json says where each one really belongs (BSE pixel
 * -> PPL pixel), so a placement can be checked afterwards.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { makeProject } from './e2e/lib/fixtures.ts';
import { writePairTestSet, PPL_SCALE, XPL_FACTOR } from './siblingPairFixtures.mts';

export interface PairTestProject {
  set: Awaited<ReturnType<typeof writePairTestSet>>;
  smzPath: string;
  projectId: string;
  pplId: string;
  xplId: string;
}

/** Writes the images, truth.json and "PPL XPL Placement Test.smz" into dir */
export async function makePairTestProject(dir: string): Promise<PairTestProject> {
  const set = await writePairTestSet(dir);
  const overviewId = randomUUID();
  const xplId = randomUUID();
  const micrograph = {
    opacity: 1, polish: false, polishDescription: '', description: '', notes: '', spots: [],
    orientationInfo: { orientationMethod: 'unoriented' }, associatedFiles: [], links: [],
    isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    instrument: { instrumentType: 'Optical Microscopy', dataType: 'Plane Polarized Light' },
  };
  const project = await makeProject(dir, 'PPL XPL Placement Test', [], {
    overviewId,
    overview: {
      ...micrograph,
      name: 'Section A PPL', imageType: 'Plane Polarized Light',
      width: set.pplSize.width, height: set.pplSize.height, imageWidth: set.pplSize.width, imageHeight: set.pplSize.height,
      scalePixelsPerCentimeter: PPL_SCALE, siblingImageId: xplId, isPrimarySibling: true,
    },
    overviewImage: fs.readFileSync(set.ppl),
    micrographs: [{
      ...micrograph,
      id: xplId, name: 'Section A XPL', imageType: 'Cross Polarized Light',
      instrument: { instrumentType: 'Optical Microscopy', dataType: 'Cross Polarized Light' },
      width: set.xplSize.width, height: set.xplSize.height, imageWidth: set.xplSize.width, imageHeight: set.xplSize.height,
      scalePixelsPerCentimeter: PPL_SCALE * XPL_FACTOR, siblingImageId: overviewId, isPrimarySibling: false,
    }],
    images: { [xplId]: fs.readFileSync(set.xpl) },
  });
  return { set, smzPath: project.smzPath, projectId: project.id, pplId: overviewId, xplId };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dir = process.argv[2] || path.join(process.env.HOME ?? '.', 'Desktop', 'PPL_XPL_Test');
  const t0 = Date.now();
  const { set, smzPath } = await makePairTestProject(dir);
  console.log(`Wrote ${dir} in ${((Date.now() - t0) / 1000).toFixed(1)} s:`);
  console.log(`  ${path.basename(smzPath)} (sample TX-01: Section A PPL + XPL, linked, ${PPL_SCALE} px/cm)`);
  console.log(`  ${path.basename(set.ppl)} ${set.pplSize.width} x ${set.pplSize.height}, ${path.basename(set.xpl)} ${set.xplSize.width} x ${set.xplSize.height}`);
  for (const c of set.crops) console.log(`  BSE/${c.file.padEnd(24)} ${c.note}`);
  console.log('  truth.json: where each BSE image belongs');
}
