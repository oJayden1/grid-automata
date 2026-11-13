import { describe, it, expect } from 'vitest';
import { ChunkGrid } from '../src/core/grid.js';
import { ElementId } from '../src/core/elements.js';
import { generateWorld } from '../src/game/world-generator.js';
import { DEFAULT_WORLD_BOUNDS } from '../src/game/types.js';

describe('WorldGenerator', () => {
  it('generates deterministic terrain with bedrock containment for a fixed seed', () => {
    const gridA = new ChunkGrid();
    const gridB = new ChunkGrid();

    const infoA = generateWorld(gridA, { seed: 4242, preset: 'caverns' });
    const infoB = generateWorld(gridB, { seed: 4242, preset: 'caverns' });

    expect(infoA.playerSpawn).toEqual(infoB.playerSpawn);
    expect(infoA.npcSpawns.length).toBeGreaterThanOrEqual(2);

    // Sample interior terrain matches identically
    for (let x = -40; x <= 40; x += 4) {
      for (let y = 30; y <= 120; y += 5) {
        expect(gridA.getCell(x, y)).toBe(gridB.getCell(x, y));
      }
    }

    // Bedrock border encloses the playable world
    expect(gridA.getCell(DEFAULT_WORLD_BOUNDS.minX, 50)).toBe(ElementId.SOLID);
    expect(gridA.getCell(DEFAULT_WORLD_BOUNDS.maxX, 50)).toBe(ElementId.SOLID);
    expect(gridA.getCell(0, DEFAULT_WORLD_BOUNDS.maxY)).toBe(ElementId.SOLID);
  });

  it('supports oasis and flat presets with safe player spawn clearance', () => {
    for (const preset of ['caverns', 'oasis', 'flat'] as const) {
      const grid = new ChunkGrid();
      const info = generateWorld(grid, { seed: 101, preset });
      const spawnElem = grid.getCell(info.playerSpawn.x, info.playerSpawn.y);
      expect(spawnElem).toBe(ElementId.EMPTY);
    }
  });
});
