import { ElementId } from '../core/elements.js';
import { StateId } from '../ai/fsm.js';
import { NPC } from '../entities/npc.js';
import { GameWorld } from './game-world.js';
import { Player } from './player.js';

export interface RendererViewOptions {
  showChunkGrid: boolean;
  showAiOverlay: boolean;
  selectedNpcId: string | null;
  hoverCell: { x: number; y: number } | null;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number; // CSS pixels per grid cell
}

const STATE_COLORS: Record<StateId, string> = {
  IDLE: '#94a3b8',
  WANDER: '#38bdf8',
  GATHER: '#f59e0b',
  FLEE: '#ef4444',
  REST: '#10b981',
};

function packRGBA(r: number, g: number, b: number, a: number = 255): number {
  return (
    ((a & 0xff) << 24) |
    ((b & 0xff) << 16) |
    ((g & 0xff) << 8) |
    (r & 0xff)
  ) >>> 0;
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function spatialNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) & 0xff;
}

/**
 * High-speed ImageData pixel renderer + crisp canvas entity & debug overlay.
 */
export class CanvasRenderer {
  private readonly offscreen: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixelBuf: Uint32Array;
  private worldWidth: number = 0;
  private worldHeight: number = 0;

  // Interpolated visual coordinates for smooth 60 FPS entity motion
  private interpPos: Map<string, { x: number; y: number }> = new Map();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.offscreen = document.createElement('canvas');
    const offCtx = this.offscreen.getContext('2d', { alpha: false });
    if (!offCtx) {
      throw new Error('Failed to create 2D offscreen canvas context.');
    }
    this.offCtx = offCtx;
    this.imageData = this.offCtx.createImageData(1, 1);
    this.pixelBuf = new Uint32Array(this.imageData.data.buffer);
  }

  private ensureBufferSize(width: number, height: number): void {
    if (this.worldWidth === width && this.worldHeight === height) return;
    this.worldWidth = width;
    this.worldHeight = height;
    this.offscreen.width = width;
    this.offscreen.height = height;
    this.imageData = this.offCtx.createImageData(width, height);
    this.pixelBuf = new Uint32Array(this.imageData.data.buffer);
  }

  public syncViewportSize(): { width: number; height: number; dpr: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    return { width: w, height: h, dpr };
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
    camera: CameraState
  ): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = Math.floor(camera.x + (sx - rect.width / 2) / camera.zoom);
    const wy = Math.floor(camera.y + (sy - rect.height / 2) / camera.zoom);
    return { x: wx, y: wy };
  }

  public worldToScreen(
    wx: number,
    wy: number,
    camera: CameraState,
    viewportW: number,
    viewportH: number
  ): { x: number; y: number } {
    return {
      x: viewportW / 2 + (wx - camera.x) * camera.zoom,
      y: viewportH / 2 + (wy - camera.y) * camera.zoom,
    };
  }

  public resetInterpolation(): void {
    this.interpPos.clear();
  }

  private getSmoothedPosition(id: string, targetX: number, targetY: number): { x: number; y: number } {
    const existing = this.interpPos.get(id);
    if (!existing) {
      const init = { x: targetX, y: targetY };
      this.interpPos.set(id, init);
      return init;
    }
    // Snap if teleported/respawned far away
    if (Math.hypot(targetX - existing.x, targetY - existing.y) > 4) {
      existing.x = targetX;
      existing.y = targetY;
      return existing;
    }
    existing.x += (targetX - existing.x) * 0.42;
    existing.y += (targetY - existing.y) * 0.42;
    return existing;
  }

  public render(
    world: GameWorld,
    camera: CameraState,
    options: RendererViewOptions
  ): void {
    const { width: viewW, height: viewH, dpr } = this.syncViewportSize();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const { bounds, simulator } = world;
    const w = bounds.maxX - bounds.minX + 1;
    const h = bounds.maxY - bounds.minY + 1;
    this.ensureBufferSize(w, h);

    const tick = simulator.currentTick;
    const grid = simulator.grid;
    const steamMaxLife = Math.max(1, simulator.config.steamLifetime);

    // 1. Write world cells into Uint32 pixel buffer
    for (let ry = 0; ry < h; ry++) {
      const wy = bounds.minY + ry;
      const rowOffset = ry * w;

      // Subtle sky-to-cavern depth backdrop
      const depthRatio = Math.max(0, Math.min(1, ry / h));
      const bgR = clampByte(20 - depthRatio * 10);
      const bgG = clampByte(26 - depthRatio * 12);
      const bgB = clampByte(36 - depthRatio * 16);

      for (let rx = 0; rx < w; rx++) {
        const wx = bounds.minX + rx;
        const elem = grid.getCell(wx, wy);

        if (elem === ElementId.EMPTY) {
          this.pixelBuf[rowOffset + rx] = packRGBA(bgR, bgG, bgB);
          continue;
        }

        const n = spatialNoise(wx, wy);
        const grain = ((n & 31) - 16) >> 1; // -8..+7

        switch (elem) {
          case ElementId.SOLID: {
            const checker = ((wx + wy) & 1) === 0 ? 4 : -4;
            this.pixelBuf[rowOffset + rx] = packRGBA(
              clampByte(54 + checker + (grain >> 1)),
              clampByte(58 + checker + (grain >> 1)),
              clampByte(66 + checker + (grain >> 1))
            );
            break;
          }
          case ElementId.SAND: {
            this.pixelBuf[rowOffset + rx] = packRGBA(
              clampByte(224 + grain),
              clampByte(192 + grain),
              clampByte(104 + (grain >> 1))
            );
            break;
          }
          case ElementId.STONE: {
            const strata = ((wy + ((wx >> 3) & 1)) % 5 === 0) ? -7 : 0;
            this.pixelBuf[rowOffset + rx] = packRGBA(
              clampByte(120 + strata + grain),
              clampByte(128 + strata + grain),
              clampByte(138 + strata + grain)
            );
            break;
          }
          case ElementId.OBSIDIAN: {
            const fleck = n > 235 ? 14 : 0;
            this.pixelBuf[rowOffset + rx] = packRGBA(
              clampByte(36 + fleck + (grain >> 1)),
              clampByte(33 + fleck + (grain >> 1)),
              clampByte(46 + fleck + (grain >> 1))
            );
            break;
          }
          case ElementId.WATER: {
            const shimmer = Math.sin(tick * 0.16 + wx * 0.45 + wy * 0.25) > 0.72 ? 22 : 0;
            this.pixelBuf[rowOffset + rx] = packRGBA(
              clampByte(40 + shimmer),
              clampByte(116 + shimmer),
              clampByte(224 + (shimmer >> 1))
            );
            break;
          }
          case ElementId.LAVA: {
            const pulse = Math.sin(tick * 0.14 + wx * 0.38 - wy * 0.32);
            const hot = pulse > 0.4 ? 1 : 0;
            this.pixelBuf[rowOffset + rx] = packRGBA(
              255,
              clampByte(hot ? 148 : 74 + (grain * 2)),
              clampByte(hot ? 28 : 8)
            );
            break;
          }
          case ElementId.STEAM: {
            const life = grid.getCellLife(wx, wy);
            const fade = Math.max(0.2, 1 - life / steamMaxLife);
            const r = clampByte(bgR + (215 - bgR) * fade * 0.72);
            const g = clampByte(bgG + (225 - bgG) * fade * 0.72);
            const b = clampByte(bgB + (238 - bgB) * fade * 0.72);
            this.pixelBuf[rowOffset + rx] = packRGBA(r, g, b);
            break;
          }
          default:
            this.pixelBuf[rowOffset + rx] = packRGBA(bgR, bgG, bgB);
        }
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    // 2. Render to main viewport
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, viewW, viewH);

    const worldOrigin = this.worldToScreen(bounds.minX, bounds.minY, camera, viewW, viewH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.offscreen,
      worldOrigin.x,
      worldOrigin.y,
      w * camera.zoom,
      h * camera.zoom
    );

    // 3. Optional Chunk Grid & Sleep Overlay
    if (options.showChunkGrid) {
      this.drawChunkOverlay(ctx, world, camera, viewW, viewH);
    }

    // 4. Optional AI Paths + Selected NPC Overlays
    for (const npc of world.getNPCs()) {
      if (!npc.isAlive) continue;
      if (options.showAiOverlay || options.selectedNpcId === npc.id) {
        this.drawNpcAiDebug(ctx, npc, camera, viewW, viewH, options.selectedNpcId === npc.id);
      }
    }

    // 5. Draw NPCs
    for (const npc of world.getNPCs()) {
      if (!npc.isAlive) continue;
      this.drawNPC(ctx, npc, camera, viewW, viewH, options.selectedNpcId === npc.id);
    }

    // 6. Draw Player + Survivor Reach / Sandbox Brush Preview
    this.drawPlayer(ctx, world.player, camera, viewW, viewH);
    this.drawInteractionCursor(ctx, world, camera, viewW, viewH, options.hoverCell);

    ctx.restore();
  }

  private drawChunkOverlay(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    camera: CameraState,
    viewW: number,
    viewH: number
  ): void {
    const chunkSize = world.simulator.grid.chunkSize;
    const pxSize = chunkSize * camera.zoom;

    ctx.save();
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';

    for (const chunk of world.simulator.grid.getAllChunks()) {
      const topLeft = this.worldToScreen(
        chunk.cx * chunkSize,
        chunk.cy * chunkSize,
        camera,
        viewW,
        viewH
      );

      if (
        topLeft.x + pxSize < 0 ||
        topLeft.y + pxSize < 0 ||
        topLeft.x > viewW ||
        topLeft.y > viewH
      ) {
        continue;
      }

      if (chunk.isActive) {
        ctx.fillStyle = 'rgba(224, 192, 104, 0.08)';
        ctx.fillRect(topLeft.x, topLeft.y, pxSize, pxSize);
        ctx.strokeStyle = 'rgba(224, 192, 104, 0.45)';
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      }

      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, pxSize, pxSize);

      if (pxSize >= 48) {
        ctx.fillStyle = chunk.isActive ? 'rgba(224, 192, 104, 0.85)' : 'rgba(148, 163, 184, 0.55)';
        ctx.fillText(
          `${chunk.cx},${chunk.cy} ${chunk.isActive ? 'ACT' : 'SLP'}`,
          topLeft.x + 4,
          topLeft.y + 4
        );
      }
    }
    ctx.restore();
  }

  private drawNpcAiDebug(
    ctx: CanvasRenderingContext2D,
    npc: NPC,
    camera: CameraState,
    viewW: number,
    viewH: number,
    isSelected: boolean
  ): void {
    const state = npc.brain.fsm.getCurrentStateId() ?? 'IDLE';
    const color = STATE_COLORS[state];

    ctx.save();
    if (npc.path.length > 0) {
      ctx.beginPath();
      const start = this.worldToScreen(npc.x + 0.5, npc.y + 0.5, camera, viewW, viewH);
      ctx.moveTo(start.x, start.y);
      for (const wp of npc.path) {
        const pt = this.worldToScreen(wp.x + 0.5, wp.y + 0.5, camera, viewW, viewH);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1.25;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isSelected) {
      const res = npc.brain.perceptions.nearestResource;
      if (res) {
        const pt = this.worldToScreen(res.pos.x + 0.5, res.pos.y + 0.5, camera, viewW, viewH);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          pt.x - camera.zoom * 0.55,
          pt.y - camera.zoom * 0.55,
          camera.zoom * 1.1,
          camera.zoom * 1.1
        );
      }

      const haz = npc.brain.perceptions.nearestHazard;
      if (haz) {
        const pt = this.worldToScreen(haz.x + 0.5, haz.y + 0.5, camera, viewW, viewH);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, camera.zoom * 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawNPC(
    ctx: CanvasRenderingContext2D,
    npc: NPC,
    camera: CameraState,
    viewW: number,
    viewH: number,
    isSelected: boolean
  ): void {
    const pos = this.getSmoothedPosition(npc.id, npc.x, npc.y);
    const screen = this.worldToScreen(pos.x, pos.y, camera, viewW, viewH);
    const z = camera.zoom;
    const state = npc.brain.fsm.getCurrentStateId() ?? 'IDLE';
    const badgeColor = STATE_COLORS[state];

    ctx.save();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(screen.x - 2, screen.y - z * 0.65 - 2, z + 4, z * 1.65 + 4);
    }

    // Worker body (slightly taller than 1 cell visually for clear silhouette)
    const bodyW = Math.max(4, z * 0.9);
    const bodyH = Math.max(6, z * 1.35);
    const bodyX = screen.x + (z - bodyW) / 2;
    const bodyY = screen.y + z - bodyH;

    ctx.fillStyle = '#334155';
    ctx.fillRect(bodyX, bodyY + bodyH * 0.35, bodyW, bodyH * 0.65);

    // Helmet / visor
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.42);
    ctx.fillStyle = badgeColor;
    ctx.fillRect(bodyX + bodyW * 0.15, bodyY + bodyH * 0.15, bodyW * 0.7, Math.max(2, bodyH * 0.15));

    // Tiny status indicator dot above NPC
    if (z >= 4) {
      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(screen.x + z * 0.5, bodyY - 5, Math.max(2.2, z * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }

    // Compact label when zoomed in or selected
    if (isSelected || z >= 10) {
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      const label = `${npc.id} · ${state}`;
      const metrics = ctx.measureText(label);
      const pad = 4;
      ctx.fillRect(
        screen.x + z * 0.5 - metrics.width / 2 - pad,
        bodyY - 22,
        metrics.width + pad * 2,
        13
      );
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(label, screen.x + z * 0.5, bodyY - 12);
    }

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: Player,
    camera: CameraState,
    viewW: number,
    viewH: number
  ): void {
    const pos = this.getSmoothedPosition(player.id, player.x, player.y);
    const screen = this.worldToScreen(pos.x, pos.y, camera, viewW, viewH);
    const z = camera.zoom;

    ctx.save();
    if (!player.isAlive) {
      ctx.globalAlpha = 0.35;
    }

    // Subtle warm lantern glow around survivor
    const cx = screen.x + z * 0.5;
    const cy = screen.y + z * 0.35;
    const glow = ctx.createRadialGradient(cx, cy, z * 0.2, cx, cy, z * 4.5);
    glow.addColorStop(0, 'rgba(224, 192, 104, 0.18)');
    glow.addColorStop(1, 'rgba(224, 192, 104, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, z * 4.5, 0, Math.PI * 2);
    ctx.fill();

    const bodyW = Math.max(5, z * 0.95);
    const bodyH = Math.max(7, z * 1.5);
    const bodyX = screen.x + (z - bodyW) / 2;
    const bodyY = screen.y + z - bodyH;

    const hurtFlash = player.damageCooldownTicks > 6;

    // Suit torso
    ctx.fillStyle = hurtFlash ? '#ef4444' : '#d97706';
    ctx.fillRect(bodyX, bodyY + bodyH * 0.36, bodyW, bodyH * 0.64);

    // Helmet
    ctx.fillStyle = hurtFlash ? '#fca5a5' : '#f5d076';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.42);

    // Directional visor
    ctx.fillStyle = '#0f172a';
    const visorW = bodyW * 0.48;
    const visorX = player.facingDir > 0 ? bodyX + bodyW - visorW - 1 : bodyX + 1;
    ctx.fillRect(visorX, bodyY + bodyH * 0.12, visorW, Math.max(2, bodyH * 0.16));

    // Mini overhead health bar when damaged
    if (player.isAlive && player.stats.health < player.stats.maxHealth) {
      const barW = Math.max(18, z * 1.8);
      const barX = cx - barW / 2;
      const barY = bodyY - 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(barX, barY, barW * (player.stats.health / player.stats.maxHealth), 3);
    }

    ctx.restore();
  }

  private drawInteractionCursor(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    camera: CameraState,
    viewW: number,
    viewH: number,
    hoverCell: { x: number; y: number } | null
  ): void {
    if (!hoverCell) return;

    ctx.save();

    if (world.mode === 'survivor') {
      // Faint reach circle around player
      const playerCenter = this.worldToScreen(
        world.player.x + 0.5,
        world.player.y + 0.5,
        camera,
        viewW,
        viewH
      );
      ctx.strokeStyle = 'rgba(224, 192, 104, 0.14)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(playerCenter.x, playerCenter.y, world.player.reachRadius * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const inReach = world.player.isWithinReach(hoverCell.x, hoverCell.y);
      const cellPos = this.worldToScreen(hoverCell.x, hoverCell.y, camera, viewW, viewH);
      ctx.strokeStyle = inReach ? 'rgba(245, 208, 118, 0.9)' : 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cellPos.x + 0.5, cellPos.y + 0.5, camera.zoom - 1, camera.zoom - 1);
    } else {
      // Sandbox brush circle preview
      const center = this.worldToScreen(
        hoverCell.x + 0.5,
        hoverCell.y + 0.5,
        camera,
        viewW,
        viewH
      );
      if (world.activeTool === 'SPAWN_NPC') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          center.x - camera.zoom * 0.5,
          center.y - camera.zoom * 0.5,
          camera.zoom,
          camera.zoom
        );
      } else {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.78)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(0.5, world.brushRadius - 0.15) * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
