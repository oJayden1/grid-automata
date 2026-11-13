import { ElementId } from './elements.js';

/**
 * Represents a fixed 2D spatial chunk containing cellular automata elements.
 */
export class Chunk {
  public readonly cx: number;
  public readonly cy: number;
  public readonly size: number;
  public readonly cellCount: number;

  public readonly elements: Uint8Array;
  public readonly lastUpdated: Uint32Array;
  public readonly life: Uint16Array;

  public isActive: boolean = false;
  public inactiveTicks: number = 0;

  // Dirty bounding box within the chunk [0..size-1]
  public dirtyMinX: number = 0;
  public dirtyMaxX: number = 0;
  public dirtyMinY: number = 0;
  public dirtyMaxY: number = 0;
  public hasDirtyRect: boolean = false;

  constructor(cx: number, cy: number, size: number = 32) {
    this.cx = cx;
    this.cy = cy;
    this.size = size;
    this.cellCount = size * size;

    this.elements = new Uint8Array(this.cellCount);
    this.lastUpdated = new Uint32Array(this.cellCount);
    this.life = new Uint16Array(this.cellCount);
    this.resetDirtyRect();
  }

  public getIndex(lx: number, ly: number): number {
    return ly * this.size + lx;
  }

  public get(lx: number, ly: number): ElementId {
    if (lx < 0 || lx >= this.size || ly < 0 || ly >= this.size) {
      return ElementId.EMPTY;
    }
    return this.elements[ly * this.size + lx] as ElementId;
  }

  public set(lx: number, ly: number, element: ElementId, tick: number = 0, initialLife: number = 0): void {
    if (lx < 0 || lx >= this.size || ly < 0 || ly >= this.size) {
      return;
    }
    const idx = ly * this.size + lx;
    this.elements[idx] = element;
    this.lastUpdated[idx] = tick;
    this.life[idx] = initialLife;

    this.markDirty(lx, ly);
    this.wakeUp();
  }

  public markDirty(lx: number, ly: number): void {
    if (!this.hasDirtyRect) {
      this.dirtyMinX = lx;
      this.dirtyMaxX = lx;
      this.dirtyMinY = ly;
      this.dirtyMaxY = ly;
      this.hasDirtyRect = true;
    } else {
      if (lx < this.dirtyMinX) this.dirtyMinX = lx;
      if (lx > this.dirtyMaxX) this.dirtyMaxX = lx;
      if (ly < this.dirtyMinY) this.dirtyMinY = ly;
      if (ly > this.dirtyMaxY) this.dirtyMaxY = ly;
    }
  }

  public resetDirtyRect(): void {
    this.dirtyMinX = 0;
    this.dirtyMaxX = this.size - 1;
    this.dirtyMinY = 0;
    this.dirtyMaxY = this.size - 1;
    this.hasDirtyRect = false;
  }

  public wakeUp(): void {
    this.isActive = true;
    this.inactiveTicks = 0;
  }

  public sleep(): void {
    this.isActive = false;
  }

  public countNonEmpty(): number {
    let count = 0;
    for (let i = 0; i < this.cellCount; i++) {
      if (this.elements[i] !== ElementId.EMPTY) {
        count++;
      }
    }
    return count;
  }
}
