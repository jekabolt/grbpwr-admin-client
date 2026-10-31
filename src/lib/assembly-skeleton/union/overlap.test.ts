import { describe, expect, it } from 'vitest';
import { intersectArea, rasterize, unionRaster } from './overlap';

const box = (x0: number, y0: number, x1: number, y1: number) =>
  rasterize(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    1,
  );

describe('unionRaster', () => {
  it('counts pieces stacked on each other once', () => {
    const back = box(0, 0, 100, 100);
    const bag = box(20, 0, 80, 50);
    const u = unionRaster([back, bag])!;
    expect(u.area).toBeCloseTo(back.area, 0);
    expect(intersectArea(box(0, 0, 100, 40), u)).toBeCloseTo(4000, 0);
  });

  it('joins pieces side by side and keeps a gap a gap', () => {
    const u = unionRaster([box(0, 0, 10, 10), box(20, 0, 30, 10)])!;
    expect(u.area).toBeCloseTo(200, 0);
    expect(intersectArea(box(10, 0, 20, 10), u)).toBeCloseTo(0, 0);
    expect(unionRaster([])).toBeNull();
  });
});
