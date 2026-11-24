import { describe, expect, it } from 'vitest';

import { gradeOrderRun } from './continuity-order';

// Nested squares graded 10 mm a side per size: a size on its own ring is in order; a size walked
// along a ring 3 steps away (Taos G 0 on ring 16) is not; tied lines carry no order.
const sq = (half: number) => [
  { x: -half, y: -half },
  { x: half, y: -half },
  { x: half, y: half },
  { x: -half, y: half },
];
const ring = (rank: number, half = 100 + 10 * rank) => ({ rank, outer: sq(half) });

describe('gradeOrderRun', () => {
  const family = [0, 1, 2, 3, 4, 5].map((r) => ring(r));

  it('passes a size between its neighbours', () => {
    expect(gradeOrderRun(ring(2), family)).toBeNull();
  });

  it('flags a middle size on a ring three steps away', () => {
    const run = gradeOrderRun(ring(2, 150), family);
    expect(run?.vs).toEqual([1, 3]);
    expect(run!.mm).toBeGreaterThanOrEqual(300); // at least one side (corners grade diagonally)
  });

  it('flags an end size past its neighbour, skipping a tied pair', () => {
    // ranks 1 and 2 drawn on one line: the end size 0 looks one rank further for the order
    const tied = [ring(1, 110), ring(2, 110), ring(3, 130), ring(4, 140)];
    expect(gradeOrderRun(ring(0, 100), tied)).toBeNull();
    expect(gradeOrderRun(ring(0, 125), tied)).not.toBeNull();
  });

  it('skips lines that converge (no order to read)', () => {
    const same = [0, 1, 2, 3].map((r) => ring(r, 100));
    expect(gradeOrderRun(ring(1, 101), same)).toBeNull();
  });

  it('measures the run in mm of arc, not in samples', () => {
    // a correct size with a 16 × 26 mm bump, drawn sparse and dense: ~28 mm out of band either way
    const bump = (step: number) => {
      const pts = [{ x: -120, y: -120 }];
      for (let x = -8; x <= 8; x += step) pts.push({ x, y: -120 - 26 * (1 - Math.abs(x) / 8) });
      pts.push({ x: 120, y: -120 }, { x: 120, y: 120 }, { x: -120, y: 120 });
      return { rank: 2, outer: pts };
    };
    expect(gradeOrderRun(bump(8), family)).toBeNull();
    expect(gradeOrderRun(bump(0.1), family)).toBeNull();
  });

  it('does not trust a neighbour pair out of grade order', () => {
    // size 1 closed on size 4's line: the correct size 2 must not be refused against it
    const bad = [ring(0), ring(1, 140), ring(3), ring(4)];
    expect(gradeOrderRun(ring(2), bad)).toBeNull();
  });

  it('needs two neighbours', () => {
    expect(gradeOrderRun(ring(0, 150), [ring(1)])).toBeNull();
  });
});
