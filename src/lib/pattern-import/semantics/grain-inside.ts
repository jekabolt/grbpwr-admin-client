// GRAIN lane · a grainline lies on its piece.
//
// The cut frame a grain is proposed in is not always the outline the operator sees: an unfolded
// piece's cut runs past its fold, beyond the drawn half (kombinezon's straps — the "symmetry axis"
// of the unfolded strap ran half its length out of the drawn strap, across the neighbour), and one
// line is applied to EVERY size as drawn (`operatorGrain`), while it was measured on one. So a
// proposal is fitted to the outlines it will stand on — every size's drawn outline (inside the
// drawn half ⇒ inside the unfolded cut, inside the seam line ⇒ inside cut = seam + allowance) —
// and one that cannot be fitted is never offered (the piece then asks for two clicks). The gate
// (G5) re-measures the written grain against the written cut line with the same test.

import type { PtMm } from '../types';
import { closestOnPolyline, pointInPolygon } from './geom';

/** A point within this of an outline is on it (a fold line along the drawn half's edge). */
export const GRAIN_INSIDE_TOL_MM = 1;
/** A proposal shorter than this is no grainline to lay a piece by. */
export const GRAIN_PROPOSAL_MIN_MM = 20;
/** Sampling step along a line (≤ the tolerance, so nothing wider than it is stepped over)… */
const STEP_MM = 0.5;
/** …and at most this many samples per line (a 2 m line is still sampled every 0.5 mm). */
const MAX_SAMPLES = 4000;
/** The fitted line spans this share of the stretch it lies on (grain-propose.ts CHORD_SHARE). */
const FIT_SHARE = 0.7;

/** One point on every outline (inside, or within `tol` of its line). */
export function pointOnRings(
  p: PtMm,
  rings: readonly (readonly PtMm[])[],
  tol = GRAIN_INSIDE_TOL_MM,
): boolean {
  return rings.every(
    (r) => r.length < 3 || pointInPolygon(p, r) || closestOnPolyline(p, r, true).d <= tol,
  );
}

/**
 * Containment of the points of ONE line (through `a` along unit `u`) in every ring: each ring is
 * crossed once (its crossings with the line, half-open rule — parity is exact even through a vertex
 * or along an edge), and a point outside by parity is still on the ring when an edge comes within
 * `tol` of it (the stretch of the line within `tol` of each edge, merged — over-reaching by ≤ tol
 * along the line). Linear in the rings' size, O(log n) per sample, memory O(n).
 */
function lineProbe(a: PtMm, u: PtMm, rings: readonly (readonly PtMm[])[], tol: number) {
  const nrm = { x: -u.y, y: u.x };
  const sep = (p: PtMm) => (p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y;
  const par = (p: PtMm) => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  const per = rings.map((r) => {
    const ts: number[] = [];
    const band: [number, number][] = [];
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const p = r[i];
      const q = r[(i + 1) % n];
      const sp = sep(p);
      const sq = sep(q);
      const tp = par(p);
      const tq = par(q);
      if (sp > 0 !== sq > 0) {
        const k = sp / (sp - sq);
        ts.push(tp + (tq - tp) * k);
      }
      // the part of the edge within tol of the line (|s| ≤ tol), widened by tol along it
      let k0 = 0;
      let k1 = 1;
      if (sp !== sq) {
        const ka = (-tol - sp) / (sq - sp);
        const kb = (tol - sp) / (sq - sp);
        k0 = Math.max(0, Math.min(ka, kb));
        k1 = Math.min(1, Math.max(ka, kb));
      } else if (Math.abs(sp) > tol) continue;
      if (k0 > k1) continue;
      const t0 = tp + (tq - tp) * k0;
      const t1 = tp + (tq - tp) * k1;
      band.push([Math.min(t0, t1) - tol, Math.max(t0, t1) + tol]);
    }
    ts.sort((x, y) => x - y);
    band.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const iv of band) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }
    return { ts, merged };
  });
  /** Count of sorted values strictly below t. */
  const below = (xs: readonly number[], t: number, key = (i: number) => xs[i]) => {
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (key(m) < t) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  return (t: number): boolean =>
    per.every(({ ts, merged }) => {
      if (below(ts, t) % 2 === 1) return true;
      // the last band starting at or before t
      const j = below(merged as unknown as number[], t, (i) => merged[i][0]) - 1;
      const k = j + 1 < merged.length && merged[j + 1][0] === t ? j + 1 : j;
      return k >= 0 && merged[k][0] <= t && t <= merged[k][1];
    });
}

