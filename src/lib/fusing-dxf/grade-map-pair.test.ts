import { describe, expect, it } from 'vitest';
import type { PtMm } from 'lib/pattern-import/types';
import { mapFuseSpecToSize, type FuseInternalLine, type FusingSourcePiece } from './dxf';
import { chooseBaseSize } from './grade-map-base';
import { attachGradeMapsSync } from './grade-map-job';
import { gradeMapGiven, type GradeMapPair, type PieceGradeMap } from './grade-map-pair';
import { pathOf, pointAt, project } from 'lib/grade-map/geom';
import { clearGradeMapCache } from './grade-map-source';
import { blankFuse, type FuseSpline, type PieceFuseSpec } from './types';

// A synthetic front panel: corners, a curved armhole, two notches on the cut, an internal line the
// zones lean on. Size 1 is the base; the other sizes are exact transforms of it.
const P = (x: number, y: number): PtMm => ({ x, y });

function armhole(): PtMm[] {
  const out: PtMm[] = [];
  const [c, k, d] = [P(330, 250), P(300, 330), P(150, 330)];
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    out.push(
      P(
        (1 - t) ** 2 * c.x + 2 * (1 - t) * t * k.x + t * t * d.x,
        (1 - t) ** 2 * c.y + 2 * (1 - t) * t * k.y + t * t * d.y,
      ),
    );
  }
  return out;
}

const CUT = [P(0, 0), P(150, 0), P(300, 0), P(330, 250), ...armhole(), P(150, 330), P(0, 280), P(0, 140)];
const LINES: FuseInternalLine[] = [
  { layer: '4', closed: false, points: [P(150, 0), P(150, 5)] },
  { layer: '4', closed: false, points: [P(0, 140), P(5, 140)] },
  { layer: '8', closed: false, points: [P(220, 50), P(220, 250)] },
];

type Affine = (p: PtMm) => PtMm;
const SHIFT: Affine = (p) => P(p.x + 7.25, p.y - 4.5);
const SCALE: Affine = (p) => P(1.05 * p.x, 1.05 * p.y);

type Size = { id: number; outline: PtMm[]; internals: FuseInternalLine[] };
const sizeOf = (id: number, f: Affine, rotate = 0, extra: FuseInternalLine[] = []): Size => {
  const cut = CUT.map(f);
  return {
    id,
    outline: [...cut.slice(rotate), ...cut.slice(0, rotate)],
    internals: [...LINES.map((l) => ({ ...l, points: l.points.map(f) })), ...extra],
  };
};

const spline = (points: PtMm[], more: Partial<FuseSpline> = {}): FuseSpline => ({
  points: points.map((p) => ({ ...p, corner: true })),
  ...more,
});
const zoneSpec = (ring: FuseSpline): PieceFuseSpec => ({
  ...blankFuse('zone'),
  zone: { spline: ring, holes: [], islands: [] },
});

// A band on the bottom edge (points on the cut), a free patch that grows, a patch on the line.
const BAND = zoneSpec(spline([P(20, 0), P(130, 0), P(130, 40), P(20, 40)]));
const GROW = zoneSpec(
  spline([P(80, 180), P(120, 180), P(120, 220), P(80, 220)], { gradeMode: 'grow' }),
);
const ON_LINE = zoneSpec(
  spline([P(205, 130), P(235, 130), P(235, 170), P(205, 170)], {
    gradeMode: 'follow_line',
    anchor: P(220, 150),
  }),
);

function pieceOf(sizes: Size[], fuse: PieceFuseSpec = BAND): FusingSourcePiece {
  return {
    identity: 'FRONT',
    displayName: 'FRONT',
    piecesPerGarment: 1,
    ungraded: false,
    fuse,
    sizes: sizes.map((s, rank) => ({
      sizeToken: `S${s.id}`,
      sizeId: s.id,
      rank,
      outline: s.outline,
      internals: s.internals,
    })),
  };
}

function mapOf(sizes: Size[]): PieceGradeMap {
  clearGradeMapCache();
  const { pieces } = attachGradeMapsSync([pieceOf(sizes)], sizes[0].id, 'test');
  const map = pieces[0].gradeMap;
  if (!map) throw new Error('no grade map built');
  return map;
}

function carry(spec: PieceFuseSpec, from: Size, to: Size, map: PieceGradeMap | null) {
  const reasons: string[][] = [];
  const pair: GradeMapPair | null = map
    ? { map, from: from.id, to: to.id, approximate: (r) => reasons.push(r) }
    : null;
  const out = mapFuseSpecToSize(
    spec,
    from.outline,
    to.outline,
    null,
    { base: from.internals, target: to.internals },
    undefined,
    pair,
  );
  return { out, reasons };
}

