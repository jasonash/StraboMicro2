/**
 * SketchLayerRenderer — Read-only sketch layer display
 *
 * Renders visible sketch layers (strokes and text) on the Konva canvas.
 * Stripped-down version of the desktop component — no eraser, no editing.
 */

import { Group, Line, Text } from 'react-konva';
import type { SketchLayer } from '../types/project-types';

interface SketchLayerRendererProps {
  layers: SketchLayer[];
}

export function SketchLayerRenderer({ layers }: SketchLayerRendererProps) {
  return (
    <>
      {layers.map((layer) => {
        if (!layer.visible) return null;
        return (
          <Group key={layer.id}>
            {layer.strokes.map((stroke) => (
              <Line
                key={stroke.id}
                points={stroke.points}
                stroke={stroke.color}
                strokeWidth={stroke.strokeWidth}
                opacity={stroke.opacity}
                lineCap="round"
                lineJoin="round"
                tension={0.3}
                listening={false}
              />
            ))}
            {layer.textItems.map((textItem) => (
              <Text
                key={textItem.id}
                x={textItem.x}
                y={textItem.y}
                text={textItem.text}
                fontSize={textItem.fontSize}
                fontFamily={textItem.fontFamily}
                fill={textItem.color}
                rotation={textItem.rotation || 0}
                listening={false}
              />
            ))}
          </Group>
        );
      })}
    </>
  );
}
