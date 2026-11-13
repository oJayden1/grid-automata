import { Chunk } from './chunk.js';
import { ElementId } from './elements.js';
import { ChunkCoord, DEFAULT_CONFIG, SimulationConfig } from './types.js';

/**
 * High-performance 2D dynamic chunk-based spatial grid.
 */
export class ChunkGrid {
  public readonly chunkSize: number;
  public readonly config: SimulationConfig;
  private readonly chunks: Map<string, Chunk> = new Map();

  // 1-element cache to avoid Map lookups on repeated local coordinate operations
  private cachedCx: number = Number.MIN_SAFE_INTEGER;
  private cachedCy: number = Number.MIN_SAFE_INTEGER;
  private cachedChunk: Chunk | null = null;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chunkSize = this.config.chunkSize;
  }

  public static chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public toChunkCoord(wx: number, wy: number): ChunkCoord {
    return {
      cx: Math.floor(wx / this.chunkSize),
      cy: Math.floor(wy / this.chunkSize),
    };
  }

  public toLocalX(wx: number): number {
    const s = this.chunkSize;
    return ((wx % s) + s) % s;
  }

  public toLocalY(wy: number): number {
    const s = this.chunkSize;
    return ((wy % s) + s) % s;
  }

  public getChunk(cx: number, cy: number, createIfMissing: boolean = false): Chunk | null {
    if (cx === this.cachedCx && cy === this.cachedCy && this.cachedChunk !== null) {
      return this.cachedChunk;
    }

    const key = ChunkGrid.chunkKey(cx, cy);
    let chunk = this.chunks.get(key) ?? null;

    if (!chunk && createIfMissing) {
      chunk = new Chunk(cx, cy, this.chunkSize);
      this.chunks.set(key, chunk);
    }

    if (chunk) {
      this.cachedCx = cx;
      this.cachedCy = cy;
      this.cachedChunk = chunk;
    }

    return chunk;
  }

  public getOrCreateChunk(cx: number, cy: number): Chunk {
    return this.getChunk(cx, cy, true)!;
  }

  public hasChunk(cx: number, cy: number): boolean {
    return this.chunks.has(ChunkGrid.chunkKey(cx, cy));
  }

  public getAllChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  public getChunkCount(): number {
    return this.chunks.size;
  }

  public getActiveChunks(): Chunk[] {
    const active: Chunk[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.isActive) {
        active.push(chunk);
      }
    }
    return active;
  }

  public getCell(wx: number, wy: number): ElementId {
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const chunk = this.getChunk(cx, cy, false);
    if (!chunk) {
      return ElementId.EMPTY;
    }
    const lx = this.toLocalX(wx);
    const ly = this.toLocalY(wy);
    return chunk.get(lx, ly);
  }

  public getCellLastUpdated(wx: number, wy: number): number {
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const chunk = this.getChunk(cx, cy, false);
    if (!chunk) return 0;
    const lx = this.toLocalX(wx);
    const ly = this.toLocalY(wy);
    return chunk.lastUpdated[chunk.getIndex(lx, ly)];
  }

  public getCellLife(wx: number, wy: number): number {
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const chunk = this.getChunk(cx, cy, false);
    if (!chunk) return 0;
    const lx = this.toLocalX(wx);
    const ly = this.toLocalY(wy);
    return chunk.life[chunk.getIndex(lx, ly)];
  }

  public setCell(
    wx: number,
    wy: number,
    element: ElementId,
    tick: number = 0,
    initialLife: number = 0
  ): boolean {
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const chunk = this.getOrCreateChunk(cx, cy);

    const lx = this.toLocalX(wx);
    const ly = this.toLocalY(wy);

    chunk.set(lx, ly, element, tick, initialLife);
    this.wakeNeighborsIfNeeded(cx, cy, lx, ly);
    return true;
  }

  public swapCells(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tick: number
  ): boolean {
    const cx1 = Math.floor(x1 / this.chunkSize);
    const cy1 = Math.floor(y1 / this.chunkSize);
    const cx2 = Math.floor(x2 / this.chunkSize);
    const cy2 = Math.floor(y2 / this.chunkSize);

    const chunk1 = this.getOrCreateChunk(cx1, cy1);
    const chunk2 = cx1 === cx2 && cy1 === cy2 ? chunk1 : this.getOrCreateChunk(cx2, cy2);

    const lx1 = this.toLocalX(x1);
    const ly1 = this.toLocalY(y1);
    const lx2 = this.toLocalX(x2);
    const ly2 = this.toLocalY(y2);

    const idx1 = chunk1.getIndex(lx1, ly1);
    const idx2 = chunk2.getIndex(lx2, ly2);

    const elem1 = chunk1.elements[idx1];
    const elem2 = chunk2.elements[idx2];
    const life1 = chunk1.life[idx1];
    const life2 = chunk2.life[idx2];

    // Swap element and life
    chunk1.elements[idx1] = elem2;
    chunk1.life[idx1] = life2;
    chunk1.lastUpdated[idx1] = tick;
    chunk1.markDirty(lx1, ly1);
    chunk1.wakeUp();

    chunk2.elements[idx2] = elem1;
    chunk2.life[idx2] = life1;
    chunk2.lastUpdated[idx2] = tick;
    chunk2.markDirty(lx2, ly2);
    chunk2.wakeUp();

    this.wakeNeighborsIfNeeded(cx1, cy1, lx1, ly1);
    if (chunk1 !== chunk2) {
      this.wakeNeighborsIfNeeded(cx2, cy2, lx2, ly2);
    }

    return true;
  }

  public wakeNeighborsIfNeeded(cx: number, cy: number, lx: number, ly: number): void {
    const s = this.chunkSize;
    const atLeft = lx === 0;
    const atRight = lx === s - 1;
    const atTop = ly === 0;
    const atBottom = ly === s - 1;

    if (atLeft) this.wakeChunk(cx - 1, cy);
    if (atRight) this.wakeChunk(cx + 1, cy);
    if (atTop) this.wakeChunk(cx, cy - 1);
    if (atBottom) this.wakeChunk(cx, cy + 1);

    if (atLeft && atTop) this.wakeChunk(cx - 1, cy - 1);
    if (atLeft && atBottom) this.wakeChunk(cx - 1, cy + 1);
    if (atRight && atTop) this.wakeChunk(cx + 1, cy - 1);
    if (atRight && atBottom) this.wakeChunk(cx + 1, cy + 1);
  }

  public wakeChunk(cx: number, cy: number): void {
    const chunk = this.getChunk(cx, cy, false);
    if (chunk && !chunk.isActive) {
      chunk.wakeUp();
    }
  }

  public clear(): void {
    this.chunks.clear();
    this.cachedCx = Number.MIN_SAFE_INTEGER;
    this.cachedCy = Number.MIN_SAFE_INTEGER;
    this.cachedChunk = null;
  }
}
