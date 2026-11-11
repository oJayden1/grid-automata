import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';

export interface ReactionResult {
  reacted: boolean;
  type?: 'quench' | 'steam_dissipate';
}

/**
 * Handles interactions and phase changes between elements (e.g. Water + Lava).
 */
export class ReactionHandler {
  /**
   * Checks if an element at (x, y) reacts with neighboring cells.
   * If water touches lava (or vice versa), water converts to steam and lava converts to stone/obsidian.
   */
  public static checkAndApplyReactions(
    grid: ChunkGrid,
    x: number,
    y: number,
    element: ElementId,
    tick: number
  ): ReactionResult {
    if (element === ElementId.WATER) {
      return this.handleWaterReactions(grid, x, y, tick);
    }
    if (element === ElementId.LAVA) {
      return this.handleLavaReactions(grid, x, y, tick);
    }
    if (element === ElementId.STEAM) {
      return this.handleSteam(grid, x, y, tick);
    }
    return { reacted: false };
  }

  private static handleWaterReactions(
    grid: ChunkGrid,
    x: number,
    y: number,
    tick: number
  ): ReactionResult {
    // Check 4 cardinal neighbors for lava
    const neighbors = [
      { nx: x, ny: y + 1 }, // below
      { nx: x, ny: y - 1 }, // above
      { nx: x - 1, ny: y }, // left
      { nx: x + 1, ny: y }, // right
    ];

    for (const { nx, ny } of neighbors) {
      const neighborElem = grid.getCell(nx, ny);
      if (neighborElem === ElementId.LAVA) {
        // Water turns to steam
        grid.setCell(x, y, ElementId.STEAM, tick, 0);

        // Lava turns to Stone or Obsidian (Obsidian if cooled from below/adjacent pressure)
        const isDenseLava = ny > y || grid.getCell(nx, ny + 1) === ElementId.LAVA;
        const formedRock = isDenseLava ? ElementId.OBSIDIAN : ElementId.STONE;
        grid.setCell(nx, ny, formedRock, tick, 0);

        return { reacted: true, type: 'quench' };
      }
    }

    return { reacted: false };
  }

  private static handleLavaReactions(
    grid: ChunkGrid,
    x: number,
    y: number,
    tick: number
  ): ReactionResult {
    const neighbors = [
      { nx: x, ny: y - 1 }, // above
      { nx: x, ny: y + 1 }, // below
      { nx: x - 1, ny: y }, // left
      { nx: x + 1, ny: y }, // right
    ];

    for (const { nx, ny } of neighbors) {
      const neighborElem = grid.getCell(nx, ny);
      if (neighborElem === ElementId.WATER) {
        // Water vaporizes into steam
        grid.setCell(nx, ny, ElementId.STEAM, tick, 0);

        // This lava cools into stone/obsidian
        const isDeepLava = y > ny || grid.getCell(x, y + 1) === ElementId.LAVA;
        const formedRock = isDeepLava ? ElementId.OBSIDIAN : ElementId.STONE;
        grid.setCell(x, y, formedRock, tick, 0);

        return { reacted: true, type: 'quench' };
      }
    }

    return { reacted: false };
  }

  private static handleSteam(
    grid: ChunkGrid,
    x: number,
    y: number,
    tick: number
  ): ReactionResult {
    const currentLife = grid.getCellLife(x, y);
    const maxLife = grid.config.steamLifetime;

    if (currentLife >= maxLife) {
      // Steam dissipates into air
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      return { reacted: true, type: 'steam_dissipate' };
    }

    // Steam rises (gravity is inverted)
    const canMoveInto = (targetElem: ElementId): boolean => {
      return targetElem === ElementId.EMPTY;
    };

    // 1. Straight up
    if (canMoveInto(grid.getCell(x, y - 1))) {
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      grid.setCell(x, y - 1, ElementId.STEAM, tick, currentLife + 1);
      return { reacted: true };
    }

    // 2. Up-diagonals (randomized bias)
    const goLeftFirst = (tick + x + y) % 2 === 0;
    const d1 = goLeftFirst ? -1 : 1;
    const d2 = -d1;

    if (canMoveInto(grid.getCell(x + d1, y - 1))) {
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      grid.setCell(x + d1, y - 1, ElementId.STEAM, tick, currentLife + 1);
      return { reacted: true };
    }
    if (canMoveInto(grid.getCell(x + d2, y - 1))) {
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      grid.setCell(x + d2, y - 1, ElementId.STEAM, tick, currentLife + 1);
      return { reacted: true };
    }

    // 3. Sideways drift
    if (canMoveInto(grid.getCell(x + d1, y))) {
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      grid.setCell(x + d1, y, ElementId.STEAM, tick, currentLife + 1);
      return { reacted: true };
    }
    if (canMoveInto(grid.getCell(x + d2, y))) {
      grid.setCell(x, y, ElementId.EMPTY, tick, 0);
      grid.setCell(x + d2, y, ElementId.STEAM, tick, currentLife + 1);
      return { reacted: true };
    }

    // Stays in place, age increases
    grid.setCell(x, y, ElementId.STEAM, tick, currentLife + 1);
    return { reacted: false };
  }
}