function pointsOf(spec: PieceFuseSpec): PtMm[] {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return spec.zone.spline.points.map(({ x, y }) => ({ x, y }));
}

const worst = (a: PtMm[], b: PtMm[]) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

describe('zone carry with a grade map', () => {
  const base = sizeOf(1, (p) => p);
  const shifted = sizeOf(2, SHIFT);
  const scaled = sizeOf(3, SCALE);
  const map = mapOf([base, shifted, scaled]);

  it.each([
    ['band on the cut', BAND],
    ['grow', GROW],
    ['follow_line', ON_LINE],
  ])('a shifted size carries the %s zone by the shift exactly', (_, spec) => {
    const { out, reasons } = carry(spec, base, shifted, map);
    expect(worst(pointsOf(out), pointsOf(spec).map(SHIFT))).toBeLessThan(1e-3);
    expect(reasons).toEqual([]);
  });

  it('a scaled size: the contour nodes and line pairs the map hands in land on the scaled spots', () => {
    const given = gradeMapGiven(
      { map, from: base.id, to: scaled.id },
      BAND,
      base.outline,
      scaled.outline,
      { base: base.internals, target: scaled.internals },
    );
    expect(given).toBeTruthy();
    const nodes = given!.contour!(base.outline, scaled.outline, true)!;
    const [from, to] = [pathOf(base.outline, true)!, pathOf(scaled.outline, true)!];
    const want = nodes.s.map((s) => SCALE(pointAt(from, s)));
    const got = nodes.t.map((t) => pointAt(to, t));
    expect(nodes.s.length).toBeGreaterThanOrEqual(4);
    expect(worst(got, want)).toBeLessThan(0.02);
    // The three corners (and not the notches) end the contour's stretches.
    expect(nodes.breaks.filter(Boolean)).toHaveLength(3);
    const pairs = given!.lines!(base.internals, scaled.internals, () => [], true);
    const line = pairs.find(([a]) => a.every((p) => Math.abs(p.x - 220) < 1e-6));
    expect(line).toBeTruthy();
    expect(worst(line![1], line![0].map(SCALE))).toBeLessThan(0.02);
  });

  it('a scaled size keeps the band on the scaled cut (the carrier keeps its mm from the corner)', () => {
    const { out, reasons } = carry(BAND, base, scaled, map);
    const cut = pathOf(scaled.outline, true)!;
    for (const p of pointsOf(out).slice(0, 2)) expect(project(cut, p).d).toBeLessThan(0.02);
    // 20 mm from the corner on the base, 20 mm from it on the scaled size.
    expect(pointsOf(out)[0].x).toBeCloseTo(20, 1);
    expect(reasons).toEqual([]);
  });

  it('a grow zone in a scaled size follows the scale', () => {
    const { out } = carry(GROW, base, scaled, map);
    expect(worst(pointsOf(out), pointsOf(GROW).map(SCALE))).toBeLessThan(0.5);
  });

  it('the way back (the pair swapped) returns the zone within 0.5 mm', () => {
    for (const spec of [BAND, GROW, ON_LINE]) {
      const there = carry(spec, base, scaled, map).out;
      const back = carry(there, scaled, base, map).out;
      expect(worst(pointsOf(back), pointsOf(spec))).toBeLessThan(0.5);
    }
  });

  it('without a map the carry is the same as before (no pair, no flag)', () => {
    for (const spec of [BAND, GROW, ON_LINE]) {
      const plain = mapFuseSpecToSize(spec, base.outline, scaled.outline, null, {
        base: base.internals,
        target: scaled.internals,
      });
      expect(carry(spec, base, scaled, null).out).toEqual(plain);
    }
  });

  it('the base size against itself takes no pair', () => {
    const { out, reasons } = carry(BAND, base, base, map);
    expect(worst(pointsOf(out), pointsOf(BAND))).toBeLessThan(1e-9);
    expect(reasons).toEqual([]);
  });
});

describe('a ring started at another vertex', () => {
  it.each([7, 19, 30])('gives the same zone (target ring from vertex %i)', (start) => {
    const base = sizeOf(1, (p) => p);
    const plain = sizeOf(3, SCALE);
    const turned = sizeOf(3, SCALE, start);
    const a = carry(BAND, base, plain, mapOf([base, plain])).out;
    const b = carry(BAND, base, turned, mapOf([base, turned])).out;
    expect(worst(pointsOf(a), pointsOf(b))).toBeLessThan(1e-6);
    const c = carry(ON_LINE, base, plain, mapOf([base, plain])).out;
    const d = carry(ON_LINE, base, turned, mapOf([base, turned])).out;
    expect(worst(pointsOf(c), pointsOf(d))).toBeLessThan(1e-6);
  });
});

