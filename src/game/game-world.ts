import { Simulator } from '../core/simulator.js';
import { ElementId } from '../core/elements.js';
import { TickStats } from '../core/types.js';
import { NPC } from '../entities/npc.js';
import { Player } from './player.js';
import {
  DEFAULT_WORLD_BOUNDS,
  GameMode,
  GameStats,
  NpcSnapshot,
  SandboxTool,
  WorldBounds,
  WorldPreset,
} from './types.js';
import { generateWorld, WorldGenerationOptions } from './world-generator.js';

export interface GameWorldOptions extends WorldGenerationOptions {
  mode?: GameMode;
}

/**
 * Unified playable world controller combining Simulator, Player, NPCs,
 * Sandbox brush tools, and progression stats.
 */
export class GameWorld {
  public simulator: Simulator;
  public player: Player;
  public bounds: WorldBounds;
  public seed: number;
  public preset: WorldPreset;
  public mode: GameMode;

  public activeTool: SandboxTool = ElementId.SAND;
  public brushRadius: number = 2;
  public selectedPlaceElement: ElementId = ElementId.SAND;

  public lastTickStats: TickStats | null = null;
  public stats: GameStats = {
    blocksMined: 0,
    blocksPlaced: 0,
    npcsSpawned: 0,
    totalReactions: 0,
    playerDeaths: 0,
    ticksSurvived: 0,
  };

  private npcCounter: number = 0;

  constructor(options: GameWorldOptions = {}) {
    this.simulator = new Simulator();
    this.bounds = options.bounds ?? { ...DEFAULT_WORLD_BOUNDS };
    this.mode = options.mode ?? 'survivor';

    const info = generateWorld(this.simulator.grid, {
      seed: options.seed,
      preset: options.preset ?? 'caverns',
      bounds: this.bounds,
    });

    this.seed = info.seed;
    this.preset = info.preset;

    this.player = new Player(info.playerSpawn.x, info.playerSpawn.y);
    // Give survivor a small starter kit so placement works right away
    this.player.addItem(ElementId.SAND, 16);
    this.player.addItem(ElementId.STONE, 12);
    this.player.addItem(ElementId.WATER, 4);
    this.attachPlayerToSimulator();

    for (const spawn of info.npcSpawns) {
      this.spawnNPC(spawn.x, spawn.y, spawn.name);
    }
  }

  public regenerate(options: WorldGenerationOptions = {}): void {
    this.simulator = new Simulator();
    this.bounds = options.bounds ?? this.bounds;
    const info = generateWorld(this.simulator.grid, {
      seed: options.seed,
      preset: options.preset ?? this.preset,
      bounds: this.bounds,
    });

    this.seed = info.seed;
    this.preset = info.preset;
    this.npcCounter = 0;

    this.player = new Player(info.playerSpawn.x, info.playerSpawn.y);
    this.player.addItem(ElementId.SAND, 16);
    this.player.addItem(ElementId.STONE, 12);
    this.player.addItem(ElementId.WATER, 4);
    this.attachPlayerToSimulator();

    this.stats = {
      blocksMined: 0,
      blocksPlaced: 0,
      npcsSpawned: 0,
      totalReactions: 0,
      playerDeaths: 0,
      ticksSurvived: 0,
    };

    for (const spawn of info.npcSpawns) {
      this.spawnNPC(spawn.x, spawn.y, spawn.name);
    }
  }

  /**
   * Registers the player with Simulator so environmental damage and chunk wakeups run
   * inside Simulator.step(), while keeping bounds enforcement active.
   */
  public attachPlayerToSimulator(): void {
    const bounds = this.bounds;
    const originalTick = this.player.tick.bind(this.player);
    this.player.tick = (grid, tickNumber) => {
      originalTick(grid, tickNumber, bounds);
    };
    this.simulator.addEntity(this.player);
  }

  public step(): TickStats {
    const wasAlive = this.player.isAlive;
    const tickStats = this.simulator.step();
    this.lastTickStats = tickStats;
    this.stats.totalReactions += tickStats.reactionsTriggered;

    if (this.player.isAlive) {
      this.stats.ticksSurvived++;
    } else if (wasAlive && !this.player.isAlive) {
      this.stats.playerDeaths++;
    }

    // Clamp NPCs safely inside inner playable bounds
    for (const entity of this.simulator.getEntities()) {
      if (entity.id === 'player') continue;
      if (entity.x <= this.bounds.minX) entity.x = this.bounds.minX + 1;
      if (entity.x >= this.bounds.maxX) entity.x = this.bounds.maxX - 1;
      if (entity.y <= this.bounds.minY) entity.y = this.bounds.minY + 1;
      if (entity.y >= this.bounds.maxY - 1) entity.y = this.bounds.maxY - 2;
    }

    return tickStats;
  }

