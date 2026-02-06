/**
 * Default Mineral Color Assignments
 *
 * Default colors for the 16 Quick Classify minerals.
 * Colors are chosen to reflect the mineral's appearance in thin section
 * or their traditional geological association.
 */

import type { MineralColorEntry } from '@/types/mineral-color-types';

export const DEFAULT_MINERAL_COLORS: MineralColorEntry[] = [
  { mineral: 'Quartz', color: '#e8e8e8' },         // Light gray (clear in thin section)
  { mineral: 'Plagioclase', color: '#a8c8f0' },     // Light blue (twinning)
  { mineral: 'K-Feldspar', color: '#f0a8b8' },      // Salmon pink (staining color)
  { mineral: 'Olivine', color: '#7bc87b' },          // Green (peridot)
  { mineral: 'Clinopyroxene', color: '#5db85d' },    // Darker green (augite)
  { mineral: 'Amphibole', color: '#2d8a2d' },        // Deep green
  { mineral: 'Hornblende', color: '#3a6b3a' },       // Forest green
  { mineral: 'Biotite', color: '#8b5a2b' },          // Brown (pleochroism)
  { mineral: 'Muscovite', color: '#f0e68c' },        // Khaki/gold (luster)
  { mineral: 'Garnet', color: '#cc3333' },           // Deep red (almandine)
  { mineral: 'Calcite', color: '#f5f5dc' },          // Beige (cream carbonate)
  { mineral: 'Dolomite', color: '#d4b896' },         // Tan (buff carbonate)
  { mineral: 'Epidote', color: '#b8cc33' },          // Yellow-green (pistachio)
  { mineral: 'Serpentine', color: '#4a8b4a' },       // Medium green
  { mineral: 'Tourmaline', color: '#333333' },       // Dark gray/black (schorl)
  { mineral: 'Zircon', color: '#ff69b4' },           // Hot pink (distinctive accessory)
];

/** Color used when a spot has no mineral assigned or the mineral is not in the color map */
export const NO_MINERAL_COLOR = '#999999';
