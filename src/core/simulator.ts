import { ChunkGrid } from './grid.js';
import { ElementId } from './elements.js';
import { SandRule } from '../rules/sand.js';
import { WaterRule } from '../rules/water.js';
import { LavaRule } from '../rules/lava.js';
import { ReactionHandler } from '../rules/reactions.js';
import { DEFAULT_CONFIG, SimulationConfig, TickStats } from './types.js';
import { Entity } from '../entities/entity.js';

/**
 * High-performance cellular automata and entity simulation engine for chunk-based grids.
 */
export class Simulator {
  public readonly grid: ChunkGrid;
  public readonly config: SimulationConfig;
  public currentTick: number = 0;
  private readonly entities: Map<string, Entity> = new Map();

  constructor(grid?: ChunkGrid, config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.grid = grid ?? new ChunkGrid(this.config);
  }

  public addEntity(entity: Entity): this {
    this.entities.set(entity.id, entity);
    const cx = Math.floor(entity.x / this.grid.chunkSize);
    const cy = Math.floor(entity.y / this.grid.chunkSize);
    this.grid.getOrCreateChunk(cx, cy).wakeUp();
    return this;
  }

  public removeEntity(id: string): boolean {
    return this.entities.delete(id);
  }

  public getEntity<T extends Entity = Entity>(id: string): T | undefined {
    return this.entities.get(id) as T | undefined;
  }

  public getEntities<T extends Entity = Entity>(): T[] {
    return Array.from(this.entities.values()) as T[];
  }

  public clearEntities(): void {
    this.entities.clear();
  }

  /**
   * Advances the simulation by one discrete tick.
   * Updates only active chunks in a bottom-to-top order with alternating horizontal scan.
   */
  public step(): TickStats {
    const startTime = performance.now();
    this.currentTick++;
    const tick = this.currentTick;
    const chunkSize = this.grid.chunkSize;
    const sleepThreshold = this.config.sleepThresholdTicks;

    let totalParticlesMoved = 0;
    let totalReactions = 0;

    // Snapshot currently active chunks
    const activeChunks = this.grid.getActiveChunks();
    const activeChunkCount = activeChunks.length;

    // Alternate horizontal scan direction based on tick to prevent asymmetric bias
    const scanLeftToRight = tick % 2 === 0;

    for (let c = 0; c < activeChunkCount; c++) {
      const chunk = activeChunks[c];
      const worldBaseX = chunk.cx * chunkSize;
      const worldBaseY = chunk.cy * chunkSize;

      let chunkMovements = 0;

      // Bottom-to-top scan (y from chunkSize - 1 down to 0)
      for (let ly = chunkSize - 1; ly >= 0; ly--) {
        const wy = worldBaseY + ly;

        if (scanLeftToRight) {
          for (let lx = 0; lx < chunkSize; lx++) {
            const result = this.updateCell(chunk, lx, ly, worldBaseX + lx, wy, tick);
            if (result.moved) chunkMovements++;
            if (result.reacted) totalReactions++;
          }
        } else {
          for (let lx = chunkSize - 1; lx >= 0; lx--) {
            const result = this.updateCell(chunk, lx, ly, worldBaseX + lx, wy, tick);
            if (result.moved) chunkMovements++;
            if (result.reacted) totalReactions++;
          }
        }
      }

      totalParticlesMoved += chunkMovements;

      // Dynamic sleep management
      if (chunkMovements === 0) {
        chunk.inactiveTicks++;
        if (chunk.inactiveTicks >= sleepThreshold) {
          chunk.sleep();
        }
      } else {
        chunk.inactiveTicks = 0;
      }
    }

    // 2. Entity Simulation Phase
    let entitiesUpdated = 0;
    let livingEntities = 0;

    for (const entity of this.entities.values()) {
      if (!entity.isAlive) continue;
      livingEntities++;

      // If entity provides autonomous tick method (e.g. NPC), invoke its AI & movement loop
      if (typeof (entity as any).tick === 'function') {
        (entity as any).tick(this.grid, tick);
      } else {
        this.updateBaseEntity(entity);
      }

      // Check environmental reactions (lava thermal damage, water, etc.)
      this.applyEnvironmentalEffects(entity);

      // Ensure chunk at entity location remains active
      const cx = Math.floor(entity.x / chunkSize);
      const cy = Math.floor(entity.y / chunkSize);
      const chunk = this.grid.getChunk(cx, cy, false);
      if (chunk && !chunk.isActive) {
        chunk.wakeUp();
      }

      entitiesUpdated++;
    }

    const durationMs = performance.now() - startTime;

    return {
      tick,
      durationMs,
      activeChunks: activeChunkCount,
      totalChunks: this.grid.getChunkCount(),
      particlesMoved: totalParticlesMoved,
      reactionsTriggered: totalReactions,
      entityCount: this.entities.size,
      livingEntities,
      entitiesUpdated,
    };
  }

  private updateBaseEntity(entity: Entity): void {
    // Basic environmental gravity if standing on empty air
    const below = this.grid.getCell(entity.x, entity.y + 1);
    if (below === ElementId.EMPTY || below === ElementId.STEAM) {
      entity.y += 1;
    }
  }

  private applyEnvironmentalEffects(entity: Entity): void {
    const currentCell = this.grid.getCell(entity.x, entity.y);
    const belowCell = this.grid.getCell(entity.x, entity.y + 1);

    // Thermal damage from lava contact
    if (currentCell === ElementId.LAVA || belowCell === ElementId.LAVA) {
      entity.takeDamage(20);
    }
  }

  private updateCell(
    chunk: InstanceType<typeof import('./chunk.js').Chunk>,
    lx: number,
    ly: number,
    wx: number,
    wy: number,
    tick: number
  ): { moved: boolean; reacted: boolean } {
    const idx = chunk.getIndex(lx, ly);

    // Skip if cell has already been processed in this tick (e.g. fallen into this chunk)
    if (chunk.lastUpdated[idx] === tick) {
      return { moved: false, reacted: false };
    }

    const elem = chunk.elements[idx] as ElementId;

    switch (elem) {
      case ElementId.EMPTY:
      case ElementId.SOLID:
      case ElementId.STONE:
      case ElementId.OBSIDIAN:
        return { moved: false, reacted: false };

      case ElementId.SAND: {
        const moved = SandRule.update(this.grid, wx, wy, tick);
        return { moved, reacted: false };
      }

      case ElementId.WATER: {
        const moved = WaterRule.update(this.grid, wx, wy, tick);
        return { moved, reacted: false };
      }

      case ElementId.LAVA: {
        const moved = LavaRule.update(this.grid, wx, wy, tick);
        return { moved, reacted: false };
      }

      case ElementId.STEAM: {
        const result = ReactionHandler.checkAndApplyReactions(
          this.grid,
          wx,
          wy,
          ElementId.STEAM,
          tick
        );
        return { moved: result.reacted, reacted: result.reacted };
      }

      default:
        return { moved: false, reacted: false };
    }
  }
}
