import type { PtMm } from 'lib/pattern-import/types';
import { describe, expect, it } from 'vitest';
import { mapFuseSpecToSize, type FuseInternalLine, type FuseInternals } from './dxf';
import { pointInRing, signedArea } from './geometry';
import fixture from './p-lin-l-2.fixture.json';
import { projectOnRing } from './spline';
import { blankFuse, type PieceFuseSpec } from './types';
import { matchContours, zoneGrade } from './zone-grade';

// FUSE_MEASURE=1 prints the measured maxima the thresholds below guard.
const measured = (label: string, value: number) => {
  if (import.meta.env.FUSE_MEASURE) console.info(`[measure] ${label}: ${value.toFixed(4)} mm`);
  return value;
};

const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const rotate = <T>(points: T[], k: number) => [...points.slice(k), ...points.slice(0, k)];
type Move = (p: PtMm) => PtMm;

// A piece with four corners and one curved side (no symmetry), piece-local mm.
const curve = Array.from({ length: 19 }, (_, k) => {
  const t = (k + 1) / 20;
  // Quadratic curve (200,120) → (120,300), bulging towards (205, 250).
  return {
    x: (1 - t) ** 2 * 200 + 2 * t * (1 - t) * 205 + t ** 2 * 120,
    y: (1 - t) ** 2 * 120 + 2 * t * (1 - t) * 250 + t ** 2 * 300,
  };
});
const piece: PtMm[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 120 },
  ...curve,
  { x: 120, y: 300 },
  { x: 0, y: 300 },
];
const bent: FuseInternalLine = {
  layer: '8',
  closed: false,
  points: [
    { x: 40, y: 60 },
    { x: 80, y: 100 },
    { x: 80, y: 200 },
  ],
};
const box: FuseInternalLine = {
  layer: '8',
  closed: true,
  points: [
    { x: 100, y: 40 },
    { x: 160, y: 40 },
    { x: 160, y: 60 },
    { x: 100, y: 60 },
  ],
};
const straight: FuseInternalLine = {
  layer: '4',
  closed: false,
  points: [
    { x: 20, y: 250 },
    { x: 100, y: 250 },
  ],
};
const pieceLines = [bent, box, straight];
const moveLine = (line: FuseInternalLine, move: Move): FuseInternalLine => ({
  ...line,
  points: line.points.map(move),
});
const internalsBy = (move: Move): FuseInternals => ({
  base: pieceLines,
  target: pieceLines.map((line) => moveLine(line, move)),
});

/** Interior probes: a grid over the piece, at least `off` mm from its contour. */
const probes = (ring: PtMm[], off: number, step = 17): PtMm[] => {
  const out: PtMm[] = [];
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += step)
    for (let y = Math.min(...ys) + 3; y < Math.max(...ys); y += step) {
      const p = { x, y };
      if (pointInRing(p, ring) && projectOnRing(p, ring).d >= off) out.push(p);
    }
  return out;
};

const spline = (points: number[][]) => ({
  points: points.map(([x, y, corner]) => ({ x, y, corner: corner !== 0 })),
});
const zoneOf = (
  outer: number[][],
  islands: number[][][] = [],
  holes: number[][][] = [],
): PieceFuseSpec => ({
  ...blankFuse('zone'),
  zone: { spline: spline(outer), holes: holes.map(spline), islands: islands.map(spline) },
});
const splineZone = (spec: PieceFuseSpec) => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return spec.zone;
};
const outerOf = (spec: PieceFuseSpec) => splineZone(spec).spline.points;

