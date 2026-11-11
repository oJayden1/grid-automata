import { ChunkGrid } from '../core/grid.js';
import { DENSITIES, ElementId } from '../core/elements.js';

/**
 * Cellular automata update logic for Sand (Powder).
 */
export class SandRule {
  /**
   * Updates a sand particle at (x, y).
   * Returns true if the particle moved, false if resting.
   */
  public static update(grid: ChunkGrid, x: number, y: number, tick: number): boolean {
    const sandDensity = DENSITIES[ElementId.SAND];

    const canDisplace = (targetElem: ElementId): boolean => {
      if (targetElem === ElementId.EMPTY) return true;
      // Sand sinks in liquids with lower density (Water density 2, Lava density 6)
      const targetDensity = DENSITIES[targetElem];
      return targetDensity > 0 && targetDensity < sandDensity;
    };

    // 1. Straight down
    const below = grid.getCell(x, y + 1);
    if (canDisplace(below)) {
      grid.swapCells(x, y, x, y + 1, tick);
      return true;
    }

    // 2. Downward diagonals with pseudo-random / alternating bias to eliminate directional skew
    const goLeftFirst = (tick + x + y) % 2 === 0;
    const dir1 = goLeftFirst ? -1 : 1;
    const dir2 = -dir1;

    const diag1 = grid.getCell(x + dir1, y + 1);
    if (canDisplace(diag1)) {
      grid.swapCells(x, y, x + dir1, y + 1, tick);
      return true;
    }

    const diag2 = grid.getCell(x + dir2, y + 1);
    if (canDisplace(diag2)) {
      grid.swapCells(x, y, x + dir2, y + 1, tick);
      return true;
    }

    // Blocked on all sides: sand remains static
    return false;
  }
}
