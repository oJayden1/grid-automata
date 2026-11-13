import { ElementId } from '../core/elements.js';
import { NPC } from '../entities/npc.js';
import { GameWorld } from './game-world.js';
import { GameMode, GameStats, WorldBounds, WorldPreset } from './types.js';

interface SerializedChunk {
  cx: number;
  cy: number;
  isActive: boolean;
  /** RLE pairs: [elementId, runLength, ...] */
  rle: number[];
}

interface SerializedEntity {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  isAlive: boolean;
  tasksCompleted?: number;
  distanceTraveled?: number;
  inventory: Array<[ElementId, number]>;
}

export interface SerializedWorld {
  version: 1;
  seed: number;
  preset: WorldPreset;
  mode: GameMode;
  tick: number;
  bounds: WorldBounds;
  stats: GameStats;
  chunks: SerializedChunk[];
  player: SerializedEntity & { spawnX: number; spawnY: number };
  npcs: SerializedEntity[];
}

function encodeRLE(elements: Uint8Array): number[] {
  const out: number[] = [];
  if (elements.length === 0) return out;
  let curr = elements[0];
  let count = 1;
  for (let i = 1; i < elements.length; i++) {
    if (elements[i] === curr) {
      count++;
    } else {
      out.push(curr, count);
      curr = elements[i];
      count = 1;
    }
  }
  out.push(curr, count);
  return out;
}

function decodeRLE(rle: number[], target: Uint8Array): void {
  let offset = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = rle[i];
    const count = rle[i + 1];
    for (let c = 0; c < count && offset < target.length; c++) {
      target[offset++] = val;
    }
  }
}

export function serializeWorld(world: GameWorld): string {
  const chunks: SerializedChunk[] = [];
  for (const chunk of world.simulator.grid.getAllChunks()) {
    if (chunk.countNonEmpty() === 0) continue;
    chunks.push({
      cx: chunk.cx,
      cy: chunk.cy,
      isActive: chunk.isActive,
      rle: encodeRLE(chunk.elements),
    });
  }

  const playerInv = Array.from(world.player.inventory.entries()).filter(([, c]) => c > 0);
  const npcs: SerializedEntity[] = world.getNPCs().map((npc) => ({
    id: npc.id,
    x: npc.x,
    y: npc.y,
    health: npc.stats.health,
    maxHealth: npc.stats.maxHealth,
    energy: npc.stats.energy,
    maxEnergy: npc.stats.maxEnergy,
    isAlive: npc.isAlive,
    tasksCompleted: npc.tasksCompleted,
    distanceTraveled: npc.distanceTraveled,
    inventory: Array.from(npc.inventory.entries()).filter(([, c]) => c > 0),
  }));

  const payload: SerializedWorld = {
    version: 1,
    seed: world.seed,
    preset: world.preset,
    mode: world.mode,
    tick: world.simulator.currentTick,
    bounds: world.bounds,
    stats: { ...world.stats },
    chunks,
    player: {
      id: world.player.id,
      x: world.player.x,
      y: world.player.y,
      spawnX: world.player.spawnX,
      spawnY: world.player.spawnY,
      health: world.player.stats.health,
      maxHealth: world.player.stats.maxHealth,
      energy: world.player.stats.energy,
      maxEnergy: world.player.stats.maxEnergy,
      isAlive: world.player.isAlive,
      inventory: playerInv,
    },
    npcs,
  };

  return JSON.stringify(payload);
}

export function deserializeWorld(rawJson: string): GameWorld {
  const data = JSON.parse(rawJson) as SerializedWorld;
  if (!data || data.version !== 1) {
    throw new Error('Unsupported saved world format.');
  }

  const world = new GameWorld({
    seed: data.seed,
    preset: data.preset,
    bounds: data.bounds,
    mode: data.mode,
  });

  // Clear generated chunks and entities, then hydrate saved snapshot
  world.simulator.grid.clear();
  world.simulator.clearEntities();
  world.simulator.currentTick = data.tick;
  world.stats = { ...data.stats };

  for (const savedChunk of data.chunks) {
    const chunk = world.simulator.grid.getOrCreateChunk(savedChunk.cx, savedChunk.cy);
    decodeRLE(savedChunk.rle, chunk.elements);
    chunk.hasDirtyRect = true;
    chunk.dirtyMinX = 0;
    chunk.dirtyMaxX = chunk.size - 1;
    chunk.dirtyMinY = 0;
    chunk.dirtyMaxY = chunk.size - 1;
    if (savedChunk.isActive) {
      chunk.wakeUp();
    } else {
      chunk.sleep();
    }
  }

  world.player.x = data.player.x;
  world.player.y = data.player.y;
  world.player.spawnX = data.player.spawnX;
  world.player.spawnY = data.player.spawnY;
  world.player.stats.health = data.player.health;
  world.player.stats.maxHealth = data.player.maxHealth;
  world.player.stats.energy = data.player.energy;
  world.player.stats.maxEnergy = data.player.maxEnergy;
  world.player.isAlive = data.player.isAlive;
  world.player.inventory.clear();
  for (const [elem, count] of data.player.inventory) {
    world.player.inventory.set(elem, count);
  }
  world.attachPlayerToSimulator();

  for (const savedNpc of data.npcs) {
    const npc = new NPC(savedNpc.id, savedNpc.x, savedNpc.y, {
      health: savedNpc.health,
      maxHealth: savedNpc.maxHealth,
      energy: savedNpc.energy,
      maxEnergy: savedNpc.maxEnergy,
    });
    npc.isAlive = savedNpc.isAlive;
    npc.tasksCompleted = savedNpc.tasksCompleted ?? 0;
    npc.distanceTraveled = savedNpc.distanceTraveled ?? 0;
    for (const [elem, count] of savedNpc.inventory) {
      npc.inventory.set(elem, count);
    }
    world.simulator.addEntity(npc);
  }

  return world;
}
