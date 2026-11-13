import { ElementId } from '../core/elements.js';
import { Point2D } from '../core/types.js';

export interface EntityStats {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  speed: number;
}

/**
 * Base game entity representing an actor in the 2D world.
 */
export class Entity {
  public readonly id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;

  public stats: EntityStats;
  public isAlive: boolean = true;
  public readonly inventory: Map<ElementId, number> = new Map();

  constructor(id: string, initialX: number, initialY: number, stats?: Partial<EntityStats>) {
    this.id = id;
    this.x = initialX;
    this.y = initialY;
    this.stats = {
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      speed: 1,
      ...stats,
    };
  }

  public get position(): Point2D {
    return { x: this.x, y: this.y };
  }

  public set position(pos: Point2D) {
    this.x = pos.x;
    this.y = pos.y;
  }

  public takeDamage(amount: number): void {
    this.stats.health = Math.max(0, this.stats.health - amount);
    if (this.stats.health <= 0) {
      this.isAlive = false;
    }
  }

  public heal(amount: number): void {
    if (!this.isAlive) return;
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  public consumeEnergy(amount: number): boolean {
    if (this.stats.energy < amount) {
      return false;
    }
    this.stats.energy = Math.max(0, this.stats.energy - amount);
    return true;
  }

  public restoreEnergy(amount: number): void {
    this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + amount);
  }

  public addItem(item: ElementId, count: number = 1): void {
    const curr = this.inventory.get(item) ?? 0;
    this.inventory.set(item, curr + count);
  }

  public countItem(item: ElementId): number {
    return this.inventory.get(item) ?? 0;
  }
}
