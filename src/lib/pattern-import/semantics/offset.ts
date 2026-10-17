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
// SILENT-TAIL (17.10) — one corner, one treatment in every size: two corners closer than
// CORNER_FLAT_MM are ONE corner (a sleeve's cap/underarm tip drawn sharp in 76–84 and with a 0.9 mm
// flat in 88 was mitred to a 60 mm spike in three sizes and bevelled to 16 mm in the fourth), and the
// limit is 2 × allowance (was 4): what real CAD does at a sharp tip (MITER_LIMIT below).
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
 * a sharper corner (turn past 120°) is square-cut at that distance, perpendicular to the corner's
 * bisector. SILENT-TAIL (17.10) measured real CAD cut lines against their seams (corpus/dxf-clo,
 * tmp/plans/pdf-to-dxf/auto/silent-tail/): CLO mitres every corner up to a 111° turn exactly (cut /
 * mitre 1.00, 200+ corners in summer men, its Gerber target, allsizes, ALLSIZES_DXF, blazer) and
 * stops well short of the mitre past that — blazer's 127–146° tips reach 1.25–2.23 × the allowance
 * (0.49–0.90 of the mitre), never more. Clipper's own MiterLimit default is 2 (× delta), SVG's
 * miterlimit 4 is the same 2 × the half-width, lib/nesting's offset uses 2. 4 drew 60 mm spikes
 * at a 15 mm allowance (palto SL), past anything CAD writes.
 */
export const MITER_LIMIT = 2;
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
 * SILENT-TAIL: corners joined by sides this short (summed, mm) are ONE corner, mitred between the
 * outer sides as if drawn sharp. A traced or filled tip often ends in a sub-millimetre flat in one
 * size and not in the next (palto SL 88: 87.8° + 63.5° over a 0.91 mm flat, 76–84 one 150–154°
 * vertex); mitring each half on its own made a bevel there and a spike in the other sizes — one
 * corner cut two ways in one family. Well under any drawn bevel (a blunted collar point, ≥ 3 mm).
 */
export const CORNER_FLAT_MM = 1.5;

/** One allowance corner: vertices first…last (one vertex, or a sharp tip split by a micro-flat). */
type CornerJoin = { first: number; last: number; pts: PtMm[] };
/**
 * How an allowance corner is cut: 'mitre' (sides extended to their meeting point), 'square' (the
 * mitre would reach past MITER_LIMIT × allowance: cut there, perpendicular to the bisector),
 * 'step' (a jog smaller than the allowance next to it: kept round, the exact parallel).
 */
export type CornerKind = 'mitre' | 'square' | 'step';
/** A corner of the source line: where it is (the tip as drawn sharp), its turn, its mitre / d. */
export type CornerInfo = { at: PtMm; turnDeg: number; ratio: number; kind: CornerKind };
type CornerRun = CornerInfo & { first: number; last: number };

/** Where the lines through `a` along `ea` and through `b` along `eb` meet (null: parallel). */
function meet(a: PtMm, ea: Vec, b: PtMm, eb: Vec): PtMm | null {
  const den = ea.x * eb.y - ea.y * eb.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((b.x - a.x) * eb.y - (b.y - a.y) * eb.x) / den;
  return { x: a.x + t * ea.x, y: a.y + t * ea.y };
}

/**
 * W2: the vertices whose allowance corner is MITRED, with their join points (the mitre point, or
 * the two ends of the square cut). A corner is a vertex convex w.r.t. the offset, turning by
 * CORNER_MIN_TURN_DEG…CORNER_MAX_TURN_DEG, with no concave turn of that size within |d| along the
 * line on either side: a step, jog or notch smaller than the allowance (a convex and a concave turn
 * close together) is not a corner — mitring it would push a spike of up to (√2 − 1)·d past the
 * neighbouring sides (a 1–3 mm jog of a fill became a 4–6 mm bump on Ulmus), so it keeps the
 * exact parallel (round). Curves (turns under the minimum) keep the exact parallel too: the cut
 * line changes at corners only. Corner vertices joined by sides summing ≤ CORNER_FLAT_MM are one
 * corner (keyed by its first vertex): mitred between the side into the first and the side out of
 * the last, at the point where those two sides meet, as if the tip were drawn sharp.
 */
