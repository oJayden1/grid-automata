import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkGrid } from '../src/core/grid.js';
import { ElementId } from '../src/core/elements.js';
import { GridPathfinder } from '../src/ai/pathfinding.js';

describe('GridPathfinder', () => {
  let grid: ChunkGrid;

  beforeEach(() => {
    grid = new ChunkGrid({ chunkSize: 32 });
    // Flat ground from x = 0..30 at y = 10
    for (let x = 0; x <= 30; x++) {
      grid.setCell(x, 10, ElementId.SOLID);
    }
  });

  it('finds a direct horizontal path along ground', () => {
    const path = GridPathfinder.findPath(grid, { x: 5, y: 9 }, { x: 10, y: 9 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(6); // 5 to 10 inclusive
    expect(path![0]).toEqual({ x: 5, y: 9 });
    expect(path![path!.length - 1]).toEqual({ x: 10, y: 9 });
  });

  it('steps up a 1-block obstacle', () => {
    // Obstacle at x = 7, y = 9
    grid.setCell(7, 9, ElementId.SOLID);

    const path = GridPathfinder.findPath(grid, { x: 5, y: 9 }, { x: 9, y: 9 });
    expect(path).not.toBeNull();
    // Path should step up over x = 7 at y = 8
    const steppedOver = path!.some((pt) => pt.x === 7 && pt.y === 8);
    expect(steppedOver).toBe(true);
  });

  it('routes around lethal hazards such as lava', () => {
    // Place lava block on ground at x = 7, y = 9
    grid.setCell(7, 9, ElementId.LAVA);

    const path = GridPathfinder.findPath(grid, { x: 5, y: 9 }, { x: 10, y: 9 });
    expect(path).not.toBeNull();

    // Verify path avoids touching the lava cell
    for (const pt of path!) {
      expect(grid.getCell(pt.x, pt.y)).not.toBe(ElementId.LAVA);
    }
  });
});
