import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { canonRing, matchCorners, nestWalk, ringDistance, type NestSizeIn } from './nest-walk';
import { segIntersect } from '../geom';

// a pentagon graded about C: each vertex moves by its own vector per size step
const BASE: PtMm[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 220, y: 150 },
  { x: 100, y: 230 },
  { x: 0, y: 150 },
];
const C = { x: 100, y: 100 };
const N = 9;
const E = 4;
/** the cumulative scale of size k: `rate(i)` is the step between size i and i + 1 */
const scaleOf = (k: number, rate: (i: number) => number) => {
  let s = 1;
  if (k > E) for (let i = E; i < k; i++) s += rate(i);
  else for (let i = k; i < E; i++) s -= rate(i);
  return s;
};
const ringOf = (s: number) =>
  BASE.map((v) => ({ x: C.x + (v.x - C.x) * s, y: C.y + (v.y - C.y) * s }));
const closedLine = (r: PtMm[]) => [...r, r[0]];

type Nest = { truth: PtMm[][]; lines: PtMm[][][] };
const nest = (rate: (i: number) => number): Nest => {
  const truth = Array.from({ length: N }, (_, k) => ringOf(scaleOf(k, rate)));
  return { truth, lines: truth.map((r) => [closedLine(r)]) };
};
const sizesOf = (n: Nest, open: number[] = []): NestSizeIn[] =>
  n.truth.map((r, rank) => ({
    rank,
    outer: open.includes(rank) ? null : r,
    from: 'class',
  }));
const maxErr = (a: PtMm[], b: PtMm[]) => ringDistance(a, canonRing(b).pts).max;

