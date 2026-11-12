import { describe, expect, it } from 'vitest';
import fixture from './bp-shirt-back.fixture.json';
import { mapFuseSpecToSize } from './dxf';
import { edgeRunsOf, pairEdgeRuns, pointOnEdgeRun, type EdgePoint } from './edge-runs';
import { blankFuse, type FuseEdge, type PieceFuseSpec } from './types';

// A strip edge is stored as an edge-run index on the base outline. Each size is its own DXF block,
// so another size's cut ring may start at another vertex (or run the other way round): run 0 of
// that ring is then a different physical edge. The mapping must pair runs by geometry, not index.
const ring = (pts: number[][]) => pts.map(([x, y]) => ({ x, y }));
const rotate = <T>(points: readonly T[], k: number) => [...points.slice(k), ...points.slice(0, k)];
const m = ring(fixture.m);
const xs = ring(fixture.xs);

const strip = (edges: FuseEdge[]): PieceFuseSpec => ({
  ...blankFuse('strip'),
  widthMm: 12,
  edges,
});

/** Where a stored strip edge physically sits on an outline: its trimmed start and end points. */
function placed(outline: readonly EdgePoint[], edge: FuseEdge) {
  const run = edgeRunsOf(outline)[edge.edge];
  return {
    start: pointOnEdgeRun(run, edge.startMm).point,
    end: pointOnEdgeRun(run, run.length - edge.endMm).point,
  };
}

const near = (a: EdgePoint, b: EdgePoint, mm: number) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(mm);

describe('strip edge identity across sizes', () => {
  const runCount = edgeRunsOf(m).length;
  const edges = [
    { edge: 1, startMm: 10, endMm: 20 },
    { edge: 3, startMm: 0, endMm: 5 },
  ];

  it('edgeRunsOf is NOT start-independent: run 0 follows the ring start', () => {
    // Proof that index identity alone is unsafe: rotating the ring moves run 0 to another edge.
    expect(runCount).toBeGreaterThan(2);
    const base0 = edgeRunsOf(xs)[0].points[0];
    const shifted = edgeRunsOf(rotate(xs, edgeRunsOf(xs)[1].segmentIndices[0]))[0].points[0];
    expect(Math.hypot(base0.x - shifted.x, base0.y - shifted.y)).toBeGreaterThan(1);
  });

  it('lands on the same physical edge whatever vertex the target ring starts at', () => {
    const reference = mapFuseSpecToSize(strip(edges), m, xs);
    for (let k = 0; k < xs.length; k += 3) {
      const target = rotate(xs, k);
      const mapped = mapFuseSpecToSize(strip(edges), m, target);
      expect(mapped.edges).toHaveLength(edges.length);
      for (const ref of reference.edges) {
        const want = placed(xs, ref);
        const match = mapped.edges.find((edge) => {
          const got = placed(target, edge);
          return Math.hypot(got.start.x - want.start.x, got.start.y - want.start.y) < 0.01;
        });
        expect(match, `ring start ${k}`).toBeDefined();
        near(placed(target, match!).end, want.end, 0.01);
      }
    }
  });

  it('lands on the same physical edge whatever vertex the base ring starts at', () => {
    const reference = mapFuseSpecToSize(strip(edges), m, xs);
    const want = reference.edges.map((edge) => placed(xs, edge));
    const runs = edgeRunsOf(m);
    for (let k = 1; k < m.length; k += 5) {
      const base = rotate(m, k);
      // The same physical edges, addressed in the rotated base ring's own run indices (found by
      // their first corner, independently of the pairing under test).
      const rotatedRuns = edgeRunsOf(base);
      const stored = edges.map((e) => {
        const corner = runs[e.edge].points[0];
        const index = rotatedRuns.findIndex(
          (run) => Math.hypot(run.points[0].x - corner.x, run.points[0].y - corner.y) < 1e-9,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        return { ...e, edge: index };
      });
      const mapped = mapFuseSpecToSize(strip(stored), base, xs);
      for (const edge of mapped.edges) {
        const got = placed(xs, edge);
        const match = want.find(
          (w) => Math.hypot(w.start.x - got.start.x, w.start.y - got.start.y) < 0.01,
        );
        expect(match).toBeDefined();
        near(got.end, match!.end, 0.01);
      }
    }
  });

  it('a ring running the other way round swaps start and end trims', () => {
    const reversed = [...xs].reverse();
    const reference = mapFuseSpecToSize(strip(edges), m, xs);
    const mapped = mapFuseSpecToSize(strip(edges), m, reversed);
    for (const ref of reference.edges) {
      const want = placed(xs, ref);
      const match = mapped.edges.find((edge) => {
        const got = placed(reversed, edge);
        return Math.hypot(got.start.x - want.end.x, got.start.y - want.end.y) < 0.01;
      });
      expect(match).toBeDefined();
      const got = placed(reversed, match!);
      near(got.end, want.start, 0.01);
    }
  });

  it('base → size → base returns the stored edges', () => {
    for (const k of [0, 7, 40]) {
      const target = rotate(xs, k);
      const onSize = mapFuseSpecToSize(strip(edges), m, target);
      const back = mapFuseSpecToSize(onSize, target, m);
      expect(back.edges.map((e) => e.edge)).toEqual(edges.map((e) => e.edge));
      back.edges.forEach((e, i) => {
        expect(e.startMm).toBeCloseTo(edges[i].startMm, 6);
        expect(e.endMm).toBeCloseTo(edges[i].endMm, 6);
      });
    }
  });

  it('a symmetric outline is still paired by position, not just by shape', () => {
    const rect = ring([
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ]);
    const bigger = ring([
      [0, 0],
      [110, 0],
      [110, 55],
      [0, 55],
    ]);
    // Rotated by two vertices the run sequence looks the same; only the position tells the top
    // edge from the bottom one.
    const pairing = pairEdgeRuns(rect, rotate(bigger, 2));
    expect(pairing).toEqual({ target: [2, 3, 0, 1], reversed: false });
  });

  it('refuses when the runs do not correspond', () => {
    const tri = ring([
      [0, 0],
      [100, 0],
      [50, 80],
    ]);
    expect(pairEdgeRuns(m, tri)).toBeNull();
    const spec = strip(edges);
    expect(mapFuseSpecToSize(spec, m, tri)).toBe(spec);
  });
});

describe('strip trims between sizes', () => {
  it('are proportional to the paired run length, not fixed millimetres', () => {
    // Pinned on purpose (8c032d9ec): `startMm`/`endMm` are real mm on the base size only; on every
    // other size they keep their fraction of the graded edge.
    const base = ring([
      [0, 0],
      [80, 0],
      [80, 60],
      [0, 60],
    ]);
    const target = ring([
      [0, 0],
      [120, 0],
      [120, 80],
      [0, 80],
    ]);
    const mapped = mapFuseSpecToSize(strip([{ edge: 0, startMm: 8, endMm: 16 }]), base, target);
    expect(mapped.edges).toEqual([{ edge: 0, startMm: 12, endMm: 24 }]);
  });
});
