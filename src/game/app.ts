import { ElementId, ELEMENT_DEFS } from '../core/elements.js';
import { GameWorld } from './game-world.js';
import { CameraState, CanvasRenderer } from './renderer.js';
import { deserializeWorld, serializeWorld } from './storage.js';
import { SandboxTool, WorldPreset } from './types.js';

const STORAGE_KEY = 'grid-automata-save-v1';

interface HotbarSlot {
  tool: SandboxTool;
  label: string;
  color: string;
}

const SURVIVOR_SLOTS: Array<{ element: ElementId; label: string; color: string }> = [
  { element: ElementId.SAND, label: 'Sand', color: '#e0c068' },
  { element: ElementId.STONE, label: 'Stone', color: '#888f9b' },
  { element: ElementId.OBSIDIAN, label: 'Obsidian', color: '#3b3347' },
  { element: ElementId.WATER, label: 'Water', color: '#3070e0' },
];

const SANDBOX_SLOTS: HotbarSlot[] = [
  { tool: ElementId.SAND, label: 'Sand', color: '#e0c068' },
  { tool: ElementId.WATER, label: 'Water', color: '#3070e0' },
  { tool: ElementId.LAVA, label: 'Lava', color: '#ff5200' },
  { tool: ElementId.STONE, label: 'Stone', color: '#888f9b' },
  { tool: ElementId.OBSIDIAN, label: 'Obsidian', color: '#3b3347' },
  { tool: ElementId.STEAM, label: 'Steam', color: '#d8e2ee' },
  { tool: ElementId.SOLID, label: 'Bedrock', color: '#474d57' },
  { tool: ElementId.EMPTY, label: 'Erase', color: '#141922' },
  { tool: 'SPAWN_NPC', label: 'Spawn NPC', color: '#38bdf8' },
];

export class GameApp {
  private world: GameWorld;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: CanvasRenderer;
  private readonly camera: CameraState;

  private isPaused = false;
  private speedMultiplier = 1; // 0.5, 1, 2
  private readonly baseTps = 24;
  private accumulatorMs = 0;
  private lastFrameTime = 0;
  private measuredTps = 0;
  private tpsTicks = 0;
  private tpsTimerMs = 0;

  private showChunkGrid = false;
  private showAiOverlay = false;
  private selectedNpcId: string | null = null;
  private cameraFollowPlayer = true;

  private hoverCell: { x: number; y: number } | null = null;
  private activePointerButton: number | null = null;
  private isPanning = false;
  private panLastClient: { x: number; y: number } | null = null;
  private heldKeys = new Set<string>();

  private toastTimeout: number | null = null;

  // DOM references
  private readonly hpValue = document.getElementById('hp-value')!;
  private readonly hpFill = document.getElementById('hp-fill')!;
  private readonly energyValue = document.getElementById('energy-value')!;
  private readonly energyFill = document.getElementById('energy-fill')!;
  private readonly statTick = document.getElementById('stat-tick')!;
  private readonly statChunks = document.getElementById('stat-chunks')!;
  private readonly statNpcs = document.getElementById('stat-npcs')!;
  private readonly statTps = document.getElementById('stat-tps')!;

  private readonly btnModeSurvivor = document.getElementById('mode-survivor')!;
  private readonly btnModeSandbox = document.getElementById('mode-sandbox')!;
  private readonly btnPause = document.getElementById('btn-pause')!;
  private readonly btnStep = document.getElementById('btn-step')!;
  private readonly btnSpeed = document.getElementById('btn-speed')!;
  private readonly btnChunks = document.getElementById('btn-chunks')!;
  private readonly btnAi = document.getElementById('btn-ai')!;
  private readonly btnCenter = document.getElementById('btn-center')!;
  private readonly btnSave = document.getElementById('btn-save')!;
  private readonly btnLoad = document.getElementById('btn-load')!;
  private readonly btnNewWorld = document.getElementById('btn-new-world')!;
  private readonly presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
  private readonly btnHelp = document.getElementById('btn-help')!;
  private readonly btnCloseHelp = document.getElementById('btn-close-help')!;
  private readonly helpModal = document.getElementById('help-modal')!;
  private readonly deathModal = document.getElementById('death-modal')!;
  private readonly btnRespawn = document.getElementById('btn-respawn')!;
  private readonly btnSwitchSandbox = document.getElementById('btn-switch-sandbox')!;

