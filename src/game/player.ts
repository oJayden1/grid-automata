import { Entity, EntityStats } from '../entities/entity.js';
import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { PlayerInputState, WorldBounds } from './types.js';

/**
 * Playable Survivor character integrated with the Simulator entity loop.
 */
export class Player extends Entity {
  public spawnX: number;
  public spawnY: number;
  public facingDir: -1 | 1 = 1;
  public onGround: boolean = false;
  public inWater: boolean = false;
  public reachRadius: number = 6;
  public damageCooldownTicks: number = 0;
  public lastHurtTick: number = -999;

  public input: PlayerInputState = {
    left: false,
    right: false,
    jump: false,
    down: false,
  };

  private vyFloat: number = 0;
  private accY: number = 0;
  private coyoteTicks: number = 0;
  private moveTickCounter: number = 0;

  constructor(
    initialX: number,
    initialY: number,
    stats?: Partial<EntityStats>
  ) {
    super('player', initialX, initialY, {
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      speed: 1,
      ...stats,
    });
    this.spawnX = initialX;
    this.spawnY = initialY;
  }

  public static isPassable(elem: ElementId): boolean {
    return (
      elem === ElementId.EMPTY ||
      elem === ElementId.STEAM ||
      elem === ElementId.WATER ||
      elem === ElementId.LAVA
    );
  }

  public static isSolid(elem: ElementId): boolean {
    return (
      elem === ElementId.SOLID ||
      elem === ElementId.STONE ||
      elem === ElementId.OBSIDIAN ||
      elem === ElementId.SAND
    );
  }

  public static isMineable(elem: ElementId): boolean {
    return (
      elem === ElementId.SAND ||
      elem === ElementId.STONE ||
      elem === ElementId.OBSIDIAN ||
      elem === ElementId.WATER
    );
  }

  public override takeDamage(amount: number): void {
    if (!this.isAlive || this.damageCooldownTicks > 0) {
      return;
    }
    super.takeDamage(amount);
    this.damageCooldownTicks = 12;
    this.lastHurtTick = 0;

    // Gentle upward hop away from thermal hazard so lava is survivable with quick reflexes
    if (this.isAlive) {
      this.vyFloat = Math.min(this.vyFloat, -0.85);
      this.accY = -0.5;
    }
  }

  public tick(grid: ChunkGrid, tickNumber: number, bounds?: WorldBounds): void {
    if (!this.isAlive) return;

    if (this.damageCooldownTicks > 0) {
      this.damageCooldownTicks--;
      this.lastHurtTick++;
    }

    // If buried by falling sand, gently pop up one cell if open space above
    const currentCell = grid.getCell(this.x, this.y);
    if (currentCell === ElementId.SAND && Player.isPassable(grid.getCell(this.x, this.y - 1))) {
      this.y -= 1;
    }

    this.inWater = grid.getCell(this.x, this.y) === ElementId.WATER;
    const belowElem = grid.getCell(this.x, this.y + 1);
    const groundedNow = Player.isSolid(belowElem);

    if (groundedNow) {
      this.onGround = true;
      this.coyoteTicks = 3;
    } else {
      this.onGround = false;
      if (this.coyoteTicks > 0) this.coyoteTicks--;
    }

    // Horizontal movement
    const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (dir !== 0) {
      this.facingDir = dir > 0 ? 1 : -1;
      this.moveTickCounter++;
      const moveInterval = this.inWater ? 2 : 1;
      if (this.moveTickCounter % moveInterval === 0) {
        this.tryMoveHorizontal(grid, this.facingDir, bounds);
      }
    } else {
      this.moveTickCounter = 0;
    }

    // Vertical physics: swimming vs air jump & gravity
    if (this.inWater) {
      if (this.input.jump) {
        this.vyFloat = -0.65;
      } else if (this.input.down) {
        this.vyFloat = 0.65;
      } else {
        this.vyFloat = Math.min(0.35, this.vyFloat + 0.08);
      }
    } else {
      if (this.input.jump && (this.onGround || this.coyoteTicks > 0)) {
        this.vyFloat = -1.2;
        this.accY = -0.2;
        this.onGround = false;
        this.coyoteTicks = 0;
        this.consumeEnergy(2);
      } else {
        this.vyFloat = Math.min(1.0, this.vyFloat + 0.2);
      }
    }

    this.accY += this.vyFloat;

    if (this.accY <= -1.0) {
      const targetY = this.y - 1;
      const inYBounds = !bounds || targetY >= bounds.minY;
      if (inYBounds && Player.isPassable(grid.getCell(this.x, targetY))) {
        this.y = targetY;
        this.accY = Math.max(-0.5, this.accY + 1.0);
      } else {
        this.vyFloat = 0;
        this.accY = 0;
      }
    } else if (this.accY >= 1.0) {
      const targetY = this.y + 1;
      const inYBounds = !bounds || targetY <= bounds.maxY;
      if (inYBounds && Player.isPassable(grid.getCell(this.x, targetY))) {
        this.y = targetY;
        this.accY = Math.min(0.5, this.accY - 1.0);
      } else {
        this.vyFloat = 0;
        this.accY = 0;
        this.onGround = true;
      }
    }

    // Gentle energy & health regeneration when safe and resting
    if (dir === 0 && !this.input.jump) {
      this.restoreEnergy(0.8);
    } else {
      this.restoreEnergy(0.25);
    }

    // Slow natural regen if well-rested and not touching lava
    if (
      tickNumber % 25 === 0 &&
      this.damageCooldownTicks === 0 &&
      this.stats.energy > 60 &&
      this.stats.health < this.stats.maxHealth &&
      grid.getCell(this.x, this.y) !== ElementId.LAVA &&
      grid.getCell(this.x, this.y + 1) !== ElementId.LAVA
    ) {
      this.heal(1);
    }
  }