describe('grade field: exact where the grade is simple', () => {
  const shift: Move = (p) => ({ x: p.x + 7.3, y: p.y - 4.1 });
  const scale: Move = (p) => ({ x: p.x * 1.08, y: p.y * 1.05 });

  it.each([
    ['with internal lines', true],
    ['contour only', false],
  ])('a pure translation is reproduced everywhere (%s)', (_label, withLines) => {
    const target = piece.map(shift);
    const grade = zoneGrade(piece, target, withLines ? internalsBy(shift) : null);
    const inner = Math.max(...probes(piece, 0).map((p) => dist(grade.point(p), shift(p))));
    const onContour = Math.max(
      ...[0.1, 0.37, 0.52, 0.81, 0.95].map((f) => {
        const a = piece[Math.floor(f * piece.length)];
        return dist(grade.carry(a), shift(a));
      }),
    );
    expect(measured('translation, interior field', inner)).toBeLessThan(0.1);
    expect(measured('translation, contour carrier', onContour)).toBeLessThan(0.1);
    // Through the mapper: an attached ring (corner, edge, blend band, deep inside) and a detached one.
    const zone = zoneOf(
      [
        [0, 0],
        [200, 0],
        [196, 60, 0],
        [120, 150, 0],
        [0, 300],
      ],
      [
        [
          [30, 220],
          [110, 220],
          [110, 280],
          [30, 280],
        ],
      ],
    );
    const mapped = splineZone(
      mapFuseSpecToSize(zone, piece, target, null, withLines ? internalsBy(shift) : null),
    );
    const source = splineZone(zone);
    const worst = Math.max(
      ...[mapped.spline, ...mapped.islands].flatMap((ring, r) =>
        ring.points.map((p, i) => dist(p, shift([source.spline, ...source.islands][r].points[i]))),
      ),
    );
    expect(measured('translation, mapped zone', worst)).toBeLessThan(0.1);
  });

  it.each([
    ['with internal lines', true],
    ['contour only', false],
  ])('a pure axis scale of the whole piece is reproduced inside it (%s)', (_label, withLines) => {
    const target = piece.map(scale);
    const lines = withLines ? internalsBy(scale) : null;
    const grade = zoneGrade(piece, target, lines);
    const inner = Math.max(...probes(piece, 0).map((p) => dist(grade.point(p), scale(p))));
    expect(measured('axis scale, interior field', inner)).toBeLessThan(0.1);
    // The contour correspondence itself: every base vertex lands on its scaled twin.
    const match = matchContours(piece, target)!;
    expect(match.cornered).toBe(true);
    const zone = zoneOf([
      [0, 0],
      [200, 0],
      [120, 150, 0],
      [60, 140, 0],
      [0, 300],
    ]);
    const mapped = outerOf(mapFuseSpecToSize(zone, piece, target, null, lines));
    // Contour only, a point near an edge keeps its mm off it instead of scaling: only the points
    // on the contour are the scale's. With the lines, the inner points ride them.
    const worst = Math.max(
      ...outerOf(zone)
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => withLines || projectOnRing(p, piece).d < 0.01)
        .map(({ p, i }) => dist(mapped[i], scale(p))),
    );
    expect(measured('axis scale, mapped zone', worst)).toBeLessThan(0.1);
  });

  it('a 2× stretch moves an inner point by the full 20 mm, not 17', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ];
    const double: Move = (p) => ({ x: p.x * 2, y: p.y });
    const moved = zoneGrade(square, square.map(double)).point({ x: 20, y: 30 });
    expect(Math.abs(moved.x - 40)).toBeLessThan(0.1);
    expect(Math.abs(moved.y - 30)).toBeLessThan(0.1);
  });
});