function cornerRuns(
  src: readonly PtMm[],
  d: number,
  limit: number,
  /** Every convex turn in range may be mitred (no step rule): the gate's lenient reading. */
  anyConvex = false,
): CornerRun[] {
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
  // runs of corner vertices (each turning ≥ the minimum, convex) along sides ≤ CORNER_FLAT_MM
  const isCorner = (j: number) => turn[j] >= minT;
  const used = new Uint8Array(n);
  const runs: { first: number; last: number; turn: number }[] = [];
  const order = [...Array(n).keys()].filter(isCorner).sort((a, b) => turn[b] - turn[a]);
  for (const j of order) {
    if (used[j]) continue;
    let first = j;
    let last = j;
    let flat = 0;
    let sum = turn[j];
    used[j] = 1;
    for (;;) {
      const p = (first - 1 + n) % n;
      const q = (last + 1) % n;
      const lp = edgeLen(p);
      const lq = edgeLen(last);
      const canP = p !== last && !used[p] && isCorner(p) && flat + lp <= CORNER_FLAT_MM;
      const canQ = q !== first && !used[q] && isCorner(q) && flat + lq <= CORNER_FLAT_MM;
      if (!canP && !canQ) break;
      if (canP && (!canQ || lp <= lq)) {
        first = p;
        flat += lp;
        sum += turn[p];
        used[p] = 1;
      } else {
        last = q;
        flat += lq;
        sum += turn[q];
        used[q] = 1;
      }
    }
    runs.push({ first, last, turn: sum });
  }
  const out: CornerRun[] = [];
  const add = (first: number, last: number, P: PtMm, t: number, step: boolean) => {
    const nk = nrm[(first - 1 + n) % n];
    const nj = nrm[last];
    const cosHalf = Math.hypot(nk.x + nj.x, nk.y + nj.y) / 2;
    const ratio = cosHalf > 1e-9 ? 1 / cosHalf : Infinity;
    out.push({
      first,
      last,
      at: P,
      turnDeg: (t * 180) / Math.PI,
      ratio,
      kind: step ? 'step' : ratio > limit ? 'square' : 'mitre',
    });
  };
  for (const r of runs) {
    if (r.turn > maxT) continue;
    // the step rule (a jog smaller than the allowance): kept round — a 'step' corner
    const step = !anyConvex && (concaveNear(r.last, 1) || concaveNear(r.first, -1));
    if (r.last === r.first) {
      add(r.first, r.last, src[r.first], r.turn, step);
      continue;
    }
    // the tip as drawn sharp: where the side into `first` meets the side out of `last`
    const nk = nrm[(r.first - 1 + n) % n];
    const nj = nrm[r.last];
    const P = meet(src[r.first], { x: -nk.y, y: nk.x }, src[r.last], { x: -nj.y, y: nj.x });
    if (P && Math.hypot(P.x - src[r.first].x, P.y - src[r.first].y) <= 4 * CORNER_FLAT_MM) {
      add(r.first, r.last, P, r.turn, step);
      continue;
    }
    // not a tip after all: each vertex on its own, as before
    for (let j = r.first; ; j = (j + 1) % n) {
      if (turn[j] <= maxT) add(j, j, src[j], turn[j], step);
      if (j === r.last) break;
    }
  }
  return out;
}

/**
 * The joins of the mitred corners (`cornerRuns` less the step corners), keyed by first vertex.
 * `kindOf` may DEMOTE a corner — mitre → square (cut at min(limit, 0.97 × its own mitre): the same
 * two-point cut as its neighbours in the family) or → step (round) — never promote one: whatever
 * it picks lies inside the corner's own mitre, so the deviation report and G6 read it as before.
 */
