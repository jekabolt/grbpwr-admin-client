// offsetContour — the parallel curve of a piece outline, CLIPPER-BASED (08-CONTRACT §2), never
// `lib/nesting/geom/offset.ts` (that one falls back to the convex hull: on a front it fills the
// armhole and the neckline, and the hull would go to layer 1 = the line the cutter follows).
//
// Why not `ClipperOffset` itself: clipper2-js 1.2.4 ports `OffsetPoint(group, path, j, ref k)` with
// `k` by VALUE, so every vertex is joined against the LAST edge's normal. Measured on a 100 mm
// square, +10 mm: Miter gives bbox x ∈ [−10, 100] (one side never moves), Round loses 15 % of the
// area. So the raw offset is built here (edge shifted by d, a join at every vertex, concave corner =
// "perp, vertex, perp" so the reversal is a closed sliver), and Clipper's own cleanup does the
// rest: Union with FillRule.Positive on 1 µm integers — the part of clipper2-js that works.
//
// W2 (ULMUS-DIAG §4b/§4c) — the allowance corner is MITRED, as a pattern maker cuts it: the two sides
// are extended to their intersection, so the corner point of the cut line is where the seam corner
// is, shifted by the allowance along both sides (a round join drew every corner as an r = allowance
// arc: "drops" on sharp tips, extra crossings between sizes, a 1.3 mm jog of the seam line became a
// ~5 mm hump). A corner whose mitre would reach further than MITER_LIMIT × allowance from the seam
// corner (a sharp tip) is square-cut there, perpendicular to the bisector. Along curves the vertices
// turn by a few degrees and the mitre is the parallel (10 mm at 10° → 0.04 mm out).
// The morphological opening of traced outlines (below) keeps the round join: it is a disk, not a cut.
//
// The result is the d-level set of the distance to the source along the sides; at a convex corner it
// reaches as far as that corner's mitre (or cut). That is what the report measures
// (`parallelDeviation`): a hull collapse, a bitten bay or a lost lobe all show as a deviation, a
// second loop or a hole.

import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { OffsetReport, PtMm } from '../types';
import {
  SegIndex,
  areaOf,
  ccw,
  dedupe,
  hullRatio,
  sampleAlong,
  selfIntersects,
  signedArea,
} from './geom';

/** Integer units per mm: 1 µm (well under every tolerance, far from int53 on a 5 m sheet). */
export const OFFSET_SCALE = 1000;
/** Max chord sagitta of a round join, mm. */
export const ARC_TOL_MM = 0.01;
/** Same thresholds as gate G6. */
export const HULL_RATIO_MAX = 0.995;
/**
 * A source at least this convex (≤ 1 % hull deficit: a near-rectangle whose only bays are notch
 * cuts) may legitimately turn convex under a true outward parallel — the bays narrower than twice
 * the allowance fill. Only a source with real concavity (armhole, neckline, crotch) can "collapse to
 * the hull"; a fill across those is also caught by the parallel-deviation check (I2: kombinezon's
 * notched strips were blocked at 0.9925 → 0.9960).
 */
export const HULL_SOURCE_CONCAVE_MAX = 0.99;
export const MAX_DEVIATION_MM = 0.2;
/**
 * W2: a mitred allowance corner reaches at most this many × the allowance from the seam corner;
 * a sharper corner is square-cut at that distance, perpendicular to the corner's bisector.
 */
export const MITER_LIMIT = 4;
export type OffsetJoin = 'round' | 'miter';

const toPath = (pts: readonly PtMm[]): Path64 => {
  const p = new Path64();
  for (const q of pts)
    p.push(new Point64(Math.round(q.x * OFFSET_SCALE), Math.round(q.y * OFFSET_SCALE)));
  return p;
};
const fromPath = (p: Path64): PtMm[] => {
  const out: PtMm[] = [];
  for (const q of p) out.push({ x: q.x / OFFSET_SCALE, y: q.y / OFFSET_SCALE });
  return out;
};

type Vec = { x: number; y: number };
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

