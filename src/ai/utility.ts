/**
 * Utility AI system: Response curves, considerations, and multi-objective action selection.
 */

export type ResponseCurveType = 'linear' | 'quadratic' | 'inverse' | 'logistic';

export interface CurveParameters {
  type: ResponseCurveType;
  exponent?: number; // For quadratic/polynomial
  slope?: number;    // For linear
  midpoint?: number; // For logistic (0..1)
  steepness?: number;// For logistic
}

/**
 * Normalizes and shapes a raw input [0..1] into a utility score [0..1].
 */
export function evaluateCurve(value: number, params: CurveParameters): number {
  const x = Math.max(0, Math.min(1, value));

  switch (params.type) {
    case 'linear': {
      const slope = params.slope ?? 1;
      return Math.max(0, Math.min(1, x * slope));
    }
    case 'quadratic': {
      const exp = params.exponent ?? 2;
      return Math.pow(x, exp);
    }
    case 'inverse': {
      const exp = params.exponent ?? 1;
      return Math.pow(1 - x, exp);
    }
    case 'logistic': {
      const k = params.steepness ?? 10;
      const x0 = params.midpoint ?? 0.5;
      return 1 / (1 + Math.exp(-k * (x - x0)));
    }
    default:
      return x;
  }
}

export interface Consideration<TContext> {
  name: string;
  evaluate(context: TContext): number;
}

export interface UtilityTask<TContext> {
  id: string;
  weight: number;
  considerations: Consideration<TContext>[];
}

export interface ScoredTask {
  id: string;
  score: number;
  breakdown: Record<string, number>;
}

export class UtilitySelector<TContext> {
  private readonly tasks: UtilityTask<TContext>[] = [];
  public currentTaskId: string | null = null;
  public hysteresisMultiplier: number = 1.15; // Commitment bonus to prevent thrashing

  public registerTask(task: UtilityTask<TContext>): this {
    this.tasks.push(task);
    return this;
  }

  public evaluateAll(context: TContext): ScoredTask[] {
    const scored: ScoredTask[] = [];

    for (const task of this.tasks) {
      if (task.considerations.length === 0) {
        scored.push({ id: task.id, score: 0, breakdown: {} });
        continue;
      }

      let score = task.weight;
      const breakdown: Record<string, number> = {};

      for (const c of task.considerations) {
        const raw = c.evaluate(context);
        const clamped = Math.max(0, Math.min(1, raw));
        breakdown[c.name] = clamped;
        score *= clamped; // Multiplicative combination (any zero disqualifies)
      }

      // Apply hysteresis momentum if this task is already running
      if (this.currentTaskId === task.id) {
        score *= this.hysteresisMultiplier;
      }

      scored.push({ id: task.id, score, breakdown });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  public selectBestTask(context: TContext): ScoredTask | null {
    const scored = this.evaluateAll(context);
    if (scored.length === 0 || scored[0].score <= 0) {
      return null;
    }
    const best = scored[0];
    this.currentTaskId = best.id;
    return best;
  }
}
