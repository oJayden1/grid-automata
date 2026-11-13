import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { ReactionHandler } from './reactions.js';

/**
 * Cellular automata update logic for Water (Low-viscosity Liquid).
 */
export class WaterRule {
  /**
   * Updates a water particle at (x, y).
   * Returns true if water moved or reacted, false if resting.
   */
  public static update(grid: ChunkGrid, x: number, y: number, tick: number): boolean {
    // Check reactions first (e.g. adjacent to lava)
    const reaction = ReactionHandler.checkAndApplyReactions(grid, x, y, ElementId.WATER, tick);
    if (reaction.reacted) {
      return true;
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

    // 3. Horizontal dispersion across surface
    const maxDispersion = grid.config.waterDispersionRate;

    // Check preferred direction first, then opposite
    const directions = [dir1, dir2];
    for (const dir of directions) {
      let furthestX = x;
      for (let dist = 1; dist <= maxDispersion; dist++) {
        const nextX = x + dir * dist;
        const elem = grid.getCell(nextX, y);
        if (canMoveInto(elem)) {
          furthestX = nextX;
        } else {
          // Blocked by barrier, stop scanning further in this direction
          break;
        }
      }

      if (furthestX !== x) {
        grid.swapCells(x, y, furthestX, y, tick);
        return true;
      }
    }

    return false;
  }
}
