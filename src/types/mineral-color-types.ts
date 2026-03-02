/**
 * Mineral Color Types
 *
 * Types for the Mineral Color Tool feature, which allows users to assign
 * colors to minerals and toggle between spot color and mineral color views.
 */

export interface MineralColorEntry {
  mineral: string;  // Must match mineralDB.csv vocabulary
  color: string;    // Hex color, e.g. '#ff6b6b'
}

export type SpotColorMode = 'spot-color' | 'mineral-color';

export type SpotLabelMode = 'original' | 'mineralogy' | 'none';
