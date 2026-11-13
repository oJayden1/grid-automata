import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { Point2D } from '../core/types.js';

export interface PathNode {
  x: number;
  y: number;
  gCost: number;
  hCost: number;
  fCost: number;
  parent: PathNode | null;
}

/**
 * 2D Grid Pathfinding (A*) adapted for cellular automata physics and terrain.
 */
export class GridPathfinder {
  public static isWalkable(grid: ChunkGrid, x: number, y: number): boolean {
    const elem = grid.getCell(x, y);
    // NPC can occupy empty air, steam, or shallow water
    return elem === ElementId.EMPTY || elem === ElementId.STEAM || elem === ElementId.WATER;
  }

  public static isSolidGround(grid: ChunkGrid, x: number, y: number): boolean {
    const elem = grid.getCell(x, y);
    return (
      elem === ElementId.SOLID ||
      elem === ElementId.STONE ||
      elem === ElementId.OBSIDIAN ||
      elem === ElementId.SAND
    );
  }

  public static isHazard(grid: ChunkGrid, x: number, y: number): boolean {
    // Check cell and adjacent neighbors for lethal lava
    if (grid.getCell(x, y) === ElementId.LAVA) return true;
    if (grid.getCell(x + 1, y) === ElementId.LAVA) return true;
    if (grid.getCell(x - 1, y) === ElementId.LAVA) return true;
    if (grid.getCell(x, y + 1) === ElementId.LAVA) return true;
    return false;
  }

  /**
   * Calculates manhattan distance heuristic.
   */
  private static heuristic(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  /**
   * Finds a traversable path from start to goal.
   */
  public static findPath(
    grid: ChunkGrid,
    start: Point2D,
    goal: Point2D,
    maxSearchSteps: number = 600
  ): Point2D[] | null {
    if (start.x === goal.x && start.y === goal.y) {
      return [{ x: start.x, y: start.y }];
    }

    const openSet: Map<string, PathNode> = new Map();
    const closedSet: Set<string> = new Set();

    const startNode: PathNode = {
      x: start.x,
      y: start.y,
      gCost: 0,
      hCost: this.heuristic(start.x, start.y, goal.x, goal.y),
      fCost: this.heuristic(start.x, start.y, goal.x, goal.y),
      parent: null,
    };

    const startKey = `${start.x},${start.y}`;
    openSet.set(startKey, startNode);

    let steps = 0;

    while (openSet.size > 0 && steps++ < maxSearchSteps) {
      // Find lowest fCost node
      let current: PathNode | null = null;
      let lowestF = Infinity;

      for (const node of openSet.values()) {
        if (node.fCost < lowestF) {
          lowestF = node.fCost;
          current = node;
        }
      }

      if (!current) break;

      const currentKey = `${current.x},${current.y}`;

      // Goal reached (or adjacent if goal is a solid resource cell)
      if (
        (current.x === goal.x && current.y === goal.y) ||
        (this.heuristic(current.x, current.y, goal.x, goal.y) <= 1 && !this.isWalkable(grid, goal.x, goal.y))
      ) {
        return this.reconstructPath(current);
      }

      openSet.delete(currentKey);
      closedSet.add(currentKey);

      // Explore neighbors: left, right, step-up, step-down, jump over gap/hazard
      const candidateMoves: Point2D[] = [
        { x: current.x + 1, y: current.y },     // right
        { x: current.x - 1, y: current.y },     // left
        { x: current.x + 1, y: current.y - 1 }, // step-up right
        { x: current.x - 1, y: current.y - 1 }, // step-up left
        { x: current.x + 1, y: current.y + 1 }, // step-down right
        { x: current.x - 1, y: current.y + 1 }, // step-down left
        { x: current.x + 2, y: current.y },     // leap across gap/hazard right
        { x: current.x - 2, y: current.y },     // leap across gap/hazard left
        { x: current.x, y: current.y + 1 },     // fall down
      ];

      for (const next of candidateMoves) {
        const nextKey = `${next.x},${next.y}`;
        if (closedSet.has(nextKey)) continue;

        // Must be walkable space
        if (!this.isWalkable(grid, next.x, next.y)) continue;

        // If stepping up, head clearance check
        if (next.y < current.y && !this.isWalkable(grid, current.x, current.y - 1)) {
          continue;
        }

        // Leap across 1-tile pit or hazard (dx = 2)
        if (Math.abs(next.x - current.x) === 2) {
          const midX = (current.x + next.x) / 2;
          const isMidHazardOrPit =
            this.isHazard(grid, midX, current.y) ||
            !this.isSolidGround(grid, midX, current.y + 1);
          // Only leap if the midpoint is a hazard or pit, with head clearance
          if (!isMidHazardOrPit || !this.isWalkable(grid, midX, current.y - 1)) {
            continue;
          }
        }

        // Must have solid support or be in water/falling
        const hasFooting =
          this.isSolidGround(grid, next.x, next.y + 1) ||
          grid.getCell(next.x, next.y) === ElementId.WATER ||
          next.y > current.y; // Falling down is valid

        if (!hasFooting) continue;

        // Movement costs
        let moveCost = 1.0;
        if (Math.abs(next.x - current.x) === 2) moveCost = 2.5; // Jumping cost
        if (grid.getCell(next.x, next.y) === ElementId.WATER) moveCost = 2.5;
        if (this.isHazard(grid, next.x, next.y)) moveCost = 6.0; // Moderate hazard penalty

        const tentativeG = current.gCost + moveCost;
        let neighbor = openSet.get(nextKey);

        if (!neighbor) {
          const h = this.heuristic(next.x, next.y, goal.x, goal.y);
          neighbor = {
            x: next.x,
            y: next.y,
            gCost: tentativeG,
            hCost: h,
            fCost: tentativeG + h,
            parent: current,
          };
          openSet.set(nextKey, neighbor);
        } else if (tentativeG < neighbor.gCost) {
          neighbor.gCost = tentativeG;
          neighbor.fCost = tentativeG + neighbor.hCost;
          neighbor.parent = current;
        }
      }
    }

    return null; // No path found within step budget
  }

  private static reconstructPath(endNode: PathNode): Point2D[] {
    const path: Point2D[] = [];
    let curr: PathNode | null = endNode;
    while (curr) {
      path.push({ x: curr.x, y: curr.y });
      curr = curr.parent;
    }
    return path.reverse();
  }
}