describe('a shift off the 0.01 mm grid', () => {
  // An L with an inner corner; the map stores 0.01 mm steps, so its corners land a few µm off the
  // shifted ring's vertices (here 4 µm past the inner corner). A patch tucked 1 mm into the inner
  // corner leans on both stretches' ends: read off the corner, it went 28 mm astray.
  const L = [P(0, 0), P(300, 0), P(300, 150), P(150, 150), P(150, 300), P(0, 300)];
  const OFF: Affine = (p) => P(p.x + 7.254, p.y - 4.504);
  const base: Size = { id: 1, outline: L, internals: [] };
  const off: Size = { id: 2, outline: L.map(OFF), internals: [] };
  const TUCKED = zoneSpec(spline([P(120, 120), P(149, 120), P(149, 149), P(120, 149)]));

  it('still carries a zone in the inner corner by the shift', () => {
    const { out, reasons } = carry(TUCKED, base, off, mapOf([base, off]));
    expect(worst(pointsOf(out), pointsOf(TUCKED).map(OFF))).toBeLessThan(0.02);
    expect(reasons).toEqual([]);
  });
});

describe('a refused internal line', () => {
  // Size 3 draws the line twice, 0.5 mm either side: the map cannot tell which one it is.
  const twin = (dx: number): FuseInternalLine => ({
    layer: '8',
    closed: false,
    points: [P(220, 50), P(220, 250)].map(SCALE).map((p) => P(p.x + dx, p.y)),
  });
  const base = sizeOf(1, (p) => p);
  const shifted = sizeOf(2, SHIFT);
  const doubled: Size = {
    ...sizeOf(3, SCALE),
    internals: [...LINES.slice(0, 2).map((l) => ({ ...l, points: l.points.map(SCALE) })), twin(-0.5), twin(0.5)],
  };
  const map = mapOf([base, shifted, doubled]);

  it('the map refuses the line in that size only', () => {
    const line = map.piece.tracks.find((t) => t.kind === 'internal')!;
    expect(line.sizes.find((s) => s.sizeId === 3)?.refused).toMatch(/ambiguous/);
    expect(line.sizes.find((s) => s.sizeId === 2)?.delta).toBeTruthy();
  });

  it('a zone on the line falls back to inference there and the size is flagged', () => {
    const { out, reasons } = carry(ON_LINE, base, doubled, map);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].join('; ')).toMatch(/internal line near the zone: .*ambiguous/);
    for (const p of pointsOf(out)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    // The size whose line the map does carry is not flagged.
    expect(carry(ON_LINE, base, shifted, map).reasons).toEqual([]);
  });

  it('a zone far from the refused line is not flagged', () => {
    expect(carry(BAND, base, doubled, map).reasons).toEqual([]);
  });
});

