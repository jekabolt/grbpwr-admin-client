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
/** Sampling step along a line (≤ the tolerance, so nothing wider than it is stepped over). */
const STEP_MM = 0.5;
/** The fitted line spans this share of the stretch it lies on (grain-propose.ts CHORD_SHARE). */
const FIT_SHARE = 0.7;

const insideRing = (p: PtMm, ring: readonly PtMm[], tol: number) =>
  pointInPolygon(p, ring) || closestOnPolyline(p, ring, true).d <= tol;
const insideAll = (p: PtMm, rings: readonly (readonly PtMm[])[], tol: number) =>
  rings.every((r) => r.length < 3 || insideRing(p, r, tol));

/**
 * How much of the segment a→b lies outside any of `rings` by more than `tol` (mm, sampled every
 * 0.5 mm, both ends included). 0 = the segment lies on every outline.
 */
export function grainOutsideMm(
  a: PtMm,
  b: PtMm,
  rings: readonly (readonly PtMm[])[],
  tol = GRAIN_INSIDE_TOL_MM,
): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(L / STEP_MM));
  let out = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!insideAll({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, rings, tol))
      out += i === 0 || i === n ? L / n / 2 : L / n;
  }
  return out;
}

/**
 * The proposal a→b fitted onto every outline in `rings`: kept as is when it lies on all of them;
 * else re-placed on the same line, at `FIT_SHARE` of the stretch of that line lying on every
 * outline that overlaps it most (a line that misses the outlines entirely, or a stretch too short,
 * gives null — the piece asks).
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
  const live = rings.filter((r) => r.length >= 3);
  if (!live.length) return L >= minMm ? [a, b] : null;
  if (grainOutsideMm(a, b, live, tol) === 0) return L >= minMm ? [a, b] : null;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  // the line's parameter range over every outline (projections of their vertices)
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
  const n = Math.max(1, Math.ceil((hi - lo) / STEP_MM));
  const at = (i: number) => lo + ((hi - lo) * i) / n;
  // runs of samples inside every outline; the one that overlaps [0, L] most (else the longest)
  let best: { t0: number; t1: number; score: number } | null = null;
  let start = -1;
  for (let i = 0; i <= n + 1; i++) {
    const ok = i <= n && insideAll({ x: a.x + u.x * at(i), y: a.y + u.y * at(i) }, live, tol);
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
  if (!best || !(best.t1 - best.t0 > 0)) return null;
  const pad = ((best.t1 - best.t0) * (1 - FIT_SHARE)) / 2;
  const t0 = best.t0 + pad;
  const t1 = best.t1 - pad;
  if (t1 - t0 < minMm) return null;
  const pa = { x: a.x + u.x * t0, y: a.y + u.y * t0 };
  const pb = { x: a.x + u.x * t1, y: a.y + u.y * t1 };
  // the sampled run's ends are inside; a sliver between samples narrower than the step is not
  return grainOutsideMm(pa, pb, live, tol) === 0 ? [pa, pb] : null;
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
