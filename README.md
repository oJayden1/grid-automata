# 2D Chunk-Based Grid & Cellular Automata Engine

A high-performance, modular 2D chunk-based grid and cellular automata simulation engine implemented in TypeScript. Features falling-sand physics, low-viscosity water dispersion, high-viscosity lava flow, phase-change reactions (quenching and steam generation), dynamic spatial chunking, and sleeping chunk optimizations.

## Features

- **2D Spatial Chunk Partitioning:**
  - Dynamic chunk allocation on demand (configurable chunk sizes, default `32x32` cells).
  - Open 2D coordinate system supporting arbitrary positive, zero, and negative world coordinates.
  - Typed array backing (`Uint8Array`, `Uint32Array`, `Uint16Array`) for maximum memory locality and cache efficiency.
  - Fast chunk pointer caching to eliminate map lookup overhead during sequential passes.

- **Active Chunk & Sleeping Optimization:**
  - Chunks automatically track particle movement and dirty bounding boxes.
  - Inactive chunks without dynamic particles enter low-cost sleep state after a configurable tick threshold.
  - Boundary-crossing particles automatically wake neighboring chunks (cardinal and diagonal).

- **Physics & Cellular Automata Rules:**
  - **Sand (Powder):**
    - Gravity: Falls straight down through air.
    - Cascading: Slides down-left or down-right to form natural mounds (angle of repose) with alternating scan directions to prevent directional skew.
    - Buoyancy / Sedimentation: Denser than liquids (`density = 10`), sinking through water (`density = 2`) and lava (`density = 6`).
  - **Water (Liquid):**
    - High fluidity: Falls downward and rapidly disperses horizontally (dispersion rate up to 4 cells per tick) to equalize water levels across containers.
  - **Lava (Viscous Liquid):**
    - High viscosity: Oozes downward and sideways at a regulated flow rate with lower horizontal dispersion.
  - **Reactions & Phase Changes:**
    - **Volcanic Quenching:** Contact between Water and Lava vaporizes Water into rising Steam and cools Lava into Stone (or Obsidian under pressure).
    - **Steam (Gas):** Rises upward against gravity, drifts sideways, and dissipates after a configurable lifetime.

- **Double-Buffering & Bottom-to-Top Updates:**
  - Bottom-to-top scan order (`y` from maxY to minY) eliminates multi-cell teleportation artifacts.
  - Per-cell update tags ensure particles are never stepped multiple times in a single tick.

## Architecture

```
grid-automata/
├── src/
│   ├── index.ts               # Public library entrypoint
│   ├── core/
│   │   ├── types.ts           # Types, configs, telemetry stats
│   │   ├── elements.ts        # Element definitions, densities, and categories
│   │   ├── chunk.ts           # Chunk typed arrays, dirty bounds, sleep states
│   │   ├── grid.ts            # Spatial grid, coordinate hashing, wakeups
│   │   └── simulator.ts       # Simulation loop, scan order, step orchestration
│   ├── rules/
│   │   ├── sand.ts            # Powder falling and diagonal displacement
│   │   ├── water.ts           # Liquid gravity and lateral dispersion
│   │   ├── lava.ts            # Viscous fluid dynamics and oozing
│   │   └── reactions.ts       # Thermal quench and gas rising/dissipation
│   └── benchmark/
│       └── headless-verify.ts # Headless performance and stability benchmark
└── tests/
    ├── chunk.test.ts          # Chunk unit tests
    ├── grid.test.ts           # Grid coordinate and boundary tests
    ├── sand.test.ts           # Sand gravity and fluid displacement tests
    ├── water.test.ts          # Water leveling and barrier tests
    ├── lava.test.ts           # Lava viscosity tests
    ├── reactions.test.ts      # Water + Lava quench and steam tests
    └── performance.test.ts    # Sleep optimization and latency tests
```

## Getting Started

### Installation

```bash
npm install
```

### Running Unit Tests

Run the full Vitest suite (30 comprehensive unit tests):

```bash
npm test
```

### Running Headless Verification & Stability Benchmarks

Execute the automated headless verification suite directly in bash:

```bash
npm run verify
```

### Building Distribution Assets

```bash
npm run build
```

## Headless Benchmark Performance

Benchmarked across 64 chunks (256x256 world) under 10,000+ simultaneously interacting particles:

| Metric | Result | Target / Standard |
|---|---|---|
| **Mean Tick Duration** | `1.441 ms` | `< 16.6 ms` (60 FPS budget) |
| **Median Tick Duration** | `1.544 ms` | `< 16.6 ms` |
| **P95 Latency** | `2.327 ms` | `< 30.0 ms` |
| **P99 Latency** | `3.914 ms` | `< 50.0 ms` |
| **Throughput** | `694.0 TPS` | `> 60 TPS` (~11.5x real-time margin) |
| **Timing Jitter (StdDev)** | `0.665 ms` | Low variance / jitter-free |
| **Memory Growth (Delta)** | `1.74 MB` | Garbage collection stable |

## License

MIT