describe('grade field: contours that are hard to match', () => {
  const ellipse = (n: number, start: number, rx: number, ry: number, cx = 0, cy = 0) =>
    Array.from({ length: n }, (_, k) => {
      const a = (2 * Math.PI * (k + start)) / n;
      return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    });

  it('a rounded contour with no corners still carries a scale exactly', () => {
    // Other vertex count, other start vertex, other winding.
    const base = ellipse(180, 0, 120, 80, 150, 100);
    const target = ellipse(233, 41.5, 132, 84, 165, 105).reverse();
    const grow: Move = (p) => ({ x: p.x * 1.1, y: p.y * 1.05 });
    const match = matchContours(base, target)!;
    expect(match.cornered).toBe(false);
    const grade = zoneGrade(base, target);
    const inner = Math.max(...probes(base, 0).map((p) => dist(grade.point(p), grow(p))));
    expect(measured('rounded contour, interior field', inner)).toBeLessThan(0.1);
    const edge = Math.max(
      ...base.filter((_, i) => i % 9 === 0).map((p) => dist(grade.carry(p), grow(p))),
    );
    expect(measured('rounded contour, contour carrier', edge)).toBeLessThan(0.1);
  });

  it('false single-vertex kinks of a noisy tessellation are not corners', () => {
    const grow: Move = (p) => ({ x: p.x * 1.06 + 3, y: p.y * 1.04 });
    const clean = piece.map(grow);
    // 0.03 mm teeth: each turns the contour by > 35° at one vertex.
    const teeth = (ring: PtMm[], at: number, along: PtMm): PtMm[] => [
      ...ring.slice(0, at),
      { x: ring[at - 1].x + along.x * 50, y: ring[at - 1].y + along.y * 50 },
      {
        x: ring[at - 1].x + along.x * 50.02 - along.y * 0.03,
        y: ring[at - 1].y + along.y * 50.02 + along.x * 0.03,
      },
      { x: ring[at - 1].x + along.x * 50.04, y: ring[at - 1].y + along.y * 50.04 },
      ...ring.slice(at),
    ];
    const noisyTarget = teeth(clean, 1, { x: 1, y: 0 });
    const noisyBase = teeth(piece, 2, { x: 0, y: 1 });
    const zone = zoneOf([
      [0, 0],
      [200, 0],
      [200, 120],
      [120, 150, 0],
      [0, 300],
    ]);
    const want = outerOf(mapFuseSpecToSize(zone, piece, clean, null, internalsBy(grow)));
    const got = outerOf(mapFuseSpecToSize(zone, noisyBase, noisyTarget, null, internalsBy(grow)));
    expect(matchContours(noisyBase, noisyTarget)!.cornered).toBe(true);
    const worst = Math.max(...want.map((p, i) => dist(p, got[i])));
    expect(measured('noisy tessellation vs clean', worst)).toBeLessThan(0.1);
  });

  it('the result does not depend on where either ring starts, or on its winding', () => {
    const grow: Move = (p) => ({ x: p.x * 1.07, y: p.y * 1.03 + 2 });
    const target = piece.map(grow);
    const zone = zoneOf([
      [0, 0],
      [200, 0],
      [195, 80, 0],
      [120, 150, 0],
      [0, 300],
    ]);
    const want = outerOf(mapFuseSpecToSize(zone, piece, target, null, internalsBy(grow)));
    for (const [b, t, flip] of [
      [7, 0, false],
      [0, 13, false],
      [11, 20, true],
    ] as const) {
      const turned = rotate(target, t);
      const got = outerOf(
        mapFuseSpecToSize(
          zone,
          rotate(piece, b),
          flip ? [...turned].reverse() : turned,
          null,
          internalsBy(grow),
        ),
      );
      expect(Math.max(...want.map((p, i) => dist(p, got[i])))).toBeLessThan(0.01);
    }
  });
});

