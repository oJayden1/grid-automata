import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine, State } from '../src/ai/fsm.js';

interface TestContext {
  energy: number;
  visitedStates: string[];
}

describe('StateMachine', () => {
  let context: TestContext;
  let fsm: StateMachine<TestContext>;

  beforeEach(() => {
    context = { energy: 100, visitedStates: [] };
    fsm = new StateMachine(context);

    const idleState: State<TestContext> = {
      id: 'IDLE',
      onEnter: (ctx) => ctx.visitedStates.push('ENTER_IDLE'),
      onUpdate: (ctx) => {
        if (ctx.energy < 30) {
          return { targetState: 'REST', reason: 'Low energy' };
        }
        return null;
      },
      onExit: (ctx) => ctx.visitedStates.push('EXIT_IDLE'),
    };

    const restState: State<TestContext> = {
      id: 'REST',
      onEnter: (ctx) => ctx.visitedStates.push('ENTER_REST'),
      onUpdate: (ctx) => {
        ctx.energy += 20;
        if (ctx.energy >= 90) {
          return { targetState: 'IDLE', reason: 'Energy restored' };
        }
        return null;
      },
      onExit: (ctx) => ctx.visitedStates.push('EXIT_REST'),
    };

    fsm.registerState(idleState);
    fsm.registerState(restState);
    fsm.changeState('IDLE');
  });

  it('starts in initial state with onEnter called', () => {
    expect(fsm.getCurrentStateId()).toBe('IDLE');
    expect(context.visitedStates).toEqual(['ENTER_IDLE']);
  });

  it('transitions state when condition triggers in onUpdate', () => {
    context.energy = 20;
    fsm.update(1);

    expect(fsm.getCurrentStateId()).toBe('REST');
    expect(fsm.getPreviousStateId()).toBe('IDLE');
    expect(context.visitedStates).toEqual(['ENTER_IDLE', 'EXIT_IDLE', 'ENTER_REST']);
  });

  it('tracks state duration in ticks', () => {
    expect(fsm.getStateTicks()).toBe(0);
    fsm.update(1);
    expect(fsm.getStateTicks()).toBe(1);
    fsm.update(2);
    expect(fsm.getStateTicks()).toBe(2);
  });
});
