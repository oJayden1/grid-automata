import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { DEFAULT_WORLD_BOUNDS, WorldBounds, WorldPreset } from './types.js';

export interface WorldGenerationOptions {
  seed?: number;
  preset?: WorldPreset;
  bounds?: WorldBounds;
}

export interface GeneratedWorldInfo {
  seed: number;
  preset: WorldPreset;
  bounds: WorldBounds;
  playerSpawn: { x: number; y: number };
  npcSpawns: Array<{ x: number; y: number; name: string }>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = x - x0;
  const sy = y - y0;
  const ux = sx * sx * (3 - 2 * sx);
  const uy = sy * sy * (3 - 2 * sy);

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const ix0 = n00 + (n10 - n00) * ux;
  const ix1 = n01 + (n11 - n01) * ux;
  return ix0 + (ix1 - ix0) * uy;
}

function fbm1D(x: number, seed: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 0.035;
  for (let i = 0; i < 3; i++) {
    value += amp * valueNoise2D(x * freq, i * 17.3, seed);
    freq *= 2.1;
    amp *= 0.5;
  }
  return value;
}

function fbm2D(x: number, y: number, seed: number): number {
  let value = 0;
  let amp = 0.55;
  let freq = 0.085;
  for (let i = 0; i < 3; i++) {
    value += amp * valueNoise2D(x * freq, y * freq, seed + i * 97);
    freq *= 2.05;
    amp *= 0.5;
  }
  return value;
}

/**
 * Generates playable procedural terrain into a ChunkGrid.
 */