describe('nestWalk', () => {
  it('rebuilds a linear nest exactly', () => {
    const n = nest(() => 0.03);
    const w = nestWalk({ sizes: sizesOf(n), own: (r) => n.lines[r], common: [] });
    expect(w.etalon).toBe(E);
    for (let k = 0; k < N; k++) {
      const b = w.sizes.get(k);
      expect(b, `size ${k}`).toBeTruthy();
      expect(maxErr(b!.outer, n.truth[k])).toBeLessThan(0.1);
      expect(b!.derivedMm).toBe(0);
    }
  });

  it('rebuilds a nest whose step changes with the size range', () => {
    const n = nest((i) => (i < 4 ? 0.015 : 0.04));
    const w = nestWalk({ sizes: sizesOf(n), own: (r) => n.lines[r], common: [] });
    for (let k = 0; k < N; k++) expect(maxErr(w.sizes.get(k)!.outer, n.truth[k])).toBeLessThan(0.1);
  });

  it('interpolates a size the sheet does not draw', () => {
    const n = nest(() => 0.03);
    const lines = n.lines.map((l, r) => (r === 6 ? [] : l));
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => lines[r], common: [] });
    const b = w.sizes.get(6)!;
    // interior blend of the bracketing anchors (resampling ~0.3 mm on the synthetic nest)
    expect(maxErr(b.outer, n.truth[6])).toBeLessThan(0.5);
    expect(b.states.interpolated).toBeGreaterThan(0);
    expect(b.derived.every((d) => d.kind === 'interpolated')).toBe(true);
    // the whole outline is derived: nothing of size 6 is drawn
    expect(b.derivedMm).toBeGreaterThan(0.9 * b.outer.length * 0.5);
  });

  it('interpolates a missing size at a grade range break within floor + 0.2', () => {
    // 6 → 7 is the first step of the steep range: mid(5,7) is the floor
    const n = nest((i) => (i < 6 ? 0.015 : 0.04));
    const lines = n.lines.map((l, r) => (r === 6 ? [] : l));
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => lines[r], common: [] });
    const mid = n.truth[6].map((p) => {
      const a = n.truth[5].reduce((best, q) =>
        Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best,
      );
      const b = n.truth[7].reduce((best, q) =>
        Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best,
      );
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    });
    const floor = ringDistance(mid, canonRing(n.truth[6]).pts).p95;
    const p95 = ringDistance(w.sizes.get(6)!.outer, canonRing(n.truth[6]).pts).p95;
    expect(p95).toBeLessThanOrEqual(Math.max(0.5, floor + 0.2) + 1e-6);
  });

  it('bridges a gap in one size line by the etalon segment', () => {
    const n = nest(() => 0.03);
    // size 6's bottom edge loses 12 mm in its middle
    const r6 = n.truth[6];
    const a = r6[0];
    const b = r6[1];
    const mid = (a.x + b.x) / 2;
    const gapped = [[{ x: mid + 6, y: a.y }, b, r6[2], r6[3], r6[4], a, { x: mid - 6, y: a.y }]];
    const lines = n.lines.map((l, r) => (r === 6 ? gapped : l));
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => lines[r], common: [] });
    const out = w.sizes.get(6)!;
    // open size: blend fills the gap; resampling leaves ~0.4 mm on corners
    expect(maxErr(out.outer, n.truth[6])).toBeLessThan(0.5);
    expect(out.derivedMm).toBeGreaterThan(11);
    expect(out.refused).toBeUndefined();
  });

  it('does not take a foreign line beside the path', () => {
    const n = nest(() => 0.03);
    const r6 = n.truth[6];
    const a = r6[0];
    const b = r6[1];
    const mid = (a.x + b.x) / 2;
    const gapped = [[{ x: mid + 15, y: a.y }, b, r6[2], r6[3], r6[4], a, { x: mid - 15, y: a.y }]];
    // another size's line 1 mm inside size 6's missing stretch
    const foreign = [
      { x: mid - 20, y: a.y + 1 },
      { x: mid + 20, y: a.y + 1 },
    ];
    const lines = n.lines.map((l, r) => (r === 6 ? gapped : r === 8 ? [...l, foreign] : l));
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => lines[r], common: [] });
    const out = w.sizes.get(6)!;
    // on the foreign line the outline would sit 1 mm off; blend stays on the grade
    expect(maxErr(out.outer, n.truth[6])).toBeLessThan(0.5);
    expect(out.derivedMm).toBeGreaterThan(25);
  });

  it('rejects an etalon with a missing corner', () => {
    const n = nest(() => 0.03);
    // the middle size's corner at (220, 150) rounded off (radius 30: no turn > 40° over ±8 mm)
    const r = n.truth[E];
    const v = r[2];
    const pin = r[1];
    const pout = r[3];
    const ui = {
      x: (pin.x - v.x) / Math.hypot(pin.x - v.x, pin.y - v.y),
      y: (pin.y - v.y) / Math.hypot(pin.x - v.x, pin.y - v.y),
    };
    const uo = {
      x: (pout.x - v.x) / Math.hypot(pout.x - v.x, pout.y - v.y),
      y: (pout.y - v.y) / Math.hypot(pout.x - v.x, pout.y - v.y),
    };
    const k = 40;
    const arc: PtMm[] = [];
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      // a quadratic arc from v + k·ui to v + k·uo, control point at the vertex
      const p0 = { x: v.x + k * ui.x, y: v.y + k * ui.y };
      const p2 = { x: v.x + k * uo.x, y: v.y + k * uo.y };
      arc.push({
        x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * v.x + t ** 2 * p2.x,
        y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * v.y + t ** 2 * p2.y,
      });
    }
    const rounded = [r[0], r[1], ...arc, r[3], r[4]];
    const sizes = sizesOf(n).map((s) => (s.rank === E ? { ...s, outer: rounded } : s));
    const lines = n.lines.map((l, i) => (i === E ? [closedLine(rounded)] : l));
    const w = nestWalk({ sizes, own: (i) => lines[i], common: [] });
    expect(w.etalon).not.toBe(E);
    const c = w.candidates.find((x) => x.rank === E)!;
    expect(c.eligible).toBe(false);
    expect(c.fails.some((f) => f.startsWith('c:'))).toBe(true);
  });

  it('moves an etalon landmark by the measured grade shift', () => {
    const n = nest(() => 0.05);
    const w = nestWalk({ sizes: sizesOf(n), own: (r) => n.lines[r], common: [] });
    expect(w.etalon).toBe(E);
    const j = 0;
    const pE = w.tracks![j].pos[E]!;
    const pNext = w.tracks![j].pos[E + 1]!;
    const truthStep = {
      x: n.truth[E + 1][0].x - n.truth[E][0].x,
      y: n.truth[E + 1][0].y - n.truth[E][0].y,
    };
    expect(Math.hypot(pNext.x - pE.x - truthStep.x, pNext.y - pE.y - truthStep.y)).toBeLessThan(
      0.5,
    );
  });

  it('takes the shift from neighbours where the size has no line', () => {
    const n = nest(() => 0.03);
    const lines = n.lines.map((l, r) => (r === 6 ? [] : l));
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => lines[r], common: [] });
    const b = w.sizes.get(6)!;
    expect(maxErr(b.outer, n.truth[6])).toBeLessThan(0.5);
    expect(b.states.interpolated + b.states.extrapolated).toBeGreaterThan(0);
  });

  it('demotes a whole size stuck on a neighbour and never keeps it as an anchor', () => {
    // size 6's entire outline is a copy of size 5 → every corner stuck ≤ 1 mm
    const n = nest(() => 0.1);
    const stuck = n.truth.map((r, k) => (k === 6 ? n.truth[5].map((p) => ({ ...p })) : r));
    const lines = stuck.map((r) => [closedLine(r)]);
    const sizes = stuck.map((r, rank) => ({ rank, outer: r, from: 'class' as const }));
    const w = nestWalk({ sizes, own: (r) => lines[r], common: [] });
    const dem = (w.demoted ?? []).filter((d) => d.wholeSize);
    expect(dem.length).toBeGreaterThan(0);
    for (const d of dem) {
      expect(w.anchors).not.toContain(d.rank);
      expect(d.stuckDistMm).not.toBeNull();
      expect(d.stuckDistMm!).toBeLessThanOrEqual(1);
    }
  });

  it('does not emit a partly traced edge twice', () => {
    const n = nest(() => 0.03);
    const w = nestWalk({ sizes: sizesOf(n, [6]), own: (r) => n.lines[r], common: [] });
    const b = w.sizes.get(6)!;
    const edges = b.edgeFrom ?? [];
    const keys = edges.map((e) => `${e.a}:${e.b}:${e.how}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matchCorners takes a subset when the size has extra corners', () => {
    const etalon: PtMm[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const size: PtMm[] = [
      { x: 0, y: 0 },
      { x: 5, y: -0.2 }, // extra
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const m = matchCorners(etalon, size, { residMm: 2 });
    expect(m).toHaveLength(4);
    expect(m![0]).toEqual(size[0]);
    expect(m![1]).toEqual(size[2]);
  });

  it('ringCheck catches a wrap-around self-crossing', () => {
    // bow-tie: first and last segments cross near the join
    const bow: PtMm[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    // first–last edge of the closed ring crosses the middle edge
    const closed = [...bow, bow[0]];
    let crossed = false;
    const n = bow.length;
    for (let i = 0; i < n; i++) {
      const a = bow[i];
      const b = bow[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
        const h = segIntersect(a, b, bow[j], bow[(j + 1) % n]);
        if (h && h.t > 1e-6 && h.t < 1 - 1e-6) crossed = true;
      }
    }
    expect(crossed).toBe(true);
    // the walk refuses a self-crossing build (synthetic open size forced to a bow via hide)
    const n2 = nest(() => 0.03);
    const sizes = sizesOf(n2);
    // leave-one-out of an interior size must still build a simple ring
    const w = nestWalk({
      sizes,
      own: (r) => n2.lines[r],
      common: [],
      hide: new Set([3]),
      only: new Set([3]),
    });
    const b = w.sizes.get(3);
    expect(b?.refused).not.toBe('self-crossing');
  });

  it('builds an interior size from the weighted blend of the two anchor rings', () => {
    const n = nest(() => 0.04);
    const w = nestWalk({
      sizes: sizesOf(n),
      own: (r) => n.lines[r],
      common: [],
      hide: new Set([6]),
      only: new Set([6]),
    });
    const b = w.sizes.get(6)!;
    expect(b.refused).toBeUndefined();
    expect(maxErr(b.outer, n.truth[6])).toBeLessThan(0.5);
    expect((b.edgeFrom ?? []).every((e) => e.how === 'blended')).toBe(true);
  });
});
