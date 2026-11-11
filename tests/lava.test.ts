import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';

describe('Lava Simulation Rule', () => {
  let sim: Simulator;

  beforeEach(() => {
    // Set viscosity skip to 0 for deterministic unit testing of motion
    sim = new Simulator(undefined, { lavaViscositySkip: 0 });
  });

  it('flows downward under gravity', () => {
    sim.grid.setCell(10, 5, ElementId.LAVA);
    sim.step();
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.LAVA);
  });

  it('oozes sideways when blocked below (dispersion rate = 1)', () => {
    // Floor spanning x = 9..11 at y = 10
    sim.grid.setCell(9, 10, ElementId.SOLID);
    sim.grid.setCell(10, 10, ElementId.SOLID);
    sim.grid.setCell(11, 10, ElementId.SOLID);
    sim.grid.setCell(10, 9, ElementId.LAVA);

    sim.step();

    // Lava moves 1 cell left or right at y = 9
    expect(sim.grid.getCell(10, 9)).toBe(ElementId.EMPTY);
    const moved =
      sim.grid.getCell(9, 9) === ElementId.LAVA || sim.grid.getCell(11, 9) === ElementId.LAVA;
    expect(moved).toBe(true);
  });

  it('exhibits viscous flow compared to rapid water dispersion', () => {
    // With normal viscosity skip (0.35), lava has ticks where it rests
    const viscousSim = new Simulator(undefined, { lavaViscositySkip: 0.99 });
    viscousSim.grid.setCell(10, 5, ElementId.LAVA);
    viscousSim.step();

    // With 0.99 skip, lava should remain in place on most single ticks
    expect(viscousSim.grid.getCell(10, 5)).toBe(ElementId.LAVA);
  });
});
