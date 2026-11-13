import { describe, it, expect } from 'vitest';
import { evaluateCurve, UtilitySelector } from '../src/ai/utility.js';

describe('Utility AI', () => {
  describe('evaluateCurve', () => {
    it('evaluates linear curve correctly', () => {
      expect(evaluateCurve(0.5, { type: 'linear', slope: 1.0 })).toBeCloseTo(0.5);
      expect(evaluateCurve(0.8, { type: 'linear', slope: 0.5 })).toBeCloseTo(0.4);
      expect(evaluateCurve(1.5, { type: 'linear', slope: 1.0 })).toBe(1.0); // clamped
    });

    it('evaluates quadratic curve with progressive acceleration', () => {
      expect(evaluateCurve(0.0, { type: 'quadratic', exponent: 2 })).toBe(0.0);
      expect(evaluateCurve(0.5, { type: 'quadratic', exponent: 2 })).toBe(0.25);
      expect(evaluateCurve(1.0, { type: 'quadratic', exponent: 2 })).toBe(1.0);
    });

    it('evaluates inverse curve', () => {
      expect(evaluateCurve(0.0, { type: 'inverse', exponent: 1 })).toBe(1.0);
      expect(evaluateCurve(0.7, { type: 'inverse', exponent: 1 })).toBeCloseTo(0.3);
      expect(evaluateCurve(1.0, { type: 'inverse', exponent: 1 })).toBe(0.0);
    });

    it('evaluates logistic S-curve', () => {
      const mid = evaluateCurve(0.5, { type: 'logistic', midpoint: 0.5, steepness: 10 });
      expect(mid).toBeCloseTo(0.5);

      const high = evaluateCurve(0.8, { type: 'logistic', midpoint: 0.5, steepness: 10 });
      expect(high).toBeGreaterThan(0.9);
    });
  });

  describe('UtilitySelector', () => {
    interface Context {
      danger: number;
      tiredness: number;
    }

    it('ranks and picks the highest scoring task', () => {
      const selector = new UtilitySelector<Context>();

      selector.registerTask({
        id: 'FLEE',
        weight: 1.5,
        considerations: [{ name: 'danger', evaluate: (ctx) => ctx.danger }],
      });

      selector.registerTask({
        id: 'REST',
        weight: 1.0,
        considerations: [{ name: 'tired', evaluate: (ctx) => ctx.tiredness }],
      });

      // Low danger, high tiredness -> should pick REST
      const best1 = selector.selectBestTask({ danger: 0.1, tiredness: 0.9 });
      expect(best1?.id).toBe('REST');

      // High danger -> should pick FLEE
      const best2 = selector.selectBestTask({ danger: 0.9, tiredness: 0.8 });
      expect(best2?.id).toBe('FLEE');
    });

    it('applies hysteresis commitment to current task', () => {
      const selector = new UtilitySelector<Context>();
      selector.hysteresisMultiplier = 1.3;

      selector.registerTask({
        id: 'TASK_A',
        weight: 1.0,
        considerations: [{ name: 'c', evaluate: () => 0.5 }],
      });

      selector.registerTask({
        id: 'TASK_B',
        weight: 1.0,
        considerations: [{ name: 'c', evaluate: () => 0.52 }], // slightly higher
      });

      // Initially TASK_B wins
      selector.selectBestTask({ danger: 0, tiredness: 0 });
      expect(selector.currentTaskId).toBe('TASK_B');

      // Now TASK_B has 1.3x multiplier (0.52 * 1.3 = 0.676), so even if TASK_A increases to 0.6, B stays active
      selector.registerTask({
        id: 'TASK_A',
        weight: 1.0,
        considerations: [{ name: 'c', evaluate: () => 0.6 }],
      });

      const next = selector.selectBestTask({ danger: 0, tiredness: 0 });
      expect(next?.id).toBe('TASK_B');
    });
  });
});
