import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { isFoldBounded } from './folded';
import { inside } from './geom';
import {
  doubleTurn,
  foldedOutline,
  foldMap,
  foldSection,
  type FlatFold,
  type FoldMapGeometry,
} from './index';

const piece: Pt2[] = [
  [0, 0],
  [80, 0],
  [80, 20],
  [0, 20],
];

const fold = (a: Pt2, b: Pt2): FlatFold => ({
  a,
  b,
  flipAt: [10, 10],
  kind: 'inward',
});

const full = fold([30, 0], [30, 20]);
const oneEnd = fold([30, 0], [30, 12]);
const twoEnds = fold([30, 4], [30, 16]);

const range = (points: readonly Pt2[], axis: 0 | 1): [number, number] => {
  const values = points.map((point) => point[axis]);
  return [Math.min(...values), Math.max(...values)];
};

const area = (poly: readonly Pt2[]) =>
  Math.abs(
    poly.reduce((sum, [x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length];
      return sum + x * ny - nx * y;
    }, 0),
  ) / 2;

const geometry = (): FoldMapGeometry => ({
  rings: [piece],
  edges: [
    [
      [10, 0],
      [10, 20],
    ],
  ],
  marks: [
    [10, 2],
    [10, 10],
    [10, 18],
  ],
  innerLines: [],
});

describe('bounded foldedOutline', () => {
  it('keeps the existing full-width fold geometry exact', () => {
    const shape = foldedOutline(piece, [full]);

    expect(shape.plies).toEqual([
      {
        poly: [
          [60, 0],
          [30, 0],
          [30, 20],
          [60, 20],
        ],
        flipped: true,
        by: 1,
        t: 1,
      },
      {
        poly: [
          [30, 0],
          [80, 0],
          [80, 20],
          [30, 20],
        ],
        flipped: false,
        by: 0,
        t: 1,
      },
    ]);
    expect(shape.outline).toEqual(shape.plies[1].poly);
    expect(shape.finishedWidthMm).toBe(50);
  });

  it('with one internal end moves only the stretch before that end', () => {
    const shape = foldedOutline(piece, [oneEnd]);
    const moving = shape.plies.find((ply) => ply.by === 1)!;
    const fixed = shape.plies.filter((ply) => ply.by === 0);

    expect(range(moving.poly, 1)).toEqual([0, 12]);
    expect(fixed.some((ply) => inside(ply.poly, [10, 18]))).toBe(true);
    expect(area(shape.outline)).toBeCloseTo(1240, 6);
    expect(shape.finishedWidthMm).toBe(80);
  });

  it('with two internal ends leaves both outside stretches flat', () => {
    const shape = foldedOutline(piece, [twoEnds]);
    const moving = shape.plies.find((ply) => ply.by === 1)!;
    const fixed = shape.plies.filter((ply) => ply.by === 0);

    expect(range(moving.poly, 1)).toEqual([4, 16]);
    expect(fixed.some((ply) => inside(ply.poly, [10, 2]))).toBe(true);
    expect(fixed.some((ply) => inside(ply.poly, [10, 18]))).toBe(true);
    expect(area(shape.outline)).toBeCloseTo(1240, 6);
    expect(shape.finishedWidthMm).toBe(80);
  });

  it('sizes a bounded double turn from the moving stretch only', () => {
    const tapered: Pt2[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [20, 100],
    ];

    expect(doubleTurn(tapered, [50, 80], [50, 100], 1)[0][0][0]).toBeCloseTo(33, 6);
    expect(doubleTurn(tapered, [50, 0], [50, 100], 1)[0][0][0]).toBeCloseTo(25, 6);
  });

  it('keeps both plies of a full double turn full on a slanted edge', () => {
    const slanted: Pt2[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 60],
    ];
    const [outer, inner] = doubleTurn(slanted, [50, 0], [50, 80], 1);

    expect(inner).toEqual([
      [50, 0],
      [50, 80],
    ]);
    expect(outer[0][0]).toBeCloseTo(25, 6);
    expect(Math.max(outer[0][1], outer[1][1])).toBeCloseTo(70, 6);
    expect(
      isFoldBounded(slanted, { a: outer[0], b: outer[1], flipAt: [10, 10], kind: 'inward' }),
    ).toBe(false);
  });
});

describe('bounded foldSection', () => {
  const width = (span: { lo: number; hi: number }) => span.hi - span.lo;

  it('keeps the old reduced section for a full-width fold', () => {
    const section = foldSection(piece, [full])!;
    expect(width(section.fin)).toBe(50);
    expect(section.plies).toHaveLength(2);
  });

  it.each([
    ['one internal end', oneEnd],
    ['two internal ends', twoEnds],
  ])('keeps the flat projection outside %s', (_name, bounded) => {
    const section = foldSection(piece, [bounded])!;
    expect(width(section.fin)).toBe(80);
    expect(section.plies.some((ply) => width(ply) === 80)).toBe(true);
    expect(section.plies.some((ply) => width(ply) === 30)).toBe(true);
  });
});

describe('bounded foldMap', () => {
  it('keeps full-width mapping unchanged', () => {
    const mapped = foldMap(geometry(), [full]);
    expect(mapped.marks).toEqual([
      [50, 2],
      [50, 10],
      [50, 18],
    ]);
    expect(mapped.edges).toHaveLength(1);
  });

  it('with one internal end maps only features inside its band', () => {
    const mapped = foldMap(geometry(), [oneEnd]);
    expect(mapped.marks).toEqual([
      [50, 2],
      [50, 10],
      [10, 18],
    ]);
    expect(mapped.edges).toHaveLength(2);
    expect(mapped.rings[0]).toEqual(foldedOutline(piece, [oneEnd]).outline);
  });

  it('with two internal ends maps only the middle stretch', () => {
    const mapped = foldMap(geometry(), [twoEnds]);
    expect(mapped.marks).toEqual([
      [10, 2],
      [50, 10],
      [10, 18],
    ]);
    expect(mapped.edges).toHaveLength(3);
    expect(mapped.rings[0]).toEqual(foldedOutline(piece, [twoEnds]).outline);
  });
});
