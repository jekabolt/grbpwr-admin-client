import type { PieceDTO } from 'lib/nesting/types';
import type { PtMm } from 'lib/pattern-import/types';
import { describe, expect, it } from 'vitest';
import { mapFuseSpecToSize, type FuseInternalLine, type FuseInternals } from './dxf';
import { fusingInternalLines } from './internal-lines';
import fixture from './p-lin-l-2.fixture.json';
import { projectOnRing } from './spline';
import { blankFuse, type PieceFuseSpec } from './types';

// Card 164's lining piece P_LIN_L_2 in all four sizes, piece-local mm: the cut ring plus the
// internal lines (grain, welt pocket box and centre, facing fold, notch). M is the base size.
type Size = keyof typeof fixture.rings;
const ring = (size: Size): PtMm[] => fixture.rings[size].map(([x, y]) => ({ x, y }));
const lines = (size: Size): FuseInternalLine[] =>
  fixture.internals[size].map((line) => ({
    layer: line.layer,
    closed: line.closed,
    points: line.points.map(([x, y]) => ({ x, y })),
  }));
const internals = (from: Size, to: Size): FuseInternals => ({
  base: lines(from),
  target: lines(to),
});
const rotate = <T>(points: T[], k: number) => [...points.slice(k), ...points.slice(0, k)];

const spline = (points: number[][]) => ({
  points: points.map(([x, y, corner]) => ({ x, y, corner: corner === 1 })),
});
// The stored zone: a rectangle around the welt pocket and a strip along the right edge whose
// first point sits inside the piece, on the facing fold line.
const pocket = [
  [34.2, 283.8, 1],
  [195.4, 278.2, 1],
  [195.4, 307.6, 1],
  [34.2, 303.7, 1],
];
const strip = [
  [203.5, 290.4, 0],
  [190.4, 0.5, 1],
  [248.4, 0.4, 1],
  [248.5, 641.9, 1],
  [88.2, 722.1, 1],
];
const zoneOf = (outer: number[][], islands: number[][][] = []): PieceFuseSpec => ({
  ...blankFuse('zone'),
  zone: { spline: spline(outer), holes: [], islands: islands.map(spline) },
});
const stored = zoneOf(pocket, [strip]);

const ringsOf = (spec: PieceFuseSpec) => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return [spec.zone.spline, ...spec.zone.islands].map((s) => s.points);
};
const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const maxDrift = (a: PieceFuseSpec, b: PieceFuseSpec) => {
  const ra = ringsOf(a).flat();
  const rb = ringsOf(b).flat();
  expect(rb).toHaveLength(ra.length);
  return Math.max(...ra.map((point, i) => dist(point, rb[i])));
};
const sides = (points: PtMm[]) =>
  points.map((point, i) => dist(point, points[(i + 1) % points.length]));
// Contour corners the way the mapper finds them: a turn sharper than 35°.
const corners = (points: PtMm[]) =>
  points.filter((b, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const c = points[(i + 1) % points.length];
    const turn = Math.atan2(
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
    );
    return Math.abs(turn) > (35 * Math.PI) / 180;
  });

const sizes: Size[] = ['S', 'L', 'XL'];

