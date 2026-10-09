// pieces/ (F4) — the fill's pixel boundary snapped back onto the vector wall chains, and the
// two numbers the gate reads per candidate: source-edge coverage and p95 distance.
//
// Snapping: the traced boundary is resampled every `stepMm`; each sample takes the nearest wall
// (a chain, or a stretch of one) within `reachMm`, with hysteresis so parallel walls 1 mm apart do
// not flicker. Consecutive samples on one wall form a run; a run becomes the wall's own vertices
// between the two projected ends; neighbouring runs meet at the walls' intersection when they cross
// near the switch, else at the two projections (that joint is a bridged gap and counts as
// unbacked length). Stretches with no wall in reach keep the raster samples (unbacked too).
import type { ChainId, PtMm } from 'lib/pattern-import/types';

import { dist, quantile, resample, SegGrid, segIntersect, segNearest } from './geom';

/** A wall as the fill used it: a chain, or a stretch of one (a shared portion of a size line). */
export type WallItem = { chain: ChainId; pts: PtMm[]; closed?: boolean };

export type SnapResult = {
  outer: PtMm[];
  walls: ChainId[];
  /** Share of outline length within `snapMm` of a wall (source-edge coverage). */
  coverage: number;
  /** p95 of the distance from the outline (sampled every 0.5 mm) to the nearest wall, mm. */
  p95Mm: number;
  /** Share of the traced fill boundary within reach of the vector outline (snap sanity). */
  agreement: number;
  /** Unbacked stretches longer than 2 mm: midpoint + length (bridged gaps, raster-only runs). */
  gaps: { at: PtMm; lengthMm: number }[];
};

export type SnapOpts = { stepMm: number; reachMm: number; snapMm: number };

type Hit = { item: number; seg: number; u: number; q: PtMm; s: number; d: number };

class WallIndex {
  readonly grid = new SegGrid(4);
  readonly cum: number[][];
  /** Polyline per item; a closed item is stored twice round so a stretch may cross its seam. */
  readonly pl: PtMm[][];
  /** Perimeter of a closed item (0 for open ones). */
  readonly per: number[];
  constructor(readonly items: WallItem[]) {
    this.pl = items.map((it) => {
      const ring =
        it.closed || (it.pts.length > 3 && dist(it.pts[0], it.pts[it.pts.length - 1]) < 0.5);
      if (!ring || it.pts.length < 3) return it.pts;
      const loop = dist(it.pts[0], it.pts[it.pts.length - 1]) < 0.5 ? it.pts.slice(0, -1) : it.pts;
      return [...loop, ...loop, loop[0]];
    });
    this.cum = this.pl.map((pts) => {
      const c = [0];
      for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
      return c;
    });
    this.per = this.pl.map((pts, k) =>
      pts === items[k].pts ? 0 : this.cum[k][this.cum[k].length - 1] / 2,
    );
    items.forEach((it, k) => this.grid.addPolyline(k, it.pts, !!it.closed));
  }
  /** Arc positions of consecutive hits on item k made continuous (closed items unwrap the seam). */
  unwrap(k: number, s: number[]): number[] {
    const P = this.per[k];
    if (!P) return s;
    const out = [s[0]];
    for (let i = 1; i < s.length; i++) {
      let v = s[i];
      const prev = out[i - 1];
      while (v - prev > P / 2) v -= P;
      while (prev - v > P / 2) v += P;
      out.push(v);
    }
    // shift into [0, 2P)
    const lo = Math.min(...out);
    const shift = lo < 0 ? Math.ceil(-lo / P) * P : lo >= P ? -Math.floor(lo / P) * P : 0;
    return out.map((v) => v + shift);
  }
  /** Arc position on item k of the point nearest to p, the copy closest to `ref`. */
  near(k: number, p: PtMm, ref: number): number {
    const pts = this.pl[k];
    const cum = this.cum[k];
    let best = Infinity;
    let bs = ref;
    for (let i = 0; i + 1 < pts.length; i++) {
      const r = segNearest(p, pts[i], pts[i + 1]);
      const s = cum[i] + r.u * (cum[i + 1] - cum[i]);
      if (
        r.d < best - 1e-6 ||
        (Math.abs(r.d - best) <= 1e-6 && Math.abs(s - ref) < Math.abs(bs - ref))
      ) {
        best = r.d;
        bs = s;
      }
    }
    return bs;
  }
  nearest(p: PtMm, reach: number, prefer: number, hyst: number): Hit | null {
    let best: Hit | null = null;
    let pref: Hit | null = null;
    this.grid.near(p, reach, (k, i) => {
      const pts = this.pl[k];
      const r = segNearest(p, pts[i], pts[i + 1]);
      if (r.d > reach) return;
      const h: Hit = {
        item: k,
        seg: i,
        u: r.u,
        q: r.q,
        s: this.cum[k][i] + r.u * (this.cum[k][i + 1] - this.cum[k][i]),
        d: r.d,
      };
      if (!best || h.d < best.d) best = h;
      if (k === prefer && (!pref || h.d < pref.d)) pref = h;
    });
    const b = best as Hit | null;
    const pr = pref as Hit | null;
    if (pr && b && pr.d <= b.d + hyst) return pr;
    return b;
  }
  /** Distance from p to the nearest wall within reach (Infinity if none). */
  distance(p: PtMm, reach: number): number {
    let d = Infinity;
    this.grid.near(p, reach, (k, i) => {
      const pts = this.pl[k];
      const r = segNearest(p, pts[i], pts[i + 1]);
      if (r.d < d) d = r.d;
    });
    return d;
  }
  /** Points of item k between arc positions a and b (either direction), ends included. */
  stretch(k: number, a: number, b: number): PtMm[] {
    const pts = this.pl[k];
    const cum = this.cum[k];
    const at = (s: number): PtMm => {
      if (s <= 0) return pts[0];
      if (s >= cum[cum.length - 1]) return pts[pts.length - 1];
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] <= s) lo = m;
        else hi = m;
      }
      const L = cum[hi] - cum[lo] || 1;
      const t = (s - cum[lo]) / L;
      return {
        x: pts[lo].x + (pts[hi].x - pts[lo].x) * t,
        y: pts[lo].y + (pts[hi].y - pts[lo].y) * t,
      };
    };
    const out: PtMm[] = [at(a)];
    if (a <= b) {
      for (let i = 0; i < cum.length; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i]);
    } else {
      for (let i = cum.length - 1; i >= 0; i--) if (cum[i] < a && cum[i] > b) out.push(pts[i]);
    }
    out.push(at(b));
    return out;
  }
}

