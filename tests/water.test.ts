import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';

describe('Water Simulation Rule', () => {
  let sim: Simulator;

  beforeEach(() => {
    sim = new Simulator();
  });

  it('falls straight down under gravity', () => {
    sim.grid.setCell(15, 5, ElementId.WATER);
    sim.step();
    expect(sim.grid.getCell(15, 5)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(15, 6)).toBe(ElementId.WATER);
  });

  it('disperses horizontally when blocked below', () => {
    // Floor spanning x = 0..30 at y = 10
    for (let x = 0; x <= 30; x++) {
      sim.grid.setCell(x, 10, ElementId.SOLID);
    }
    sim.grid.setCell(15, 9, ElementId.WATER);

    sim.step();

    // Water must have moved horizontally away from (15, 9) along the floor
    expect(sim.grid.getCell(15, 9)).toBe(ElementId.EMPTY);
    let foundWater = false;
    for (let x = 0; x <= 30; x++) {
      if (x !== 15 && sim.grid.getCell(x, 9) === ElementId.WATER) {
        foundWater = true;
        break;
      }
    }
    expect(foundWater).toBe(true);
  });

  it('equalizes across a container floor', () => {
    // Create a container: floor from x=10..20, walls at x=9 and x=21
    for (let x = 9; x <= 21; x++) {
      sim.grid.setCell(x, 15, ElementId.SOLID); // floor
    }
    for (let y = 10; y <= 15; y++) {
      sim.grid.setCell(9, y, ElementId.SOLID);  // left wall
      sim.grid.setCell(21, y, ElementId.SOLID); // right wall
    }

    // Pour 5 water cells at x = 15, y = 14
    for (let i = 0; i < 5; i++) {
      sim.grid.setCell(15, 14 - i, ElementId.WATER);
    }

    // Run 20 ticks to let fluid spread and settle
    for (let t = 0; t < 20; t++) {
      sim.step();
    }

    // All water should rest on the floor y = 14
    let waterOnFloor = 0;
    for (let x = 10; x <= 20; x++) {
      if (sim.grid.getCell(x, 14) === ElementId.WATER) {
        waterOnFloor++;
      }
    }
    expect(waterOnFloor).toBe(5);
  });

  it('respects solid barriers and does not leak through walls', () => {
    sim.grid.setCell(10, 10, ElementId.SOLID); // barrier
    sim.grid.setCell(10, 11, ElementId.SOLID); // floor
    sim.grid.setCell(9, 10, ElementId.WATER);  // water against left of barrier

    sim.step();

    // Water cannot jump across barrier to x = 11
    expect(sim.grid.getCell(11, 10)).toBe(ElementId.EMPTY);
  });
});
