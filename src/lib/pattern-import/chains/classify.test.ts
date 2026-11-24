import { describe, expect, it } from 'vitest';

import type { Chain, PtMm, Style } from '../types';
import { furniture } from './classify';

// A long straight dashed line is page furniture ("dashed guide") unless its pen also draws a
// garment curve. A tile's scale moves a dash a few percent, so the pens must match within that.

const INK: [number, number, number] = [32, 29, 30];
const pen = (id: number, dash: number[], widthMm = 0.35): Style => ({
  id,
  strokeRgb: INK,
  widthMm,
  dash,
  layer: null,
  fill: false,
  clip: null,
});

const chain = (id: number, style: number, pts: PtMm[]): Chain => {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { id, pts, closed: false, ranges: [], motif: null, style, lengthMm: len };
};

/** A quarter arc, radius 120 mm: a curve of ~190 mm. */
const arc = (): PtMm[] =>
  Array.from({ length: 40 }, (_, i) => {
    const a = (i / 39) * (Math.PI / 2);
    return { x: 120 * Math.sin(a), y: 120 - 120 * Math.cos(a) + 500 };
  });
const straight = (): PtMm[] => [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
];

describe('furniture: dashed guide', () => {
  const curvedPen = pen(1, [9.59, 1.03, 0.34, 1.03, 0.34, 1.03]);

  it('keeps a straight edge whose pen is the curve pen printed 2 % off', () => {
    const styles = new Map([
      [1, curvedPen],
      [2, pen(2, [9.75, 1.04, 0.35, 1.04, 0.35, 1.04])],
    ]);
    const out = furniture([chain(0, 1, arc()), chain(1, 2, straight())], styles);
    expect(out[1]).not.toBe('dashed guide');
  });

  it('still throws out a straight dashed line of a pen no curve uses', () => {
    const styles = new Map([
      [1, curvedPen],
      [3, pen(3, [20, 6])],
    ]);
    const out = furniture([chain(0, 1, arc()), chain(1, 3, straight())], styles);
    expect(out[1]).toBe('dashed guide');
  });

  it('keeps a straight dashed line whose pen draws no curve when the guide rule is off', () => {
    // a size drawn only in straight lines (a skirt) has no curve in its pen
    const styles = new Map([[3, pen(3, [20, 6])]]);
    const out = furniture([chain(0, 3, straight())], styles, [], [], undefined, true);
    expect(out[0]).not.toBe('dashed guide');
  });
});
