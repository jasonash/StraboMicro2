/**
 * Default mineral keys of the Quick Classify toolbar (Point Count, Quick Edit):
 * the keys a new install starts with and what Configure Shortcuts > Reset to
 * Defaults restores. Common rock-forming minerals only; non-mineral categories
 * (matrix, void, lithic, opaque) are left out because the mineralogy schema
 * only supports mineral names.
 */
export const DEFAULT_QUICK_CLASSIFY_SHORTCUTS: Readonly<Record<string, string>> = {
  'q': 'Quartz',
  'p': 'Plagioclase',
  'k': 'K-Feldspar',
  'o': 'Olivine',
  'x': 'Clinopyroxene',
  'a': 'Amphibole',
  'h': 'Hornblende',
  'b': 'Biotite',
  'm': 'Muscovite',
  'g': 'Garnet',
  'c': 'Calcite',
  'd': 'Dolomite',
  'e': 'Epidote',
  's': 'Serpentine',
  'z': 'Zircon',
};