/** Outward unit normal of every edge i (src[i] → src[i+1]) of a CCW loop; zero for a null edge. */
function edgeNormals(src: readonly PtMm[]): Vec[] {
  const n = src.length;
  const nrm: Vec[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // CCW: the interior is on the left → outward normal on the right.
    nrm[i] = L > 0 ? { x: (b.y - a.y) / L, y: -(b.x - a.x) / L } : { x: 0, y: 0 };
  }
  return nrm;
}

/**
 * The mitre join at P between the shifted edges k (into P) and j (out of P): the intersection of
 * the two shifted sides, or — past `limit·|d|` from P — the square cut perpendicular to the
 * bisector at that distance (two points). Null when the corner is degenerate (no extension).
 */
function miterJoin(P: PtMm, nk: Vec, nj: Vec, d: number, limit: number): PtMm[] | null {
  const ad = Math.abs(d);
  const vk = { x: d * nk.x, y: d * nk.y };
  const vj = { x: d * nj.x, y: d * nj.y };
  const sx = vk.x + vj.x;
  const sy = vk.y + vj.y;
  const sl = Math.hypot(sx, sy);
  const cosHalf = sl / (2 * ad);
  const lim = limit * ad;
  if (cosHalf > 1e-9 && ad / cosHalf <= lim) {
    const r = ad / cosHalf / sl;
    return [{ x: P.x + sx * r, y: P.y + sy * r }];
  }
  // edge directions: k runs into P, j out of P
  const ek = { x: -nk.y, y: nk.x };
  const ej = { x: -nj.y, y: nj.x };
  // a full reversal has no bisector: the tip points along the incoming edge
  const u = sl > 1e-9 ? { x: sx / sl, y: sy / sl } : ek;
  const ck = dot(ek, u);
  const cj = dot(ej, u);
  if (Math.abs(ck) < 1e-9 || Math.abs(cj) < 1e-9) return null;
  const tk = (lim - dot(vk, u)) / ck;
  const tj = (lim - dot(vj, u)) / cj;
  return [
    { x: P.x + vk.x + tk * ek.x, y: P.y + vk.y + tk * ek.y },
    { x: P.x + vj.x + tj * ej.x, y: P.y + vj.y + tj * ej.y },
  ];
}

/** W2: a vertex is an allowance CORNER when its side directions differ by at least this much. */
export const CORNER_MIN_TURN_DEG = 15;
/** …and at most this much: a sharper reversal is a needle (a fill artefact), never extended. */
export const CORNER_MAX_TURN_DEG = 175;

/**
 * W2: the vertices whose allowance corner is MITRED, with their join points (the mitre point, or
 * the two ends of the square cut). A corner is a vertex convex w.r.t. the offset, turning by
 * CORNER_MIN_TURN_DEG…CORNER_MAX_TURN_DEG, with no concave turn of that size within |d| along the
 * line on either side: a step, jog or notch smaller than the allowance (a convex and a concave turn
 * close together) is not a corner — mitring it would push a spike of up to (√2 − 1)·d past the
 * neighbouring sides (a 1–3 mm jog of a fill became a 4–6 mm bump on Ulmus), so it keeps the
 * exact parallel (round). Curves (turns under the minimum) keep the exact parallel too: the cut
 * line changes at corners only.
 */
function cornerJoins(
  src: readonly PtMm[],
  d: number,
  limit: number,
  /** Every convex turn in range may be mitred (no step rule): the gate's lenient reading. */
  anyConvex = false,
): Map<number, PtMm[]> {
  const n = src.length;
  const nrm = edgeNormals(src);
  const ad = Math.abs(d);
  const minT = (CORNER_MIN_TURN_DEG * Math.PI) / 180;
  const maxT = (CORNER_MAX_TURN_DEG * Math.PI) / 180;
  const turn: number[] = new Array(n);
  for (let j = 0; j < n; j++) {
    const nk = nrm[(j - 1 + n) % n];
    const nj = nrm[j];
    // signed by the offset: > 0 = convex w.r.t. the offset direction
    turn[j] = Math.atan2(nk.x * nj.y - nk.y * nj.x, nk.x * nj.x + nk.y * nj.y) * Math.sign(d);
  }
  const edgeLen = (i: number) => {
    const a = src[i];
    const c = src[(i + 1) % n];
    return Math.hypot(c.x - a.x, c.y - a.y);
  };
  /** A concave turn ≥ the minimum within |d| of vertex j, walking `dir` (+1 / −1). */
  const concaveNear = (j: number, dir: 1 | -1) => {
    let run = 0;
    for (let step = 1; step < n; step++) {
      const prev = (j + (step - 1) * dir + n * step) % n;
      run += edgeLen(dir === 1 ? prev : (prev - 1 + n) % n);
      if (run >= ad) return false;
      const k = (j + step * dir + n * step) % n;
      if (turn[k] <= -minT) return true;
    }
    return false;
  };
  const out = new Map<number, PtMm[]>();
  for (let j = 0; j < n; j++) {
    const t = turn[j];
    if (t < minT || t > maxT) continue;
    if (!anyConvex && (concaveNear(j, 1) || concaveNear(j, -1))) continue;
    const m = miterJoin(src[j], nrm[(j - 1 + n) % n], nrm[j], d, limit);
    if (m) out.set(j, m);
  }
  return out;
}

