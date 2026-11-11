import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';

describe('Performance & Chunk Sleep Optimization', () => {
  let sim: Simulator;

  beforeEach(() => {
    sim = new Simulator(undefined, { sleepThresholdTicks: 2 });
  });

  it('puts chunks to sleep when no elements move for threshold ticks', () => {
    // Fill a 10x10 block of solid rock
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        sim.grid.setCell(x, y, ElementId.SOLID);
      }
    }

    const chunk = sim.grid.getOrCreateChunk(0, 0);
    expect(chunk.isActive).toBe(true);

    // Tick 1: 0 movements
    sim.step();
    expect(chunk.isActive).toBe(true);
    expect(chunk.inactiveTicks).toBe(1);

    // Tick 2: 0 movements -> reaches threshold 2 -> sleeps
    sim.step();
    expect(chunk.isActive).toBe(false);
  });

  it('wakes sleeping chunks when dynamic particles are introduced', () => {
    // Put chunk (0, 0) to sleep
    const chunk = sim.grid.getOrCreateChunk(0, 0);
    chunk.sleep();
    expect(chunk.isActive).toBe(false);

    // Adding sand to the chunk wakes it up
    sim.grid.setCell(15, 10, ElementId.SAND);
    expect(chunk.isActive).toBe(true);

    // Stepping updates the sand
    const stats = sim.step();
    expect(stats.activeChunks).toBe(1);
    expect(stats.particlesMoved).toBe(1);
    expect(sim.grid.getCell(15, 11)).toBe(ElementId.SAND);
  });

  it('maintains high tick speed under multi-chunk load', () => {
    // Initialize 16 chunks (4x4 chunks = 128x128 cells)
    const gridSize = 128;
    for (let x = 0; x < gridSize; x += 4) {
      sim.grid.setCell(x, 0, ElementId.SAND);
      sim.grid.setCell(x + 1, 0, ElementId.WATER);
    }

    // Step 50 ticks
    const durations: number[] = [];
    for (let t = 0; t < 50; t++) {
      const stats = sim.step();
      durations.push(stats.durationMs);
    }

    const meanDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    // Tick duration should be fast (< 25ms per tick in headless Node)
    expect(meanDuration).toBeLessThan(25);
  });
});
