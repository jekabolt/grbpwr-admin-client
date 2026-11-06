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

  it('a fold off the middle cuts its plies at the line', () => {
    const out = foldedOutline(strip, [along(0.3, 0.1)], frame);
    expect(out.finishedWidthMm).toBeCloseTo(70, 6);
    const flap = out.plies.find((p) => p.layer === -1)!;
    const [lo, hi] = spanU(flap.poly);
    expect(lo).toBeCloseTo(0.3, 9);
    expect(hi).toBeCloseTo(0.6, 9);
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

  it('leaves PLEAT rows flat instead of treating them as outward folds', () => {
    const out = foldedOutline(strip, [along(1 / 3, 0, 1, 'pleat')], frame);
    expect(out.outline).toEqual(strip);
    expect(out.plies).toEqual([{ poly: strip, layer: 0 }]);
    expect(out.skipped).toEqual([1]);
  });

  describe('crossing lines', () => {
    const square: UV[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const size = { w: 300, h: 300 };
    const fold = (seq: number, a: UV, b: UV, flipAt: UV): DollFold => ({
      seq,
      a,
      b,
      flipAt,
      kind: 'inward',
    });
    const area = (poly: readonly UV[]) => {
      let sum = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        sum += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      return Math.abs(sum) / 2;
    };

    it('at a right angle: four plies, one rigid quarter each, the footprint what paper leaves', () => {
      const out = foldedOutline(
        square,
        [fold(1, [1 / 3, 0], [1 / 3, 1], [0, 0.5]), fold(2, [0, 1 / 3], [1, 1 / 3], [0.5, 0])],
        size,
      );
      expect(out.plies).toHaveLength(4);
      expect(out.plies.reduce((sum, p) => sum + area(p.poly), 0)).toBeCloseTo(1, 9);
      for (const ply of out.plies) {
        const [lo, hi] = spanU(ply.poly);
        expect(lo).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
        expect(hi).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(out.plies.map((p) => p.layer).sort((x, y) => x - y)).toEqual([-3, -2, -1, 0]);
    });

    it('a ply with no stretch on the line goes with the one it is folded onto', () => {
      // Turned flap and foot first; the third line runs right of both and cuts neither.
      const out = foldedOutline(
        square,
        [
          fold(1, [1 / 3, 0], [1 / 3, 1], [0, 0.5]),
          fold(2, [0, 1 / 3], [1, 1 / 3], [0.5, 0]),
          fold(3, [5 / 6, 0], [5 / 6, 1], [0, 0.5]),
        ],
        size,
      );
      expect(out.plies).toHaveLength(6);
      expect(out.plies.reduce((sum, p) => sum + area(p.poly), 0)).toBeCloseTo(1, 9);
      // All of it left of the line lands right of it, mirrored as one body, the flap included.
      const lo = Math.min(...out.plies.map((p) => spanU(p.poly)[0]));
      const hi = Math.max(...out.plies.map((p) => spanU(p.poly)[1]));
      expect(lo).toBeCloseTo(5 / 6, 9);
      expect(hi).toBeCloseTo(4 / 3, 9);
    });
  });
});
