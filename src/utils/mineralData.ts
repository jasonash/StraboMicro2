/**
 * Mineral and Lithology Database Utilities
 *
 * Provides access to the mineral and lithology reference databases
 * loaded from CSV files.
 */

import mineralCSV from '@/data/mineralDB.csv?raw';
import lithologyCSV from '@/data/lithology_data.csv?raw';

export interface Mineral {
  pkey: number;
  mineralname: string;
  shortlist: number; // 1 = commonly used, 0 = less common
  abbrev: string;
}

export interface Lithology {
  pkey: number;
  level1: string; // Main category (e.g., "Igneous", "Metamorphic", "Sedimentary")
  level2: string; // Subcategory (e.g., "Volcanic", "Plutonic")
  level3: string; // Specific type (e.g., "Basalt", "Granite")
  showhide: string; // "show" or "hide"
}

let mineralCache: Mineral[] | null = null;
let lithologyCache: Lithology[] | null = null;

/**
 * Parse CSV text into array of objects
 */
function parseCSV<T>(csvText: string, transform: (row: string[]) => T): T[] {
  const lines = csvText.trim().split('\n');
  // Skip header row (first line)
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return transform(values);
  });
}

/**
 * Load and parse mineral database
 */
export function loadMinerals(): Mineral[] {
  if (mineralCache) return mineralCache;

  mineralCache = parseCSV(mineralCSV, (values) => ({
    pkey: parseInt(values[0]),
    mineralname: values[1],
    shortlist: parseInt(values[2]),
    abbrev: values[3],
  }));

  return mineralCache;
}

/**
 * Load and parse lithology database
 */
export function loadLithologies(): Lithology[] {
  if (lithologyCache) return lithologyCache;

  lithologyCache = parseCSV(lithologyCSV, (values) => ({
    pkey: parseInt(values[0]),
    level1: values[1],
    level2: values[2],
    level3: values[3] || '',
    showhide: values[4],
  })).filter(lith => lith.showhide === 'show');

  return lithologyCache;
}

/**
 * Get only commonly used minerals (shortlist = 1)
 */
export function getCommonMinerals(): Mineral[] {
  return loadMinerals().filter(m => m.shortlist === 1);
}

/**
 * Search minerals by name (case-insensitive)
 */
export function searchMinerals(query: string, limit = 50): Mineral[] {
  if (!query) return getCommonMinerals().slice(0, limit);

  const lowercaseQuery = query.toLowerCase();
  const allMinerals = loadMinerals();

  // First, find exact matches and starts-with matches
  const exactMatches = allMinerals.filter(m =>
    m.mineralname.toLowerCase() === lowercaseQuery
  );

  const startsWithMatches = allMinerals.filter(m =>
    m.mineralname.toLowerCase().startsWith(lowercaseQuery) &&
    m.mineralname.toLowerCase() !== lowercaseQuery
  );

  // Then, find contains matches
  const containsMatches = allMinerals.filter(m =>
    m.mineralname.toLowerCase().includes(lowercaseQuery) &&
    !m.mineralname.toLowerCase().startsWith(lowercaseQuery)
  );

  // Combine and limit results
  return [...exactMatches, ...startsWithMatches, ...containsMatches].slice(0, limit);
}

/**
 * Get unique level1 categories from lithology data
 */
export function getLithologyLevel1Options(): string[] {
  const lithologies = loadLithologies();
  return Array.from(new Set(lithologies.map(l => l.level1))).filter(Boolean);
}

/**
 * Get level2 options for a given level1 category
 */
export function getLithologyLevel2Options(level1: string): string[] {
  const lithologies = loadLithologies();
  return Array.from(
    new Set(
      lithologies
        .filter(l => l.level1 === level1)
        .map(l => l.level2)
    )
  ).filter(Boolean);
}

/**
 * Get level3 options for given level1 and level2
 */
export function getLithologyLevel3Options(level1: string, level2: string): string[] {
  const lithologies = loadLithologies();
  return Array.from(
    new Set(
      lithologies
        .filter(l => l.level1 === level1 && l.level2 === level2)
        .map(l => l.level3)
    )
  ).filter(Boolean);
}
