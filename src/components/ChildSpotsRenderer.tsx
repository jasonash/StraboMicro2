/**
 * ChildSpotsRenderer Component
 *
 * Renders spots from a child (overlay) micrograph transformed into the parent's coordinate space.
 * This enables "recursive spots" - showing child spots overlaid on the parent view.
 *
 * The transformation accounts for:
 * - Position offset (where the child is placed on the parent)
 * - Scale difference (pixels-per-centimeter ratio between parent and child)
 * - Rotation (child micrograph rotation)
 */

import { useMemo } from 'react';
import { Group } from 'react-konva';
import { MicrographMetadata, Spot } from '@/types/project-types';
import { SpotRenderer } from './SpotRenderer';

interface ChildSpotsRendererProps {
  /** The child micrograph whose spots we're rendering */
  childMicrograph: MicrographMetadata;
  /** Parent micrograph metadata for calculating transforms */
  parentMetadata: {
    width: number;
    height: number;
    scalePixelsPerCentimeter: number;
  };
  /** Current stage scale (zoom level) */
  stageScale: number;
  /** Currently selected spot ID (for selection highlighting) */
  activeSpotId: string | null;
  /** Multi-selected spot IDs */
  selectedSpotIds?: string[];
  /** Callback when a spot is clicked */
  onSpotClick?: (spot: Spot, event: any) => void;
  /** Callback when a spot is right-clicked */
  onSpotContextMenu?: (spot: Spot, x: number, y: number) => void;
}

export const ChildSpotsRenderer: React.FC<ChildSpotsRendererProps> = ({
  childMicrograph,
  parentMetadata,
  stageScale,
  activeSpotId,
  selectedSpotIds = [],
  onSpotClick,
  onSpotContextMenu,
}) => {
  // Skip if no spots
  if (!childMicrograph.spots || childMicrograph.spots.length === 0) {
    return null;
  }

  /**
   * Calculate the transformation to map child coordinates to parent coordinates.
   * This mirrors the logic in AssociatedImageRenderer.overlayTransform
   */
  const overlayTransform = useMemo(() => {
    const childPxPerCm = childMicrograph.scalePixelsPerCentimeter || 100;
    const parentPxPerCm = parentMetadata.scalePixelsPerCentimeter || 100;
    const scaleFactor = parentPxPerCm / childPxPerCm;

    const imageWidth = childMicrograph.imageWidth || 0;
    const imageHeight = childMicrograph.imageHeight || 0;
    const scaledWidth = imageWidth * scaleFactor;
    const scaledHeight = imageHeight * scaleFactor;

    let centerX = 0;
    let centerY = 0;

    // Get position from appropriate field (same logic as AssociatedImageRenderer)
    if (childMicrograph.offsetInParent) {
      // offsetInParent is top-left corner position, convert to center
      const topLeftX = childMicrograph.offsetInParent.X ?? childMicrograph.offsetInParent.x ?? 0;
      const topLeftY = childMicrograph.offsetInParent.Y ?? childMicrograph.offsetInParent.y ?? 0;
      centerX = topLeftX + scaledWidth / 2;
      centerY = topLeftY + scaledHeight / 2;
    } else if (childMicrograph.pointInParent) {
      // For point placement, position is already the center
      centerX = childMicrograph.pointInParent.x ?? childMicrograph.pointInParent.X ?? 0;
      centerY = childMicrograph.pointInParent.y ?? childMicrograph.pointInParent.Y ?? 0;
    } else if (childMicrograph.xOffset !== undefined && childMicrograph.xOffset !== null &&
               childMicrograph.yOffset !== undefined && childMicrograph.yOffset !== null) {
      // Legacy fields - assume top-left, convert to center
      centerX = childMicrograph.xOffset + scaledWidth / 2;
      centerY = childMicrograph.yOffset + scaledHeight / 2;
    }

    return {
      x: centerX,
      y: centerY,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
      rotation: childMicrograph.rotation || 0,
      offsetX: imageWidth / 2,  // Rotate around center
      offsetY: imageHeight / 2, // Rotate around center
    };
  }, [childMicrograph, parentMetadata]);

  // Calculate effective scale for spot rendering
  // Spots need to know the combined scale to render stroke widths correctly
  const effectiveScale = stageScale * overlayTransform.scaleX;

  return (
    <Group
      x={overlayTransform.x}
      y={overlayTransform.y}
      scaleX={overlayTransform.scaleX}
      scaleY={overlayTransform.scaleY}
      rotation={overlayTransform.rotation}
      offsetX={overlayTransform.offsetX}
      offsetY={overlayTransform.offsetY}
    >
      {/* Render child spots - clickable for selection and editing */}
      {childMicrograph.spots.map((spot) => (
        <SpotRenderer
          key={spot.id}
          spot={spot}
          scale={effectiveScale}
          isSelected={spot.id === activeSpotId || selectedSpotIds.includes(spot.id)}
          onClick={onSpotClick}
          onContextMenu={onSpotContextMenu}
          renderLabelsOnly={false}
        />
      ))}
    </Group>
  );
};
