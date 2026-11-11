import { Entity, EntityStats } from './entity.js';
import { NPCBrain } from '../ai/npc-brain.js';
import { StateId } from '../ai/fsm.js';
import { ChunkGrid } from '../core/grid.js';
import { Point2D } from '../core/types.js';
import { GridPathfinder } from '../ai/pathfinding.js';

/**
 * Autonomous NPC agent equipped with Utility AI, Decision Trees, and FSM.
 */
export class NPC extends Entity {
  public readonly brain: NPCBrain;
  public currentGrid: ChunkGrid | null = null;
  public path: Point2D[] = [];
  public distanceTraveled: number = 0;
  public tasksCompleted: number = 0;

  // History tracking for telemetry and unit tests
  public readonly stateHistory: StateId[] = [];
  public readonly taskHistory: string[] = [];

  constructor(id: string, initialX: number, initialY: number, stats?: Partial<EntityStats>) {
    super(id, initialX, initialY, stats);
    this.brain = new NPCBrain(this);
  }

  /**
   * Primary simulation tick for the agent.
   */
  public tick(grid: ChunkGrid, tickNumber: number): StateId {
    if (!this.isAlive) return 'IDLE';

    this.currentGrid = grid;

    // 1. Environmental Gravity: If unsupported by ground/water, fall down
    if (
      GridPathfinder.isWalkable(grid, this.x, this.y + 1) &&
      !GridPathfinder.isSolidGround(grid, this.x, this.y + 1)
    ) {
      this.y += 1;
    }

    // 2. Sensory & Cognitive Brain Processing
    const currentState = this.brain.update(grid, tickNumber);
    this.stateHistory.push(currentState);

    const activeTask = this.brain.utilitySelector.currentTaskId ?? 'NONE';
    this.taskHistory.push(activeTask);

    return currentState;
  }

  /**
   * Executes a single movement step along the active path.
   */
  public followPathStep(): boolean {
    if (this.path.length === 0) return false;

    const nextTarget = this.path[0];
    if (this.stepTowards(nextTarget.x, nextTarget.y)) {
      this.path.shift();
      return true;
    }

    // Path blocked, clear to force recalculation
    this.path = [];
    return false;
  }

  /**
   * Direct step towards adjacent coordinate.
   */
  public stepTowards(targetX: number, targetY: number): boolean {
    if (!this.currentGrid) return false;

    const dx = Math.sign(targetX - this.x);
    const dy = Math.sign(targetY - this.y);

    const newX = this.x + dx;
    const newY = this.y + dy;

    // Walkability validation
    if (GridPathfinder.isWalkable(this.currentGrid, newX, newY)) {
      const dist = Math.hypot(newX - this.x, newY - this.y);
      this.x = newX;
      this.y = newY;
      this.distanceTraveled += dist;
      this.consumeEnergy(0.5);
      return true;
    }

    return false;
  }
}
