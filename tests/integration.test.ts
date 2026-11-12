import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../src/core/simulator.js';
import { ElementId } from '../src/core/elements.js';
import { NPC } from '../src/entities/npc.js';
import { Entity } from '../src/entities/entity.js';

describe('Integration: Sandbox Core (Cellular Automata + Entity Loops)', () => {
  let sim: Simulator;

  beforeEach(() => {
    sim = new Simulator();

    // Solid floor from x = 0 to 60 at y = 15
    for (let x = 0; x <= 60; x++) {
      sim.grid.setCell(x, 15, ElementId.SOLID);
    }
  });

  it('steps entities and cellular automata concurrently in the unified world tick loop', () => {
    // 1. Add cellular automata dynamic elements:
    // Falling sand at x = 10, y = 5
    sim.grid.setCell(10, 5, ElementId.SAND);
    // Flowing water at x = 20, y = 5
    sim.grid.setCell(20, 5, ElementId.WATER);

    // 2. Add autonomous NPC at x = 30, y = 14
    const npc = new NPC('miner-bob', 30, 14);
    sim.addEntity(npc);

    expect(sim.getEntities().length).toBe(1);

    // Step world tick
    const stats = sim.step();

    // Verify tick stats reflect both cellular automata and entity loop execution
    expect(stats.tick).toBe(1);
    expect(stats.particlesMoved).toBeGreaterThan(0);
    expect(stats.entityCount).toBe(1);
    expect(stats.livingEntities).toBe(1);
    expect(stats.entitiesUpdated).toBe(1);

    // Verify sand fell under gravity
    expect(sim.grid.getCell(10, 5)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(10, 6)).toBe(ElementId.SAND);

    // Verify water flowed under gravity
    expect(sim.grid.getCell(20, 5)).toBe(ElementId.EMPTY);
    expect(sim.grid.getCell(20, 6)).toBe(ElementId.WATER);

    // Verify NPC executed a tick
    expect(npc.taskHistory.length).toBe(1);
    expect(npc.stateHistory.length).toBe(1);
  });

  it('triggers cellular automata cascade when an NPC harvests ground beneath hanging sand', () => {
    // Place a harvestable stone at x = 15, y = 14
    sim.grid.setCell(15, 14, ElementId.STONE);
    // Stack a sand particle directly on top of the stone at x = 15, y = 13
    sim.grid.setCell(15, 13, ElementId.SAND);

    // Spawn NPC right next to the stone at x = 14, y = 14
    const npc = new NPC('harvester', 14, 14);
    sim.addEntity(npc);

    // Run ticks until NPC harvests the stone
    for (let t = 0; t < 20; t++) {
      sim.step();
      if (npc.countItem(ElementId.STONE) > 0) break;
    }

    expect(npc.countItem(ElementId.STONE)).toBe(1);

    // Step 10 more ticks to let cellular automata gravity cascade and agent interact
    for (let t = 0; t < 10; t++) {
      sim.step();
    }

    // The sand that was originally at (15, 13) cascaded down and was collected by the active harvester
    expect(sim.grid.getCell(15, 13)).toBe(ElementId.EMPTY);
    expect(npc.countItem(ElementId.SAND)).toBe(1);
  });

  it('applies environmental damage to entities in hazard contact during world ticks', () => {
    const rawEntity = new Entity('dummy', 25, 14);
    sim.addEntity(rawEntity);

    expect(rawEntity.stats.health).toBe(100);

    // Step normally with no hazard
    sim.step();
    expect(rawEntity.stats.health).toBe(100);

    // Introduce lethal lava directly below the entity
    sim.grid.setCell(25, 15, ElementId.LAVA);

    // Step world tick -> lava contact triggers damage
    sim.step();
    expect(rawEntity.stats.health).toBeLessThan(100);
    expect(rawEntity.stats.health).toBe(80);
  });

  it('handles multiple entities operating in a dynamically reacting world for 100 ticks', () => {
    // Place pools of water and lava that react and produce stone/steam
    sim.grid.setCell(10, 14, ElementId.WATER);
    sim.grid.setCell(11, 14, ElementId.LAVA);

    // Spawn 2 NPCs
    const npc1 = new NPC('explorer-1', 5, 14);
    const npc2 = new NPC('explorer-2', 40, 14);
    sim.addEntity(npc1);
    sim.addEntity(npc2);

    let totalReactionsEncountered = 0;

    // Simulate 100 world ticks
    for (let t = 1; t <= 100; t++) {
      const stats = sim.step();
      totalReactionsEncountered += stats.reactionsTriggered;
    }

    // Both entities must have processed 100 ticks
    expect(npc1.taskHistory.length).toBe(100);
    expect(npc2.taskHistory.length).toBe(100);

    // Quench reaction occurred (water + lava -> stone/steam)
    expect(totalReactionsEncountered).toBeGreaterThan(0);
    // Explorer-1 found the stone formed by the lava quench reaction and collected it
    expect(npc1.countItem(ElementId.STONE)).toBe(1);
  });
});