const liveRings = (rings: readonly (readonly PtMm[])[]) => rings.filter((r) => r.length >= 3);

/**
 * How much of the segment a→b lies outside any of `rings` by more than `tol` (mm, sampled every
 * ≤ 0.5 mm — at most 4000 samples — both ends included). 0 = the segment lies on every outline.
 * A zero-length segment is one point: 0 on the outlines, else Infinity.
 */
export function grainOutsideMm(
  a: PtMm,
  b: PtMm,
  rings: readonly (readonly PtMm[])[],
  tol = GRAIN_INSIDE_TOL_MM,
): number {
  const live = liveRings(rings);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(L > 0)) return pointOnRings(a, live, tol) ? 0 : Infinity;
  if (!live.length) return 0;
  const inside = lineProbe(a, { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, live, tol);
  const n = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(L / STEP_MM)));
  let out = 0;
  for (let i = 0; i <= n; i++)
    if (!inside((L * i) / n)) out += i === 0 || i === n ? L / n / 2 : L / n;
  return out;
}

/**
 * The stretch of the line through `a` along `u` that lies on every outline (sampled), the one that
 * overlaps [0, L] most (else the longest); null when the line misses them.
 */
function runAlong(
  a: PtMm,
  u: PtMm,
  live: readonly (readonly PtMm[])[],
  tol: number,
  L: number,
): { t0: number; t1: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of live)
    for (const p of r) {
      const t = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  lo -= tol;
  hi += tol;
  const inside = lineProbe(a, u, live, tol);
  const n = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil((hi - lo) / STEP_MM)));
  const at = (i: number) => lo + ((hi - lo) * i) / n;
  let best: { t0: number; t1: number; score: number } | null = null;
  let start = -1;
  for (let i = 0; i <= n + 1; i++) {
    const ok = i <= n && inside(at(i));
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      const t0 = at(start);
      const t1 = at(i - 1);
      const overlap = Math.max(0, Math.min(t1, L) - Math.max(t0, 0));
      const score = overlap * 1e6 + (t1 - t0);
      if (!best || score > best.score) best = { t0, t1, score };
      start = -1;
    }
  }
  return best && best.t1 - best.t0 > 0 ? best : null;
}

/** Offsets tried across the outlines when the line itself does not fit (a graded nest shifted). */
const PARALLEL_TRIES = 64;

/**
 * The proposal a→b fitted onto every outline in `rings`: kept as is when it lies on all of them;
 * else re-placed on the same line, at `FIT_SHARE` of the stretch of that line lying on every
 * outline that overlaps it most; else (that stretch too short — sizes graded apart, so the line
 * through one size's middle misses another) on the PARALLEL line, same direction, with the longest
 * such stretch (nearest the original on a tie). Null when no line of that direction lies on every
 * outline for `minMm` — the outlines share no room (a file per size, laid side by side), the piece
 * asks.
 */