/** Raw (self-overlapping) offset of a CCW loop by signed d (d > 0 = outward). */
function rawOffset(
  src: readonly PtMm[],
  d: number,
  arcTol: number,
  join: OffsetJoin = 'round',
  limit = MITER_LIMIT,
): PtMm[] {
  const n = src.length;
  const nrm = edgeNormals(src);
  const ad = Math.abs(d);
  const stepAng = 2 * Math.acos(Math.max(-1, 1 - Math.min(arcTol, ad) / ad));
  const corners = join === 'miter' ? cornerJoins(src, d, limit) : new Map<number, PtMm[]>();
  const out: PtMm[] = [];
  for (let j = 0; j < n; j++) {
    const k = (j - 1 + n) % n;
    const nk = nrm[k];
    const nj = nrm[j];
    const P = src[j];
    const corner = corners.get(j);
    if (corner) {
      out.push(...corner);
      continue;
    }
    const sinA = nk.x * nj.y - nk.y * nj.x;
    const cosA = nk.x * nj.x + nk.y * nj.y;
    if (cosA > -0.99 && sinA * d < 0) {
      // concave w.r.t. the offset direction: the reversal is cleaned by the union
      out.push({ x: P.x + d * nk.x, y: P.y + d * nk.y });
      out.push(P);
      out.push({ x: P.x + d * nj.x, y: P.y + d * nj.y });
      continue;
    }
    const ang = Math.atan2(sinA, cosA);
    const steps = Math.max(1, Math.ceil(Math.abs(ang) / stepAng));
    const vx = d * nk.x;
    const vy = d * nk.y;
    out.push({ x: P.x + vx, y: P.y + vy });
    for (let s = 1; s < steps; s++) {
      const t = (ang * s) / steps;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      out.push({ x: P.x + vx * c - vy * sn, y: P.y + vx * sn + vy * c });
    }
    if (Math.abs(ang) > 1e-12) out.push({ x: P.x + d * nj.x, y: P.y + d * nj.y });
  }
  return out;
}

/**
 * How far each mitred corner's join reaches from its vertex (mm): the mitre point, or the far end
 * of the square cut. Every other vertex is joined round — its reach is |d|.
 */
function joinReach(
  src: readonly PtMm[],
  d: number,
  limit: number,
  anyConvex: boolean,
): { p: PtMm; r: number }[] {
  const out: { p: PtMm; r: number }[] = [];
  for (const [j, m] of cornerJoins(src, d, limit, anyConvex)) {
    const P = src[j];
    out.push({ p: P, r: Math.max(...m.map((q) => Math.hypot(q.x - P.x, q.y - P.y))) });
  }
  return out;
}

/**
 * Max deviation of `result` from the d-offset of `src` with mitred corners (`cornerJoins`),
 * sampled every 0.5 mm along the result: a point is never closer than |d| to the source (a bitten
 * bay, a bevelled corner, a hull collapse across a neck), and never further than |d| unless it lies
 * within a mitred corner's reach (the mitre, or the square cut past MITER_LIMIT). A stray lobe, a
 * mitre on a step or a lost side shows as a deviation. `join: 'round'` allows no reach past |d|;
 * `lenient` lets every convex turn in range be a corner (the gate reads a file whose writer decided).
 */
