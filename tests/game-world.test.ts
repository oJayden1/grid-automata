import { describe, it, expect } from 'vitest';
import { ElementId } from '../src/core/elements.js';
import { GameWorld } from '../src/game/game-world.js';
import { deserializeWorld, serializeWorld } from '../src/game/storage.js';

describe('GameWorld & Storage', () => {
  it('supports sandbox brush painting, NPC spawning, and unified simulation ticks', () => {
    const world = new GameWorld({ seed: 777, preset: 'flat' });
    const initialNpcCount = world.getNPCs().length;

    // Paint a sand drop above the spawn camp
    const painted = world.paintBrush(world.player.x + 12, world.player.y - 8, ElementId.SAND, 2);
    expect(painted).toBeGreaterThan(0);

    // Spawn a new NPC
    const npc = world.spawnNPC(world.player.x + 4, world.player.y - 1);
    expect(npc).not.toBeNull();
    expect(world.getNPCs().length).toBe(initialNpcCount + 1);

    // Advance world ticks
    for (let i = 0; i < 15; i++) {
      world.step();
    }
    expect(world.simulator.currentTick).toBe(15);
    expect(world.stats.ticksSurvived).toBe(15);
  });

  it('serializes and restores chunks, player state, inventory, and NPCs cleanly', () => {
    const world = new GameWorld({ seed: 1337, preset: 'caverns' });
    world.player.addItem(ElementId.OBSIDIAN, 7);
    world.paintBrush(world.player.x + 8, world.player.y - 6, ElementId.WATER, 2);
    world.step();
    world.step();

    const json = serializeWorld(world);
    const restored = deserializeWorld(json);

    expect(restored.seed).toBe(1337);
    expect(restored.preset).toBe('caverns');
    expect(restored.simulator.currentTick).toBe(2);
    expect(restored.player.countItem(ElementId.OBSIDIAN)).toBe(7);
    expect(restored.getNPCs().length).toBe(world.getNPCs().length);

    // Spawning an NPC after restore produces a unique non-colliding ID
    const extraNpc = restored.spawnNPC(restored.player.x + 2, restored.player.y);
    expect(extraNpc).not.toBeNull();
    const ids = restored.getNPCs().map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
