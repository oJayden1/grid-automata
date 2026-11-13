import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';

describe('Sand Simulation Rule', () => {
  let sim: Simulator;

  beforeEach(() => {
    sim = new Simulator();
  });

  it('falls straight down in free air', () => {
    sim.grid.setCell(10, 5, ElementId.SAND);
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.SAND);
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.EMPTY);

    sim.step();

    expect(sim.grid.getCell(10, 5)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.SAND);

    sim.step();
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(10, 7)).toBe(ElementId.SAND);
  });

  it('cascades diagonally to form a natural mound/pyramid when hitting a floor', () => {
    // Solid floor at y = 10
    for (let x = 0; x < 20; x++) {
      sim.grid.setCell(x, 10, ElementId.SOLID);
    }

    // Drop two sand particles at the same column
    sim.grid.setCell(10, 9, ElementId.SAND); // sitting on floor
    sim.grid.setCell(10, 8, ElementId.SAND); // one above

    sim.step();

    // First sand stays at (10, 9), second slides to either (9, 9) or (11, 9)
    expect(sim.grid.getCell(10, 9)).toBe(ElementId.SAND);
    const leftOrRight =
      sim.grid.getCell(9, 9) === ElementId.SAND || sim.grid.getCell(11, 9) === ElementId.SAND;
    expect(leftOrRight).toBe(true);
  });

  it('sinks through water due to higher density', () => {
    // Container vessel: floor at y = 7, walls at x = 9 and x = 11
    sim.grid.setCell(9, 7, ElementId.SOLID);
    sim.grid.setCell(10, 7, ElementId.SOLID);
    sim.grid.setCell(11, 7, ElementId.SOLID);
    sim.grid.setCell(9, 6, ElementId.SOLID);
    sim.grid.setCell(11, 6, ElementId.SOLID);
    sim.grid.setCell(9, 5, ElementId.SOLID);
    sim.grid.setCell(11, 5, ElementId.SOLID);

    // Water at y = 6, Sand at y = 5
    sim.grid.setCell(10, 6, ElementId.WATER);
    sim.grid.setCell(10, 5, ElementId.SAND);

    sim.step();

    // Sand displaces water downward, water moves up to (10, 5)
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.SAND);
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.WATER);
  });

  it('sinks through lava due to density disparity', () => {
    // Container vessel: floor at y = 7, walls at x = 9 and x = 11
    sim.grid.setCell(9, 7, ElementId.SOLID);
    sim.grid.setCell(10, 7, ElementId.SOLID);
    sim.grid.setCell(11, 7, ElementId.SOLID);
    sim.grid.setCell(9, 6, ElementId.SOLID);
    sim.grid.setCell(11, 6, ElementId.SOLID);
    sim.grid.setCell(9, 5, ElementId.SOLID);
    sim.grid.setCell(11, 5, ElementId.SOLID);

    // Lava at y = 6, Sand at y = 5
    sim.grid.setCell(10, 6, ElementId.LAVA);
    sim.grid.setCell(10, 5, ElementId.SAND);

    sim.step();

    // Sand sinks into lava, lava moves up to (10, 5)
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.SAND);
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.LAVA);
  });

  it('remains at rest when blocked below and on both diagonals', () => {
    sim.grid.setCell(10, 10, ElementId.SAND);
    sim.grid.setCell(10, 11, ElementId.SOLID); // below
    sim.grid.setCell(9, 11, ElementId.SOLID);  // down-left
    sim.grid.setCell(11, 11, ElementId.SOLID); // down-right

    const stats = sim.step();

    expect(sim.grid.getCell(10, 10)).toBe(ElementId.SAND);
    expect(stats.particlesMoved).toBe(0);
  });
});
