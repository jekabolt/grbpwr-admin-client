import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { outlineOf, predictPair } from './checks';
import { predictAll } from './grade-all';

// The bodice of repair-draw.test.ts (6 mm wider, 8 mm longer per step); `bend` moves the bottom
// corner of one size sideways — a size the reader got a little wrong there.
const corners = (r: number, bend = 0): PtMm[] => {
  const w = 200 + 6 * r;
  const h = 300 + 8 * r;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h * 0.7 },
    { x: w * 0.55 + bend, y: h },
    { x: 0, y: h },
  ];
};
const ring = (c: PtMm[]): PtMm[] => {
  const out: PtMm[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j < m; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
  }
  return out;
};
const near = (pts: readonly PtMm[], q: PtMm) =>
  Math.min(...pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));

/** Edge step: size 7 from sizes 1–6; size 6 (the nearest) carries `bend` at the bottom corner. */
const edgeStep = (bend: number) => {
  const members = [1, 2, 3, 4, 5, 6].map((rank) => ({
    rank,
    o: outlineOf(ring(corners(rank, rank === 6 ? bend : 0)))!,
  }));
  const o5 = members[4].o;
  const o6 = members[5].o;
  const C = predictPair(o5, o6, 2, 1, 'stacked')!;
  const D = predictAll(o5, o6, 5, 6, members, 7, 'stacked')!;
  // the farthest the prediction runs from the true size 7, over the whole line
  const truth = ring(corners(7));
  const off = (pts: readonly PtMm[]) => Math.max(...truth.map((q) => near(pts, q)));
  return { C: off(C.pts), D: off(D.pts), Dres: D };
};

describe('predictAll (variant D): the grade over all anchors', () => {
  it('equals the pair on a clean linear grade', () => {
    const { C, D, Dres } = edgeStep(0);
    expect(Dres.sizes).toBe(6);
    expect(Math.abs(D - C)).toBeLessThan(0.3);
    expect(D).toBeLessThan(0.6); // the sampling floor (0.51 mm), same as the pair
  });

  it('is not pulled off by one bent neighbour at the edge step', () => {
    // the pair carries the 3 mm bend of size 6 into size 7 (4.2 mm); D down-weights size 6 (0.96)
    const { C, D } = edgeStep(3);
    expect(C).toBeGreaterThan(4);
    expect(D).toBeLessThan(1.5);
  });

  it('needs four sizes (below that it equals the pair)', () => {
    const members = [4, 5, 6].map((rank) => ({ rank, o: outlineOf(ring(corners(rank)))! }));
    expect(predictAll(members[1].o, members[2].o, 5, 6, members, 7, 'stacked')).toBeNull();
  });
});
