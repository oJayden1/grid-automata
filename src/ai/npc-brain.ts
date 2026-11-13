import { StateMachine, StateId } from './fsm.js';
import { UtilitySelector, evaluateCurve } from './utility.js';
import { DecisionTree, DecisionNode, ActionNode, ActionResult } from './decision-tree.js';
import { GridPathfinder } from './pathfinding.js';
import { ChunkGrid } from '../core/grid.js';
import { ElementId } from '../core/elements.js';
import { Point2D } from '../core/types.js';
import { NPC } from '../entities/npc.js';

export interface BrainPerceptions {
  nearestHazard: Point2D | null;
  hazardDistance: number;
  nearestResource: { pos: Point2D; type: ElementId } | null;
  resourceDistance: number;
  energyRatio: number;
  healthRatio: number;
}

/**
 * Unified NPC Brain combining Utility AI, FSM, and Decision Trees.
 */
export class NPCBrain {
  public readonly fsm: StateMachine<NPC>;
  public readonly utilitySelector: UtilitySelector<NPC>;
  public perceptions: BrainPerceptions = {
    nearestHazard: null,
    hazardDistance: Infinity,
    nearestResource: null,
    resourceDistance: Infinity,
    energyRatio: 1,
    healthRatio: 1,
  };

  private gatherDecisionTree!: DecisionTree<NPC>;
  private wanderDecisionTree!: DecisionTree<NPC>;

  constructor(private readonly npc: NPC) {
    this.fsm = new StateMachine<NPC>(npc);
    this.utilitySelector = new UtilitySelector<NPC>();

    this.setupUtilityTasks();
    this.setupFSMStates();
    this.setupDecisionTrees();
  }

