import { describe, expect, it } from 'vitest';

import { foldedOutline } from './fold-outline';
import type { DollFold, UV } from './types';

// A placket strip in its seam frame: 100 mm wide, 300 mm tall (the unit square scaled by frame).
const strip: UV[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const frame = { w: 100, h: 300 };
const along = (u: number, flipU: number, seq = 1, kind: DollFold['kind'] = 'inward'): DollFold => ({
  seq,
  a: [u, 0],
  b: [u, 1],
  flipAt: [flipU, 0.5],
  kind,
});

const spanU = (pts: readonly UV[]) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [u] of pts) {
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  return [lo, hi] as const;
};

describe('foldedOutline', () => {
  it('leaves the piece alone without folds', () => {
    const out = foldedOutline(strip, [], frame);
    expect(out.outline).toEqual(strip);
    expect(out.plies).toEqual([{ poly: strip, layer: 0 }]);
    expect(out.skipped).toEqual([]);
  });

  it('a single fold down the middle halves the width, the flap one ply under', () => {
    const out = foldedOutline(strip, [along(0.5, 0.25)], frame);
    expect(out.finishedWidthMm).toBeCloseTo(50, 6);
    expect(out.cutWidthMm).toBeCloseTo(100, 6);
    expect(spanU(out.outline)).toEqual([0.5, 1]);
    expect(out.plies.map((p) => p.layer).sort((x, y) => x - y)).toEqual([-1, 0]);
    for (const ply of out.plies) expect(spanU(ply.poly)).toEqual([0.5, 1]);
    const flap = out.plies.find((p) => p.layer === -1)!;
    expect(flap.poly.length).toBe(4);
  });

  it('an outward fold puts the flap one ply over', () => {
    const out = foldedOutline(strip, [along(0.5, 0.75, 1, 'outward')], frame);
    expect(spanU(out.outline)).toEqual([0, 0.5]);
    expect(out.plies.map((p) => p.layer).sort((x, y) => x - y)).toEqual([0, 1]);
  });

  it('two equal folds the same way roll the strip to a third, three plies in stack order', () => {
    const out = foldedOutline(strip, [along(1 / 3, 0, 1), along(2 / 3, 0, 2)], frame);
    expect(out.finishedWidthMm).toBeCloseTo(100 / 3, 6);
    const [lo, hi] = spanU(out.outline);
    expect(lo).toBeCloseTo(2 / 3, 9);
    expect(hi).toBeCloseTo(1, 9);
    // The first flap (turned twice) ends up right under the fixed third, the middle third under it.
    expect(out.plies.map((p) => p.layer).sort((x, y) => x - y)).toEqual([-2, -1, 0]);
    expect(out.skipped).toEqual([]);
  });

  it('two folds the opposite way zigzag the strip to a third', () => {
    const out = foldedOutline(strip, [along(1 / 3, 0, 1), along(2 / 3, 1, 2, 'outward')], frame);
    expect(out.finishedWidthMm).toBeCloseTo(100 / 3, 6);
    expect(out.plies.map((p) => p.layer).sort((x, y) => x - y)).toEqual([-1, 0, 1]);
  });

  it('says which fold did nothing (line off the piece, flipAt on the line)', () => {
    const out = foldedOutline(strip, [along(1.5, 0.2, 1), along(0.5, 0.5, 2)], frame);
    expect(out.skipped).toEqual([1, 2]);
    expect(out.plies).toHaveLength(1);
  });
});
