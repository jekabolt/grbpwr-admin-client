// Grade map · the proven correspondence of one line between the base and one size, and the node set
// that reproduces it.
//
// Anchors are arc pairs (base s, size t) the matcher proved: matched corners, matched notches, the
// ends of an open line. Between two anchors a base point keeps its fraction of the run — measured
// after the bbox stretch (sx, sy) on a contour, so a pure axis grade is reproduced exactly on a curved
// run too (the zone mapper's run correspondence), plainly on an internal line (the importer's). The
// result is a monotone piecewise-linear map of arc s → arc t with knots at the anchors and the base
// vertices, so its inverse is exact.
//
// Nodes: the anchors, plus — greedily, where node-to-node arc fraction strays more than FIDELITY_MM
// from that map in any carried size, either way — the knot of largest error, until none strays.

import { FIDELITY_MM } from 'lib/pattern-import/adapters/rul/correspond';
import { mod, type Path } from './geom';

export type Anchor = { s: number; t: number };

/** Monotone knots: ks from ks[0] over one base length (closed) or 0..LB (open); kt alike. */
export type Corr = { closed: boolean; LB: number; LZ: number; ks: number[]; kt: number[] };

export const MAX_NODES = 2000;
/** Anchors closer than this (mm of base arc) merge: 0.01 mm storage cannot keep them in order. */
const ANCHOR_MERGE_MM = 0.02;

function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return span > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span : ys[lo];
}

/**
 * The correspondence from anchors (any order). null when the anchors are out of order on the size
 * line (a closed line must wind once, an open one run forward) or collapse a run to a point.
 */
export function corrOf(
  base: Path,
  size: Path,
  anchors0: readonly Anchor[],
  stretch: { sx: number; sy: number } | null,
): Corr | null {
  const closed = base.closed;
  const LB = base.total;
  const LZ = size.total;
  const anchors = [...anchors0]
    .map((a) => (closed ? { s: mod(a.s, LB), t: mod(a.t, LZ) } : a))
    .sort((a, b) => a.s - b.s)
    .filter((a, i, all) => !i || a.s - all[i - 1].s > 1e-9);
  const K = anchors.length;
  if (!K || (!closed && K < 2)) return null;
  const runs: { s0: number; sl: number; t0: number; tl: number }[] = [];
  if (closed) {
    let wind = 0;
    for (let k = 0; k < K; k++) {
      const a = anchors[k];
      const b = anchors[(k + 1) % K];
      const sl = K === 1 ? LB : mod(b.s - a.s, LB);
      const tl = K === 1 ? LZ : mod(b.t - a.t, LZ);
      if (tl < 1e-9 && sl > 1e-6) return null;
      wind += tl;
      runs.push({ s0: a.s, sl, t0: a.t, tl });
    }
    if (Math.abs(wind - LZ) > 1e-6) return null;
  } else {
    for (let k = 0; k + 1 < K; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      if (b.t - a.t < -1e-9 || (b.t - a.t < 1e-9 && b.s - a.s > 1e-6)) return null;
      runs.push({ s0: a.s, sl: b.s - a.s, t0: a.t, tl: b.t - a.t });
    }
  }
  const ks: number[] = [];
  const kt: number[] = [];
  let sBase = runs[0].s0;
  let tBase = runs[0].t0;
  for (const r of runs) {
    // base vertices strictly inside the run, as offsets from its start
    const offs = [0];
    if (stretch) {
      for (let i = 0; i < base.pts.length; i++) {
        const off = closed ? mod(base.cum[i] - r.s0, LB) : base.cum[i] - r.s0;
        if (off > 1e-9 && off < r.sl - 1e-9) offs.push(off);
      }
      offs.sort((a, b) => a - b);
    }
    offs.push(r.sl);
    const stretched = [0];
    for (let i = 1; i < offs.length; i++) {
      if (!stretch) {
        stretched.push(offs[i]);
        continue;
      }
      const a = pointAtArc(base, r.s0 + offs[i - 1]);
      const b = pointAtArc(base, r.s0 + Math.min(offs[i], r.sl - 1e-9));
      stretched.push(
        stretched[i - 1] + Math.hypot((b.x - a.x) * stretch.sx, (b.y - a.y) * stretch.sy),
      );
    }
    const whole = stretched[stretched.length - 1] || 1;
    for (let i = 0; i < offs.length - 1; i++) {
      ks.push(sBase + offs[i]);
      kt.push(tBase + (stretched[i] / whole) * r.tl);
    }
    sBase += r.sl;
    tBase += r.tl;
  }
  ks.push(sBase);
  kt.push(tBase);
  return { closed, LB, LZ, ks, kt };
}

