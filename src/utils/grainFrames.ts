/**
 * Grain orientations in a shared frame (Claire, 2026-11-05).
 *
 * A grain's angle is measured on the image it was drawn on. An associated micrograph can be
 * placed rotated (or by 3-point registration) on its parent, so in "All micrographs" its
 * grains are turned into the frame of its reference micrograph first: the polygon is mapped
 * up the placement chain and its long axis measured there. Size and shape stay as measured
 * on the grain's own image. Grains under different reference micrographs still have unrelated
 * frames; the caller reports how many frames were combined.
 */

import type { MicrographMetadata, Spot } from '@/types/project-types';
import { calculateAllGrainMetrics, calculateEllipseMetrics, type GrainMetrics } from '@/utils/grainMetrics';
import { referenceFrameOf, transformSpot } from '@/utils/parentSpots';

type Lookup = (id: string) => MicrographMetadata | undefined;

export interface FrameSummary {
  id: string;
  name: string;
  grains: number;
}

/**
 * Metrics for the grains. With useReferenceFrames, orientationDegrees is the angle in each
 * grain's reference micrograph frame; otherwise in its own micrograph. orientationFrame names
 * the micrograph whose horizontal is 0°. frames lists the frames used, in first-seen order.
 */
export function grainMetricsInFrames(
  items: Array<{ spot: Spot; micrograph: MicrographMetadata }>,
  lookup: Lookup,
  useReferenceFrames: boolean
): { metrics: GrainMetrics[]; frames: FrameSummary[] } {
  const metrics: GrainMetrics[] = [];
  const frames = new Map<string, FrameSummary>();
  const frameCache = new Map<string, ReturnType<typeof referenceFrameOf>>();

  for (const { spot, micrograph } of items) {
    const [m] = calculateAllGrainMetrics([spot], micrograph.scalePixelsPerCentimeter || 100);
    if (!m) continue;

    let frameId = micrograph.id;
    let frameName = micrograph.name || 'Unnamed Micrograph';
    if (useReferenceFrames) {
      let frame = frameCache.get(micrograph.id);
      if (!frame) {
        frame = referenceFrameOf(micrograph, lookup);
        frameCache.set(micrograph.id, frame);
      }
      frameId = frame.rootId;
      frameName = frame.rootName;
      if (frameId !== micrograph.id) {
        const mapped = transformSpot(spot, frame.matrix);
        const points = (mapped.points ?? []).map((p) => ({ X: p.X ?? 0, Y: p.Y ?? 0 }));
        if (points.length >= 3) m.orientationDegrees = calculateEllipseMetrics(points).orientation;
      }
    }
    m.orientationFrame = frameName;
    metrics.push(m);

    const summary = frames.get(frameId);
    if (summary) summary.grains++;
    else frames.set(frameId, { id: frameId, name: frameName, grains: 1 });
  }

  return { metrics, frames: [...frames.values()] };
}