export function generateWorld(
  grid: ChunkGrid,
  options: WorldGenerationOptions = {}
): GeneratedWorldInfo {
  grid.clear();

  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  const preset: WorldPreset = options.preset ?? 'caverns';
  const bounds: WorldBounds = options.bounds ?? { ...DEFAULT_WORLD_BOUNDS };
  const rng = mulberry32(seed);

  const { minX, maxX, minY, maxY } = bounds;
  const spawnX = Math.floor((minX + maxX) / 2) - 32; // x = 0 for default -96..159
  let spawnSurfaceY = Math.floor(minY + (maxY - minY) * 0.34);

  if (preset === 'flat') {
    const floorY = maxY - 22;
    spawnSurfaceY = floorY;

    for (let x = minX; x <= maxX; x++) {
      for (let y = floorY; y < maxY; y++) {
        const elem = y < floorY + 5 ? ElementId.STONE : ElementId.OBSIDIAN;
        grid.setCell(x, y, elem);
      }
    }

    // Place a small starter sand pile & water pond to invite immediate experimentation
    for (let x = spawnX + 18; x <= spawnX + 30; x++) {
      for (let y = floorY - 6; y < floorY; y++) {
        if (Math.abs(x - (spawnX + 24)) <= floorY - y) {
          grid.setCell(x, y, ElementId.SAND);
        }
      }
    }
    for (let x = spawnX - 28; x <= spawnX - 16; x++) {
      grid.setCell(x, floorY, ElementId.EMPTY);
      grid.setCell(x, floorY + 1, ElementId.WATER);
      grid.setCell(x, floorY + 2, ElementId.WATER);
    }

    stampBedrockBorders(grid, bounds);
    return {
      seed,
      preset,
      bounds,
      playerSpawn: { x: spawnX, y: spawnSurfaceY - 2 },
      npcSpawns: [
        { x: spawnX - 8, y: spawnSurfaceY - 2, name: 'npc-miner-1' },
        { x: spawnX + 10, y: spawnSurfaceY - 2, name: 'npc-scout-2' },
      ],
    };
  }

  // Procedural terrain heightmap for 'caverns' and 'oasis'
  const heights = new Map<number, number>();
  const baseSurfaceY = preset === 'oasis' ? Math.floor(maxY * 0.4) : Math.floor(maxY * 0.34);

  for (let x = minX; x <= maxX; x++) {
    const hillOffset = (fbm1D(x + 500, seed) - 0.5) * (preset === 'oasis' ? 28 : 22);
    // Flatten gently near player spawn clearing
    const distFromSpawn = Math.abs(x - spawnX);
    const flattenFactor = Math.max(0, Math.min(1, (distFromSpawn - 6) / 14));
    let surfaceY = Math.round(baseSurfaceY + hillOffset * flattenFactor);
    surfaceY = Math.max(minY + 12, Math.min(maxY - 28, surfaceY));
    heights.set(x, surfaceY);
  }

  spawnSurfaceY = heights.get(spawnX) ?? baseSurfaceY;
  const oasisCenterX = spawnX + 36;
  const oasisWaterLevel = (heights.get(oasisCenterX) ?? baseSurfaceY) + 1;

  for (let x = minX + 1; x <= maxX - 1; x++) {
    const surfaceY = heights.get(x)!;
    const sandDepth = preset === 'oasis' ? 7 + Math.floor(rng() * 4) : 3 + Math.floor(rng() * 3);

    for (let y = surfaceY; y <= maxY - 2; y++) {
      const depth = y - surfaceY;

      // Carve underground caverns (skip right under spawn camp)
      const nearSpawnCamp = Math.abs(x - spawnX) <= 10 && y <= spawnSurfaceY + 10;
      if (!nearSpawnCamp && depth > 7 && y < maxY - 5) {
        const caveVal = fbm2D(x + 200, y + 200, seed + 13);
        const cavernThreshold = preset === 'caverns' ? 0.58 : 0.65;

        if (caveVal > cavernThreshold) {
          // Deep caves hold volcanic lava pockets or water pools
          if (y > maxY - 24 && caveVal > 0.72) {
            grid.setCell(x, y, ElementId.LAVA);
          } else if (y > maxY - 46 && y < maxY - 26 && caveVal > 0.74) {
            grid.setCell(x, y, ElementId.WATER);
          }
          continue;
        }
      }

      // Solid strata
      if (depth < sandDepth) {
        grid.setCell(x, y, ElementId.SAND);
      } else if (y > maxY - 18 && fbm2D(x, y, seed + 77) > 0.52) {
        grid.setCell(x, y, ElementId.OBSIDIAN);
      } else {
        grid.setCell(x, y, ElementId.STONE);
      }
    }

    // Surface Oasis Basin
    if (Math.abs(x - oasisCenterX) <= 14) {
      const basinDepth = Math.round(7 * (1 - Math.pow((x - oasisCenterX) / 15, 2)));
      const basinFloor = oasisWaterLevel + basinDepth;
      for (let y = Math.min(surfaceY, oasisWaterLevel - 3); y <= basinFloor; y++) {
        if (y >= oasisWaterLevel) {
          grid.setCell(x, y, ElementId.WATER);
        } else {
          grid.setCell(x, y, ElementId.EMPTY);
        }
      }
      grid.setCell(x, basinFloor + 1, ElementId.STONE);
      grid.setCell(x, basinFloor + 2, ElementId.STONE);
    }
  }

  // Create a visible surface volcanic fissure on the opposite side for quench experiments
  if (preset === 'caverns') {
    const fissureX = spawnX - 42;
    const fissureTop = (heights.get(fissureX) ?? baseSurfaceY) + 1;
    for (let x = fissureX - 7; x <= fissureX + 7; x++) {
      const depth = Math.round(9 * (1 - Math.pow((x - fissureX) / 8, 2)));
      for (let y = fissureTop - 2; y <= fissureTop + depth; y++) {
        if (y >= fissureTop + 3) {
          grid.setCell(x, y, ElementId.LAVA);
        } else {
          grid.setCell(x, y, ElementId.EMPTY);
        }
      }
      grid.setCell(x, fissureTop + depth + 1, ElementId.OBSIDIAN);
      grid.setCell(x, fissureTop + depth + 2, ElementId.OBSIDIAN);
    }
  }

  // Ensure a clear safe camp platform around player spawn + starter resources nearby
  for (let x = spawnX - 8; x <= spawnX + 8; x++) {
    for (let y = spawnSurfaceY - 10; y < spawnSurfaceY; y++) {
      grid.setCell(x, y, ElementId.EMPTY);
    }
    grid.setCell(x, spawnSurfaceY, ElementId.STONE);
    grid.setCell(x, spawnSurfaceY + 1, ElementId.STONE);
  }

  // Starter sand mound near camp so NPCs immediately gather & physics settle visibly
  for (let x = spawnX + 10; x <= spawnX + 15; x++) {
    for (let y = spawnSurfaceY - 4; y < spawnSurfaceY; y++) {
      if (Math.abs(x - (spawnX + 12)) <= spawnSurfaceY - y) {
        grid.setCell(x, y, ElementId.SAND);
      }
    }
  }

  stampBedrockBorders(grid, bounds);

  return {
    seed,
    preset,
    bounds,
    playerSpawn: { x: spawnX, y: spawnSurfaceY - 2 },
    npcSpawns: [
      { x: spawnX - 5, y: spawnSurfaceY - 2, name: 'npc-miner-1' },
      { x: spawnX + 6, y: spawnSurfaceY - 2, name: 'npc-scout-2' },
      { x: spawnX + 18, y: (heights.get(spawnX + 18) ?? spawnSurfaceY) - 2, name: 'npc-builder-3' },
    ],
  };
}

function stampBedrockBorders(grid: ChunkGrid, bounds: WorldBounds): void {
  const { minX, maxX, minY, maxY } = bounds;
  for (let x = minX; x <= maxX; x++) {
    grid.setCell(x, minY, ElementId.SOLID);
    grid.setCell(x, maxY, ElementId.SOLID);
    grid.setCell(x, maxY - 1, ElementId.SOLID);
  }
  for (let y = minY; y <= maxY; y++) {
    grid.setCell(minX, y, ElementId.SOLID);
    grid.setCell(maxX, y, ElementId.SOLID);
  }
}
