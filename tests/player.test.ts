import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';
import { Player } from '../src/game/player.js';
import { DEFAULT_WORLD_BOUNDS } from '../src/game/types.js';

describe('Player', () => {
  let sim: Simulator;
  let player: Player;

  beforeEach(() => {
    sim = new Simulator();
    for (let x = -20; x <= 20; x++) {
      sim.grid.setCell(x, 15, ElementId.SOLID);
    }
    player = new Player(0, 14);
    const tickFn = player.tick.bind(player);
    player.tick = (grid, tick) => tickFn(grid, tick, DEFAULT_WORLD_BOUNDS);
    sim.addEntity(player);
  });

  it('moves left/right and automatically steps up 1-block ledges', () => {
    sim.grid.setCell(2, 14, ElementId.STONE);

    player.input.right = true;
    for (let i = 0; i < 4; i++) {
      sim.step();
    }
    player.input.right = false;

    expect(player.x).toBeGreaterThanOrEqual(2);
    expect(player.y).toBeLessThanOrEqual(14);
  });

  it('jumps vertically and lands back on solid ground under gravity', () => {
    const startY = player.y;
    player.input.jump = true;
    sim.step();
    player.input.jump = false;

    let minY = player.y;
    for (let i = 0; i < 20; i++) {
      sim.step();
      if (player.y < minY) minY = player.y;
    }

    expect(minY).toBeLessThan(startY - 1);
    expect(player.y).toBe(startY);
    expect(player.onGround).toBe(true);
  });

  it('mines mineable cells into inventory while refusing bedrock/lava', () => {
    sim.grid.setCell(2, 14, ElementId.STONE);
    sim.grid.setCell(3, 14, ElementId.LAVA);
    sim.grid.setCell(2, 15, ElementId.SOLID);

    expect(player.mineCell(sim.grid, 2, 14, 1)).toBe(ElementId.STONE);
    expect(player.countItem(ElementId.STONE)).toBe(1);
    expect(sim.grid.getCell(2, 14)).toBe(ElementId.EMPTY);

    expect(player.mineCell(sim.grid, 3, 14, 1)).toBeNull();
    expect(player.mineCell(sim.grid, 2, 15, 1)).toBeNull();
    expect(player.mineCell(sim.grid, 15, 14, 1)).toBeNull(); // Out of reach
  });

  it('places inventory elements and triggers water-lava quench reactions', () => {
    player.addItem(ElementId.WATER, 2);
    sim.grid.setCell(3, 14, ElementId.LAVA);

    const placed = player.placeCell(sim.grid, 2, 14, ElementId.WATER, 1);
    expect(placed).toBe(true);
    expect(player.countItem(ElementId.WATER)).toBe(1);

    sim.step();
    expect(sim.grid.getCell(2, 14)).toBe(ElementId.STEAM);
    const quenched = sim.grid.getCell(3, 14);
    expect(quenched === ElementId.STONE || quenched === ElementId.OBSIDIAN).toBe(true);
  });

  it('applies lava damage with i-frames and supports respawn', () => {
    sim.grid.setCell(0, 15, ElementId.LAVA);
    sim.step();
    expect(player.stats.health).toBe(80);

    // Immediate next tick is protected by damage cooldown
    sim.step();
    expect(player.stats.health).toBe(80);

    player.takeDamage(100); // cooldown prevents instant hit, force via direct death check
    player.damageCooldownTicks = 0;
    player.takeDamage(100);
    expect(player.isAlive).toBe(false);

    player.respawn(0, 14);
    expect(player.isAlive).toBe(true);
    expect(player.stats.health).toBe(100);
  });
});
