/**
 * Wording of the image stitcher wizard (docs/image-stitcher-design.md). Pure, so the sentences
 * are tested (npm run test:stitch) and stay in one place.
 */

const n = (value: number) => Math.round(value).toLocaleString('en-US');
const images = (count: number) => (count === 1 ? '1 image' : `${n(count)} images`);

/** Header of the review screen */
export function placedText(placed: number, total: number): string {
  if (total > 0 && placed === total) return total === 2 ? 'Both images placed automatically' : `All ${n(total)} images placed automatically`;
  if (placed <= 1) return `The images could not be fitted together automatically`;
  return `${n(placed)} of ${images(total)} placed automatically`;
}

/** What size the mosaic will be saved at (design decision 1) */
export function sizeText(frame: { fullWidth: number; fullHeight: number; width: number; height: number; scale: number }): string {
  if (frame.scale >= 1) return `The mosaic will be ${n(frame.width)} x ${n(frame.height)} px.`;
  const percent = Math.max(1, Math.round(frame.scale * 100));
  return `Full size would be ${n(frame.fullWidth)} x ${n(frame.fullHeight)} px. It will be saved at ${n(frame.width)} x ${n(frame.height)} px (${percent}%).`;
}

/** "about 4 minutes" */
export function durationText(seconds: number): string {
  if (seconds < 45) return 'less than a minute';
  if (seconds < 90) return 'about a minute';
  return `about ${n(Math.ceil(seconds / 60))} minutes`;
}

/** Shown before starting when there are many images (design decision 18) */
export function estimateText(count: number, seconds: number): string {
  return `${images(count)}: this may take ${durationText(seconds)}.`;
}

export function tooManyText(count: number, most: number): string {
  return `${n(count)} images are more than can be stitched in one go (${n(most)} at most). Stitch them in parts.`;
}

export function skippedText(count: number): string {
  return count === 1 ? '1 image cannot be used and will be skipped.' : `${n(count)} images cannot be used and will be skipped.`;
}

export type ProgressStage = 'reading' | 'features' | 'pairs' | 'layout' | 'hard-features' | 'hard-pairs';

export interface ProgressLine {
  label: string;
  /** "312 of 1,128", or empty */
  count: string;
  state: 'done' | 'now' | 'waiting';
  /** 0..100 while it is the current line and has a count */
  percent: number | null;
}

/**
 * The lines of "Fitting the images together": Reading images, Comparing images, [Looking harder
 * at 3 images,] Working out the layout.
 */
export function progressLines(p: { stage: ProgressStage; done: number; total: number; unplaced?: number }): ProgressLine[] {
  const order = ['read', 'compare', 'harder', 'layout'] as const;
  const hard = p.stage === 'hard-features' || p.stage === 'hard-pairs';
  const current: (typeof order)[number] =
    p.stage === 'reading' || p.stage === 'features' ? 'read' : p.stage === 'pairs' ? 'compare' : hard ? 'harder' : 'layout';
  const count = p.total > 0 ? `${n(p.done)} of ${n(p.total)}` : '';
  const percent = p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : null;
  const labels: Record<(typeof order)[number], string> = {
    read: 'Reading images',
    compare: 'Comparing images',
    harder: `Looking harder at ${images(p.unplaced ?? 0)}`,
    layout: 'Working out the layout',
  };
  // The harder line appears only once that pass runs; the layout after it is the second layout
  const shown = order.filter((key) => key !== 'harder' || hard);
  const at = shown.indexOf(current);
  return shown.map((key, k) => ({
    label: labels[key],
    count: k === at && key !== 'layout' ? count : '',
    state: k < at ? 'done' : k === at ? 'now' : 'waiting',
    percent: k === at && key !== 'layout' ? percent : null,
  }));
}

export function overlapsText(count: number): string {
  return count === 1 ? '1 overlap found so far' : `${n(count)} overlaps found so far`;
}

/** The notice when images of the mosaic have a scale bar or label burned in (design decision 17) */
export function graphicsText(count: number): string {
  const which = count === 1 ? '1 image seems to have' : `${n(count)} images seem to have`;
  return `${which} a scale bar or label burned in (dashed outline). It will appear in the mosaic, except where another image covers the same spot.`;
}

/**
 * The notice for an image at another magnification than the rest (design decision 4).
 * factor: how many times more magnified it is (below 1: less magnified).
 */
export function magnificationText(name: string, factor: number): string {
  const times = (f: number) => (Math.abs(f - Math.round(f)) < 0.15 ? String(Math.round(f)) : f.toFixed(1));
  if (factor >= 1) {
    return `"${name}" is about ${times(factor)} times more magnified than the other images. In the mosaic its extra detail is lost. `
      + 'You can leave it out and, once the mosaic is in the project, add it as an associated micrograph on the mosaic (Add Associated Micrograph, location method "Place automatically on parent").';
  }
  return `"${name}" is about ${times(1 / factor)} times less magnified than the other images. In the mosaic it will look blurred next to them. You can leave it out.`;
}

/** One line under an image that is not in the mosaic */
export function groupText(count: number): string {
  return count === 1 ? 'Fits no other image' : `Group of ${n(count)} that fit each other`;
}