export function fitGrainInside(
  a: PtMm,
  b: PtMm,
  rings: readonly (readonly PtMm[])[],
  opts: { tol?: number; minMm?: number } = {},
): [PtMm, PtMm] | null {
  const tol = opts.tol ?? GRAIN_INSIDE_TOL_MM;
  const minMm = opts.minMm ?? GRAIN_PROPOSAL_MIN_MM;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(L > 0)) return null;
  const live = liveRings(rings);
  if (!live.length || grainOutsideMm(a, b, live, tol) === 0) return L >= minMm ? [a, b] : null;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const nrm = { x: -u.y, y: u.x };
  const shrunk = (o: PtMm, r: { t0: number; t1: number }): [PtMm, PtMm] | null => {
    const pad = ((r.t1 - r.t0) * (1 - FIT_SHARE)) / 2;
    const t0 = r.t0 + pad;
    const t1 = r.t1 - pad;
    if (t1 - t0 < minMm) return null;
    const pa = { x: o.x + u.x * t0, y: o.y + u.y * t0 };
    const pb = { x: o.x + u.x * t1, y: o.y + u.y * t1 };
    // the sampled run's ends are inside; a sliver between samples narrower than the step is not
    return grainOutsideMm(pa, pb, live, tol) === 0 ? [pa, pb] : null;
  };
  const own = runAlong(a, u, live, tol, L);
  const onLine = own ? shrunk(a, own) : null;
  if (onLine) return onLine;
  // parallel lines across the outlines' common width
  let dlo = Infinity;
  let dhi = -Infinity;
  for (const r of live)
    for (const p of r) {
      const d = (p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y;
      if (d < dlo) dlo = d;
      if (d > dhi) dhi = d;
    }
  let best: { fit: [PtMm, PtMm]; len: number; d: number } | null = null;
  for (let k = 1; k < PARALLEL_TRIES; k++) {
    const d = dlo + ((dhi - dlo) * k) / PARALLEL_TRIES;
    const o = { x: a.x + nrm.x * d, y: a.y + nrm.y * d };
    const r = runAlong(o, u, live, tol, L);
    const f = r ? shrunk(o, r) : null;
    if (!f) continue;
    const len = Math.hypot(f[1].x - f[0].x, f[1].y - f[0].y);
    if (
      !best ||
      len > best.len + 1e-6 ||
      (Math.abs(len - best.len) <= 1e-6 && Math.abs(d) < Math.abs(best.d))
    )
      best = { fit: f, len, d };
  }
  return best?.fit ?? null;
}

/** Probe switch (node only): GRAIN_FIT_OFF offers every proposal as measured (the "before" column). */
function fitOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.GRAIN_FIT_OFF;
}

/**
 * One proposal vetted for the outlines it will be applied to. `fit`: a geometric proposal (a
 * line the outline suggests) is re-placed onto them; a drawn line is the drawing's and is only
 * kept or dropped. Returns the proposal (maybe moved) or the reason it is not offered.
 */
export function vetProposal<T extends { a: PtMm; b: PtMm; why: string }>(
  pr: T,
  rings: readonly (readonly PtMm[])[],
  fit: boolean,
): { ok: T } | { dropped: string } {
  if (fitOff()) return { ok: pr };
  const L = Math.hypot(pr.b.x - pr.a.x, pr.b.y - pr.a.y);
  if (fit) {
    const f = fitGrainInside(pr.a, pr.b, rings);
    if (!f)
      return {
        dropped: `the proposed grainline (${pr.why}) does not fit inside the piece in every size — not offered`,
      };
    return { ok: { ...pr, a: f[0], b: f[1] } };
  }
  if (L < GRAIN_PROPOSAL_MIN_MM)
    return {
      dropped: `the proposed grainline (${pr.why}) is ${L.toFixed(0)} mm long (< ${GRAIN_PROPOSAL_MIN_MM}) — not offered`,
    };
  const out = grainOutsideMm(
    pr.a,
    pr.b,
    rings.filter((r) => r.length >= 3),
  );
  if (out > 0)
    return {
      dropped: `the proposed grainline (${pr.why}) runs ${out.toFixed(0)} mm outside the piece — not offered`,
    };
  return { ok: pr };
}