export function parallelDeviation(
  result: readonly PtMm[],
  src: readonly PtMm[],
  d: number,
  opts: { limit?: number; join?: OffsetJoin; lenient?: boolean } = {},
): number {
  const limit = opts.limit ?? MITER_LIMIT;
  const ad = Math.abs(d);
  const idx = new SegIndex([{ pts: src, closed: true }], 5);
  const reach = opts.join === 'round' ? [] : joinReach(src, d, limit, !!opts.lenient);
  const cell = Math.max(5, ad * limit);
  const grid = new Map<string, { p: PtMm; r: number }[]>();
  for (const v of reach) {
    const key = `${Math.floor(v.p.x / cell)},${Math.floor(v.p.y / cell)}`;
    const a = grid.get(key);
    if (a) a.push(v);
    else grid.set(key, [v]);
  }
  /** Distance past the reach of the nearest-fitting convex corner join (0 = inside one). */
  const pastJoins = (q: PtMm, e: number): number => {
    const cx = Math.floor(q.x / cell);
    const cy = Math.floor(q.y / cell);
    let best = e - ad;
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const v of grid.get(`${x},${y}`) ?? []) {
          const over = Math.hypot(q.x - v.p.x, q.y - v.p.y) - v.r;
          if (over < best) best = over;
          if (best <= 0) return 0;
        }
    return Math.max(0, best);
  };
  const far = ad * limit * 1.5 + 10;
  let dev = 0;
  for (const q of sampleAlong(result, true, 0.5)) {
    const e = idx.nearest(q, far);
    if (!Number.isFinite(e)) {
      dev = Math.max(dev, far);
      continue;
    }
    if (e < ad) dev = Math.max(dev, ad - e);
    else if (e > ad) dev = Math.max(dev, pastJoins(q, e));
  }
  return dev;
}

export type OffsetResult = { pts: PtMm[]; report: OffsetReport; sourceHullRatio: number };

/**
 * Parallel curve of a closed outline: `mm > 0` outward (seam → cut), `mm < 0` inward (cut → seam).
 * The report is what gate G6 reads; `report.ok === false` must BLOCK the piece (Codex C4).
 */
export function offsetContour(
  pts: readonly PtMm[],
  mm: number,
  opts: { arcTolMm?: number; join?: OffsetJoin; miterLimit?: number } = {},
): OffsetResult {
  const join = opts.join ?? 'miter';
  const limit = opts.miterLimit ?? MITER_LIMIT;
  const src = ccw(dedupe(pts, true, 1e-4));
  const srcHull = hullRatio(src);
  if (src.length < 3 || areaOf(src) <= 0) {
    return {
      pts: [...pts],
      sourceHullRatio: srcHull,
      report: {
        ok: false,
        loops: 0,
        selfIntersects: false,
        hullRatio: 1,
        maxDeviationMm: Infinity,
        reason: 'degenerate source outline',
      },
    };
  }
  if (Math.abs(mm) < 1e-9) {
    return {
      pts: src,
      sourceHullRatio: srcHull,
      report: {
        ok: true,
        loops: 1,
        selfIntersects: selfIntersects(src),
        hullRatio: srcHull,
        maxDeviationMm: 0,
      },
    };
  }
  const raw = rawOffset(src, mm, opts.arcTolMm ?? ARC_TOL_MM, join, limit);
  const solution: Paths64 = Clipper.Union([toPath(raw)], undefined, FillRule.Positive);
  const loops: PtMm[][] = [];
  let holes = 0;
  for (const p of solution) {
    const q = dedupe(fromPath(p), true, 1e-9);
    if (q.length < 3) continue;
    if (signedArea(q) > 0) loops.push(q);
    else holes++;
  }
  loops.sort((a, b) => areaOf(b) - areaOf(a));
  const best = loops[0] ?? [];
  const reasons: string[] = [];
  if (loops.length !== 1)
    reasons.push(loops.length ? `${loops.length} loops (the outline splits)` : 'offset vanished');
  if (holes) reasons.push(`${holes} hole(s) appeared`);
  const si = best.length ? selfIntersects(best) : false;
  if (si) reasons.push('self-intersection');
  const hr = best.length ? hullRatio(best) : 1;
  const hull = srcHull < HULL_SOURCE_CONCAVE_MAX && hr >= HULL_RATIO_MAX;
  if (hull)
    reasons.push(`collapsed to the convex hull (${hr.toFixed(4)} vs source ${srcHull.toFixed(4)})`);
  const dev = best.length ? parallelDeviation(best, src, mm, { limit, join }) : Infinity;
  if (!(dev <= MAX_DEVIATION_MM))
    reasons.push(`deviation ${dev.toFixed(3)} mm from a true parallel`);
  return {
    pts: best,
    sourceHullRatio: srcHull,
    report: {
      ok: reasons.length === 0,
      loops: loops.length + holes,
      selfIntersects: si,
      hullRatio: hr,
      maxDeviationMm: dev,
      ...(reasons.length ? { reason: reasons.join('; ') } : {}),
    },
  };
}