function cornerJoins(
  src: readonly PtMm[],
  d: number,
  limit: number,
  anyConvex = false,
  kindOf?: (c: CornerInfo) => CornerKind | null,
  /** SHAPE comparison only (never written): read these square corners as their mitre point. */
  fullMitre?: (c: CornerInfo) => boolean,
): Map<number, CornerJoin> {
  const n = src.length;
  const nrm = edgeNormals(src);
  const rank = { mitre: 0, square: 1, step: 2 } as const;
  const out = new Map<number, CornerJoin>();
  for (const r of cornerRuns(src, d, limit, anyConvex)) {
    const want = kindOf?.(r) ?? null;
    const kind = want && rank[want] > rank[r.kind] ? want : r.kind;
    if (kind === 'step') continue;
    const lim =
      kind === 'square' && fullMitre?.(r)
        ? Infinity
        : kind === 'square' && r.kind === 'mitre'
          ? Math.min(limit, 0.97 * r.ratio)
          : limit;
    const m = miterJoin(r.at, nrm[(r.first - 1 + n) % n], nrm[r.last], d, lim);
    if (m) out.set(r.first, { first: r.first, last: r.last, pts: m });
  }
  return out;
}

/** The vertices a merged corner covers after its first (the offset skips them). */
function coveredBy(corners: ReadonlyMap<number, CornerJoin>, n: number): Set<number> {
  const s = new Set<number>();
  for (const c of corners.values())
    for (let j = c.first; j !== c.last; ) {
      j = (j + 1) % n;
      s.add(j);
    }
  return s;
}