describe('zone carried across sizes along the internal lines (P_LIN_L_2)', () => {
  it.each(sizes)('the pocket rectangle is identical on %s: the welt box is not graded', (size) => {
    const mapped = mapFuseSpecToSize(stored, ring('M'), ring(size), null, internals('M', size));
    ringsOf(mapped)[0].forEach((point, i) => {
      expect(dist(point, { x: pocket[i][0], y: pocket[i][1] })).toBeLessThan(0.5);
    });
  });

  it('the strip point on the facing fold moves with the fold', () => {
    const mapped = mapFuseSpecToSize(stored, ring('M'), ring('XL'), null, internals('M', 'XL'));
    const inner = ringsOf(mapped)[1][0];
    expect(Math.abs(inner.x - 213.5)).toBeLessThan(1);
    expect(Math.abs(inner.y - 290.4)).toBeLessThan(1);
  });

  it.each(sizes)('the strip points on the cut edge stay on the %s edge, at its corners', (size) => {
    const base = ring('M');
    const target = ring(size);
    const baseCorners = corners(base);
    const targetCorners = corners(target);
    expect(targetCorners).toHaveLength(baseCorners.length);
    const withLines = mapFuseSpecToSize(stored, base, target, null, internals('M', size));
    const contourOnly = mapFuseSpecToSize(stored, base, target, null);
    strip.slice(1).forEach(([x, y], k) => {
      const point = ringsOf(withLines)[1][k + 1];
      expect(projectOnRing(point, target).d).toBeLessThan(1);
      // Contour points do not depend on the internal lines.
      expect(dist(point, ringsOf(contourOnly)[1][k + 1])).toBeLessThan(1e-6);
      const corner = baseCorners.findIndex((c) => dist(c, { x, y }) < 1);
      if (corner >= 0) expect(dist(point, targetCorners[corner])).toBeLessThan(1);
    });
  });

  it('without internal lines the rectangle keeps its size and moves at most 10 mm on XL', () => {
    const mapped = mapFuseSpecToSize(stored, ring('M'), ring('XL'), null);
    const rect = ringsOf(mapped)[0];
    const baseRect = pocket.map(([x, y]) => ({ x, y }));
    sides(rect).forEach((side, i) => expect(Math.abs(side - sides(baseRect)[i])).toBeLessThan(0.5));
    rect.forEach((point, i) => expect(dist(point, baseRect[i])).toBeLessThanOrEqual(10));
  });

  it('lines that do not pair up fall back to the contour without throwing', () => {
    const broken: FuseInternals = { base: lines('M'), target: lines('XL').slice(1) };
    const mapped = mapFuseSpecToSize(stored, ring('M'), ring('XL'), null, broken);
    const contourOnly = mapFuseSpecToSize(stored, ring('M'), ring('XL'), null);
    // Only layer 7 (the grain line) loses its pair; layer 8 still carries the pocket.
    ringsOf(mapped)[0].forEach((point, i) => {
      expect(dist(point, { x: pocket[i][0], y: pocket[i][1] })).toBeLessThan(0.5);
    });
    const noLines = mapFuseSpecToSize(stored, ring('M'), ring('XL'), null, {
      base: lines('M'),
      target: [],
    });
    expect(maxDrift(noLines, contourOnly)).toBeLessThan(1e-6);
  });

  it.each(sizes)('an inner point never moves farther than the contour does (M → %s)', (size) => {
    const base = ring('M');
    const target = ring(size);
    // A triangle hanging off two right-edge corners; its third point roams the piece.
    for (let x = 30; x <= 230; x += 50) {
      for (let y = 60; y <= 660; y += 100) {
        const probe = zoneOf([
          [248.44, 0.43, 1],
          [248.47, 641.89, 1],
          [x, y, 0],
        ]);
        for (const lines of [internals('M', size), null]) {
          const moved = ringsOf(mapFuseSpecToSize(probe, base, target, null, lines))[0][2];
          expect(dist(moved, { x, y })).toBeLessThan(15);
        }
      }
    }
  });

  it.each(sizes)('M → %s → M returns the stored points', (size) => {
    for (const withLines of [true, false]) {
      const there = withLines ? internals('M', size) : null;
      const back = withLines ? internals(size, 'M') : null;
      const shown = mapFuseSpecToSize(stored, ring('M'), ring(size), null, there);
      const written = mapFuseSpecToSize(shown, ring(size), ring('M'), null, back);
      expect(maxDrift(written, stored)).toBeLessThan(0.5);
    }
  });

  it.each(sizes)('a zone drawn on %s survives the write to M and back', (size) => {
    // A free rectangle and a strip edited on screen, the editor writes it to the base size and
    // the sheet draws it on the shown size again.
    const target = ring(size);
    const drawn = zoneOf(
      [
        [60, 400, 1],
        [150, 400, 1],
        [150, 440, 1],
        [60, 440, 1],
      ],
      [
        [
          [205, 300, 0],
          ...corners(target)
            .slice(0, 2)
            .map(({ x, y }) => [x, y, 1]),
        ],
      ],
    );
    for (const withLines of [true, false]) {
      const written = mapFuseSpecToSize(
        drawn,
        target,
        ring('M'),
        null,
        withLines ? internals(size, 'M') : null,
      );
      const back = mapFuseSpecToSize(
        written,
        ring('M'),
        target,
        null,
        withLines ? internals('M', size) : null,
      );
      expect(maxDrift(back, drawn)).toBeLessThan(2);
    }
  });

  it.each([
    [0, 0],
    [17, 0],
    [0, 90],
    [150, 33],
  ])(
    'does not depend on where the rings start (XL from %i, M from %i)',
    (targetStart, baseStart) => {
      const reference = mapFuseSpecToSize(
        stored,
        ring('M'),
        ring('XL'),
        null,
        internals('M', 'XL'),
      );
      const rotated = mapFuseSpecToSize(
        stored,
        rotate(ring('M'), baseStart),
        rotate(ring('XL'), targetStart),
        null,
        internals('M', 'XL'),
      );
      expect(maxDrift(rotated, reference)).toBeLessThan(0.01);
    },
  );
});

describe('fusingInternalLines', () => {
  it('keeps the internal lines in mm and leaves out both outlines', () => {
    const square = (side: number) => [
      { x: 0, y: 0 },
      { x: side, y: 0 },
      { x: side, y: side },
      { x: 0, y: side },
    ];
    const piece: PieceDTO = {
      id: 1,
      name: 'P',
      source: 'main.dxf',
      layer: '14',
      poly: square(30),
      bboxW: 30,
      bboxH: 30,
      areaCm2: 900,
      inner: [
        // The cut line around the sewing-line contour: an outline, not an internal line.
        { layer: '1', closed: true, pts: square(31) },
        { layer: '14', closed: false, pts: square(20) },
        { layer: '8', closed: true, pts: square(2) },
        { layer: '7', closed: false, pts: [{ x: 1, y: 2 }] },
        {
          layer: '7',
          closed: false,
          pts: [
            { x: 1, y: 2 },
            { x: 1, y: 12 },
          ],
        },
      ],
    };
    expect(fusingInternalLines(piece, null)).toEqual([
      { layer: '8', closed: true, points: square(20) },
      {
        layer: '7',
        closed: false,
        points: [
          { x: 10, y: 20 },
          { x: 10, y: 120 },
        ],
      },
    ]);
  });
});