describe('grade field: internal lines paired by geometry', () => {
  // The contour grows; the box does not move at all, the bent line moves 6 mm sideways.
  const grow: Move = (p) => ({ x: p.x * 1.06, y: p.y * 1.04 });
  const target = piece.map(grow);
  const slide: Move = (p) => ({ x: p.x + 6, y: p.y });
  const targetLines = [moveLine(bent, slide), box, moveLine(straight, grow)];
  const zone = zoneOf([
    [0, 0],
    [200, 0],
    [130, 50, 0],
    [80, 150, 0],
    [60, 80, 0],
    [0, 300],
  ]);
  const reference = outerOf(
    mapFuseSpecToSize(zone, piece, target, null, { base: pieceLines, target: targetLines }),
  );

  it('a point on a bent line moves exactly with it; one inside the box stays with the box', () => {
    // (80,150) lies on the bent line, (130,50) inside the ungraded box, (60,80) on its slanted leg.
    expect(dist(reference[3], { x: 86, y: 150 })).toBeLessThan(1e-6);
    expect(dist(reference[4], { x: 66, y: 80 })).toBeLessThan(1e-6);
    expect(dist(reference[2], { x: 130, y: 50 })).toBeLessThan(0.5);
  });

  it('swapped file order, reversed direction and other vertex counts change nothing', () => {
    const reversed = { ...targetLines[0], points: [...targetLines[0].points].reverse() };
    // The same box started at another corner, wound the other way, with a vertex mid-side.
    const reboxed = {
      ...box,
      points: [
        { x: 160, y: 60 },
        { x: 160, y: 40 },
        { x: 130, y: 40 },
        { x: 100, y: 40 },
        { x: 100, y: 60 },
      ],
    };
    const denser = {
      ...targetLines[0],
      points: [...reversed.points.slice(0, 1), { x: 86, y: 160 }, ...reversed.points.slice(1)],
    };
    for (const lines of [
      [targetLines[2], reboxed, reversed],
      [reboxed, denser, targetLines[2]],
    ]) {
      const got = outerOf(
        mapFuseSpecToSize(zone, piece, target, null, { base: pieceLines, target: lines }),
      );
      const worst = Math.max(...reference.map((p, i) => dist(p, got[i])));
      expect(measured('lines reordered / reversed / resampled', worst)).toBeLessThan(0.01);
    }
  });

  it('an ambiguous line is left out alone: the rest of its layer still leads', () => {
    // Two target candidates for the bent line, 0.6 mm apart: neither is taken; the box still is.
    const rival = moveLine(bent, (p) => ({ x: p.x + 6.6, y: p.y }));
    const got = outerOf(
      mapFuseSpecToSize(zone, piece, target, null, {
        base: pieceLines,
        target: [...targetLines, rival],
      }),
    );
    expect(dist(got[2], { x: 130, y: 50 })).toBeLessThan(0.5);
    const contourOnly = outerOf(mapFuseSpecToSize(zone, piece, target, null));
    // Without its line the point on it is carried by the contour and the box, not by a guess.
    expect(dist(got[3], { x: 86, y: 150 })).toBeGreaterThan(1);
    expect(dist(got[3], contourOnly[3])).toBeLessThan(4);
  });

  it('lines that contradict each other do not fold a ring over', () => {
    // A second box 4 mm beside the first, moved 12 mm towards it: no continuous map does both.
    const second: FuseInternalLine = {
      layer: '8',
      closed: true,
      points: [
        { x: 164, y: 40 },
        { x: 190, y: 40 },
        { x: 190, y: 60 },
        { x: 164, y: 60 },
      ],
    };
    const lines: FuseInternals = {
      base: [...pieceLines, second],
      target: [...targetLines, moveLine(second, (p) => ({ x: p.x - 12, y: p.y }))],
    };
    const across = zoneOf([
      [200, 0],
      [200, 120],
      [150, 70, 0],
      [158, 50, 0],
      [166, 50, 0],
      [150, 30, 0],
    ]);
    const before = outerOf(across);
    const after = outerOf(mapFuseSpecToSize(across, piece, target, null, lines));
    expect(Math.sign(signedArea(after))).toBe(Math.sign(signedArea(before)));
    // The two points that straddled the gap keep their order.
    expect(after[4].x).toBeGreaterThan(after[3].x);
  });
});

