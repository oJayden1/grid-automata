import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkGrid } from '../src/core/grid.js';
import { ElementId } from '../src/core/elements.js';

describe('ChunkGrid', () => {
  let grid: ChunkGrid;

  beforeEach(() => {
    grid = new ChunkGrid({ chunkSize: 32 });
  });

  it('correctly maps positive, zero, and negative world coordinates to chunk coordinates', () => {
    expect(grid.toChunkCoord(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(grid.toChunkCoord(31, 31)).toEqual({ cx: 0, cy: 0 });
    expect(grid.toChunkCoord(32, 32)).toEqual({ cx: 1, cy: 1 });
    expect(grid.toChunkCoord(-1, -1)).toEqual({ cx: -1, cy: -1 });
    expect(grid.toChunkCoord(-32, -32)).toEqual({ cx: -1, cy: -1 });
    expect(grid.toChunkCoord(-33, -33)).toEqual({ cx: -2, cy: -2 });

    expect(grid.toLocalX(0)).toBe(0);
    expect(grid.toLocalX(31)).toBe(31);
    expect(grid.toLocalX(32)).toBe(0);
    expect(grid.toLocalX(-1)).toBe(31);
    expect(grid.toLocalX(-32)).toBe(0);
  });

  it('dynamically instantiates chunks on demand', () => {
    expect(grid.getChunkCount()).toBe(0);
    grid.setCell(100, 200, ElementId.SAND);
    expect(grid.getChunkCount()).toBe(1);

    const { cx, cy } = grid.toChunkCoord(100, 200);
    expect(grid.hasChunk(cx, cy)).toBe(true);
    expect(grid.getCell(100, 200)).toBe(ElementId.SAND);
  });

  it('swaps cells within the same chunk', () => {
    grid.setCell(10, 10, ElementId.SAND, 1);
    grid.setCell(10, 11, ElementId.EMPTY, 1);

    grid.swapCells(10, 10, 10, 11, 2);
    expect(grid.getCell(10, 10)).toBe(ElementId.EMPTY);
    expect(grid.getCell(10, 11)).toBe(ElementId.SAND);
    expect(grid.getCellLastUpdated(10, 11)).toBe(2);
  });

  it('swaps cells across chunk boundaries seamlessly', () => {
    // Cell at right boundary of chunk (0, 0)
    grid.setCell(31, 10, ElementId.WATER, 1);
    // Cell at left boundary of chunk (1, 0)
    grid.setCell(32, 10, ElementId.EMPTY, 1);

    expect(grid.getChunkCount()).toBe(2);

    grid.swapCells(31, 10, 32, 10, 2);

    expect(grid.getCell(31, 10)).toBe(ElementId.EMPTY);
    expect(grid.getCell(32, 10)).toBe(ElementId.WATER);
  });

  it('wakes neighbor chunks when border cells are updated', () => {
    const chunk0 = grid.getOrCreateChunk(0, 0);
    const chunk1 = grid.getOrCreateChunk(1, 0);
    chunk0.sleep();
    chunk1.sleep();
    expect(chunk1.isActive).toBe(false);

    // Setting cell at right border of chunk 0 (lx = 31)
    grid.setCell(31, 5, ElementId.SAND);
    // Chunk 0 must be awake
    expect(chunk0.isActive).toBe(true);
    // Neighbor chunk 1 must also be woken up
    expect(chunk1.isActive).toBe(true);
  });
});
