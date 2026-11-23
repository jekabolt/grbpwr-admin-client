import { describe, expect, it } from 'vitest';

import type { Chain, PtMm, Style } from '../types';
import { closeCorners } from './corners';

// MDF340 Opal, F — FRONT SKIRT, size 10. Page 53.
// Operation 3012 continues one side; operation 3046 continues the other.
// Both strokes are on the sheet. The corner used to stay open: the sheet has no
// stub/ramp convention, so the printed strokes were left for isNotch / fragment < 8 mm.

const END_A: PtMm = { x: 888.72, y: 232.99 };
const END_B: PtMm = { x: 889.42, y: 230.94 };
const OP_3012: PtMm[] = [
  { x: 888.72, y: 233.01 },
  { x: 889.22, y: 231.54 },
  { x: 889.71, y: 230.09 },
];
const OP_3046: PtMm[] = [
  { x: 891.45, y: 231.65 },
  { x: 890.0, y: 231.16 },
  { x: 888.54, y: 230.67 },
];

const unit = (x: number, y: number): PtMm => {
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
};
const tA = unit(0.325, -0.946);
const tB = unit(0.946, 0.325);

const style = (id: number, dash: number[] | null): Style => ({
  id,
  strokeRgb: [32, 29, 30],
  widthMm: 0.49,
  dash,
  layer: null,
  fill: false,
  clip: null,
});
const STYLES = new Map<number, Style>([
  [0, style(0, [3, 1.5])],
  [1, style(1, null)],
]);

function poly(pts: PtMm[], styleId: number): Chain {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { id: 0, pts, closed: false, ranges: [], motif: null, style: styleId, lengthMm: len };
}

function side(end: PtMm, t: PtMm): Chain {
  return poly([{ x: end.x - t.x * 40, y: end.y - t.y * 40 }, end], 0);
}

function run(strokes: PtMm[][], extra: Chain[] = [], extraRank = false) {
  const chains = [side(END_A, tA), side(END_B, tB), ...strokes.map((p) => poly(p, 1)), ...extra];
  chains.forEach((c, id) => (c.id = id));
  const rankOf = new Map<number, number>([
    [0, 0],
    [1, 0],
  ]);
  if (extraRank) rankOf.set(chains.length - 1, 1);
  return closeCorners(
    chains,
    rankOf,
    STYLES,
    (c) => rankOf.has(c),
    (c) => !rankOf.has(c),
    extraRank ? 2 : 1,
  );
}

const has = (pts: PtMm[], p: PtMm, tol = 0.02) =>
  pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol);

describe('closeCorners · printed corner arms', () => {
  it('keeps both printed strokes and the corner they confirm (MDF340 p.53 ops 3012, 3046)', () => {
    const out = run([OP_3012, OP_3046]);
    expect(out.walls).toHaveLength(1);
    expect(out.walls[0].rule).toBe('arms');
    expect(out.walls[0].chains).toEqual([2, 3]);
    expect(has(out.walls[0].pts, OP_3012[1])).toBe(true);
    expect(has(out.walls[0].pts, END_B, 0.05)).toBe(true);
    expect(has(out.walls[0].pts, OP_3012[2])).toBe(false);
    expect(out.extended).toBe(0);
  });

  it('restores a vertex the strokes stop short of, from the two confirmed sides', () => {
    const a: PtMm = { x: 0, y: 0 };
    const b: PtMm = { x: 3, y: 4 };
    const ta: PtMm = { x: 1, y: 0 };
    const tb: PtMm = { x: 0, y: -1 };
    const shortA = [a, { x: 1.6, y: 0 }];
    const shortB = [b, { x: 3, y: 2.4 }];
    const chains = [side(a, ta), side(b, tb), poly(shortA, 1), poly(shortB, 1)];
    chains.forEach((c, id) => (c.id = id));
    const out = closeCorners(
      chains,
      new Map([
        [0, 0],
        [1, 0],
      ]),
      STYLES,
      (c) => c < 2,
      (c) => c >= 2,
      1,
    );
    expect(out.walls).toHaveLength(1);
    expect(has(out.walls[0].pts, shortA[1])).toBe(true);
    expect(has(out.walls[0].pts, shortB[1])).toBe(true);
    expect(has(out.walls[0].pts, { x: 3, y: 0 }, 0.05)).toBe(true);
  });

  it('stops when the confirming stroke is removed (op 3046)', () => {
    const out = run([OP_3012]);
    expect(out.walls).toHaveLength(0);
  });

  it('stops when the same side has an equal second continuation', () => {
    const n = { x: -tA.y, y: tA.x };
    const rival = OP_3012.map((p) => ({ x: p.x + n.x * 0.15, y: p.y + n.y * 0.15 }));
    const out = run([OP_3012, OP_3046, rival]);
    expect(out.walls).toHaveLength(0);
    expect(out.refused['arms: two continuations']).toBe(1);
  });

  it('does not give the stroke to either rank when it continues both', () => {
    const other = side(END_A, tA);
    const out = run([OP_3012, OP_3046], [other], true);
    expect(out.walls).toHaveLength(0);
    expect(out.refused['arms: two ranks']).toBe(1);
  });
});