  /**
   * Scans grid neighborhood around the NPC to update sensory perceptions.
   */
  public perceive(grid: ChunkGrid, scanRadius: number = 15): void {
    let closestHazard: Point2D | null = null;
    let minHazardDist = Infinity;

    let closestResource: { pos: Point2D; type: ElementId } | null = null;
    let minResourceDist = Infinity;

    const startX = this.npc.x - scanRadius;
    const endX = this.npc.x + scanRadius;
    const startY = this.npc.y - scanRadius;
    const endY = this.npc.y + scanRadius;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const elem = grid.getCell(x, y);

        // Hazards (Lava)
        if (elem === ElementId.LAVA) {
          const dist = Math.hypot(x - this.npc.x, y - this.npc.y);
          if (dist < minHazardDist) {
            minHazardDist = dist;
            closestHazard = { x, y };
          }
        }

        // Gatherable resources (Sand, Stone, Water)
        if (elem === ElementId.SAND || elem === ElementId.STONE || elem === ElementId.WATER) {
          const dist = Math.hypot(x - this.npc.x, y - this.npc.y);
          if (dist < minResourceDist) {
            minResourceDist = dist;
            closestResource = { pos: { x, y }, type: elem };
          }
        }
      }
    }

    this.perceptions = {
      nearestHazard: closestHazard,
      hazardDistance: minHazardDist,
      nearestResource: closestResource,
      resourceDistance: minResourceDist,
      energyRatio: this.npc.stats.energy / this.npc.stats.maxEnergy,
      healthRatio: this.npc.stats.health / this.npc.stats.maxHealth,
    };
  }

  private setupUtilityTasks(): void {
    // 1. FLEE HAZARD: High priority when lethal lava is close
    this.utilitySelector.registerTask({
      id: 'FLEE',
      weight: 1.8,
      considerations: [
        {
          name: 'HazardDanger',
          evaluate: () => {
            if (this.perceptions.hazardDistance > 10) return 0;
            // Closer to hazard -> quadratically spikes to 1.0
            const normalized = 1 - this.perceptions.hazardDistance / 10;
            return evaluateCurve(normalized, { type: 'quadratic', exponent: 2 });
          },
        },
      ],
    });

    // 2. REST RECOVERY: High priority when stamina/energy is depleted
    this.utilitySelector.registerTask({
      id: 'REST',
      weight: 1.4,
      considerations: [
        {
          name: 'EnergyNeed',
          evaluate: () => {
            const ratio = this.perceptions.energyRatio;
            if (ratio > 0.6) return 0;
            // Exponential urgency when energy drops below 40%
            return evaluateCurve(1 - ratio, { type: 'quadratic', exponent: 2.2 });
          },
        },
      ],
    });

    // 3. GATHER RESOURCE: Work goal when energy is good and resources are known
    this.utilitySelector.registerTask({
      id: 'GATHER',
      weight: 1.0,
      considerations: [
        {
          name: 'ResourceAvailable',
          evaluate: () => (this.perceptions.nearestResource ? 1.0 : 0.0),
        },
        {
          name: 'EnergySufficiency',
          evaluate: () => evaluateCurve(this.perceptions.energyRatio, { type: 'linear', slope: 1.0 }),
        },
        {
          name: 'ResourceProximity',
          evaluate: () => {
            if (!this.perceptions.nearestResource) return 0;
            const dist = this.perceptions.resourceDistance;
            return Math.max(0, 1 - dist / 20);
          },
        },
      ],
    });

    // 4. WANDER: Leisure/patrol exploration when no other urgent tasks exist
    this.utilitySelector.registerTask({
      id: 'WANDER',
      weight: 0.5,
      considerations: [
        {
          name: 'Curiosity',
          evaluate: () => (this.perceptions.energyRatio > 0.3 ? 0.7 : 0.1),
        },
      ],
    });

    // 5. IDLE: Standby baseline
    this.utilitySelector.registerTask({
      id: 'IDLE',
      weight: 0.15,
      considerations: [
        {
          name: 'Baseline',
          evaluate: () => 1.0,
        },
      ],
    });
  }

  private setupFSMStates(): void {
    // IDLE State
    this.fsm.registerState({
      id: 'IDLE',
      onEnter: (npc) => {
        npc.path = [];
      },
      onUpdate: (npc) => {
        const bestTask = this.utilitySelector.selectBestTask(npc);
        if (bestTask && bestTask.id !== 'IDLE') {
          return { targetState: bestTask.id as StateId, reason: 'Utility task selected' };
        }
        return null;
      },
    });

    // REST State
    this.fsm.registerState({
      id: 'REST',
      onEnter: (npc) => {
        npc.path = [];
      },
      onUpdate: (npc) => {
        // Recover energy while resting
        npc.restoreEnergy(6);

        // If fully recovered, switch back to IDLE
        if (npc.stats.energy >= npc.stats.maxEnergy * 0.95) {
          return { targetState: 'IDLE', reason: 'Energy restored' };
        }

        // Interrupt rest if hazard approaches
        if (this.perceptions.hazardDistance < 4) {
          return { targetState: 'FLEE', reason: 'Hazard approached resting area' };
        }

        return null;
      },
    });

    // FLEE State
    this.fsm.registerState({
      id: 'FLEE',
      onUpdate: (npc) => {
        // If hazard is far enough, resume normal operations
        if (this.perceptions.hazardDistance >= 12 || !this.perceptions.nearestHazard) {
          return { targetState: 'IDLE', reason: 'Reached safe distance' };
        }

        // Flee in opposite direction of hazard
        const h = this.perceptions.nearestHazard;
        const fleeDirX = npc.x < h.x ? -1 : 1;
        npc.stepTowards(npc.x + fleeDirX, npc.y);
        npc.consumeEnergy(2);

        return null;
      },
    });

    // GATHER State
    this.fsm.registerState({
      id: 'GATHER',
      onUpdate: (npc) => {
        // Evaluate utility: if energy critical or hazard detected, bail out
        const bestTask = this.utilitySelector.selectBestTask(npc);
        if (bestTask && (bestTask.id === 'FLEE' || bestTask.id === 'REST')) {
          return { targetState: bestTask.id as StateId, reason: `Interrupted by higher priority ${bestTask.id}` };
        }

        if (!this.perceptions.nearestResource) {
          return { targetState: 'IDLE', reason: 'No resources available' };
        }

        // Execute tactical decision tree
        this.gatherDecisionTree.execute(npc);
        return null;
      },
    });

    // WANDER State
    this.fsm.registerState({
      id: 'WANDER',
      onUpdate: (npc) => {
        const bestTask = this.utilitySelector.selectBestTask(npc);
        if (bestTask && bestTask.id !== 'WANDER') {
          return { targetState: bestTask.id as StateId, reason: `Switched to ${bestTask.id}` };
        }

        this.wanderDecisionTree.execute(npc);
        return null;
      },
    });

    // Start in IDLE
    this.fsm.changeState('IDLE');
  }

  private setupDecisionTrees(): void {
    // Tactical Decision Tree for Gathering
    this.gatherDecisionTree = new DecisionTree<NPC>(
      new DecisionNode<NPC>(
        'IsAdjacentToResource',
        (npc) => {
          const res = this.perceptions.nearestResource;
          if (!res) return false;
          const dist = Math.hypot(res.pos.x - npc.x, res.pos.y - npc.y);
          return dist <= 1.5;
        },
        // TRUE: Harvest the resource
        new ActionNode<NPC>('HARVEST', (npc) => {
          const res = this.perceptions.nearestResource;
          if (res) {
            npc.addItem(res.type, 1);
            npc.currentGrid?.setCell(res.pos.x, res.pos.y, ElementId.EMPTY);
            npc.tasksCompleted++;
            npc.consumeEnergy(1);
          }
          return { success: true, actionId: 'HARVEST' };
        }),
        // FALSE: Navigate towards resource
        new DecisionNode<NPC>(
          'HasActivePath',
          (npc) => npc.path.length > 0,
          // TRUE: Follow path
          new ActionNode<NPC>('FOLLOW_PATH', (npc) => {
            npc.followPathStep();
            return { success: true, actionId: 'FOLLOW_PATH' };
          }),
          // FALSE: Plan path
          new ActionNode<NPC>('PLAN_PATH', (npc) => {
            const res = this.perceptions.nearestResource;
            if (res && npc.currentGrid) {
              const path = GridPathfinder.findPath(npc.currentGrid, npc.position, res.pos);
              if (path && path.length > 1) {
                npc.path = path.slice(1); // skip current cell
              }
            }
            return { success: true, actionId: 'PLAN_PATH' };
          })
        )
      )
    );

    // Tactical Decision Tree for Wandering
    this.wanderDecisionTree = new DecisionTree<NPC>(
      new DecisionNode<NPC>(
        'HasWanderPath',
        (npc) => npc.path.length > 0,
        new ActionNode<NPC>('STEP_WANDER', (npc) => {
          npc.followPathStep();
          return { success: true, actionId: 'STEP_WANDER' };
        }),
        new ActionNode<NPC>('PICK_WANDER_TARGET', (npc) => {
          if (!npc.currentGrid) return { success: false, actionId: 'NO_GRID' };
          // Random offset within 5 blocks
          const targetX = npc.x + (Math.random() > 0.5 ? 4 : -4);
          const path = GridPathfinder.findPath(npc.currentGrid, npc.position, { x: targetX, y: npc.y });
          if (path && path.length > 1) {
            npc.path = path.slice(1);
          }
          return { success: true, actionId: 'PICK_WANDER_TARGET' };
        })
      )
    );
  }

  public update(grid: ChunkGrid, tick: number): StateId {
    this.perceive(grid);
    return this.fsm.update(tick);
  }
}
