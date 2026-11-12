import { describe, expect, it } from 'vitest';
import { budgetInnerPaths, type InnerPath } from './pieces';

const line = (layer: string, n: number, closed = false): InnerPath => ({
  layer,
  closed,
  pts: Array.from({ length: n }, (_, i) => ({ x: i, y: layer.length })),
});

const points = (paths: readonly InnerPath[]) => paths.reduce((s, p) => s + p.pts.length, 0);

describe('budgetInnerPaths', () => {
  it('keeps everything untouched under the budget', () => {
    const paths = [line('8', 10), line('4', 2)];
    expect(budgetInnerPaths(paths, 100)).toEqual(paths);
  });

  it('dense artwork first in the file never pushes out the short structural lines after it', () => {
    // Before: the 5000-point artwork took all 4000 points (cut mid-line, `closed` lost) and the
    // pocket and fold lines after it were gone.
    const artwork = line('8', 5000, true);
    const pocket = line('8', 2);
    const fold = line('7', 3);
    const out = budgetInnerPaths([artwork, pocket, fold], 4000);
    expect(points(out)).toBeLessThanOrEqual(4000);
    expect(out.map((p) => p.layer)).toEqual(['8', '8', '7']);
    expect(out[1]).toEqual(pocket);
    expect(out[2]).toEqual(fold);
    expect(out[0].closed).toBe(true);
    expect(out[0].pts).toHaveLength(4000 - 5);
  });

  it('thins an open line keeping both ends, never truncating it', () => {
    const long = line('8', 9001);
    const [out] = budgetInnerPaths([long], 100);
    expect(out.pts).toHaveLength(100);
    expect(out.pts[0]).toEqual(long.pts[0]);
    expect(out.pts[99]).toEqual(long.pts[9000]);
  });

  it('splits what is left evenly between the paths that do not fit whole', () => {
    const out = budgetInnerPaths([line('a', 3000), line('b', 3000), line('c', 10)], 1010);
    expect(out.map((p) => p.pts.length)).toEqual([500, 500, 10]);
  });

  it('picks the same short lines whatever the size of the dense one', () => {
    const short = [line('7', 2), line('4', 4), line('8', 30)];
    for (const dense of [3990, 6000, 20000]) {
      const out = budgetInnerPaths([line('8', dense), ...short], 4000);
      expect(out.slice(1)).toEqual(short);
    }
  });
});
