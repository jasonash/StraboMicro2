/**
 * View > Show Parent Spots (Peter, 2026-10-29): the spots of every micrograph
 * above the one in the viewer, mapped into its pixels (src/utils/parentSpots.ts)
 * and cut off at its edges, drawn faded and dashed with the name of the
 * micrograph they belong to ("Garnet 3 (BSE 1)"). They cannot be selected or
 * edited here; right-click offers Go to Spot on <micrograph>.
 */

import { useMemo } from 'react';
import { Group } from 'react-konva';
import type { MicrographMetadata } from '@/types/project-types';
import { useAppStore } from '@/store';
import { ancestorSpots, type ParentSpot } from '@/utils/parentSpots';
import { spotFilterLook } from '@/utils/spotDataSections';
import { spotBounds } from '@/utils/spotFraming';
import { SpotRenderer } from './SpotRenderer';

interface ParentSpotsRendererProps {
  micrograph: MicrographMetadata;
  /** The micrograph's image size, to cut the spots off at its edges */
  width: number;
  height: number;
  stageScale: number;
  /** Labels pass (drawn above the micrograph's own spots) */
  renderLabelsOnly?: boolean;
  onContextMenu?: (parentSpot: ParentSpot, x: number, y: number) => void;
}

export function ParentSpotsRenderer({ micrograph, width, height, stageScale, renderLabelsOnly = false, onContextMenu }: ParentSpotsRendererProps) {
  const micrographIndex = useAppStore((state) => state.micrographIndex);
  const spotFilter = useAppStore((state) => state.spotFilter);
  const showArchivedSpots = useAppStore((state) => state.showArchivedSpots);

  const spots = useMemo(
    () => ancestorSpots(micrograph, (id) => micrographIndex.get(id))
      .filter((p) => (!p.source.archived || showArchivedSpots) && spotFilterLook(p.source, spotFilter) !== 'hidden')
      // Only spots that reach this image (the rest are cut off entirely)
      .filter((p) => {
        const b = spotBounds(p.spot);
        return b !== null && b.maxX >= 0 && b.maxY >= 0 && b.minX <= width && b.minY <= height;
      })
      .map((p) => ({ ...p, spot: { ...p.spot, name: `${p.source.name} (${p.sourceMicrographName})` } })),
    [micrograph, micrographIndex, spotFilter, showArchivedSpots, width, height]
  );

  if (spots.length === 0 || !width || !height) return null;

  return (
    <Group clipX={0} clipY={0} clipWidth={width} clipHeight={height} name="parent-spots">
      {spots.map((p) => (
        <SpotRenderer
          key={`${p.sourceMicrographId}:${p.source.id}`}
          spot={p.spot}
          scale={stageScale}
          fromParent
          renderLabelsOnly={renderLabelsOnly}
          onContextMenu={onContextMenu ? (_spot, x, y) => onContextMenu(p, x, y) : undefined}
        />
      ))}
    </Group>
  );
}
