import { describe, it, expect, beforeEach } from 'vitest';
import { Chunk } from '../src/core/chunk.js';
import { ElementId } from '../src/core/elements.js';

describe('Chunk', () => {
  let chunk: Chunk;

  beforeEach(() => {
    chunk = new Chunk(0, 0, 32);
  });

  it('initializes with specified size and default empty cells', () => {
    expect(chunk.cx).toBe(0);
    expect(chunk.cy).toBe(0);
    expect(chunk.size).toBe(32);
    expect(chunk.cellCount).toBe(1024);
    expect(chunk.isActive).toBe(false);
    expect(chunk.countNonEmpty()).toBe(0);

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        expect(chunk.get(x, y)).toBe(ElementId.EMPTY);
      }
    }
  });

  it('sets and gets elements accurately', () => {
    chunk.set(5, 10, ElementId.SAND, 1);
    expect(chunk.get(5, 10)).toBe(ElementId.SAND);
    expect(chunk.lastUpdated[chunk.getIndex(5, 10)]).toBe(1);
    expect(chunk.isActive).toBe(true);
    expect(chunk.countNonEmpty()).toBe(1);
  });

  it('safely handles out-of-bounds get and set', () => {
    expect(chunk.get(-1, 0)).toBe(ElementId.EMPTY);
    expect(chunk.get(32, 5)).toBe(ElementId.EMPTY);
    expect(chunk.get(0, -5)).toBe(ElementId.EMPTY);
    expect(chunk.get(10, 35)).toBe(ElementId.EMPTY);

    // Should not throw
    chunk.set(-1, 0, ElementId.SAND);
    chunk.set(32, 0, ElementId.SAND);
    expect(chunk.countNonEmpty()).toBe(0);
  });

  it('tracks dirty bounding box', () => {
    expect(chunk.hasDirtyRect).toBe(false);
    chunk.set(10, 15, ElementId.WATER);
    expect(chunk.hasDirtyRect).toBe(true);
    expect(chunk.dirtyMinX).toBe(10);
    expect(chunk.dirtyMaxX).toBe(10);
    expect(chunk.dirtyMinY).toBe(15);
    expect(chunk.dirtyMaxY).toBe(15);

    chunk.set(4, 25, ElementId.SAND);
    expect(chunk.dirtyMinX).toBe(4);
    expect(chunk.dirtyMaxX).toBe(10);
    expect(chunk.dirtyMinY).toBe(15);
    expect(chunk.dirtyMaxY).toBe(25);
  });

  it('manages sleep and wake transitions', () => {
    expect(chunk.isActive).toBe(false);
    chunk.wakeUp();
    expect(chunk.isActive).toBe(true);
    expect(chunk.inactiveTicks).toBe(0);

    chunk.inactiveTicks = 5;
    chunk.sleep();
    expect(chunk.isActive).toBe(false);

    chunk.wakeUp();
    expect(chunk.isActive).toBe(true);
    expect(chunk.inactiveTicks).toBe(0);
  });
});