function pointAtArc(path: Path, s: number) {
  const t = path.closed ? mod(s, path.total) : Math.max(0, Math.min(path.total, s));
  let lo = 0;
  let hi = path.cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.cum[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = path.pts[lo];
  const b = path.pts[(lo + 1) % path.pts.length];
  const len = path.cum[lo + 1] - path.cum[lo];
  const f = len > 0 ? (t - path.cum[lo]) / len : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Size arc of base arc s, unwrapped: s and the result may run past one length (closed). */
export function fwdU(c: Corr, s: number): number {
  if (!c.closed) return interpolate(c.ks, c.kt, s);
  const m = Math.floor((s - c.ks[0]) / c.LB);
  return interpolate(c.ks, c.kt, s - m * c.LB) + m * c.LZ;
}

/** Base arc of size arc t, unwrapped. */
export function invU(c: Corr, t: number): number {
  if (!c.closed) return interpolate(c.kt, c.ks, t);
  const m = Math.floor((t - c.kt[0]) / c.LZ);
  return interpolate(c.kt, c.ks, t - m * c.LZ) + m * c.LB;
}

/** First index whose value exceeds x (xs ascending). */
function firstAbove(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Largest error of node-to-node arc fraction against the map on one node gap, both ways. */
function gapError(c: Corr, Sa: number, Sb: number): { err: number; at: number } {
  const Ta = fwdU(c, Sa);
  const Tb = fwdU(c, Sb);
  const ds = Sb - Sa;
  const dt = Tb - Ta;
  if (ds < 1e-9 || dt < 1e-9) return ds < 1e-9 && dt < 1e-9 ? { err: 0, at: Sa } : { err: Infinity, at: (Sa + Sb) / 2 };
  let err = 0;
  let at = Sa;
  const shifts = c.closed ? [-1, 0, 1, 2] : [0];
  for (const m of shifts)
    for (let i = firstAbove(c.ks, Sa + 1e-9 - m * c.LB); i < c.ks.length; i++) {
      const s = c.ks[i] + m * c.LB;
      if (s >= Sb - 1e-9) break;
      if (s <= Sa + 1e-9) continue;
      const t = c.kt[i] + m * c.LZ;
      const e = Math.max(
        Math.abs(t - (Ta + ((s - Sa) * dt) / ds)),
        Math.abs(s - (Sa + ((t - Ta) * ds) / dt)),
      );
      if (e > err) [err, at] = [e, s];
    }
  return { err, at };
}

/**
 * The node set (base arcs, ascending; open lines keep both ends) for the given anchors and carried
 * sizes, and each size's residual. null when more than MAX_NODES would be needed.
 */
export function refineNodes(
  base: Path,
  anchorArcs: readonly number[],
  corrs: readonly Corr[],
  tol = FIDELITY_MM,
): { nodes: number[]; residual: number[]; added: number } | null {
  const LB = base.total;
  const sorted = [...new Set(anchorArcs.map((s) => (base.closed ? mod(s, LB) : s)))].sort((a, b) => a - b);
  // anchors closer than the storage can tell apart are one node (an open line keeps its ends)
  let nodes: number[] = [];
  for (const s of sorted) {
    if (!nodes.length || s - nodes[nodes.length - 1] > ANCHOR_MERGE_MM) nodes.push(s);
    else if (!base.closed && s >= LB - 1e-9) nodes[nodes.length - 1] = s;
  }
  if (base.closed && nodes.length > 1 && nodes[0] + LB - nodes[nodes.length - 1] <= ANCHOR_MERGE_MM) nodes.pop();
  if (!nodes.length) nodes = [0];
  const anchors = nodes.length;
  const gaps = () => {
    const out: [number, number][] = [];
    for (let j = 0; j + 1 < nodes.length; j++) out.push([nodes[j], nodes[j + 1]]);
    if (base.closed) out.push([nodes[nodes.length - 1], nodes[0] + LB]);
    return out;
  };
  for (;;) {
    let worst = { err: 0, at: 0 };
    for (const [a, b] of gaps())
      for (const c of corrs) {
        const e = gapError(c, a, b);
        if (e.err > worst.err) worst = e;
      }
    if (worst.err <= tol) break;
    if (nodes.length >= MAX_NODES || !Number.isFinite(worst.err)) return null;
    const s = base.closed ? mod(worst.at, LB) : worst.at;
    if (nodes.some((n) => Math.abs(n - s) < 1e-9)) return null;
    nodes = [...nodes, s].sort((x, y) => x - y);
  }
  const residual = corrs.map((c) => Math.max(0, ...gaps().map(([a, b]) => gapError(c, a, b).err)));
  return { nodes, residual, added: nodes.length - anchors };
}

/**
 * Each source's nearest target when it is clearly the nearest (the runner-up ≥ 1.5× + 0.5 mm), within
 * reach, and no other source is nearer to it; else null.
 */
export function nearestUnique<T>(
  from: readonly T[],
  to: readonly T[],
  cost: (a: T, b: T) => number,
  reach: number,
): (number | null)[] {
  const best = from.map((a) => {
    let i0 = -1;
    let c0 = Infinity;
    let c1 = Infinity;
    to.forEach((b, i) => {
      const c = cost(a, b);
      if (c < c0) [i0, c1, c0] = [i, c0, c];
      else if (c < c1) c1 = c;
    });
    return { i0, c0, c1 };
  });
  return best.map(({ i0, c0, c1 }, k) => {
    if (i0 < 0 || c0 > reach || c1 < 1.5 * c0 + 0.5) return null;
    // mutual: no other source is nearer to this target
    for (let j = 0; j < from.length; j++) if (j !== k && cost(from[j], to[i0]) < c0) return null;
    return i0;
  });
}