describe('two marks traced onto one line', () => {
  // A second line 20 mm right of the first; the map is then edited so that line follows the first
  // one into size 3 (as two near-twin marks did on a prod sleeve). Both go to inference, flagged.
  const SECOND: FuseInternalLine = { layer: '8', closed: false, points: [P(240, 50), P(240, 250)] };
  const base = sizeOf(1, (p) => p, 0, [SECOND]);
  const scaled = sizeOf(3, SCALE, 0, [{ ...SECOND, points: SECOND.points.map(SCALE) }]);
  const clean = mapOf([base, scaled]);
  const at = (x: number) =>
    clean.piece.tracks.findIndex((t) => t.kind === 'internal' && t.layer === '8' && t.base[0][0] === x * 100);
  const first = clean.piece.tracks[at(220)];
  const second = clean.piece.tracks[at(240)];
  const onto = first.sizes.find((s) => s.sizeId === 3)!.delta!;
  const edited: PieceGradeMap = {
    ...clean,
    key: `${clean.key}|edited`,
    piece: {
      ...clean.piece,
      tracks: clean.piece.tracks.map((t) =>
        t !== second
          ? t
          : {
              ...t,
              sizes: t.sizes.map((s) =>
                s.sizeId !== 3
                  ? s
                  : {
                      ...s,
                      delta: t.base.map(([x, y], j): [number, number] => [
                        first.base[j][0] + onto[j][0] - x,
                        first.base[j][1] + onto[j][1] - y,
                      ]),
                    },
              ),
            },
      ),
    },
  };

  it('the clean map pairs both lines and flags nothing', () => {
    expect(at(220)).toBeGreaterThan(-1);
    expect(at(240)).toBeGreaterThan(-1);
    expect(carry(ON_LINE, base, scaled, clean).reasons).toEqual([]);
  });

  it('the edited map hands in neither line and says why', () => {
    const reasons: string[] = [];
    const given = gradeMapGiven(
      { map: edited, from: 1, to: 3, approximate: (r) => reasons.push(...r) },
      ON_LINE,
      base.outline,
      scaled.outline,
      { base: base.internals, target: scaled.internals },
    )!;
    const own = given.lines!(base.internals, scaled.internals, () => [], true);
    expect(own.some(([from]) => from.every((p) => Math.abs(p.x - 220) < 1e-6 || Math.abs(p.x - 240) < 1e-6))).toBe(false);
    expect(reasons.join('; ')).toMatch(/internal line near the zone: another mark is traced onto the same line/);
    const { out } = carry(ON_LINE, base, scaled, edited);
    for (const p of pointsOf(out)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('carried back, the two tracks sharing one line are refused too', () => {
    const reasons: string[] = [];
    const given = gradeMapGiven(
      { map: edited, from: 3, to: 1, approximate: (r) => reasons.push(...r) },
      ON_LINE,
      scaled.outline,
      base.outline,
      { base: scaled.internals, target: base.internals },
    )!;
    const own = given.lines!(scaled.internals, base.internals, () => [], true);
    expect(own.some(([, to]) => to.every((p) => Math.abs(p.x - 220) < 1e-6 || Math.abs(p.x - 240) < 1e-6))).toBe(false);
    expect(reasons.join('; ')).toMatch(/another mark is traced onto the same line/);
  });
});

describe('an inferred line ending on a traced line', () => {
  const base = sizeOf(1, (p) => p);
  const scaled = sizeOf(3, SCALE);
  const map = mapOf([base, scaled]);
  const given = gradeMapGiven({ map, from: 1, to: 3 }, ON_LINE, base.outline, scaled.outline, {
    base: base.internals,
    target: scaled.internals,
  })!;
  // A stub from the traced line (x 220) to the right: its end on the line is where the map says,
  // or 1 mm off.
  const stub = (dy: number): [PtMm[], PtMm[], boolean] => [
    [P(220, 150), P(260, 150)],
    [P(231, 157.5 + dy), P(273, 157.5 + dy)],
    false,
  ];

  it('is kept where it agrees with the map at the shared point', () => {
    const pairs = given.lines!(base.internals, scaled.internals, () => [stub(0)], true);
    expect(pairs.some(([from]) => from[0].x === 220 && from[1].x === 260)).toBe(true);
  });

  it('is dropped where it sends the shared point elsewhere', () => {
    const pairs = given.lines!(base.internals, scaled.internals, () => [stub(1)], true);
    expect(pairs.some(([from]) => from[0].x === 220 && from[1].x === 260)).toBe(false);
  });
});

describe('the base size', () => {
  const sizes = [
    { id: 4, rank: 2 },
    { id: 2, rank: 0 },
    { id: 3, rank: 0 },
  ];
  it('is the preferred size when the piece has it', () => {
    expect(chooseBaseSize(sizes, (s) => s.id === 4, (s) => s.rank)?.id).toBe(4);
  });
  it('else the smallest rank, ties to the earlier size', () => {
    expect(chooseBaseSize(sizes, (s) => s.id === 9, (s) => s.rank)?.id).toBe(2);
  });
  it('by list order when the rank is the index (the piece editor)', () => {
    expect(chooseBaseSize(sizes, () => false, (_, i) => i)?.id).toBe(4);
  });
});

describe('the map cache', () => {
  it('builds a piece once per key', () => {
    clearGradeMapCache();
    const sizes = [sizeOf(1, (p) => p), sizeOf(2, SHIFT)];
    const first = attachGradeMapsSync([pieceOf(sizes)], 1, 'f');
    const second = attachGradeMapsSync([pieceOf(sizes)], 1, 'f');
    expect(first.stats).toMatchObject({ eligible: 1, built: 1, cached: 0 });
    expect(second.stats).toMatchObject({ eligible: 1, built: 0, cached: 1 });
    expect(second.pieces[0].gradeMap).toBe(first.pieces[0].gradeMap);
    // A strip piece, or one with one size, reads no map and comes back as it was.
    const strip = { ...pieceOf(sizes), fuse: blankFuse('strip') };
    const single = pieceOf(sizes.slice(0, 1));
    const out = attachGradeMapsSync([strip, single], 1, 'f');
    expect(out.pieces[0]).toBe(strip);
    expect(out.pieces[1]).toBe(single);
  });
});