  private tryMoveHorizontal(
    grid: ChunkGrid,
    dir: -1 | 1,
    bounds?: WorldBounds
  ): boolean {
    const nextX = this.x + dir;
    if (bounds && (nextX < bounds.minX || nextX > bounds.maxX)) {
      return false;
    }

    if (Player.isPassable(grid.getCell(nextX, this.y))) {
      this.x = nextX;
      return true;
    }

    // 1-cell auto step-up across gentle terrain ledges
    const stepUpY = this.y - 1;
    const inYBounds = !bounds || stepUpY >= bounds.minY;
    if (
      inYBounds &&
      Player.isPassable(grid.getCell(this.x, stepUpY)) &&
      Player.isPassable(grid.getCell(nextX, stepUpY))
    ) {
      this.x = nextX;
      this.y = stepUpY;
      this.vyFloat = Math.min(this.vyFloat, 0);
      return true;
    }

    return false;
  }

  public isWithinReach(targetX: number, targetY: number): boolean {
    return Math.hypot(targetX - this.x, targetY - this.y) <= this.reachRadius;
  }

  public mineCell(
    grid: ChunkGrid,
    targetX: number,
    targetY: number,
    tick: number,
    bounds?: WorldBounds
  ): ElementId | null {
    if (!this.isAlive || !this.isWithinReach(targetX, targetY)) {
      return null;
    }
    if (
      bounds &&
      (targetX < bounds.minX ||
        targetX > bounds.maxX ||
        targetY < bounds.minY ||
        targetY > bounds.maxY)
    ) {
      return null;
    }

    const elem = grid.getCell(targetX, targetY);
    if (!Player.isMineable(elem)) {
      return null;
    }

    grid.setCell(targetX, targetY, ElementId.EMPTY, tick, 0);
    this.addItem(elem, 1);
    this.consumeEnergy(0.5);
    return elem;
  }

  public placeCell(
    grid: ChunkGrid,
    targetX: number,
    targetY: number,
    element: ElementId,
    tick: number,
    bounds?: WorldBounds
  ): boolean {
    if (!this.isAlive || !this.isWithinReach(targetX, targetY)) {
      return false;
    }
    if (
      bounds &&
      (targetX < bounds.minX ||
        targetX > bounds.maxX ||
        targetY < bounds.minY ||
        targetY > bounds.maxY)
    ) {
      return false;
    }
    if (this.countItem(element) <= 0) {
      return false;
    }

    // Prevent entombs on solid placements over player's body
    if (targetX === this.x && targetY === this.y && Player.isSolid(element)) {
      return false;
    }

    const existing = grid.getCell(targetX, targetY);
    const canReplace =
      existing === ElementId.EMPTY ||
      existing === ElementId.STEAM ||
      (element !== ElementId.WATER && existing === ElementId.WATER);

    if (!canReplace) {
      return false;
    }

    const current = this.inventory.get(element) ?? 0;
    this.inventory.set(element, current - 1);
    grid.setCell(targetX, targetY, element, tick, 0);
    return true;
  }

  public respawn(x: number = this.spawnX, y: number = this.spawnY): void {
    this.x = x;
    this.y = y;
    this.vyFloat = 0;
    this.accY = 0;
    this.damageCooldownTicks = 24;
    this.stats.health = this.stats.maxHealth;
    this.stats.energy = this.stats.maxEnergy;
    this.isAlive = true;
  }
}
