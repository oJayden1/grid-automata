import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { ReactionHandler } from './reactions.js';

/**
 * Cellular automata update logic for Lava (High-viscosity Liquid).
 */
export class LavaRule {
  /**
   * Updates a lava particle at (x, y).
   * Returns true if lava moved or reacted, false if resting.
   */
  public static update(grid: ChunkGrid, x: number, y: number, tick: number): boolean {
    // Check reactions with adjacent water first
    const reaction = ReactionHandler.checkAndApplyReactions(grid, x, y, ElementId.LAVA, tick);
    if (reaction.reacted) {
      return true;
    }

    // Viscosity throttle: lava is thick and molasses-like, oozing at reduced frequency
    // Use spatial/tick hash to determine if this cell moves on this tick
    const hash = ((x * 73856093) ^ (y * 19349663) ^ (tick * 83492791)) >>> 0;
    const normalized = (hash & 0xffff) / 0xffff;
    if (normalized < grid.config.lavaViscositySkip) {
      return false;
    }

    const canMoveInto = (targetElem: ElementId): boolean => {
      return targetElem === ElementId.EMPTY;
    };

    // 1. Straight down
    const below = grid.getCell(x, y + 1);
    if (canMoveInto(below)) {
      grid.swapCells(x, y, x, y + 1, tick);
      return true;
    }

    // 2. Downward diagonals (alternating bias)
    const goLeftFirst = (tick + x + y) % 2 === 0;
    const dir1 = goLeftFirst ? -1 : 1;
    const dir2 = -dir1;

    const diag1 = grid.getCell(x + dir1, y + 1);
    if (canMoveInto(diag1)) {
      grid.swapCells(x, y, x + dir1, y + 1, tick);
      return true;
    }

    const diag2 = grid.getCell(x + dir2, y + 1);
    if (canMoveInto(diag2)) {
      grid.swapCells(x, y, x + dir2, y + 1, tick);
      return true;
    }

    // 3. Slow horizontal oozing (1 cell max)
    const dirs = [dir1, dir2];
    for (const dir of dirs) {
      const side = grid.getCell(x + dir, y);
      if (canMoveInto(side)) {
        grid.swapCells(x, y, x + dir, y, tick);
        return true;
      }
    }

    return false;
  }
}
