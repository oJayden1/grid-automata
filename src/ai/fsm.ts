/**
 * Finite State Machine (FSM) implementation for game entities.
 */

export type StateId = 'IDLE' | 'WANDER' | 'GATHER' | 'FLEE' | 'REST';

export interface StateTransition {
  targetState: StateId;
  reason?: string;
}

export interface State<TContext> {
  readonly id: StateId;
  onEnter?(context: TContext): void;
  onUpdate(context: TContext, tick: number): StateTransition | null;
  onExit?(context: TContext): void;
}

export class StateMachine<TContext> {
  private readonly states: Map<StateId, State<TContext>> = new Map();
  private currentState: State<TContext> | null = null;
  private previousStateId: StateId | null = null;
  private stateTicks: number = 0;

  constructor(private readonly context: TContext) {}

  public registerState(state: State<TContext>): this {
    this.states.set(state.id, state);
    return this;
  }

  public changeState(targetStateId: StateId, reason?: string): boolean {
    if (this.currentState?.id === targetStateId) {
      return false;
    }

    const nextState = this.states.get(targetStateId);
    if (!nextState) {
      throw new Error(`State ${targetStateId} is not registered in StateMachine.`);
    }

    if (this.currentState) {
      this.currentState.onExit?.(this.context);
      this.previousStateId = this.currentState.id;
    }

    this.currentState = nextState;
    this.stateTicks = 0;
    this.currentState.onEnter?.(this.context);
    return true;
  }

  public update(tick: number): StateId {
    if (!this.currentState) {
      throw new Error('StateMachine updated without an active state.');
    }

    this.stateTicks++;
    const transition = this.currentState.onUpdate(this.context, tick);

    if (transition && transition.targetState !== this.currentState.id) {
      this.changeState(transition.targetState, transition.reason);
    }

    return this.currentState.id;
  }

  public getCurrentStateId(): StateId | null {
    return this.currentState?.id ?? null;
  }

  public getPreviousStateId(): StateId | null {
    return this.previousStateId;
  }

  public getStateTicks(): number {
    return this.stateTicks;
  }
}
