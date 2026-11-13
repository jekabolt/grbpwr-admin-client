import type { PtMm } from 'lib/pattern-import/types';
import { describe, expect, it } from 'vitest';
import shirt from './bp-shirt-back.fixture.json';
import { mapFuseSpecToSize, type FuseInternalLine, type FuseInternals } from './dxf';
import { edgeRunsOf, pairEdgeRuns, pointOnEdgeRun } from './edge-runs';
import lining from './p-lin-l-2.fixture.json';
import { notchesOnRun } from './strip-ends';
import {
  blankFuse,
  fuseFieldsFromWire,
  fuseFieldsToWire,
  type FuseEdge,
  type FuseSpline,
  type PieceFuseSpec,
} from './types';

// How a ring and a strip end are carried to another size is the owner's choice per ring / per end.
// One test per mode; the default (no mode) is pinned by the older size-map tests.
type Size = keyof typeof lining.rings;
const ring = (pts: number[][]): PtMm[] => pts.map(([x, y]) => ({ x, y }));
const liningRing = (size: Size) => ring(lining.rings[size]);
const liningLines = (size: Size): FuseInternalLine[] =>
  lining.internals[size].map((line) => ({
    layer: line.layer,
    closed: line.closed,
    points: ring(line.points),
  }));
const liningInternals = (from: Size, to: Size): FuseInternals => ({
  base: liningLines(from),
  target: liningLines(to),
});
const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const box = (x0: number, y0: number, x1: number, y1: number): FuseSpline => ({
  points: [
    { x: x0, y: y0, corner: true },
    { x: x1, y: y0, corner: true },
    { x: x1, y: y1, corner: true },
    { x: x0, y: y1, corner: true },
  ],
});
const zone = (spline: FuseSpline, holes: FuseSpline[] = []): PieceFuseSpec => ({
  ...blankFuse('zone'),
  zone: { spline, holes, islands: [] },
});
const outerOf = (spec: PieceFuseSpec) => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return spec.zone;
};
/** Every pairwise distance of a ring: equal lists = the same shape, wherever it lies. */
const shape = (s: FuseSpline) =>
  s.points.flatMap((a, i) => s.points.slice(i + 1).map((b) => dist(a, b)));

const square = ring([
  [0, 0],
  [400, 0],
  [400, 400],
  [0, 400],
]);
const wide = ring([
  [0, 0],
  [600, 0],
  [600, 400],
  [0, 400],
]);

