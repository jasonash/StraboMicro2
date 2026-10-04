/**
 * Projects for the scenarios: a small .smz built fresh for each test (new
 * ids every time, so runs never collide), opened in the app with
 * File > Open Local Project (.smz).
 */

import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

export interface FixtureSpot {
  id: string;
  name: string;
}

export interface FixtureProject {
  id: string;
  name: string;
  datasetId: string;
  sampleId: string;
  micrographId: string;
  spots: FixtureSpot[];
  smzPath: string;
}

/** A 1600 x 1200 "micrograph": grains drawn as circles on a dark matrix */
async function micrographImage(): Promise<Buffer> {
  const circles: string[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) {
    const r = 30 + rand() * 90;
    const shade = Math.floor(90 + rand() * 140);
    circles.push(`<circle cx="${(rand() * 1600).toFixed(0)}" cy="${(rand() * 1200).toFixed(0)}" r="${r.toFixed(0)}" ` +
      `fill="rgb(${shade},${Math.floor(shade * 0.85)},${Math.floor(shade * 0.7)})" stroke="#222" stroke-width="3"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#3a3530"/>${circles.join('')}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

function spot(id: string, name: string, x: number, y: number) {
  const now = new Date().toISOString();
  return {
    id, name, labelColor: '0xffffffff', showLabel: true, color: '0x00ff00ff', opacity: 50,
    date: now, time: now, notes: '', modifiedTimestamp: Date.now(), geometryType: 'polygon',
    points: [{ X: x, Y: y }, { X: x + 220, Y: y - 60 }, { X: x + 180, Y: y + 160 }],
    associatedFiles: [], links: [], tags: [],
  };
}

/** Write a micrograph image file (JPEG) for the New Micrograph dialog */
export async function writeImage(filePath: string): Promise<string> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, await micrographImage());
  return filePath;
}

/** Write a new project .smz into `dir` */
export async function makeProject(dir: string, name: string, spotNames: string[] = ['Garnet 1', 'Quartz 1']): Promise<FixtureProject> {
  const id = randomUUID();
  const datasetId = randomUUID();
  const sampleId = randomUUID();
  const micrographId = randomUUID();
  const spots = spotNames.map((n) => ({ id: randomUUID(), name: n }));
  const now = new Date().toISOString();
  const project = {
    id, name, startDate: '', endDate: '', purposeOfStudy: '', otherTeamMembers: '', areaOfInterest: '',
    instrumentsUsed: '', gpsDatum: 'WGS84', magneticDeclination: '', notes: '', date: now, modifiedTimestamp: now,
    projectLocation: '',
    datasets: [{
      id: datasetId, name: 'Thin sections', date: now, modifiedTimestamp: now,
      samples: [{
        id: sampleId, existsOnServer: false, label: 'TX-01', sampleID: 'TX-01', igsn: '', longitude: 0, latitude: 0,
        mainSamplingPurpose: '', sampleDescription: '', materialType: '', inplacenessOfSample: '', orientedSample: '',
        sampleSize: '', degreeOfWeathering: '', sampleNotes: '', sampleType: '', color: '', lithology: '', sampleUnit: '',
        otherMaterialType: '', sampleOrientationNotes: '', otherSamplingPurpose: '',
        micrographs: [{
          id: micrographId, name: 'Overview', imageType: 'Plane Polarized Light', width: 1600, height: 1200,
          imageWidth: 1600, imageHeight: 1200, opacity: 1, scale: '', polish: false, polishDescription: '',
          description: '', notes: '', scalePixelsPerCentimeter: 40000, rotation: 0,
          spots: spots.map((s, i) => spot(s.id, s.name, 300 + i * 500, 400 + i * 200)),
          orientationInfo: { orientationMethod: 'unoriented' }, associatedFiles: [], links: [],
          isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
        }],
        isExpanded: false, isSpotExpanded: false,
      }],
    }],
    groups: [], tags: [],
  };

  fs.mkdirSync(dir, { recursive: true });
  const smzPath = path.join(dir, `${name.replace(/[^a-z0-9]+/gi, '_')}.smz`);
  const image = await micrographImage();
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(smzPath);
    const zip = new ZipArchive({});
    out.on('close', () => resolve());
    zip.on('error', reject);
    zip.pipe(out);
    zip.append(JSON.stringify(project, null, 2), { name: `${id}/project.json` });
    zip.append(image, { name: `${id}/images/${micrographId}` });
    void zip.finalize();
  });
  return { id, name, datasetId, sampleId, micrographId, spots, smzPath };
}
