import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';

import { nameSpot } from './name-spot';

const rect = (x: number, y: number, w: number, h: number): Pt2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const boxAt = (c: Pt2, w: number, h: number) => ({
  x0: c[0] - w / 2,
  y0: c[1] - h / 2,
  x1: c[0] + w / 2,
  y1: c[1] + h / 2,
});

describe('nameSpot', () => {
  it('keeps the safe spot when the name fits there', () => {
    const at = nameSpot(rect(0, 0, 200, 200), [], 80, 12);
    expect(at[0]).toBeGreaterThan(40);
    expect(at[0]).toBeLessThan(160);
  });

  it('moves off a piece lying across the middle', () => {
    const front = rect(0, 0, 200, 300);
    const pocket = rect(0, 100, 150, 80);
    const at = nameSpot(front, [pocket], 120, 12);
    const box = boxAt(at, 120, 12);
    const clear = box.y1 < 100 || box.y0 > 180 || box.x0 > 150;
    expect(clear).toBe(true);
  });

  it('goes under the unit when it fits nowhere inside', () => {
    const narrow = rect(0, 0, 60, 200);
    const at = nameSpot(narrow, [], 180, 12);
    expect(at[1]).toBeGreaterThan(200);
    expect(at[0]).toBeCloseTo(30);
  });
});