describe('zone ring carry-over modes', () => {
  it('fixed (no mode): a detached patch is the same patch on a bigger size', () => {
    const mapped = outerOf(mapFuseSpecToSize(zone(box(150, 150, 250, 250)), square, wide));
    expect(mapped.spline.gradeMode).toBeUndefined();
    shape(mapped.spline).forEach((d, i) =>
      expect(d).toBeCloseTo(shape(box(150, 150, 250, 250))[i], 3),
    );
  });

  it('grow: the ring grows with the piece, and its hole with it', () => {
    const spec = zone({ ...box(150, 150, 250, 250), gradeMode: 'grow' }, [box(180, 180, 220, 220)]);
    const mapped = outerOf(mapFuseSpecToSize(spec, square, wide));
    expect(mapped.spline.gradeMode).toBe('grow');
    const [a, b, c] = mapped.spline.points;
    expect(dist(a, b)).toBeCloseTo(150, 0); // 100 mm × 600/400
    expect(dist(b, c)).toBeCloseTo(100, 0); // the height did not grade
    const [ha, hb] = mapped.holes[0].points;
    expect(dist(ha, hb)).toBeCloseTo(60, 0);
    // … and back: the stored points return.
    const back = outerOf(mapFuseSpecToSize({ ...spec, zone: mapped }, wide, square));
    back.spline.points.forEach((p, i) =>
      expect(dist(p, outerOf(spec).spline.points[i])).toBeLessThan(0.05),
    );
  });

  it('follow line: the ring travels with its line and keeps its shape', () => {
    // The facing line of the lining piece moves 5 mm per size along x; a patch tied to it goes along.
    const anchor = { x: 248.76, y: 380.71 };
    const patch: FuseSpline = { ...box(150, 420, 230, 470), gradeMode: 'follow_line', anchor };
    const mapped = outerOf(
      mapFuseSpecToSize(
        zone(patch),
        liningRing('M'),
        liningRing('XL'),
        null,
        liningInternals('M', 'XL'),
      ),
    );
    shape(mapped.spline).forEach((d, i) => expect(d).toBeCloseTo(shape(patch)[i], 6));
    expect(mapped.spline.gradeMode).toBe('follow_line');
    // The anchor still sits on the line it names, in the shown size.
    const line = liningLines('XL')[1].points;
    expect(dist(mapped.spline.anchor!, line[line.length - 1])).toBeLessThan(1.5);
    const moved = mapped.spline.points[0];
    expect(Math.hypot(moved.x - 150, moved.y - 420)).toBeGreaterThan(5);
  });

  it('follow line: a line that turns turns the ring', () => {
    const line = (points: number[][]): FuseInternalLine => ({
      layer: '8',
      closed: false,
      points: ring(points),
    });
    const base = line([
      [100, 200],
      [200, 180],
      [300, 200],
    ]);
    // The same bent line, turned 10° about (200, 200) and moved 12 mm right.
    const turn = (10 * Math.PI) / 180;
    const turned = line(
      base.points.map((p) => [
        212 + (p.x - 200) * Math.cos(turn) - (p.y - 200) * Math.sin(turn),
        200 + (p.x - 200) * Math.sin(turn) + (p.y - 200) * Math.cos(turn),
      ]),
    );
    const patch: FuseSpline = {
      ...box(180, 210, 240, 240),
      gradeMode: 'follow_line',
      anchor: { x: 200, y: 180 },
    };
    // The piece grades too: a line never moves farther than the grade of its piece allows, and the
    // geometric pairing refuses a twin beyond it.
    const guessed: string[] = [];
    const mapped = outerOf(
      mapFuseSpecToSize(zone(patch), square, wide, null, { base: [base], target: [turned] }, (w) =>
        guessed.push(w),
      ),
    );
    expect(guessed).toEqual([]);
    shape(mapped.spline).forEach((d, i) => expect(d).toBeCloseTo(shape(patch)[i], 6));
    const [a, b] = mapped.spline.points;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(8);
    expect(angle).toBeLessThan(12);
  });

  it('follow line with no internal lines falls back to the default carry', () => {
    const patch: FuseSpline = {
      ...box(150, 150, 250, 250),
      gradeMode: 'follow_line',
      anchor: { x: 200, y: 200 },
    };
    const guessed: string[] = [];
    const mapped = outerOf(
      mapFuseSpecToSize(zone(patch), square, wide, null, null, (what) => guessed.push(what)),
    );
    expect(guessed).toEqual(['line']);
    const plain = outerOf(mapFuseSpecToSize(zone(box(150, 150, 250, 250)), square, wide));
    mapped.spline.points.forEach((p, i) =>
      expect(dist(p, plain.spline.points[i])).toBeLessThan(1e-9),
    );
    expect(mapped.spline.gradeMode).toBe('follow_line');
  });
});

