/**
 * Hierarchical Decision Tree system for tactical NPC decision making.
 */

export interface ActionResult {
  success: boolean;
  actionId: string;
  data?: unknown;
}

export interface INode<TContext> {
  evaluate(context: TContext): ActionNode<TContext>;
}

export class ActionNode<TContext> implements INode<TContext> {
  constructor(
    public readonly actionId: string,
    public readonly executeHandler?: (context: TContext) => ActionResult
  ) {}

  public evaluate(_context: TContext): ActionNode<TContext> {
    return this;
  }

  public execute(context: TContext): ActionResult {
    if (this.executeHandler) {
      return this.executeHandler(context);
    }
    return { success: true, actionId: this.actionId };
  }
}

export class DecisionNode<TContext> implements INode<TContext> {
  constructor(
    public readonly name: string,
    public readonly condition: (context: TContext) => boolean,
    public readonly trueBranch: INode<TContext>,
    public readonly falseBranch: INode<TContext>
  ) {}

  public evaluate(context: TContext): ActionNode<TContext> {
    const isTrue = this.condition(context);
    const nextBranch = isTrue ? this.trueBranch : this.falseBranch;
    return nextBranch.evaluate(context);
  }
}

export class DecisionTree<TContext> {
  constructor(public root: INode<TContext>) {}

  public decide(context: TContext): ActionNode<TContext> {
    return this.root.evaluate(context);
  }

  public execute(context: TContext): ActionResult {
    const action = this.decide(context);
    return action.execute(context);
  }
}