// ── traced (raster) outlines ─────────────────────────────────────────────────────────────────
//
// A scan's outline is not a drawn polygon: the fill snaps to traced chains, and where two traces
// of one ink line lie side by side (tile overlaps, a skeleton that forked) it zig-zags between
// them and runs out and back along a tick or a notch. Measured on leonie (E3): every closed size of
// the back leg self-intersects, with 36–104 reversals of > 120° on 0.1–0.7 mm steps and spurs up
// to 8.5 mm. The offset of such a loop is not a parallel curve (3 loops, holes, deviation
// 1.5–2.7 mm), whatever the allowance — the noise is TOPOLOGICAL, so G6 was right to refuse it and
// a wider G6 tolerance would only have hidden it.
//
// So a traced outline is made a simple polygon first, then offset with the ordinary, unchanged
// G6 rules:
//   1. union (non-zero) → the largest loop: crossings and zero-area out-and-back spurs go;
//   2. a morphological OPENING by TRACE_OPEN_MM (in, then out): slivers narrower than 2r (a run
//      out along one trace and back along its twin) go, convex corners round by ≤ r·(1 − 1/√2);
//   3. Douglas–Peucker at TRACE_NOISE_MM (= the adapter's own trace step, ≈ the F11 calibration
//      p95 0.108 mm): the staircase vertices go, no point moves more than that.
// Guarded: the cleaned line must stay within TRACE_MOVE_MAX_MM of the traced one and keep its
// area to TRACE_AREA_LOSS_MAX; otherwise the traced line is kept as it is (and G6 decides).

/** Traced line noise, mm: the raster adapter's DP step (`simplifyMm` 0.1) ≈ F11 scan p95 0.108. */
export const TRACE_NOISE_MM = 0.1;
/** Opening radius, mm: slivers narrower than twice this are trace artefacts, not cloth. */
export const TRACE_OPEN_MM = 0.25;
/** The cleaned line never moves further than this from the traced one (else: not cleaned). */
export const TRACE_MOVE_MAX_MM = 0.5;
/** …and never loses more than this share of the traced area (a lobe on a neck is not noise). */
export const TRACE_AREA_LOSS_MAX = 0.01;

export type TraceCleanReport = {
  cleaned: boolean;
  /** Vertices before → after. */
  vertices: [number, number];
  /** How far the cleaned line moved from the traced one at most (the line itself, not spurs). */
  movedMm: number;
  /** How far the removed spurs / crossings reached from the cleaned line. */
  removedMm: number;
  /** The traced outline crossed itself. */
  selfIntersected: boolean;
  reason?: string;
};

/** The positive loops of a non-zero union, largest first. */
function unionLoops(paths: PtMm[][], rule: FillRule): PtMm[][] {
  const sol = Clipper.Union(
    paths.map((p) => toPath(p)),
    undefined,
    rule,
  );
  const loops: PtMm[][] = [];
  for (const p of sol) {
    const q = dedupe(fromPath(p), true, 1e-9);
    if (q.length >= 3 && signedArea(q) > 0) loops.push(q);
  }
  return loops.sort((a, b) => areaOf(b) - areaOf(a));
}

