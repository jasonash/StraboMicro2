/**
 * Image stitcher scenarios: writes tiles cut from a made-up thin section (tests/stitchFixtures.mts)
 * as JPEG files named after their ids. Returns the paths.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function writeTiles(dir: string, tiles: Array<{ id: string; image: { data: Uint8Array; width: number; height: number } }>): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (const t of tiles) {
    const p = path.join(dir, `${t.id}.jpg`);
    await sharp(Buffer.from(t.image.data.buffer, t.image.data.byteOffset, t.image.data.length), { raw: { width: t.image.width, height: t.image.height, channels: 1 } }).jpeg({ quality: 92 }).toFile(p);
    paths.push(p);
  }
  return paths;
}
