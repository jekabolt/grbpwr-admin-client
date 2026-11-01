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

  it('steps beside the unit when under it lies another piece', () => {
    const upper = rect(0, 0, 60, 100);
    const lower = rect(0, 100, 60, 300);
    const at = nameSpot(upper, [lower], 180, 12);
    const box = boxAt(at, 180, 12);
    const onLower = box.x0 < 60 && box.x1 > 0 && box.y0 < 400 && box.y1 > 100;
    const onUpper = box.x0 < 60 && box.x1 > 0 && box.y0 < 100 && box.y1 > 0;
    expect(onLower || onUpper).toBe(false);
  });

  // 660 on #87: an upper front + pocket over the lower front, a name wider than the upper piece.
  // Under it lies the lower front; over it the canvas ends — the name goes beside, in the canvas.
  it('stays in the canvas when over the unit is off it and under it is another piece', () => {
    const frame = { x0: 0, y0: 0, x1: 800, y1: 420 };
    const upper = rect(250, 10, 140, 120);
    const lower = rect(250, 130, 170, 280);
    const room = { frame, w: 290, h: 20 };
    const at = nameSpot(upper, [lower], 260, 16, upper, room);
    const box = boxAt(at, room.w, room.h);
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(800);
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(420);
    const meets = (r: { x0: number; y0: number; x1: number; y1: number }) =>
      box.x0 <= r.x1 && r.x0 <= box.x1 && box.y0 <= r.y1 && r.y0 <= box.y1;
    expect(meets({ x0: 250, y0: 10, x1: 390, y1: 130 })).toBe(false);
    expect(meets({ x0: 250, y0: 130, x1: 420, y1: 410 })).toBe(false);
  });

  it('slides a name under a unit near the canvas edge back into the canvas', () => {
    const frame = { x0: 0, y0: 0, x1: 300, y1: 300 };
    const narrow = rect(0, 0, 40, 200);
    const at = nameSpot(narrow, [], 180, 12, narrow, { frame, w: 200, h: 20 });
    const box = boxAt(at, 200, 20);
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.y0).toBeGreaterThan(200);
  });

  it('leaves its piece for a spot clear of the boxes the label pass avoids', () => {
    const front = rect(0, 0, 300, 300);
    const other = { x0: 0, y0: 100, x1: 300, y1: 200 }; // another input's box over the middle
    const at = nameSpot(front, [], 100, 12, front, { avoid: [other], w: 110, h: 20 });
    const box = boxAt(at, 110, 20);
    const onOther = box.y0 <= other.y1 && box.y1 >= other.y0;
    expect(onOther).toBe(false);
  });
});
