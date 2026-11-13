import { describe, it, expect } from 'vitest';
import { DecisionTree, DecisionNode, ActionNode } from '../src/ai/decision-tree.js';

interface TacticalContext {
  targetDistance: number;
  hasLineOfSight: boolean;
}

describe('DecisionTree', () => {
  it('evaluates branching conditions to select the appropriate action', () => {
    // Tree:
    // IsTargetClose (<= 2)
    //   ├── TRUE  -> MELEE_ATTACK
    //   └── FALSE -> HasLineOfSight
    //                  ├── TRUE  -> RANGED_ATTACK
    //                  └── FALSE -> ADVANCE
    const tree = new DecisionTree<TacticalContext>(
      new DecisionNode<TacticalContext>(
        'IsTargetClose',
        (ctx) => ctx.targetDistance <= 2,
        new ActionNode<TacticalContext>('MELEE_ATTACK'),
        new DecisionNode<TacticalContext>(
          'HasLineOfSight',
          (ctx) => ctx.hasLineOfSight,
          new ActionNode<TacticalContext>('RANGED_ATTACK'),
          new ActionNode<TacticalContext>('ADVANCE')
        )
      )
    );

    // Case 1: Close target
    expect(tree.decide({ targetDistance: 1.5, hasLineOfSight: true }).actionId).toBe('MELEE_ATTACK');

    // Case 2: Far target with line of sight
    expect(tree.decide({ targetDistance: 5.0, hasLineOfSight: true }).actionId).toBe('RANGED_ATTACK');

    // Case 3: Far target without line of sight
    expect(tree.decide({ targetDistance: 5.0, hasLineOfSight: false }).actionId).toBe('ADVANCE');
  });

  it('executes action handlers attached to nodes', () => {
    let executed = false;
    const action = new ActionNode<TacticalContext>('ACTION_TEST', () => {
      executed = true;
      return { success: true, actionId: 'ACTION_TEST' };
    });

    const tree = new DecisionTree(action);
    const result = tree.execute({ targetDistance: 0, hasLineOfSight: true });

    expect(result.success).toBe(true);
    expect(executed).toBe(true);
  });
});