/** Raw (self-overlapping) offset of a CCW loop by signed d (d > 0 = outward). */
function rawOffset(
  src: readonly PtMm[],
  d: number,
  arcTol: number,
  join: OffsetJoin = 'round',
  limit = MITER_LIMIT,
  kindOf?: (c: CornerInfo) => CornerKind | null,
  fullMitre?: (c: CornerInfo) => boolean,
): PtMm[] {
  const n = src.length;
  const nrm = edgeNormals(src);
  const ad = Math.abs(d);
  const stepAng = 2 * Math.acos(Math.max(-1, 1 - Math.min(arcTol, ad) / ad));
  const corners =
    join === 'miter'
      ? cornerJoins(src, d, limit, false, kindOf, fullMitre)
      : new Map<number, CornerJoin>();
  const skip = coveredBy(corners, n);
  const out: PtMm[] = [];
  for (let j = 0; j < n; j++) {
    if (skip.has(j)) continue;
    const k = (j - 1 + n) % n;
    const nk = nrm[k];
    const nj = nrm[j];
    const P = src[j];
    const corner = corners.get(j);
    if (corner) {
      out.push(...corner.pts);
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
 * Each mitred corner's JOIN REGION: the polygon vertex → shifted side end → mitre point (or the two
 * ends of the square cut) → other shifted side end. Every other vertex is joined round — nothing of
 * the offset may lie further than |d| from the source there.
 */
function joinWedges(
  src: readonly PtMm[],
  d: number,
  limit: number,
  anyConvex: boolean,
): { p: PtMm; r: number; poly: PtMm[] }[] {
  const n = src.length;
  const nrm = edgeNormals(src);
  const out: { p: PtMm; r: number; poly: PtMm[] }[] = [];
  for (const c of cornerJoins(src, d, limit, anyConvex).values()) {
    const P = src[c.first];
    const Q = src[c.last];
    const nk = nrm[(c.first - 1 + n) % n];
    const nj = nrm[c.last];
    // a merged tip: back from the last vertex along its micro-flat to the first
    const flat: PtMm[] = [];
    for (let j = c.last; j !== c.first; j = (j - 1 + n) % n) flat.push(src[j]);
    const poly = [
      P,
      { x: P.x + d * nk.x, y: P.y + d * nk.y },
      ...c.pts,
      { x: Q.x + d * nj.x, y: Q.y + d * nj.y },
      ...flat,
    ];
    out.push({ p: P, r: Math.max(...poly.map((q) => Math.hypot(q.x - P.x, q.y - P.y))), poly });
  }
  return out;
}

/** How far q lies outside the polygon (0 inside or on it). */
function outsideOf(q: PtMm, poly: readonly PtMm[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[k];
    const b = poly[i];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return inside ? 0 : best;
}

/**
 * Max deviation of `result` from the d-offset of `src` with mitred corners (`cornerJoins`),
 * sampled every 0.5 mm along the result: a point is never closer than |d| to the source (a bitten
 * bay, a bevelled corner, a hull collapse across a neck), and never further than |d| unless it lies
 * inside a mitred corner's join region (the mitre, or the square cut past MITER_LIMIT). A stray lobe, a
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
  const reach = opts.join === 'round' ? [] : joinWedges(src, d, limit, !!opts.lenient);
  // every wedge within ±1 cell of any point it covers: the cell is at least the largest reach
  const cell = Math.max(5, ad * limit, ...reach.map((v) => v.r + 1));
  const grid = new Map<string, { p: PtMm; r: number; poly: PtMm[] }[]>();
  for (const v of reach) {
    const key = `${Math.floor(v.p.x / cell)},${Math.floor(v.p.y / cell)}`;
    const a = grid.get(key);
    if (a) a.push(v);
    else grid.set(key, [v]);
  }
  /** Distance outside the nearest mitred corner's join region (0 = inside one). */
  const pastJoins = (q: PtMm, e: number): number => {
    const cx = Math.floor(q.x / cell);
    const cy = Math.floor(q.y / cell);
    let best = e - ad;
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const v of grid.get(`${x},${y}`) ?? []) {
          if (Math.hypot(q.x - v.p.x, q.y - v.p.y) > v.r + best) continue;
          const over = outsideOf(q, v.poly);
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

/** The allowance corners `offsetContour(pts, mm)` would cut, with how it would cut each. */
export function cornersOf(pts: readonly PtMm[], mm: number, limit = MITER_LIMIT): CornerInfo[] {
  const src = ccw(dedupe(pts, true, 1e-4));
  if (src.length < 3 || Math.abs(mm) < 1e-9) return [];
  return cornerRuns(src, mm, limit).map(({ at, turnDeg, ratio, kind }) => ({
    at,
    turnDeg,
    ratio,
    kind,
  }));
}

/**
 * SILENT-TAIL — one corner, one treatment across a family's sizes. A graded corner's angle and
 * the jog beside it change a little from size to size; each size alone crosses the mitre limit or
 * the step rule's allowance at its own size (palto SL: a 9.2 / 13.8 / 16.9 mm step at the hem
 * corner of 80 / 84 / 88 against a 15 mm allowance — round, round, mitred). Corners are matched
 * across sizes by where they sit in the outline's box (within FAMILY_CORNER_MATCH of the box,
 * turning the same way within FAMILY_CORNER_TURN_DEG), and every size of a matched corner takes
 * the most conservative treatment any size needs: step (round) over square over mitre. Demotion
 * only: the result lies inside every size's own mitre, so G6 reads it as before. Returns, per
 * size (same order as `lines`), the override for `offsetContour`'s `cornerKinds`, or null where
 * nothing changes.
 */
export const FAMILY_CORNER_MATCH = 0.06;
export const FAMILY_CORNER_TURN_DEG = 75;
export function familyCornerKinds(
  lines: readonly (readonly PtMm[])[],
  mm: number,
  limit = MITER_LIMIT,
): (((c: CornerInfo) => CornerKind | null) | null)[] {
  const rank = { mitre: 0, square: 1, step: 2 } as const;
  const per = lines.map((l) => {
    const b = l.reduce(
      (a, q) => ({
        minX: Math.min(a.minX, q.x),
        minY: Math.min(a.minY, q.y),
        maxX: Math.max(a.maxX, q.x),
        maxY: Math.max(a.maxY, q.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const W = Math.max(1e-6, b.maxX - b.minX);
    const H = Math.max(1e-6, b.maxY - b.minY);
    return cornersOf(l, mm, limit).map((c) => ({
      c,
      u: (c.at.x - b.minX) / W,
      v: (c.at.y - b.minY) / H,
    }));
  });
  type P = (typeof per)[number][number];
  const near = (a: P, b: P) =>
    Math.hypot(a.u - b.u, a.v - b.v) <= FAMILY_CORNER_MATCH &&
    Math.abs(a.c.turnDeg - b.c.turnDeg) <= FAMILY_CORNER_TURN_DEG;
  const nearest = (a: P, list: readonly P[]) => {
    let best: P | null = null;
    let bd = Infinity;
    for (const b of list) {
      if (!near(a, b)) continue;
      const dd = Math.hypot(a.u - b.u, a.v - b.v);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    return best;
  };
  // groups: each corner joined with its mutual nearest in every other size (union–find)
  const all = per.flat();
  const parent = new Map<P, P>(all.map((x) => [x, x]));
  const find = (x: P): P => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (let i = 0; i < per.length; i++)
    for (let j = i + 1; j < per.length; j++)
      for (const a of per[i]) {
        const b = nearest(a, per[j]);
        if (b && nearest(b, per[i]) === a) parent.set(find(a), find(b));
      }
  const worst = new Map<P, CornerKind>();
  for (const x of all) {
    const r = find(x);
    const w = worst.get(r);
    if (!w || rank[x.c.kind] > rank[w]) worst.set(r, x.c.kind);
  }
  return per.map((list) => {
    const demote = list.filter((x) => rank[worst.get(find(x))!] > rank[x.c.kind]);
    if (!demote.length) return null;
    return (c: CornerInfo) => {
      const hit = demote.find((x) => Math.hypot(x.c.at.x - c.at.x, x.c.at.y - c.at.y) < 1e-6);
      return hit ? worst.get(find(hit))! : null;
    };
  });
}

/**
 * SILENT-TAIL (SHAPE): per size, the corners the family square-cuts in EVERY size — one matched
 * corner present in all of them (`familyCornerKinds`' groups), square in all after the family's
 * treatment. Their flats are construction (their length grows along the run with the corner's
 * angle), so the one-shape comparison may read them as the mitre point they cut off; a square
 * corner that only some sizes have is a shape difference and is never read so.
 */
export function familySharedSquares(
  lines: readonly (readonly PtMm[])[],
  mm: number,
  limit = MITER_LIMIT,
): ((c: CornerInfo) => boolean)[] {
  const kinds = familyCornerKinds(lines, mm, limit);
  const per = lines.map((l) => cornersOf(l, mm, limit));
  const eff = per.map((list, i) => list.map((c) => kinds[i]?.(c) ?? c.kind));
  const W = lines.map((l) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const q of l) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
    return { minX, minY, w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) };
  });
  const uv = (i: number, c: CornerInfo) => ({
    u: (c.at.x - W[i].minX) / W[i].w,
    v: (c.at.y - W[i].minY) / W[i].h,
  });
  // a square corner of size i is shared when every other size has a square corner at its place
  // (the same match as the family pass: box position and turn)
  return per.map((list, i) => {
    const shared = list.filter((c, k) => {
      if (eff[i][k] !== 'square') return false;
      const a = uv(i, c);
      return per.every(
        (other, j) =>
          j === i ||
          other.some((o, m) => {
            if (eff[j][m] !== 'square') return false;
            const b = uv(j, o);
            return (
              Math.hypot(a.u - b.u, a.v - b.v) <= FAMILY_CORNER_MATCH &&
              Math.abs(c.turnDeg - o.turnDeg) <= FAMILY_CORNER_TURN_DEG
            );
          }),
      );
    });
    return (c: CornerInfo) =>
      shared.some((x) => Math.hypot(x.at.x - c.at.x, x.at.y - c.at.y) < 1e-6);
  });
}

/**
 * Parallel curve of a closed outline: `mm > 0` outward (seam → cut), `mm < 0` inward (cut → seam).
 * The report is what gate G6 reads; `report.ok === false` must BLOCK the piece (Codex C4).
 */
export function offsetContour(
  pts: readonly PtMm[],
  mm: number,
  opts: {
    arcTolMm?: number;
    join?: OffsetJoin;
    miterLimit?: number;
    /** SILENT-TAIL: the family's treatment of a corner (`familyCornerKinds`); may only demote. */
    cornerKinds?: (c: CornerInfo) => CornerKind | null;
    /** SHAPE comparison only: these square corners as their full mitre (not a cut line). */
    fullMitre?: (c: CornerInfo) => boolean;
  } = {},
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
  const raw = rawOffset(
    src,
    mm,
    opts.arcTolMm ?? ARC_TOL_MM,
    join,
    limit,
    opts.cornerKinds,
    opts.fullMitre,
  );
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
