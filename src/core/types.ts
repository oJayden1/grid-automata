/**
 * Core type definitions for 2D chunk-based cellular automata.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface ChunkCoord {
  cx: number;
  cy: number;
}

export interface SimulationConfig {
  /** Size of each chunk edge in cells. Defaults to 32 (32x32 = 1024 cells). */
  chunkSize: number;
  /** Inactive ticks required before a chunk transitions to sleep. Defaults to 3. */
  sleepThresholdTicks: number;
  /** Lava viscosity factor: probability of skipping movement per tick (0 to 1). Defaults to 0.4. */
  lavaViscositySkip: number;
  /** Maximum horizontal dispersion rate for water in cells per tick. Defaults to 4. */
  waterDispersionRate: number;
  /** Maximum horizontal dispersion rate for lava in cells per tick. Defaults to 1. */
  lavaDispersionRate: number;
  /** Steam lifetime in ticks before dissipating into air. Defaults to 120. */
  steamLifetime: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  chunkSize: 32,
  sleepThresholdTicks: 3,
  lavaViscositySkip: 0.35,
  waterDispersionRate: 4,
  lavaDispersionRate: 1,
  steamLifetime: 120,
};

export interface TickStats {
  tick: number;
  durationMs: number;
  activeChunks: number;
  totalChunks: number;
  particlesMoved: number;
  reactionsTriggered: number;
}

export type CellSwapFn = (x1: number, y1: number, x2: number, y2: number) => boolean;
