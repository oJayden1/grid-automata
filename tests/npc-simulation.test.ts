import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkGrid } from '../src/core/grid.js';
import { ElementId } from '../src/core/elements.js';
import { NPC } from '../src/entities/npc.js';

describe('NPC 100-Tick Simulation: Movement and Task Picking', () => {
  let grid: ChunkGrid;

  beforeEach(() => {
    grid = new ChunkGrid({ chunkSize: 32 });

    // Build solid terrain floor from x = 0 to x = 80 at y = 10
    for (let x = 0; x <= 80; x++) {
      grid.setCell(x, 10, ElementId.SOLID);
    }
  });

  it('simulates 100 ticks of agent movement, utility task picking, and resource harvesting', () => {
    // Place a harvestable resource at x = 12, y = 9
    grid.setCell(12, 9, ElementId.STONE);
    // Place another resource further at x = 20, y = 9
    grid.setCell(20, 9, ElementId.SAND);

    // Spawn NPC at x = 5, y = 9 with initial energy 60 (to trigger rest cycle within 100 ticks)
    const npc = new NPC('miner-1', 5, 9, { energy: 60 });
    const initialX = npc.x;

    // Simulate 100 discrete ticks
    for (let tick = 1; tick <= 100; tick++) {
      npc.tick(grid, tick);
    }

    // 1. Verification of 100-tick history
    expect(npc.taskHistory.length).toBe(100);
    expect(npc.stateHistory.length).toBe(100);

    // 2. Verification of agent physical movement
    expect(npc.distanceTraveled).toBeGreaterThan(0);
    expect(npc.x).not.toBe(initialX);

    // 3. Verification of dynamic task picking via Utility AI
    const distinctTasks = new Set(npc.taskHistory);
    expect(distinctTasks.size).toBeGreaterThanOrEqual(2);
    expect(distinctTasks.has('GATHER')).toBe(true);

    // 4. Verification of state machine transitions
    const distinctStates = new Set(npc.stateHistory);
    expect(distinctStates.has('GATHER')).toBe(true);

    // 5. Verification of task execution (harvested stone at x=12)
    expect(npc.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(npc.countItem(ElementId.STONE)).toBeGreaterThanOrEqual(1);

    // 6. Verification of fatigue and resting cycle
    // Moving and harvesting consumed energy, triggering the REST state to recover
    const enteredRest = distinctStates.has('REST');
    expect(enteredRest).toBe(true);
    expect(npc.stats.energy).toBeGreaterThan(30);
  });

  it('simulates 100 ticks of dynamic hazard evasion (fleeing lava) and recovery', () => {
    // Spawn NPC at x = 15, y = 9
    const npc = new NPC('scout-1', 15, 9, { energy: 100 });

    // Initial safe ticks (ticks 1..10)
    for (let tick = 1; tick <= 10; tick++) {
      npc.tick(grid, tick);
    }
    expect(npc.brain.fsm.getCurrentStateId()).not.toBe('FLEE');

    // At tick 11, lava hazard appears dangerously close at x = 18, y = 9
    grid.setCell(18, 9, ElementId.LAVA);

    // Run next 40 ticks where NPC detects lava and flees
    for (let tick = 11; tick <= 50; tick++) {
      npc.tick(grid, tick);
    }

    // Agent must have entered FLEE state and moved away from the hazard at x = 18
    expect(npc.stateHistory.includes('FLEE')).toBe(true);
    expect(Math.abs(npc.x - 18)).toBeGreaterThanOrEqual(4);
    expect(npc.isAlive).toBe(true);

    // Remove hazard at tick 51 to let agent stabilize
    grid.setCell(18, 9, ElementId.EMPTY);

    // Complete the remaining 50 ticks (up to 100)
    for (let tick = 51; tick <= 100; tick++) {
      npc.tick(grid, tick);
    }

    expect(npc.taskHistory.length).toBe(100);
    expect(npc.stateHistory.length).toBe(100);
    // Agent returned to normal exploration or resting
    const finalState = npc.brain.fsm.getCurrentStateId();
    expect(finalState === 'IDLE' || finalState === 'WANDER' || finalState === 'REST').toBe(true);
  });

  it('simulates 100 ticks of multiple concurrent agents operating autonomously', () => {
    // Scatter several resources
    grid.setCell(10, 9, ElementId.SAND);
    grid.setCell(25, 9, ElementId.STONE);
    grid.setCell(40, 9, ElementId.WATER);

    const agent1 = new NPC('agent-1', 2, 9);
    const agent2 = new NPC('agent-2', 20, 9);
    const agent3 = new NPC('agent-3', 35, 9);
    const team = [agent1, agent2, agent3];

    for (let tick = 1; tick <= 100; tick++) {
      for (const agent of team) {
        agent.tick(grid, tick);
      }
    }

    for (const agent of team) {
      expect(agent.taskHistory.length).toBe(100);
      expect(agent.stateHistory.length).toBe(100);
      expect(agent.distanceTraveled).toBeGreaterThan(0);
      expect(agent.isAlive).toBe(true);
    }
  });
});
