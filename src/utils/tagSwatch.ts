/**
 * The small colored dot that stands for a tag (Tags tab list, New Spot's Tags
 * field): fill color with the tag's transparency, line color border, tag size
 * capped for lists.
 */

import type { Tag } from '@/types/project-types';

export function tagSwatchStyle(tag: Pick<Tag, 'fillColor' | 'lineColor' | 'transparency' | 'tagSize'>, maxSize = 16) {
  const transparency = tag.transparency ?? 100;
  const alphaHex = Math.round((transparency / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  const size = Math.min(tag.tagSize ?? 10, maxSize);

  return {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: `${tag.fillColor || '#FF0000'}${alphaHex}`,
    border: `1px solid ${tag.lineColor || '#000000'}`,
    flexShrink: 0,
  };
}