/** Douglas–Peucker on a closed loop (split at the vertex farthest from vertex 0). */
function simplifyClosed(pts: readonly PtMm[], tol: number): PtMm[] {
  const n = pts.length;
  if (n < 4 || tol <= 0) return [...pts];
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const dp = (a: readonly PtMm[]): PtMm[] => {
    const keep = new Uint8Array(a.length);
    keep[0] = keep[a.length - 1] = 1;
    const stack: [number, number][] = [[0, a.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop()!;
      if (i1 - i0 < 2) continue;
      const A = a[i0];
      const B = a[i1];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const L = Math.hypot(dx, dy);
      let best = -1;
      let bi = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const d =
          L < 1e-9
            ? Math.hypot(a[i].x - A.x, a[i].y - A.y)
            : Math.abs((a[i].x - A.x) * dy - (a[i].y - A.y) * dx) / L;
        if (d > best) {
          best = d;
          bi = i;
        }
      }
      if (best > tol) {
        keep[bi] = 1;
        stack.push([i0, bi], [bi, i1]);
      }
    }
    return a.filter((_, i) => keep[i]);
  };
  const first = dp(pts.slice(0, far + 1));
  const second = dp([...pts.slice(far), pts[0]]);
  return [...first, ...second.slice(1, -1)];
}

/** One-sided Hausdorff: the farthest sample of `a` from the line `b`, mm. */
function farthest(a: readonly PtMm[], b: readonly PtMm[], cap: number): number {
  const idx = new SegIndex([{ pts: b, closed: true }], 5);
  let m = 0;
  for (const p of sampleAlong(a, true, 0.25)) {
    const d = idx.nearest(p, cap);
    m = Math.max(m, Number.isFinite(d) ? d : cap);
  }
  return m;
}

/**
 * A traced (raster) outline as a simple polygon the offset can follow (see the block above). The
 * result is CCW. Vector outlines never come here: their walls are exact.
 */
export function cleanTracedOutline(
  pts: readonly PtMm[],
  opts: { noiseMm?: number; openMm?: number } = {},
): { pts: PtMm[]; report: TraceCleanReport } {
  const noise = opts.noiseMm ?? TRACE_NOISE_MM;
  const r = opts.openMm ?? TRACE_OPEN_MM;
  const src = dedupe(pts, true, 1e-6);
  const si = src.length >= 4 && selfIntersects(src);
  const keep = (reason: string) => ({
    pts: ccw(src),
    report: {
      cleaned: false,
      vertices: [src.length, src.length] as [number, number],
      movedMm: 0,
      removedMm: 0,
      selfIntersected: si,
      reason,
    },
  });
  if (src.length < 3) return keep('degenerate outline');
  const union = unionLoops([src], FillRule.NonZero);
  if (!union.length) return keep('the outline encloses nothing');
  const tracedArea = union.reduce((a, l) => a + areaOf(l), 0);
  let loop = union[0];
  if (r > 0) {
    const eroded = unionLoops([rawOffset(loop, -r, ARC_TOL_MM)], FillRule.Positive)[0];
    const opened = eroded
      ? unionLoops([rawOffset(eroded, r, ARC_TOL_MM)], FillRule.Positive)[0]
      : undefined;
    if (opened) loop = opened;
  }
  loop = simplifyClosed(loop, noise);
  const fin = unionLoops([loop], FillRule.NonZero)[0];
  if (!fin) return keep('the cleaned outline vanished');
  const area = areaOf(fin);
  if (area < tracedArea * (1 - TRACE_AREA_LOSS_MAX))
    return keep(
      `cleaning would drop ${(((tracedArea - area) / tracedArea) * 100).toFixed(1)} % of the area (a lobe on a neck, not noise)`,
    );
  const moved = farthest(fin, src, TRACE_MOVE_MAX_MM * 4);
  if (moved > TRACE_MOVE_MAX_MM)
    return keep(`cleaning would move the line ${moved.toFixed(2)} mm off the trace`);
  return {
    pts: ccw(fin),
    report: {
      cleaned: true,
      vertices: [src.length, fin.length],
      movedMm: moved,
      removedMm: farthest(src, fin, 50),
      selfIntersected: si,
    },
  };
}