  private readonly hotbar = document.getElementById('hotbar')!;
  private readonly hintStrip = document.getElementById('hint-strip')!;
  private readonly inspectorPanel = document.getElementById('inspector-panel')!;
  private readonly npcListEl = document.getElementById('npc-list')!;
  private readonly npcDetailEl = document.getElementById('npc-detail')!;
  private readonly btnSpawnNpc = document.getElementById('btn-spawn-npc')!;
  private readonly toastEl = document.getElementById('toast')!;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Missing #game-canvas element.');
    }
    this.canvas = canvas;
    this.world = new GameWorld({ preset: 'caverns' });
    this.renderer = new CanvasRenderer(this.canvas);
    this.camera = {
      x: this.world.player.x,
      y: this.world.player.y,
      zoom: 8,
    };

    this.bindEvents();
    this.rebuildHotbar();
    this.updateHud();
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private bindEvents(): void {
    this.btnModeSurvivor.addEventListener('click', () => this.setMode('survivor'));
    this.btnModeSandbox.addEventListener('click', () => this.setMode('sandbox'));

    this.btnPause.addEventListener('click', () => this.togglePause());
    this.btnStep.addEventListener('click', () => this.singleStep());
    this.btnSpeed.addEventListener('click', () => this.cycleSpeed());
    this.btnChunks.addEventListener('click', () => this.toggleChunks());
    this.btnAi.addEventListener('click', () => this.toggleAiOverlay());
    this.btnCenter.addEventListener('click', () => this.centerOnPlayer());

    this.btnSave.addEventListener('click', () => this.saveToStorage());
    this.btnLoad.addEventListener('click', () => this.loadFromStorage());
    this.btnNewWorld.addEventListener('click', () => {
      const preset = this.presetSelect.value as WorldPreset;
      this.world.regenerate({ preset });
      this.selectedNpcId = null;
      this.renderer.resetInterpolation();
      this.centerOnPlayer();
      this.rebuildHotbar();
      this.showToast(`Generated ${preset} world (seed ${this.world.seed})`);
    });

    this.btnSpawnNpc.addEventListener('click', () => {
      const npc = this.world.spawnNPC(this.world.player.x + 2, this.world.player.y - 1);
      if (npc) {
        this.selectedNpcId = npc.id;
        this.showToast(`Spawned ${npc.id}`);
      }
    });

    this.btnHelp.addEventListener('click', () => this.helpModal.classList.remove('hidden'));
    this.btnCloseHelp.addEventListener('click', () => this.helpModal.classList.add('hidden'));
    this.helpModal.addEventListener('click', (e) => {
      if (e.target === this.helpModal) this.helpModal.classList.add('hidden');
    });

    this.btnRespawn.addEventListener('click', () => this.respawnPlayer());
    this.btnSwitchSandbox.addEventListener('click', () => {
      this.deathModal.classList.add('hidden');
      this.setMode('sandbox');
    });

    // Pointer / Canvas events
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Keyboard events
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => {
      this.heldKeys.clear();
      this.syncPlayerInputs();
    });
  }

  private setMode(mode: 'survivor' | 'sandbox'): void {
    this.world.mode = mode;
    this.btnModeSurvivor.classList.toggle('active', mode === 'survivor');
    this.btnModeSandbox.classList.toggle('active', mode === 'sandbox');
    if (mode === 'survivor') {
      this.cameraFollowPlayer = true;
    }
    this.rebuildHotbar();
    this.updateHintStrip();
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    this.btnPause.textContent = this.isPaused ? 'Resume' : 'Pause';
    this.btnPause.classList.toggle('toggle-on', this.isPaused);
  }

  private singleStep(): void {
    if (!this.isPaused) this.togglePause();
    this.world.step();
    this.updateHud();
  }

  private cycleSpeed(): void {
    const order = [0.5, 1, 2];
    const idx = order.indexOf(this.speedMultiplier);
    this.speedMultiplier = order[(idx + 1) % order.length];
    this.btnSpeed.textContent = `${this.speedMultiplier}x`;
  }

  private toggleChunks(): void {
    this.showChunkGrid = !this.showChunkGrid;
    this.btnChunks.classList.toggle('toggle-on', this.showChunkGrid);
  }

  private toggleAiOverlay(): void {
    this.showAiOverlay = !this.showAiOverlay;
    this.btnAi.classList.toggle('toggle-on', this.showAiOverlay);
    this.inspectorPanel.classList.toggle('hidden', !this.showAiOverlay);
    if (this.showAiOverlay && !this.selectedNpcId) {
      const npcs = this.world.getNPCs();
      if (npcs.length > 0) this.selectedNpcId = npcs[0].id;
    }
    this.updateInspector();
  }

  private centerOnPlayer(): void {
    this.cameraFollowPlayer = true;
    this.camera.x = this.world.player.x;
    this.camera.y = this.world.player.y;
  }

  private respawnPlayer(): void {
    this.world.player.respawn();
    this.deathModal.classList.add('hidden');
    this.centerOnPlayer();
    this.showToast('Respawned at camp');
  }

  private saveToStorage(): void {
    try {
      const payload = serializeWorld(this.world);
      localStorage.setItem(STORAGE_KEY, payload);
      this.showToast(`World saved (${Math.round(payload.length / 1024)} KB)`);
    } catch {
      this.showToast('Failed to save world');
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.showToast('No saved world found');
        return;
      }
      this.world = deserializeWorld(raw);
      this.presetSelect.value = this.world.preset;
      this.setMode(this.world.mode);
      this.renderer.resetInterpolation();
      this.centerOnPlayer();
      this.showToast(`Loaded world (tick ${this.world.simulator.currentTick})`);
    } catch {
      this.showToast('Failed to load saved world');
    }
  }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2200);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      this.cameraFollowPlayer = false;
      this.panLastClient = { x: e.clientX, y: e.clientY };
      return;
    }

    const cell = this.renderer.screenToWorld(e.clientX, e.clientY, this.camera);
    this.hoverCell = cell;

    // If AI overlay is open and clicking near an NPC in Sandbox/inspect, select it
    if (e.button === 0 && this.showAiOverlay) {
      const clickedNpc = this.world.findNearestNPC(cell.x, cell.y, 1.8);
      if (clickedNpc) {
        this.selectedNpcId = clickedNpc.id;
        this.updateInspector();
        return;
      }
    }

    this.activePointerButton = e.button;
    this.applyPointerAction(cell.x, cell.y, e.button, true);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.isPanning && this.panLastClient) {
      const dx = (e.clientX - this.panLastClient.x) / this.camera.zoom;
      const dy = (e.clientY - this.panLastClient.y) / this.camera.zoom;
      this.camera.x -= dx;
      this.camera.y -= dy;
      this.panLastClient = { x: e.clientX, y: e.clientY };
      return;
    }

    const cell = this.renderer.screenToWorld(e.clientX, e.clientY, this.camera);
    this.hoverCell = cell;

    if (this.activePointerButton !== null) {
      this.applyPointerAction(cell.x, cell.y, this.activePointerButton, false);
    }
  }

  private onPointerUp(): void {
    this.activePointerButton = null;
    this.isPanning = false;
    this.panLastClient = null;
  }

  private applyPointerAction(
    wx: number,
    wy: number,
    button: number,
    isInitialClick: boolean
  ): void {
    if (this.world.mode === 'survivor') {
      if (button === 0) {
        const mined = this.world.mineAt(wx, wy);
        if (mined !== null) {
          this.rebuildHotbar();
        }
      } else if (button === 2) {
        if (this.world.placeAt(wx, wy, this.world.selectedPlaceElement)) {
          this.rebuildHotbar();
        }
      }
      return;
    }

    // Sandbox mode
    if (button === 2) {
      this.world.paintBrush(wx, wy, ElementId.EMPTY);
      return;
    }

    if (button === 0) {
      if (this.world.activeTool === 'SPAWN_NPC') {
        if (isInitialClick) {
          const npc = this.world.spawnNPC(wx, wy);
          if (npc) {
            this.selectedNpcId = npc.id;
            this.showToast(`Spawned ${npc.id}`);
          }
        }
      } else {
        this.world.paintBrush(wx, wy, this.world.activeTool);
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.camera.zoom = Math.max(3, Math.min(20, this.camera.zoom * factor));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) {
      return;
    }

    const key = e.key.toLowerCase();
    this.heldKeys.add(key);

    if (key === 'tab') {
      e.preventDefault();
      this.setMode(this.world.mode === 'survivor' ? 'sandbox' : 'survivor');
      return;
    }
    if (key === 'p') {
      this.togglePause();
      return;
    }
    if (key === '.') {
      this.singleStep();
      return;
    }
    if (key === 'g') {
      this.toggleChunks();
      return;
    }
    if (key === 'i') {
      this.toggleAiOverlay();
      return;
    }
    if (key === 'c') {
      this.centerOnPlayer();
      return;
    }
    if (key === 'h' || key === '?') {
      this.helpModal.classList.toggle('hidden');
      return;
    }
    if (key === 'escape') {
      this.helpModal.classList.add('hidden');
      return;
    }
    if (key === 'r' && !this.world.player.isAlive) {
      this.respawnPlayer();
      return;
    }
    if (key === '[') {
      this.world.brushRadius = Math.max(1, this.world.brushRadius - 1);
      this.rebuildHotbar();
      return;
    }
    if (key === ']') {
      this.world.brushRadius = Math.min(8, this.world.brushRadius + 1);
      this.rebuildHotbar();
      return;
    }

    // Number keys 1..9 select hotbar slot
    if (key >= '1' && key <= '9') {
      const idx = parseInt(key, 10) - 1;
      if (this.world.mode === 'survivor') {
        if (idx < SURVIVOR_SLOTS.length) {
          this.world.selectedPlaceElement = SURVIVOR_SLOTS[idx].element;
          this.rebuildHotbar();
        }
      } else {
        if (idx < SANDBOX_SLOTS.length) {
          this.world.activeTool = SANDBOX_SLOTS[idx].tool;
          this.rebuildHotbar();
        }
      }
      return;
    }

    if (key === ' ' || key.startsWith('arrow')) {
      e.preventDefault();
    }

    this.syncPlayerInputs();
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.key.toLowerCase());
    this.syncPlayerInputs();
  }

  private syncPlayerInputs(): void {
    if (this.world.mode === 'survivor') {
      this.world.player.input.left = this.heldKeys.has('a') || this.heldKeys.has('arrowleft');
      this.world.player.input.right = this.heldKeys.has('d') || this.heldKeys.has('arrowright');
      this.world.player.input.jump =
        this.heldKeys.has('w') || this.heldKeys.has('arrowup') || this.heldKeys.has(' ');
      this.world.player.input.down = this.heldKeys.has('s') || this.heldKeys.has('arrowdown');
    } else {
      this.world.player.input.left = false;
      this.world.player.input.right = false;
      this.world.player.input.jump = false;
      this.world.player.input.down = false;
    }
  }

  private rebuildHotbar(): void {
    this.hotbar.innerHTML = '';

    if (this.world.mode === 'survivor') {
      SURVIVOR_SLOTS.forEach((slot, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `slot-btn${this.world.selectedPlaceElement === slot.element ? ' selected' : ''}`;
        const count = this.world.player.countItem(slot.element);
        btn.innerHTML = `
          <span class="slot-key">${i + 1}</span>
          <span class="swatch" style="background:${slot.color}"></span>
          <span>${slot.label}</span>
          <span class="slot-count">${count}</span>
        `;
        btn.addEventListener('click', () => {
          this.world.selectedPlaceElement = slot.element;
          this.rebuildHotbar();
        });
        this.hotbar.appendChild(btn);
      });
    } else {
      SANDBOX_SLOTS.forEach((slot, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `slot-btn${this.world.activeTool === slot.tool ? ' selected' : ''}`;
        btn.innerHTML = `
          <span class="slot-key">${i + 1}</span>
          <span class="swatch" style="background:${slot.color}"></span>
          <span>${slot.label}</span>
        `;
        btn.addEventListener('click', () => {
          this.world.activeTool = slot.tool;
          this.rebuildHotbar();
        });
        this.hotbar.appendChild(btn);
      });

      const brushWrap = document.createElement('div');
      brushWrap.className = 'brush-control';
      brushWrap.innerHTML = `
        <span>Size <strong id="brush-size-val">${this.world.brushRadius}</strong></span>
        <input id="brush-range" type="range" min="1" max="8" value="${this.world.brushRadius}" />
      `;
      const rangeInput = brushWrap.querySelector('#brush-range') as HTMLInputElement;
      const sizeVal = brushWrap.querySelector('#brush-size-val')!;
      rangeInput.addEventListener('input', () => {
        this.world.brushRadius = parseInt(rangeInput.value, 10);
        sizeVal.textContent = String(this.world.brushRadius);
      });
      this.hotbar.appendChild(brushWrap);
    }

    this.updateHintStrip();
  }

  private updateHintStrip(): void {
    if (this.world.mode === 'survivor') {
      const selectedName = ELEMENT_DEFS[this.world.selectedPlaceElement]?.name ?? 'Block';
      this.hintStrip.textContent =
        `WASD / Space Move & Jump · Left-Click Mine · Right-Click Place ${selectedName} · Tab Sandbox`;
    } else {
      const toolLabel =
        this.world.activeTool === 'SPAWN_NPC'
          ? 'Spawn NPC'
          : ELEMENT_DEFS[this.world.activeTool]?.name ?? 'Tool';
      this.hintStrip.textContent =
        `Left-Click ${toolLabel} · Right-Click Erase · WASD Pan Camera · [ ] Brush Size · Tab Survivor`;
    }
  }

  private updateHud(): void {
    const p = this.world.player;
    this.hpValue.textContent = `${Math.round(p.stats.health)}/${p.stats.maxHealth}`;
    this.hpFill.style.width = `${Math.max(0, (p.stats.health / p.stats.maxHealth) * 100)}%`;
    this.energyValue.textContent = `${Math.round(p.stats.energy)}/${p.stats.maxEnergy}`;
    this.energyFill.style.width = `${Math.max(0, (p.stats.energy / p.stats.maxEnergy) * 100)}%`;

    const stats = this.world.lastTickStats;
    this.statTick.textContent = String(this.world.simulator.currentTick);
    this.statChunks.textContent = stats
      ? `${stats.activeChunks}/${stats.totalChunks}`
      : `0/${this.world.simulator.grid.getChunkCount()}`;
    this.statNpcs.textContent = String(this.world.getNPCs().filter((n) => n.isAlive).length);
    this.statTps.textContent = String(this.measuredTps);

    if (!p.isAlive && this.world.mode === 'survivor') {
      this.deathModal.classList.remove('hidden');
    } else {
      this.deathModal.classList.add('hidden');
    }

    if (this.showAiOverlay) {
      this.updateInspector();
    }
  }

  private updateInspector(): void {
    const snapshots = this.world.getNpcSnapshots();
    this.npcListEl.innerHTML = '';

    for (const snap of snapshots) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `npc-row${snap.id === this.selectedNpcId ? ' selected' : ''}`;
      btn.innerHTML = `
        <span>${snap.id}</span>
        <span class="state-tag">${snap.state ?? 'IDLE'}</span>
      `;
      btn.addEventListener('click', () => {
        this.selectedNpcId = snap.id;
        this.updateInspector();
      });
      this.npcListEl.appendChild(btn);
    }

    const selected = snapshots.find((s) => s.id === this.selectedNpcId) ?? snapshots[0];
    if (!selected) {
      this.npcDetailEl.innerHTML = '<span>No NPCs</span><span>Click + Spawn NPC</span>';
      return;
    }
    this.selectedNpcId = selected.id;

    const invSummary = Object.entries(selected.inventory)
      .map(([id, cnt]) => `${ELEMENT_DEFS[Number(id) as ElementId]?.name ?? id}:${cnt}`)
      .join(' ') || 'Empty';

    this.npcDetailEl.innerHTML = `
      <span>Position</span><span>(${selected.x}, ${selected.y})</span>
      <span>FSM State</span><span>${selected.state ?? 'IDLE'}</span>
      <span>Utility Task</span><span>${selected.task}</span>
      <span>Health</span><span>${Math.round(selected.health)}/${selected.maxHealth}</span>
      <span>Energy</span><span>${Math.round(selected.energy)}/${selected.maxEnergy}</span>
      <span>Harvested</span><span>${selected.tasksCompleted}</span>
      <span>Waypoints</span><span>${selected.pathLength}</span>
      <span>Inventory</span><span>${invSummary}</span>
    `;
  }

  private loop(now: number): void {
    const dtMs = Math.min(100, Math.max(0, now - this.lastFrameTime));
    this.lastFrameTime = now;

    // Sandbox camera panning with WASD / Arrows
    if (this.world.mode === 'sandbox') {
      const panSpeed = (32 / this.camera.zoom) * (dtMs / 100);
      if (this.heldKeys.has('a') || this.heldKeys.has('arrowleft')) {
        this.cameraFollowPlayer = false;
        this.camera.x -= panSpeed;
      }
      if (this.heldKeys.has('d') || this.heldKeys.has('arrowright')) {
        this.cameraFollowPlayer = false;
        this.camera.x += panSpeed;
      }
      if (this.heldKeys.has('w') || this.heldKeys.has('arrowup')) {
        this.cameraFollowPlayer = false;
        this.camera.y -= panSpeed;
      }
      if (this.heldKeys.has('s') || this.heldKeys.has('arrowdown')) {
        this.cameraFollowPlayer = false;
        this.camera.y += panSpeed;
      }
    }

    // Fixed-timestep simulation ticks
    if (!this.isPaused) {
      const stepIntervalMs = 1000 / (this.baseTps * this.speedMultiplier);
      this.accumulatorMs += dtMs;
      let stepsThisFrame = 0;
      while (this.accumulatorMs >= stepIntervalMs && stepsThisFrame < 4) {
        this.world.step();
        this.accumulatorMs -= stepIntervalMs;
        stepsThisFrame++;
        this.tpsTicks++;
      }
    }

    this.tpsTimerMs += dtMs;
    if (this.tpsTimerMs >= 500) {
      this.measuredTps = Math.round((this.tpsTicks * 1000) / this.tpsTimerMs);
      this.tpsTicks = 0;
      this.tpsTimerMs = 0;
      this.updateHud();
    } else if (!this.isPaused) {
      // Keep vitals & tick counter responsive
      const stats = this.world.lastTickStats;
      this.statTick.textContent = String(this.world.simulator.currentTick);
      this.statChunks.textContent = stats
        ? `${stats.activeChunks}/${stats.totalChunks}`
        : `0/${this.world.simulator.grid.getChunkCount()}`;
      this.statNpcs.textContent = String(this.world.getNPCs().filter((n) => n.isAlive).length);
      this.hpValue.textContent = `${Math.round(this.world.player.stats.health)}/${this.world.player.stats.maxHealth}`;
      this.hpFill.style.width = `${Math.max(0, (this.world.player.stats.health / this.world.player.stats.maxHealth) * 100)}%`;
      this.energyValue.textContent = `${Math.round(this.world.player.stats.energy)}/${this.world.player.stats.maxEnergy}`;
      this.energyFill.style.width = `${Math.max(0, (this.world.player.stats.energy / this.world.player.stats.maxEnergy) * 100)}%`;
      if (!this.world.player.isAlive && this.world.mode === 'survivor') {
        this.deathModal.classList.remove('hidden');
      }
    }

    // Smooth camera follow in Survivor mode
    if (this.cameraFollowPlayer) {
      this.camera.x += (this.world.player.x - this.camera.x) * 0.14;
      this.camera.y += (this.world.player.y - this.camera.y) * 0.14;
    }

    this.renderer.render(this.world, this.camera, {
      showChunkGrid: this.showChunkGrid,
      showAiOverlay: this.showAiOverlay,
      selectedNpcId: this.selectedNpcId,
      hoverCell: this.hoverCell,
    });

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
