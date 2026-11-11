import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';

describe('Reactions (Water + Lava, Steam)', () => {
  let sim: Simulator;

  beforeEach(() => {
    sim = new Simulator();
  });

  it('quenches water and lava into steam and stone upon contact', () => {
    // Water placed above Lava
    sim.grid.setCell(10, 5, ElementId.WATER);
    sim.grid.setCell(10, 6, ElementId.LAVA);

    sim.step();

    // Water turns to STEAM, Lava cools to STONE or OBSIDIAN
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.STEAM);
    const rock = sim.grid.getCell(10, 6);
    expect(rock === ElementId.STONE || rock === ElementId.OBSIDIAN).toBe(true);
  });

  it('forms Obsidian when lava is deep or quenched under pressure', () => {
    // Column of lava
    sim.grid.setCell(10, 6, ElementId.LAVA);
    sim.grid.setCell(10, 7, ElementId.LAVA);
    // Water dropped on top
    sim.grid.setCell(10, 5, ElementId.WATER);

    sim.step();

    // Lava with lava below forms Obsidian
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.OBSIDIAN);
  });

  it('causes steam to rise upwards against gravity', () => {
    sim.grid.setCell(10, 10, ElementId.STEAM);

    sim.step();

    // Steam moves to y = 9
    expect(sim.grid.getCell(10, 10)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(10, 9)).toBe(ElementId.STEAM);
  });

  it('dissipates steam after its lifetime threshold expires', () => {
    // Config with 3 tick steam lifetime
    const shortSteamSim = new Simulator(undefined, { steamLifetime: 3 });
    shortSteamSim.grid.setCell(10, 10, ElementId.STEAM, 0, 0);

    // Tick 1: moves up to 9, age = 1
    shortSteamSim.step();
    expect(shortSteamSim.grid.getCell(10, 9)).toBe(ElementId.STEAM);

    // Tick 2: moves up to 8, age = 2
    shortSteamSim.step();
    expect(shortSteamSim.grid.getCell(10, 8)).toBe(ElementId.STEAM);

    // Tick 3: moves up to 7, age = 3 (reached lifetime)
    shortSteamSim.step();

    // Tick 4: reaches threshold and dissipates into EMPTY
    shortSteamSim.step();
    expect(shortSteamSim.grid.getCell(10, 6)).toBe(ElementId.EMPTY);
    expect(shortSteamSim.grid.getCell(10, 7)).toBe(ElementId.EMPTY);
  });

  it('reacts across cardinal directions (side-by-side)', () => {
    // Water and Lava placed next to each other
    sim.grid.setCell(10, 10, ElementId.WATER);
    sim.grid.setCell(11, 10, ElementId.LAVA);

    sim.step();

    expect(sim.grid.getCell(10, 10)).toBe(ElementId.STEAM);
    const rock = sim.grid.getCell(11, 10);
    expect(rock === ElementId.STONE || rock === ElementId.OBSIDIAN).toBe(true);
  });
});
