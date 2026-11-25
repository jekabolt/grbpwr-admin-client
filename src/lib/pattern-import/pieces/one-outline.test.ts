import { describe, expect, it } from 'vitest';

import type { Chain, PtMm } from 'lib/pattern-import/types';

import { signedArea } from './geom';
import { oneLap, oneOutlineAt } from './one-outline';

const chain = (id: number, pts: PtMm[]): Chain => ({
  id,
  pts,
  closed: false,
  ranges: [{ path: id, from: 0, to: pts.length - 1 }],
  motif: null,
  style: 0,
  lengthMm: pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0),
});

/** Four sides of a w × h box at (x, y); each side stops `short` mm before its two corners. */
const box = (x: number, y: number, w: number, h: number, short: number): Chain[] => [
  chain(0, [
    { x: x + short, y },
    { x: x + w - short, y },
  ]),
  chain(1, [
    { x: x + w, y: y + short },
    { x: x + w, y: y + h - short },
  ]),
  chain(2, [
    { x: x + w - short, y: y + h },
    { x: x + short, y: y + h },
  ]),
  chain(3, [
    { x, y: y + h - short },
    { x, y: y + short },
  ]),
];

describe('one outline for every size', () => {
  it('builds the corners the sides stop short of', () => {
    const chains = box(100, 100, 120, 80, 4);
    const r = oneOutlineAt(chains, [0, 1, 2, 3], { x: 160, y: 140 });
    expect(r).not.toBeNull();
    expect(Math.abs(signedArea(r!.outer))).toBeCloseTo(120 * 80, 0);
    expect(new Set(r!.chains)).toEqual(new Set([0, 1, 2, 3]));
  });

  it('cuts back sides that run past the corner', () => {
    const chains = box(100, 100, 120, 80, -6);
    const r = oneOutlineAt(chains, [0, 1, 2, 3], { x: 160, y: 140 });
    expect(r).not.toBeNull();
    expect(Math.abs(signedArea(r!.outer))).toBeCloseTo(120 * 80, 0);
  });

  it('does not draw across a gap in a side', () => {
    const chains = box(100, 100, 120, 80, 4);
    // the top side loses 30 mm in its middle
    chains[0] = chain(0, [
      { x: 104, y: 100 },
      { x: 140, y: 100 },
    ]);
    chains.push(
      chain(4, [
        { x: 170, y: 100 },
        { x: 216, y: 100 },
      ]),
    );
    expect(oneOutlineAt(chains, [0, 1, 2, 3, 4], { x: 160, y: 140 })).toBeNull();
  });

  it('is not a walk that does not go round the label', () => {
    const chains = box(100, 100, 120, 80, 4);
    expect(oneOutlineAt(chains, [0, 1, 2, 3], { x: 400, y: 140 })).toBeNull();
  });

  it('takes a page-sized box for the tile frame', () => {
    const chains = box(0, 0, 210, 297, 2);
    const at = { x: 100, y: 150 };
    expect(oneOutlineAt(chains, [0, 1, 2, 3], at, [{ widthMm: 210, heightMm: 297 }])).toBeNull();
    expect(oneOutlineAt(chains, [0, 1, 2, 3], at, [])).not.toBeNull();
  });

  it('reads an outline printed once per size on the same place as one outline', () => {
    // one closed line that goes round the box 16 times, starting in the middle of a side
    const lap: PtMm[] = [
      { x: 220, y: 140 },
      { x: 220, y: 180 },
      { x: 100, y: 180 },
      { x: 100, y: 100 },
      { x: 220, y: 100 },
    ];
    const pts = Array.from({ length: 16 }, () => lap).flat();
    const wound: Chain = { ...chain(0, [...pts, pts[0]]), pts, closed: true };
    // 16 copies of a mark inside, nearer the label than the outline
    const marks = Array.from({ length: 16 }, (_, k) =>
      chain(k + 1, [
        { x: 170, y: 120 },
        { x: 170, y: 160 },
      ]),
    );
    const all = [wound, ...marks];
    const r = oneOutlineAt(
      all,
      all.map((c) => c.id),
      { x: 160, y: 140 },
    );
    expect(r).not.toBeNull();
    expect(Math.abs(signedArea(r!.outer))).toBeCloseTo(120 * 80, 0);
    expect(r!.chains).toEqual([0]);
  });

  it('keeps a closed line whose second lap leaves the first', () => {
    const pts: PtMm[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
      { x: 0, y: 0 },
    ];
    expect(oneLap(pts)).toBe(pts);
  });
});
