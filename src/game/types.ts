import { ElementId } from '../core/elements.js';
import { StateId } from '../ai/fsm.js';

export type GameMode = 'survivor' | 'sandbox';

export type WorldPreset = 'caverns' | 'oasis' | 'flat';

export type SandboxTool = ElementId | 'SPAWN_NPC';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const DEFAULT_WORLD_BOUNDS: WorldBounds = {
  minX: -96,
  maxX: 159,
  minY: 0,
  maxY: 127,
};

export interface PlayerInputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
}

export interface GameStats {
  blocksMined: number;
  blocksPlaced: number;
  npcsSpawned: number;
  totalReactions: number;
  playerDeaths: number;
  ticksSurvived: number;
}

export interface NpcSnapshot {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  state: StateId | null;
  task: string;
  tasksCompleted: number;
  distanceTraveled: number;
  inventory: Partial<Record<ElementId, number>>;
  pathLength: number;
}