type Run = { kind: 'wall'; item: number; hits: Hit[] } | { kind: 'raw'; item: -1; raw: PtMm[] };

export function snapOutline(raster: PtMm[], items: WallItem[], o: SnapOpts): SnapResult {
  const idx = new WallIndex(items);
  const samples = resample(raster, o.stepMm, true);
  // 1. nearest wall per sample, with hysteresis
  const hits: (Hit | null)[] = [];
  let prev = -1;
  for (const p of samples) {
    const h = idx.nearest(p, o.reachMm, prev, 0.35);
    hits.push(h);
    prev = h ? h.item : -1;
  }
  // 2. runs; absorb flicker (runs of ≤ 2 samples between two runs of the same item)
  const lab = hits.map((h) => (h ? h.item : -1));
  const n = lab.length;
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < n; i++) {
      if (lab[i] === lab[(i + n - 1) % n]) continue;
      let j = i;
      while (j - i < 3 && lab[(j + 1) % n] === lab[i]) j++;
      const before = lab[(i + n - 1) % n];
      const after = lab[(j + 1) % n];
      if (j - i < 2 && before === after && before !== -1) {
        for (let k = i; k <= j; k++) {
          const h = idx.nearest(samples[k % n], o.reachMm * 1.5, before, Infinity);
          if (h && h.item === before) {
            lab[k % n] = before;
            hits[k % n] = h;
          }
        }
      }
    }
  // rotate so that index 0 starts a run
  let start = 0;
  for (let i = 0; i < n; i++)
    if (lab[i] !== lab[(i + n - 1) % n]) {
      start = i;
      break;
    }
  const runs: Run[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const last = runs[runs.length - 1];
    if (lab[i] === -1) {
      if (last && last.kind === 'raw') last.raw.push(samples[i]);
      else runs.push({ kind: 'raw', item: -1, raw: [samples[i]] });
    } else {
      const h = hits[i]!;
      // one run per continuous stretch: a jump along the item (crossing an open item's ends,
      // which may meet) starts a new run
      const jump =
        last?.kind === 'wall' &&
        last.item === lab[i] &&
        !idx.per[lab[i]] &&
        Math.abs(h.s - last.hits[last.hits.length - 1].s) > 5 * o.stepMm;
      if (last && last.kind === 'wall' && last.item === lab[i] && !jump) last.hits.push(h);
      else runs.push({ kind: 'wall', item: lab[i], hits: [h] });
    }
  }
  // 3. joints between runs (the walls' intersection near the switch), then each run's own stretch
  //    between its two joints (or its first/last projection where there is no joint)
  const R = runs.length;
  const joints: (PtMm | null)[] = runs.map((ri, i) => {
    const rn = runs[(i + 1) % R];
    if (R < 2 || ri.kind === 'raw' || rn.kind === 'raw' || ri.item === rn.item) return null;
    const ha = ri.hits[ri.hits.length - 1];
    const hb = rn.hits[0];
    return crossNear(idx.pl[ri.item], idx.pl[rn.item], ha.q, hb.q, 4);
  });
  const outer: PtMm[] = [];
  const wallIds: ChainId[] = [];
  const push = (p: PtMm) => {
    const last = outer[outer.length - 1];
    if (last && dist(last, p) < 1e-6) return;
    outer.push(p);
  };
  for (let i = 0; i < R; i++) {
    const r = runs[i];
    if (r.kind === 'raw') {
      for (const p of r.raw) push(p);
      continue;
    }
    const hs = idx.unwrap(
      r.item,
      r.hits.map((h) => h.s),
    );
    let a = hs[0];
    let b = hs[hs.length - 1];
    const jp = joints[(i + R - 1) % R];
    const jn = joints[i];
    if (jp) a = idx.near(r.item, jp, a);
    if (jn) b = idx.near(r.item, jn, b);
    for (const p of idx.stretch(r.item, a, b)) push(p);
    if (!wallIds.length || wallIds[wallIds.length - 1] !== idx.items[r.item].chain)
      wallIds.push(idx.items[r.item].chain);
  }
  if (wallIds.length > 1 && wallIds[0] === wallIds[wallIds.length - 1]) wallIds.pop();
  // coverage: share of outline length within snapMm of a wall (sampled every 0.5 mm); p95 over the
  // same samples (gate G3/G4 measure the written cut the same way)
  const gaps: { at: PtMm; lengthMm: number }[] = [];
  const os = resample(outer, 0.5, true);
  const dOut = os.map((p) => Math.min(3, idx.distance(p, 3)));
  const okOut = dOut.filter((d) => d <= o.snapMm).length;
  let runBad: PtMm[] = [];
  const flush = () => {
    if (runBad.length * 0.5 > 2)
      gaps.push({ at: runBad[runBad.length >> 1], lengthMm: runBad.length * 0.5 });
    runBad = [];
  };
  os.forEach((p, i) => {
    if (dOut[i] > o.snapMm) runBad.push(p);
    else flush();
  });
  flush();
  // raster ↔ vector agreement: the traced boundary sits ~1.5 px outside the wall centre line; a
  // vector outline that leaves it by more than `reachMm` took a wrong stretch (the long way round)
  const og = new SegGrid(4);
  og.addPolyline(0, outer, true);
  let agree = 0;
  for (const p of samples) {
    let d = Infinity;
    og.near(p, o.reachMm, (_k, i) => {
      const r = segNearest(p, outer[i], outer[(i + 1) % outer.length]);
      if (r.d < d) d = r.d;
    });
    if (d <= o.reachMm) agree++;
  }
  const agreement = samples.length ? agree / samples.length : 0;
  const coverage = Math.min(os.length ? okOut / os.length : 0, agreement);
  return { outer, walls: wallIds, coverage, p95Mm: quantile(dOut, 0.95), gaps, agreement };
}

/** Intersection of two polylines nearest to the switch point (within r of either end), or null. */
function crossNear(a: PtMm[], b: PtMm[], pa: PtMm, pb: PtMm, r: number): PtMm | null {
  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const R = r + dist(pa, pb) / 2;
  let best: PtMm | null = null;
  let bd = Infinity;
  for (let i = 0; i + 1 < a.length; i++) {
    const sa = segNearest(mid, a[i], a[i + 1]);
    if (sa.d > R) continue;
    for (let j = 0; j + 1 < b.length; j++) {
      const sb = segNearest(mid, b[j], b[j + 1]);
      if (sb.d > R) continue;
      const x = segIntersect(a[i], a[i + 1], b[j], b[j + 1]);
      if (!x) continue;
      const d = dist(x.p, mid);
      if (d < bd && d <= R) {
        bd = d;
        best = x.p;
      }
    }
  }
  return best;
}
