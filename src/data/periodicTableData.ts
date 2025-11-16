// Periodic Table Element Data
// Based on legacy Java code: org.strabospot.uiClasses.periodicTable

export interface PeriodicElement {
  number: number;
  symbol: string;
  name: string;
  column: number; // 0-17 (18 columns)
  row: number;    // 0-8 (9 rows including lanthanides/actinides)
  bgColor: string;
  category: 'alkali' | 'alkaline-earth' | 'transition' | 'post-transition' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble-gas' | 'lanthanide' | 'actinide';
}

// Color scheme from legacy app:
// #ffffc8 - Nonmetals (yellow-ish)
// #ffe2c0 - Noble gases (peach)
// #ffcac7 - Alkali metals (pink)
// #d1d3ff - Alkaline earth metals (light blue)
// #c0dcff - Transition metals (blue)
// #ccffc5 - Post-transition metals (light green)
// #dfeec0 - Metalloids (yellow-green)
// #caffff - Lanthanides (cyan)
// #c9ffeb - Actinides (mint)

export const periodicTableElements: PeriodicElement[] = [
  // Row 0
  { number: 1, symbol: 'H', name: 'Hydrogen', column: 0, row: 0, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 2, symbol: 'He', name: 'Helium', column: 17, row: 0, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 1
  { number: 3, symbol: 'Li', name: 'Lithium', column: 0, row: 1, bgColor: '#ffcac7', category: 'alkali' },
  { number: 4, symbol: 'Be', name: 'Beryllium', column: 1, row: 1, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 5, symbol: 'B', name: 'Boron', column: 12, row: 1, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 6, symbol: 'C', name: 'Carbon', column: 13, row: 1, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 7, symbol: 'N', name: 'Nitrogen', column: 14, row: 1, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 8, symbol: 'O', name: 'Oxygen', column: 15, row: 1, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 9, symbol: 'F', name: 'Fluorine', column: 16, row: 1, bgColor: '#ffffc8', category: 'halogen' },
  { number: 10, symbol: 'Ne', name: 'Neon', column: 17, row: 1, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 2
  { number: 11, symbol: 'Na', name: 'Sodium', column: 0, row: 2, bgColor: '#ffcac7', category: 'alkali' },
  { number: 12, symbol: 'Mg', name: 'Magnesium', column: 1, row: 2, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 13, symbol: 'Al', name: 'Aluminum', column: 12, row: 2, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 14, symbol: 'Si', name: 'Silicon', column: 13, row: 2, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 15, symbol: 'P', name: 'Phosphorus', column: 14, row: 2, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 16, symbol: 'S', name: 'Sulfur', column: 15, row: 2, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 17, symbol: 'Cl', name: 'Chlorine', column: 16, row: 2, bgColor: '#ffffc8', category: 'halogen' },
  { number: 18, symbol: 'Ar', name: 'Argon', column: 17, row: 2, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 3
  { number: 19, symbol: 'K', name: 'Potassium', column: 0, row: 3, bgColor: '#ffcac7', category: 'alkali' },
  { number: 20, symbol: 'Ca', name: 'Calcium', column: 1, row: 3, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 21, symbol: 'Sc', name: 'Scandium', column: 2, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 22, symbol: 'Ti', name: 'Titanium', column: 3, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 23, symbol: 'V', name: 'Vanadium', column: 4, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 24, symbol: 'Cr', name: 'Chromium', column: 5, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 25, symbol: 'Mn', name: 'Manganese', column: 6, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 26, symbol: 'Fe', name: 'Iron', column: 7, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 27, symbol: 'Co', name: 'Cobalt', column: 8, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 28, symbol: 'Ni', name: 'Nickel', column: 9, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 29, symbol: 'Cu', name: 'Copper', column: 10, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 30, symbol: 'Zn', name: 'Zinc', column: 11, row: 3, bgColor: '#c0dcff', category: 'transition' },
  { number: 31, symbol: 'Ga', name: 'Gallium', column: 12, row: 3, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 32, symbol: 'Ge', name: 'Germanium', column: 13, row: 3, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 33, symbol: 'As', name: 'Arsenic', column: 14, row: 3, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 34, symbol: 'Se', name: 'Selenium', column: 15, row: 3, bgColor: '#ffffc8', category: 'nonmetal' },
  { number: 35, symbol: 'Br', name: 'Bromine', column: 16, row: 3, bgColor: '#ffffc8', category: 'halogen' },
  { number: 36, symbol: 'Kr', name: 'Krypton', column: 17, row: 3, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 4
  { number: 37, symbol: 'Rb', name: 'Rubidium', column: 0, row: 4, bgColor: '#ffcac7', category: 'alkali' },
  { number: 38, symbol: 'Sr', name: 'Strontium', column: 1, row: 4, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 39, symbol: 'Y', name: 'Yttrium', column: 2, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 40, symbol: 'Zr', name: 'Zirconium', column: 3, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 41, symbol: 'Nb', name: 'Niobium', column: 4, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 42, symbol: 'Mo', name: 'Molybdenum', column: 5, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 43, symbol: 'Tc', name: 'Technetium', column: 6, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 44, symbol: 'Ru', name: 'Ruthenium', column: 7, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 45, symbol: 'Rh', name: 'Rhodium', column: 8, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 46, symbol: 'Pd', name: 'Palladium', column: 9, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 47, symbol: 'Ag', name: 'Silver', column: 10, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 48, symbol: 'Cd', name: 'Cadmium', column: 11, row: 4, bgColor: '#c0dcff', category: 'transition' },
  { number: 49, symbol: 'In', name: 'Indium', column: 12, row: 4, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 50, symbol: 'Sn', name: 'Tin', column: 13, row: 4, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 51, symbol: 'Sb', name: 'Antimony', column: 14, row: 4, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 52, symbol: 'Te', name: 'Tellurium', column: 15, row: 4, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 53, symbol: 'I', name: 'Iodine', column: 16, row: 4, bgColor: '#ffffc8', category: 'halogen' },
  { number: 54, symbol: 'Xe', name: 'Xenon', column: 17, row: 4, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 5
  { number: 55, symbol: 'Cs', name: 'Cesium', column: 0, row: 5, bgColor: '#ffcac7', category: 'alkali' },
  { number: 56, symbol: 'Ba', name: 'Barium', column: 1, row: 5, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 72, symbol: 'Hf', name: 'Hafnium', column: 3, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 73, symbol: 'Ta', name: 'Tantalum', column: 4, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 74, symbol: 'W', name: 'Tungsten', column: 5, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 75, symbol: 'Re', name: 'Rhenium', column: 6, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 76, symbol: 'Os', name: 'Osmium', column: 7, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 77, symbol: 'Ir', name: 'Iridium', column: 8, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 78, symbol: 'Pt', name: 'Platinum', column: 9, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 79, symbol: 'Au', name: 'Gold', column: 10, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 80, symbol: 'Hg', name: 'Mercury', column: 11, row: 5, bgColor: '#c0dcff', category: 'transition' },
  { number: 81, symbol: 'Tl', name: 'Thallium', column: 12, row: 5, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 82, symbol: 'Pb', name: 'Lead', column: 13, row: 5, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 83, symbol: 'Bi', name: 'Bismuth', column: 14, row: 5, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 84, symbol: 'Po', name: 'Polonium', column: 15, row: 5, bgColor: '#dfeec0', category: 'metalloid' },
  { number: 85, symbol: 'At', name: 'Astatine', column: 16, row: 5, bgColor: '#ffffc8', category: 'halogen' },
  { number: 86, symbol: 'Rn', name: 'Radon', column: 17, row: 5, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 6
  { number: 87, symbol: 'Fr', name: 'Francium', column: 0, row: 6, bgColor: '#ffcac7', category: 'alkali' },
  { number: 88, symbol: 'Ra', name: 'Radium', column: 1, row: 6, bgColor: '#d1d3ff', category: 'alkaline-earth' },
  { number: 104, symbol: 'Rf', name: 'Rutherfordium', column: 3, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 105, symbol: 'Db', name: 'Dubnium', column: 4, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 106, symbol: 'Sg', name: 'Seaborgium', column: 5, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 107, symbol: 'Bh', name: 'Bohrium', column: 6, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 108, symbol: 'Hs', name: 'Hassium', column: 7, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 109, symbol: 'Mt', name: 'Meitnerium', column: 8, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 110, symbol: 'Ds', name: 'Darmstadtium', column: 9, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 111, symbol: 'Rg', name: 'Roentgenium', column: 10, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 112, symbol: 'Cn', name: 'Copernicium', column: 11, row: 6, bgColor: '#c0dcff', category: 'transition' },
  { number: 113, symbol: 'Nh', name: 'Nihonium', column: 12, row: 6, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 114, symbol: 'Fl', name: 'Flerovium', column: 13, row: 6, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 115, symbol: 'Mc', name: 'Moscovium', column: 14, row: 6, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 116, symbol: 'Lv', name: 'Livermorium', column: 15, row: 6, bgColor: '#ccffc5', category: 'post-transition' },
  { number: 117, symbol: 'Ts', name: 'Tennessine', column: 16, row: 6, bgColor: '#ffffc8', category: 'halogen' },
  { number: 118, symbol: 'Og', name: 'Oganesson', column: 17, row: 6, bgColor: '#ffe2c0', category: 'noble-gas' },

  // Row 7 - Lanthanides
  { number: 57, symbol: 'La', name: 'Lanthanum', column: 3, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 58, symbol: 'Ce', name: 'Cerium', column: 4, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 59, symbol: 'Pr', name: 'Praseodymium', column: 5, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 60, symbol: 'Nd', name: 'Neodymium', column: 6, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 61, symbol: 'Pm', name: 'Promethium', column: 7, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 62, symbol: 'Sm', name: 'Samarium', column: 8, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 63, symbol: 'Eu', name: 'Europium', column: 9, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 64, symbol: 'Gd', name: 'Gadolinium', column: 10, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 65, symbol: 'Tb', name: 'Terbium', column: 11, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 66, symbol: 'Dy', name: 'Dysprosium', column: 12, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 67, symbol: 'Ho', name: 'Holmium', column: 13, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 68, symbol: 'Er', name: 'Erbium', column: 14, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 69, symbol: 'Tm', name: 'Thulium', column: 15, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 70, symbol: 'Yb', name: 'Ytterbium', column: 16, row: 7, bgColor: '#caffff', category: 'lanthanide' },
  { number: 71, symbol: 'Lu', name: 'Lutetium', column: 17, row: 7, bgColor: '#caffff', category: 'lanthanide' },

  // Row 8 - Actinides
  { number: 89, symbol: 'Ac', name: 'Actinium', column: 3, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 90, symbol: 'Th', name: 'Thorium', column: 4, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 91, symbol: 'Pa', name: 'Protactinium', column: 5, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 92, symbol: 'U', name: 'Uranium', column: 6, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 93, symbol: 'Np', name: 'Neptunium', column: 7, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 94, symbol: 'Pu', name: 'Plutonium', column: 8, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 95, symbol: 'Am', name: 'Americium', column: 9, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 96, symbol: 'Cm', name: 'Curium', column: 10, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 97, symbol: 'Bk', name: 'Berkelium', column: 11, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 98, symbol: 'Cf', name: 'Californium', column: 12, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 99, symbol: 'Es', name: 'Einsteinium', column: 13, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 100, symbol: 'Fm', name: 'Fermium', column: 14, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 101, symbol: 'Md', name: 'Mendelevium', column: 15, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 102, symbol: 'No', name: 'Nobelium', column: 16, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
  { number: 103, symbol: 'Lr', name: 'Lawrencium', column: 17, row: 8, bgColor: '#c9ffeb', category: 'actinide' },
];

// Helper function to get element by symbol
export function getElementBySymbol(symbol: string): PeriodicElement | undefined {
  return periodicTableElements.find(el => el.symbol === symbol);
}

// Helper function to get all elements in a row
export function getElementsByRow(row: number): PeriodicElement[] {
  return periodicTableElements.filter(el => el.row === row);
}

// Helper function to get all elements in a category
export function getElementsByCategory(category: PeriodicElement['category']): PeriodicElement[] {
  return periodicTableElements.filter(el => el.category === category);
}