describe('strip end carry-over modes', () => {
  const m = ring(shirt.m);
  const xs = ring(shirt.xs);
  const strip = (edges: FuseEdge[]): PieceFuseSpec => ({
    ...blankFuse('strip'),
    widthMm: 12,
    edges,
  });

  it('mm (no mode): the trim is the same mm on every size', () => {
    const [edge] = mapFuseSpecToSize(strip([{ edge: 1, startMm: 10, endMm: 20 }]), m, xs).edges;
    const reversed = pairEdgeRuns(m, xs)!.reversed;
    expect([edge.startMm, edge.endMm]).toEqual(reversed ? [20, 10] : [10, 20]);
    expect(edge.startMode).toBeUndefined();
  });

  it('share: the trim keeps its share of the edge', () => {
    const pairing = pairEdgeRuns(m, xs)!;
    const baseRun = edgeRunsOf(m)[1];
    const run = edgeRunsOf(xs)[pairing.target[1]];
    const startMm = baseRun.length / 4;
    const [edge] = mapFuseSpecToSize(
      strip([{ edge: 1, startMm, endMm: 20, startMode: 'share' }]),
      m,
      xs,
    ).edges;
    const [shared, fixed] = pairing.reversed
      ? [edge.endMm, edge.startMm]
      : [edge.startMm, edge.endMm];
    expect(run.length).not.toBeCloseTo(baseRun.length, 0);
    expect(shared / run.length).toBeCloseTo(0.25, 6);
    expect(fixed).toBe(20);
    expect(pairing.reversed ? edge.endMode : edge.startMode).toBe('share');
  });

  it('notch: the end sits on the same notch on every size', () => {
    const base = liningRing('M');
    const target = liningRing('XL');
    const runs = edgeRunsOf(base);
    const index = runs.findIndex((run) => notchesOnRun(run, liningLines('M')).length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const [notch] = notchesOnRun(runs[index], liningLines('M'));
    // Drawn 3 mm off the notch: the end is snapped to it, here and in every size.
    const spec = strip([{ edge: index, startMm: notch + 3, endMm: 0, startMode: 'notch' }]);
    const [edge] = mapFuseSpecToSize(spec, base, target, null, liningInternals('M', 'XL')).edges;
    const run = edgeRunsOf(target)[edge.edge];
    const reversed = pairEdgeRuns(base, target)!.reversed;
    const at = reversed ? run.length - edge.endMm : edge.startMm;
    const mark = liningLines('XL').find((l) => l.layer === '4')!.points;
    const end = pointOnEdgeRun(run, at).point;
    expect(Math.min(dist(end, mark[0]), dist(end, mark[1]))).toBeLessThan(1.5);
    // Without the mode the same trim lands 10 mm away from the notch (the edge grew).
    const [plain] = mapFuseSpecToSize(
      strip([{ edge: index, startMm: notch + 3, endMm: 0 }]),
      base,
      target,
      null,
      liningInternals('M', 'XL'),
    ).edges;
    expect(plain.startMode).toBeUndefined();
  });

  it('notch with no notch on the edge keeps the mm', () => {
    const guessed: string[] = [];
    const [edge] = mapFuseSpecToSize(
      strip([{ edge: 1, startMm: 10, endMm: 20, startMode: 'notch', endMode: 'notch' }]),
      m,
      xs,
      null,
      null,
      (what) => guessed.push(what),
    ).edges;
    expect(guessed).toEqual(['notch', 'notch']);
    expect([edge.startMm, edge.endMm].sort((a, b) => a - b)).toEqual([10, 20]);
  });
});

describe('carry-over modes on the wire', () => {
  it('round-trips, and a default goes out named', () => {
    const fields = {
      fusingBomLineKey: '',
      fusingEdges: [
        { edge: 2, startMm: 10, endMm: 5, startMode: 'notch' as const },
        { edge: 4, startMm: 0, endMm: 0, endMode: 'share' as const },
      ],
      fusingZone: {
        spline: { ...box(0, 0, 10, 10), gradeMode: 'follow_line' as const, anchor: { x: 3, y: 4 } },
        holes: [],
        islands: [{ ...box(20, 0, 30, 10), gradeMode: 'grow' as const }, box(40, 0, 50, 10)],
      },
      fusingInsetMm: '',
      fusingInsetNet: false,
      fusingGrain: '',
      fusingDarts: '',
    };
    const wire = fuseFieldsToWire(fields);
    expect(wire.fusingEdges?.items?.map((e) => [e.startMode, e.endMode])).toEqual([
      ['TECH_CARD_PIECE_FUSING_END_MODE_NOTCH', 'TECH_CARD_PIECE_FUSING_END_MODE_MM'],
      ['TECH_CARD_PIECE_FUSING_END_MODE_MM', 'TECH_CARD_PIECE_FUSING_END_MODE_SHARE'],
    ]);
    expect(wire.fusingZone?.islands?.map((s) => s.gradeMode)).toEqual([
      'TECH_CARD_PIECE_FUSING_GRADE_MODE_GROW',
      'TECH_CARD_PIECE_FUSING_GRADE_MODE_FIXED',
    ]);
    expect(wire.fusingZone?.islands?.[1].anchor).toBeUndefined();
    expect(fuseFieldsFromWire(wire)).toEqual(fields);
  });
});
