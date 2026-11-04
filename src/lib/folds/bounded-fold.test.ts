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

describe('foldedOutline — a pleat of lines meeting at one point', () => {
  const back: Pt2[] = [
    [0, 0],
    [570, 0],
    [570, 690],
    [0, 690],
  ];
  const centre: FlatFold = { a: [285, 690], b: [285, 14], flipAt: [280, 350], kind: 'inward' };
  const side: FlatFold = { a: [320, 690], b: [285, 14], flipAt: [320, 350], kind: 'outward' };

  it('moves each part only across its own line, in any order', () => {
    for (const folds of [
      [centre, side],
      [side, centre],
    ]) {
      const { plies } = foldedOutline(back, folds);
      const large = plies.filter((ply) => Math.max(...ply.poly.map(([, y]) => y)) > 100);
      expect(large).toHaveLength(3);
      // The left part lands on the right, over the centre line; the right part lands on the
      // left, over the side line; neither is moved a second time by the other line.
      const leftLanded = large.find((ply) => ply.poly.some(([x, y]) => x === 570 && y === 0));
      const rightLanded = large.find((ply) => ply.poly.some(([x]) => x < 1));
      expect(leftLanded?.flipped).toBe(true);
      expect(rightLanded?.flipped).toBe(true);
      expect(large.find((ply) => !ply.flipped)?.poly).toHaveLength(3);
      const xs = large.flatMap((ply) => ply.poly.map(([x]) => x));
      expect(Math.min(...xs)).toBeGreaterThan(-1);
      expect(Math.max(...xs)).toBeLessThan(571);
    }
  });

  it('gives the same plies whichever line was made first', () => {
    const area = (plies: { poly: Pt2[] }[]) =>
      plies
        .map((ply) =>
          Math.round(
            ply.poly.reduce((sum, [x, y], i) => {
              const [nx, ny] = ply.poly[(i + 1) % ply.poly.length];
              return sum + x * ny - nx * y;
            }, 0),
          ),
        )
        .map(Math.abs)
        .sort();
    expect(area(foldedOutline(back, [centre, side]).plies)).toEqual(
      area(foldedOutline(back, [side, centre]).plies),
    );
  });

  it('still lays a double turn over itself', () => {
    const outer: FlatFold = { a: [0, 15], b: [570, 15], flipAt: [285, 5], kind: 'inward' };
    const inner: FlatFold = { a: [0, 30], b: [570, 30], flipAt: [285, 25], kind: 'inward' };
    const { plies } = foldedOutline(back, [outer, inner]);
    const ys = plies.flatMap((ply) => ply.poly.map(([, y]) => y));
    expect(Math.min(...ys)).toBeCloseTo(30, 6);
    expect(Math.max(...plies.at(-1)!.poly.map(([, y]) => y))).toBeGreaterThan(30);
  });
});

describe('foldMap — a pleat of lines meeting at one point', () => {
  it('moves a mark on the left part across the centre line only', () => {
    const back: Pt2[] = [
      [0, 0],
      [570, 0],
      [570, 690],
      [0, 690],
    ];
    const centre: FlatFold = { a: [285, 690], b: [285, 14], flipAt: [280, 350], kind: 'inward' };
    const side: FlatFold = { a: [320, 690], b: [285, 14], flipAt: [320, 350], kind: 'outward' };
    const mapped = foldMap({ rings: [back], edges: [], marks: [[100, 350]], innerLines: [] }, [
      centre,
      side,
    ]);
    expect(mapped.marks[0][0]).toBeCloseTo(470, 6);
    expect(mapped.marks[0][1]).toBeCloseTo(350, 6);
  });
});

describe('PLEAT rigid fold — BP size M', () => {
  const back: Pt2[] = [
    [0, 0],
    [569, 0],
    [569, 692],
    [0, 692],
  ];
  const apex: Pt2 = [285, 14];
  const pleat: FlatFold[] = [
    { a: apex, b: [250, 662], flipAt: [230, 340], kind: 'pleat' },
    { a: apex, b: [285, 663], flipAt: [270, 340], kind: 'pleat' },
    { a: apex, b: [320, 662], flipAt: [340, 340], kind: 'pleat' },
  ];

  it('closes 70 mm at the neck without flipping either back half', () => {
    const shape = foldedOutline(back, pleat);
    const mapped = foldMap(
      {
        rings: [back],
        edges: [],
        marks: [
          [0, 662],
          [569, 662],
          [0, 14],
          [569, 14],
          [0, 0],
          [569, 0],
          [250, 662],
          [320, 662],
        ],
        innerLines: [],
      },
      pleat,
    );

    const neckReduction = 569 - (mapped.marks[1][0] - mapped.marks[0][0]);
    expect(neckReduction).toBeGreaterThan(69);
    expect(neckReduction).toBeLessThan(72);
    const apexWidth = mapped.marks[3][0] - mapped.marks[2][0];
    expect(apexWidth).toBeGreaterThan(568);
    expect(apexWidth).toBeLessThan(570);
    expect(Math.abs(mapped.marks[5][1] - mapped.marks[4][1])).toBeLessThan(1);
    expect(mapped.marks[6][0]).toBeCloseTo(285, 6);
    expect(mapped.marks[7][0]).toBeCloseTo(285, 6);
    expect(shape.outline.length).toBeGreaterThan(3);
    expect(shape.creases).toHaveLength(1);
    expect(shape.pleats).toHaveLength(1);
    expect(shape.plies.filter((ply) => !ply.hidden).every((ply) => !ply.flipped)).toBe(true);
    expect(shape.plies.filter((ply) => ply.hidden)).toEqual([
      expect.objectContaining({ flipped: false }),
    ]);
    const wedgeTop = shape.pleats[0].wedge.slice(1);
    expect(Math.abs(wedgeTop[1][0] - wedgeTop[0][0])).toBeCloseTo(35, 0);
    expect((wedgeTop[0][0] + wedgeTop[1][0]) / 2).toBeCloseTo(285, 0);
  });

  it('keeps points inside the hidden wedge on their own half', () => {
    const mapped = foldMap(
      {
        rings: [back],
        edges: [],
        marks: [
          [267.5, 662],
          [302.5, 662],
        ],
        innerLines: [],
      },
      pleat,
    );
    expect(mapped.marks[0][0]).toBeLessThan(285);
    expect(mapped.marks[1][0]).toBeGreaterThan(285);
  });

  it('maps a later IN crease through the pleat before applying it', () => {
    const line4: FlatFold = {
      a: [0, 32],
      b: apex,
      flipAt: [40, 18],
      kind: 'inward',
    };
    const before = foldMap(
      {
        rings: [back],
        edges: [],
        marks: [line4.a, line4.b],
        innerLines: [],
      },
      pleat,
    ).marks;
    const shape = foldedOutline(back, [...pleat, line4]);

    expect(shape.creases.at(-1)?.[0]).toEqual(before[0]);
    expect(shape.creases.at(-1)?.[1]).toEqual(before[1]);
    expect(shape.creases.at(-1)?.[0]).not.toEqual(line4.a);
    expect(shape.plies.some((ply) => ply.under && ply.flipped && !ply.pleatFace)).toBe(true);
  });
});
