/**
 * SketchLayerRenderer Component
 *
 * Renders sketch layers (freeform strokes and text annotations) on the Konva canvas.
 * Each layer can be independently shown/hidden, and strokes use Catmull-Rom
 * interpolation for smooth lines.
 */

import React from 'react';
import { Group, Line, Text } from 'react-konva';
import { SketchLayer } from '@/types/project-types';

interface SketchLayerRendererProps {
  /** Array of sketch layers to render */
  layers: SketchLayer[];
  /** Current zoom level (for potential future use with stroke width scaling) */
  scale: number;
  /** ID of the layer being actively edited (for eraser hit detection) */
  activeLayerId?: string | null;
  /** Callback when a stroke is clicked (for eraser tool) */
  onStrokeClick?: (layerId: string, strokeId: string) => void;
  /** Callback when a text item is clicked */
  onTextClick?: (layerId: string, textId: string) => void;
  /** Callback when a text item is dragged */
  onTextDragEnd?: (layerId: string, textId: string, x: number, y: number) => void;
  /** Whether eraser tool is active (enables stroke hit detection) */
  eraserActive?: boolean;
  /** Whether text select/drag is enabled */
  textDraggable?: boolean;
}

/**
 * Renders all visible sketch layers with their strokes and text items.
 * Layers are rendered in order (first layer on bottom, last on top).
 */
export const SketchLayerRenderer: React.FC<SketchLayerRendererProps> = ({
  layers,
  scale: _scale, // Reserved for future use (e.g., stroke width scaling)
  activeLayerId,
  onStrokeClick,
  onTextClick,
  onTextDragEnd,
  eraserActive = false,
  textDraggable = false,
}) => {
  return (
    <>
      {layers.map((layer) => {
        // Skip hidden layers
        if (!layer.visible) return null;

        return (
          <Group key={layer.id} name={`sketch-layer-${layer.id}`}>
            {/* Render strokes */}
            {layer.strokes.map((stroke) => (
              <Line
                key={stroke.id}
                name="sketch-stroke"
                id={stroke.id}
                points={stroke.points}
                stroke={stroke.color}
                strokeWidth={stroke.strokeWidth}
                opacity={stroke.opacity}
                lineCap="round"
                lineJoin="round"
                tension={0.3} // Catmull-Rom smoothing for natural feel
                listening={eraserActive && layer.id === activeLayerId}
                hitStrokeWidth={eraserActive ? Math.max(stroke.strokeWidth, 20) : 0}
                onClick={
                  eraserActive && onStrokeClick
                    ? () => onStrokeClick(layer.id, stroke.id)
                    : undefined
                }
                onTap={
                  eraserActive && onStrokeClick
                    ? () => onStrokeClick(layer.id, stroke.id)
                    : undefined
                }
              />
            ))}

            {/* Render text items */}
            {layer.textItems.map((textItem) => (
              <Text
                key={textItem.id}
                name="sketch-text"
                id={textItem.id}
                x={textItem.x}
                y={textItem.y}
                text={textItem.text}
                fontSize={textItem.fontSize}
                fontFamily={textItem.fontFamily}
                fill={textItem.color}
                rotation={textItem.rotation || 0}
                draggable={textDraggable && layer.id === activeLayerId}
                onClick={
                  onTextClick
                    ? () => onTextClick(layer.id, textItem.id)
                    : undefined
                }
                onTap={
                  onTextClick
                    ? () => onTextClick(layer.id, textItem.id)
                    : undefined
                }
                onDragEnd={
                  onTextDragEnd
                    ? (e) => {
                        const node = e.target;
                        onTextDragEnd(layer.id, textItem.id, node.x(), node.y());
                      }
                    : undefined
                }
              />
            ))}
          </Group>
        );
      })}
    </>
  );
};

export default SketchLayerRenderer;
