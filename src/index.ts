/**
 * Grid Automata & Entity FSM - 2D Chunk-based cellular automata & AI simulation engine
 */

export * from './core/types.js';
export * from './core/elements.js';
export * from './core/chunk.js';
export * from './core/grid.js';
export * from './core/simulator.js';

export * from './rules/sand.js';
export * from './rules/water.js';
export * from './rules/lava.js';
export * from './rules/reactions.js';

export * from './ai/fsm.js';
export * from './ai/utility.js';
export * from './ai/decision-tree.js';
export * from './ai/pathfinding.js';
export * from './ai/npc-brain.js';

export * from './entities/entity.js';
export * from './entities/npc.js';

export * from './game/types.js';
export * from './game/player.js';
export * from './game/world-generator.js';
export * from './game/game-world.js';
export * from './game/storage.js';

