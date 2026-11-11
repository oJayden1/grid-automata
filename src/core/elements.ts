/**
 * Element definitions and physical properties for the cellular automata engine.
 */

export const enum ElementId {
  EMPTY = 0,
  SOLID = 1,
  SAND = 2,
  WATER = 3,
  LAVA = 4,
  STONE = 5,
  OBSIDIAN = 6,
  STEAM = 7,
}

export type ElementCategory = 'empty' | 'solid' | 'powder' | 'liquid' | 'gas';

export interface ElementDef {
  id: ElementId;
  name: string;
  category: ElementCategory;
  density: number;
  color: number; // Hex 0xRRGGBB
}

export const ELEMENT_DEFS: Readonly<Record<ElementId, ElementDef>> = {
  [ElementId.EMPTY]: {
    id: ElementId.EMPTY,
    name: 'Empty',
    category: 'empty',
    density: 0,
    color: 0x000000,
  },
  [ElementId.SOLID]: {
    id: ElementId.SOLID,
    name: 'Solid',
    category: 'solid',
    density: 9999,
    color: 0x555555,
  },
  [ElementId.SAND]: {
    id: ElementId.SAND,
    name: 'Sand',
    category: 'powder',
    density: 10,
    color: 0xe0c068,
  },
  [ElementId.WATER]: {
    id: ElementId.WATER,
    name: 'Water',
    category: 'liquid',
    density: 2,
    color: 0x3070e0,
  },
  [ElementId.LAVA]: {
    id: ElementId.LAVA,
    name: 'Lava',
    category: 'liquid',
    density: 6,
    color: 0xff4500,
  },
  [ElementId.STONE]: {
    id: ElementId.STONE,
    name: 'Stone',
    category: 'solid',
    density: 20,
    color: 0x888888,
  },
  [ElementId.OBSIDIAN]: {
    id: ElementId.OBSIDIAN,
    name: 'Obsidian',
    category: 'solid',
    density: 30,
    color: 0x241434,
  },
  [ElementId.STEAM]: {
    id: ElementId.STEAM,
    name: 'Steam',
    category: 'gas',
    density: -1,
    color: 0xddddf0,
  },
};

// Fast lookup arrays indexed by ElementId (0..7)
export const DENSITIES = new Float32Array([
  0,    // EMPTY
  9999, // SOLID
  10,   // SAND
  2,    // WATER
  6,    // LAVA
  20,   // STONE
  30,   // OBSIDIAN
  -1,   // STEAM
]);

export function isFluid(id: ElementId): boolean {
  return id === ElementId.WATER || id === ElementId.LAVA;
}

export function isPowder(id: ElementId): boolean {
  return id === ElementId.SAND;
}

export function isStaticSolid(id: ElementId): boolean {
  return id === ElementId.SOLID || id === ElementId.STONE || id === ElementId.OBSIDIAN;
}

export function isGas(id: ElementId): boolean {
  return id === ElementId.STEAM;
}