describe('rigid or pointwise: no flip at the contour', () => {
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
  const sizes: Size[] = ['S', 'L', 'XL'];

  it.each(sizes)('a point leaving the contour does not jump (M → %s)', (size) => {
    const base = ring('M');
    const grade = zoneGrade(base, ring(size), internals('M', size));
    // Triangles on the top and bottom corners, their chord ~110 mm in from the right edge; the third
    // point on the right edge steps across ZONE_ON_CONTOUR_MM and across RIGID_AT_MM.
    let worst = 0;
    for (let y = 60; y <= 600; y += 45) {
      const edge = projectOnRing({ x: 400, y }, base).p;
      const inward = { x: -1, y: 0 };
      const at = (off: number) => {
        const zone = zoneOf([
          [138.57, 1.78],
          [edge.x + inward.x * off, edge.y + inward.y * off, 0],
          [138, 745.85],
        ]);
        return outerOf(mapFuseSpecToSize(zone, base, ring(size), null, internals('M', size)))[1];
      };
      worst = Math.max(worst, dist(at(0.499), at(0.501)), dist(at(9.99), at(10.01)));
    }
    expect(measured(`seam at the contour, M → ${size}`, worst)).toBeLessThan(0.05);
    expect(grade.match?.cornered).toBe(true);
  });

  it.each(sizes)('a patch 0.4 or 0.6 mm from the contour is the same patch (M → %s)', (size) => {
    const base = ring('M');
    const left = projectOnRing({ x: -100, y: 400 }, base).p;
    const patch = (off: number) =>
      zoneOf([
        [left.x + off, 400],
        [left.x + off + 60, 400],
        [left.x + off + 60, 440],
        [left.x + off, 440],
      ]);
    const at = (off: number) =>
      outerOf(mapFuseSpecToSize(patch(off), base, ring(size), null, internals('M', size)));
    const near = at(0.4);
    const far = at(0.6);
    const worst = Math.max(...near.map((p, i) => Math.hypot(far[i].x - 0.2 - p.x, far[i].y - p.y)));
    expect(measured(`rigid / pointwise switch, M → ${size}`, worst)).toBeLessThan(0.2);
  });

  it('a ring well inside moves whole; a hole follows the ring it sits in', () => {
    const base = ring('M');
    const zone = zoneOf(
      [
        [170, 470],
        [220, 470],
        [220, 530],
        [170, 530],
      ],
      [],
      [
        [
          [180, 485],
          [205, 485],
          [205, 515],
          [180, 515],
        ],
      ],
    );
    const mapped = splineZone(
      mapFuseSpecToSize(zone, base, ring('XL'), null, internals('M', 'XL')),
    );
    const source = splineZone(zone);
    const by = {
      x: mapped.spline.points[0].x - source.spline.points[0].x,
      y: mapped.spline.points[0].y - source.spline.points[0].y,
    };
    for (const [from, to] of [
      [source.spline, mapped.spline],
      [source.holes[0], mapped.holes[0]],
    ])
      from.points.forEach((p, i) =>
        expect(dist(to.points[i], { x: p.x + by.x, y: p.y + by.y })).toBeLessThan(1e-9),
      );
  });

  it.each(sizes)('a rect round the pocket stays that rect on %s', (size) => {
    const spec: PieceFuseSpec = {
      ...blankFuse('zone'),
      zone: { rect: [34.2, 278.2, 195.4, 307.6] },
    };
    const mapped = mapFuseSpecToSize(spec, ring('M'), ring(size), null, internals('M', size));
    if (!mapped.zone || !('rect' in mapped.zone)) throw new Error('expected a rect zone');
    const worst = Math.max(
      ...mapped.zone.rect.map((v, i) => Math.abs(v - [34.2, 278.2, 195.4, 307.6][i])),
    );
    expect(measured(`pocket rect, M → ${size}`, worst)).toBeLessThan(0.5);
  });

  it('a rect in the piece corner keeps the corner and its mm off the sides', () => {
    const square = (w: number, h: number) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    const spec: PieceFuseSpec = { ...blankFuse('zone'), zone: { rect: [0, 0, 30, 21] } };
    const mapped = mapFuseSpecToSize(spec, square(80, 60), square(120, 80));
    // 80×60 → 120×80. (0,0) is the corner; the sides on the piece's sides stay on them; the far
    // corner sits 30 mm off the left side and 50 off the right, so it shares their grade: between
    // keeping its mm off the left and top (30,21) and the plain scale (45,28). Still square: a rect.
    if (!mapped.zone || !('rect' in mapped.zone)) throw new Error('expected a rect zone');
    const [x0, y0, x1, y1] = mapped.zone.rect;
    expect(Math.hypot(x0, y0)).toBeLessThan(0.01);
    expect(x1).toBeGreaterThan(30);
    expect(x1).toBeLessThan(45);
    expect(y1).toBeGreaterThan(21);
    expect(y1).toBeLessThan(28);
  });

  it.each(sizes)(
    'a band drawn 3 mm inside the edge keeps its margin and width (M → %s)',
    (size) => {
      // A placket band along the right edge: the outer side 3 mm in, the inner side 33 mm in; its
      // ends 40 mm below the top corner and 60 mm above the bottom one.
      const base = ring('M');
      const target = ring(size);
      const inward = (y: number, off: number) => {
        const edge = projectOnRing({ x: 400, y }, base).p;
        return [edge.x - off, edge.y, 0];
      };
      const ys = [40, 160, 300, 440, 580];
      const band = zoneOf([
        ...ys.map((y) => inward(y, 3)),
        ...[...ys].reverse().map((y) => inward(y, 33)),
      ]);
      for (const lines of [internals('M', size), null]) {
        const mapped = outerOf(mapFuseSpecToSize(band, base, target, null, lines));
        const drift = outerOf(band).map((p, i) =>
          Math.abs(projectOnRing(mapped[i], target).d - projectOnRing(p, base).d),
        );
        const outer = Math.max(...drift.slice(0, ys.length));
        const inner = Math.max(...drift.slice(ys.length));
        expect(measured(`band outer side margin, M → ${size}`, outer)).toBeLessThan(0.1);
        // The inner side, 33 mm in, shares a little of the grade with the opposite edge (85 mm
        // away where this piece is narrow) and with an internal line it passes near.
        expect(measured(`band inner side margin, M → ${size}`, inner)).toBeLessThan(1.2);
      }
    },
  );

  it.each(sizes)(
    'a patch 9.9 or 10.1 mm (5.9 or 6.1) from the contour is the same patch (M → %s)',
    (size) => {
      // Across the rigid band RIGID_FROM_MM..RIGID_AT_MM a ring goes from point by point to whole.
      const base = ring('M');
      const left = projectOnRing({ x: -100, y: 400 }, base).p;
      const patch = (off: number) =>
        zoneOf([
          [left.x + off, 400],
          [left.x + off + 60, 400],
          [left.x + off + 60, 440],
          [left.x + off, 440],
        ]);
      const at = (off: number) =>
        outerOf(mapFuseSpecToSize(patch(off), base, ring(size), null, internals('M', size)));
      let worst = 0;
      for (const [a, b] of [
        [5.9, 6.1],
        [9.9, 10.1],
      ]) {
        const near = at(a);
        const far = at(b);
        worst = Math.max(
          worst,
          ...near.map((p, i) => Math.hypot(far[i].x - (b - a) - p.x, far[i].y - p.y)),
        );
      }
      expect(measured(`rigid band edges, M → ${size}`, worst)).toBeLessThan(0.2);
    },
  );

  it.each(sizes)('round trips stay within budget (M ↔ %s)', (size) => {
    const base = ring('M');
    const target = ring(size);
    // Points on the contour, in the blend band, deep inside, on a line; a detached patch.
    const stored = (outline: PtMm[]) => {
      const right = projectOnRing({ x: 400, y: 300 }, outline).p;
      return zoneOf(
        [
          [outline[0].x, outline[0].y],
          [right.x, right.y],
          [right.x - 3, 340, 0],
          [right.x - 30, 380, 0],
          [140, 500, 0],
          [60, 150, 0],
        ],
        [
          [
            [34.2, 283.8],
            [195.4, 278.2],
            [195.4, 307.6],
            [34.2, 303.7],
          ],
        ],
      );
    };
    const drift = (a: PieceFuseSpec, b: PieceFuseSpec) => {
      const pa = [splineZone(a).spline, ...splineZone(a).islands].flatMap((s) => s.points);
      const pb = [splineZone(b).spline, ...splineZone(b).islands].flatMap((s) => s.points);
      return Math.max(...pa.map((p, i) => dist(p, pb[i])));
    };
    const onBase = stored(base);
    const there = mapFuseSpecToSize(onBase, base, target, null, internals('M', size));
    const back = mapFuseSpecToSize(there, target, base, null, internals(size, 'M'));
    expect(measured(`M → ${size} → M`, drift(back, onBase))).toBeLessThan(0.5);
    const onSize = stored(target);
    const written = mapFuseSpecToSize(onSize, target, base, null, internals(size, 'M'));
    const shown = mapFuseSpecToSize(written, base, target, null, internals('M', size));
    expect(measured(`${size} → M → ${size}`, drift(shown, onSize))).toBeLessThan(1);
  });
});
