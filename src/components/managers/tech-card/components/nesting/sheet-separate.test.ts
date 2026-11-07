import { describe, expect, it } from 'vitest';
import type { PieceDTO } from 'lib/nesting/types';
import { overlappingPairs, separateForDisplay } from './sheet-separate';

const rect = (id: number, x: number, y: number, w: number, h: number): PieceDTO => ({
  id,
  name: `P${id}`,
  blockName: `P${id}`,
  source: 'a.dxf',
  poly: [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ],
  bboxW: w,
  bboxH: h,
  areaCm2: w * h,
  originX: x,
  originY: y,
});

// A diamond (a piece turned 45°) inside its bbox: its corners stick into the neighbours.
const diamond = (id: number, x: number, y: number, s: number): PieceDTO => ({
  ...rect(id, x, y, s, s),
  poly: [
    { x: s / 2, y: 0 },
    { x: s, y: s / 2 },
    { x: s / 2, y: s },
    { x: 0, y: s / 2 },
  ],
  areaCm2: (s * s) / 2,
});

describe('separateForDisplay', () => {
  it('returns the same array when nothing overlaps', () => {
    const pieces = [rect(1, 0, 0, 10, 10), rect(2, 20, 0, 10, 10)];
    expect(separateForDisplay(pieces)).toBe(pieces);
  });

  it('a piece laid over its neighbour is moved off it; the file copy is untouched', () => {
    const big = rect(1, 0, 0, 40, 30);
    const small = rect(2, 35, 5, 20, 10); // 5 cm over the big one's right side
    const pieces = [big, small];
    expect(overlappingPairs(pieces)).toEqual([[1, 2]]);
    const shown = separateForDisplay(pieces);
    expect(overlappingPairs(shown)).toEqual([]);
    expect(shown[0]).toBe(big); // the big one holds its place
    expect(shown[1].originX).toBeCloseTo(41, 1); // 5 cm out + 1 cm gap, the shortest way (± 0.05 mm search step)
    expect(small.originX).toBe(35);
  });

  it('owner snapshot shape: a turned piece over two neighbours ends with zero overlaps', () => {
    const pieces = [
      rect(1, 0, 0, 50, 70),
      rect(2, 52, 0, 50, 70),
      diamond(3, 40, 20, 30), // straddles the gap between 1 and 2
      rect(4, 0, 72, 30, 10),
      rect(5, 25, 75, 30, 10),
    ];
    expect(overlappingPairs(pieces).length).toBeGreaterThan(0);
    const shown = separateForDisplay(pieces);
    expect(overlappingPairs(shown)).toEqual([]);
    expect(shown.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a shape drawn inside a piece (interlining over its piece) is not split off', () => {
    const host = rect(1, 0, 0, 40, 30);
    const shape = rect(2, 5, 5, 20, 10);
    const pieces = [host, shape];
    expect(separateForDisplay(pieces)).toBe(pieces);
  });

  it('shifts the absolute grain ends with the piece', () => {
    const big = rect(1, 0, 0, 40, 30);
    const small = {
      ...rect(2, 35, 5, 20, 10),
      grain: [{ layer: 'G', angleDeg: 0, lengthCm: 10, a: { x: 40, y: 10 }, b: { x: 50, y: 10 } }],
    };
    const shown = separateForDisplay([big, small]);
    const dx = (shown[1].originX ?? 0) - 35;
    expect(dx).toBeGreaterThan(0);
    expect(shown[1].grain?.[0].a.x).toBeCloseTo(40 + dx, 5);
  });
});