  public spawnNPC(x: number, y: number, customId?: string): NPC | null {
    const cx = Math.max(this.bounds.minX + 1, Math.min(this.bounds.maxX - 1, Math.round(x)));
    const cy = Math.max(this.bounds.minY + 1, Math.min(this.bounds.maxY - 2, Math.round(y)));

    // Clear cell if spawning on top of terrain so NPC doesn't spawn trapped inside rock
    const elem = this.simulator.grid.getCell(cx, cy);
    if (elem !== ElementId.EMPTY && elem !== ElementId.STEAM && elem !== ElementId.WATER) {
      if (elem === ElementId.SOLID) return null;
      this.simulator.grid.setCell(cx, cy, ElementId.EMPTY, this.simulator.currentTick);
    }

    let id = customId;
    if (!id) {
      do {
        this.npcCounter++;
        id = `npc-${this.npcCounter}`;
      } while (this.simulator.getEntity(id));
    }
    const npc = new NPC(id, cx, cy);
    this.simulator.addEntity(npc);
    this.stats.npcsSpawned++;
    return npc;
  }

  public getNPCs(): NPC[] {
    return this.simulator
      .getEntities()
      .filter((e): e is NPC => e instanceof NPC);
  }

  public getNpcSnapshots(): NpcSnapshot[] {
    return this.getNPCs().map((npc) => {
      const inv: Partial<Record<ElementId, number>> = {};
      for (const [k, v] of npc.inventory.entries()) {
        if (v > 0) inv[k] = v;
      }
      return {
        id: npc.id,
        x: npc.x,
        y: npc.y,
        health: npc.stats.health,
        maxHealth: npc.stats.maxHealth,
        energy: npc.stats.energy,
        maxEnergy: npc.stats.maxEnergy,
        state: npc.brain.fsm.getCurrentStateId(),
        task: npc.brain.utilitySelector.currentTaskId ?? 'IDLE',
        tasksCompleted: npc.tasksCompleted,
        distanceTraveled: npc.distanceTraveled,
        inventory: inv,
        pathLength: npc.path.length,
      };
    });
  }

  public findNearestNPC(wx: number, wy: number, maxDist: number = 6): NPC | null {
    let best: NPC | null = null;
    let bestDist = maxDist;
    for (const npc of this.getNPCs()) {
      const d = Math.hypot(npc.x - wx, npc.y - wy);
      if (d <= bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  }

  public mineAt(wx: number, wy: number): ElementId | null {
    const mined = this.player.mineCell(
      this.simulator.grid,
      Math.round(wx),
      Math.round(wy),
      this.simulator.currentTick,
      this.bounds
    );
    if (mined !== null) {
      this.stats.blocksMined++;
    }
    return mined;
  }

  public placeAt(wx: number, wy: number, element: ElementId = this.selectedPlaceElement): boolean {
    const placed = this.player.placeCell(
      this.simulator.grid,
      Math.round(wx),
      Math.round(wy),
      element,
      this.simulator.currentTick,
      this.bounds
    );
    if (placed) {
      this.stats.blocksPlaced++;
    }
    return placed;
  }

  /**
   * Paints a circular brush of an element in Sandbox mode, respecting outer bedrock shell.
   */
  public paintBrush(
    centerX: number,
    centerY: number,
    element: ElementId,
    radius: number = this.brushRadius
  ): number {
    const cx = Math.round(centerX);
    const cy = Math.round(centerY);
    const r = Math.max(1, Math.min(10, Math.round(radius)));
    const rSq = (r - 0.35) * (r - 0.35);
    const tick = this.simulator.currentTick;
    let painted = 0;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > rSq) continue;
        const wx = cx + dx;
        const wy = cy + dy;

        // Protect outer bedrock shell
        if (
          wx <= this.bounds.minX ||
          wx >= this.bounds.maxX ||
          wy <= this.bounds.minY ||
          wy >= this.bounds.maxY - 1
        ) {
          continue;
        }

        // For non-empty brush strokes, optionally preserve solid unless erasing
        if (element !== ElementId.EMPTY && this.simulator.grid.getCell(wx, wy) === ElementId.SOLID) {
          continue;
        }

        this.simulator.grid.setCell(wx, wy, element, tick, 0);
        painted++;
      }
    }

    return painted;
  }
}
