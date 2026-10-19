// pieces/gfit (GRADE P0, PROBE ONLY): the family's grade model and the check of every size.
// Anchors (sizes closed on their own lines) are matched pairwise (match.ts); corners carried
// through every anchor are the grade points; each grade point moves linearly with rank between
// neighbouring anchors (piecewise: the prediction always uses the nearest anchors around), curves
// between grade points map by relative arc length. Every size is checked against the prediction
// WITHOUT it (leave-one-out): per grade point and per edge (p95 distance, both ways). A size that
// does not agree is localised to its worst edge and its cause read: notch (a short in/out stretch),
// neighbour (the off stretch lies on another size's line), other.
import type { PtMm } from 'lib/pattern-import/types';
import { bboxOf, segNearest, SegGrid } from 'lib/pattern-import/pieces/geom';

import { matchCorners, type GfitMatch } from './match';
import { analyseOutline, type GfitOutline } from './outline';

export type GfitTol = {
  /** Point tolerance = ptMm + ptStep · |δ| (δ = the point's step per rank). */
  ptMm: number;
  ptStep: number;
  /** Edge tolerance on the p95 distance = edgeMm + edgeStep · max|δ| along the edge. */
  edgeMm: number;
  edgeStep: number;
  /** Both tolerances × this for an extreme size (predicted by extrapolation). Default 1. */
  extrapMul?: number;
};
/** The design's starting values (GRADE-DESIGN §correspondence); P0 calibrates them. */
export const GFIT_TOL_DEFAULT: GfitTol = { ptMm: 0.75, ptStep: 0.15, edgeMm: 1.0, edgeStep: 0.15 };
/**
 * P0 calibration on CAD-graded DXF (corpus dxf-clo, 5 files × 9 pieces × 5 sizes): 1.5 × p99 of the
 * leave-one-out residuals — interpolation: point 0.37 → 0.55 mm, edge p95 0.24 → 0.36 mm, no step
 * term (residuals do not grow with the step); extrapolation ≈ 2.4× (0.86 / 0.61 mm p99).
 */
export const GFIT_TOL_CAD: GfitTol = {
  ptMm: 0.55,
  ptStep: 0,
  edgeMm: 0.36,
  edgeStep: 0,
  extrapMul: 2.5,
};
/**
 * P0 proposal for recognised PDF outlines: 1.5 × p99 of the same plain leave-one-out on kombinezon
 * (CAD-graded geometry exported to PDF, read by the pipeline; 8 pieces × 8 sizes) — interpolation:
 * point 0.79 → 1.2 mm, edge p95 0.61 → 0.9 mm; extrapolation p99 1.92 / 1.8 mm → × 2.5.
 */
export const GFIT_TOL_P0: GfitTol = {
  ptMm: 1.2,
  ptStep: 0,
  edgeMm: 0.9,
  edgeStep: 0,
  extrapMul: 2.5,
};

export type GfitSizeIn = {
  rank: number;
  outer: readonly PtMm[];
  /** Closed on its own lines (fill `isAnchor`); only anchors build the model. */
  anchor: boolean;
};

export type GfitPointResid = {
  g: number;
  strong: boolean;
  resid: number;
  step: number;
  tol: number;
};
export type GfitEdgeResid = {
  e: number;
  p95: number;
  max: number;
  step: number;
  tol: number;
  len: number;
  /** Drawn points of this edge farther than tol from the prediction (canonical outline). */
  offMm: number;
  /** Longest contiguous off-tolerance run, mm; off samples and those on another size's line. */
  run: number;
  offN: number;
  onN: number;
  offAt?: PtMm;
};
export type GfitCause = 'notch' | 'neighbour' | 'other';
export type GfitSizeVerdict = {
  rank: number;
  anchor: boolean;
  /** ok = within tolerance; disagrees = not; topology = a grade point is missing in this size;
   * unpredictable = fewer than two other trusted anchors to predict it from. */
  status: 'ok' | 'disagrees' | 'topology' | 'unpredictable';
  /** interp / extrap (an extreme size) / break: the interpolation fails, the one-sided
   * extrapolations agree (a grade break at this size). */
  how?: 'interp' | 'extrap' | 'break';
  from?: [number, number];
  points: GfitPointResid[];
  edges: GfitEdgeResid[];
  /** max over strong points and edges of residual / tolerance. */
  score: number;
  cause?: GfitCause;
  worstEdge?: number;
  /** The longest off-tolerance run of the worst edge, mm, and the share of it on another size's line. */
  offRunMm?: number;
  onNeighbour?: number;
  offAt?: PtMm;
  /** Notch candidates of this size: [edge, t] when grade points are known, else arc fraction. */
  excursions: { e: number; t: number; f: number; depth: number; p: PtMm }[];
  corners: { strong: number; weak: number };
};

/** Why there is no model — or, with `model: true`, 'inconsistent': after removing up to a third of
 * the anchors some trusted anchor still disagrees (the anchors do not agree with each other). */
export type GfitWhy =
  | 'anchors<2'
  | 'no-match'
  | 'ambiguous'
  | 'grade-points<2'
  | 'bad-outline'
  | 'inconsistent';

export type GfitFamily = {
  model: boolean;
  why?: GfitWhy;
  frame: 'stacked' | 'registered';
  anchors: number[];
  /** Anchors the model trusts after robust fitting (a disagreeing anchor leaves the fit). */
  trusted: number[];
  gradePoints: number;
  strongGradePoints: number;
  /** Strong corners of an anchor pair that the matcher left unmatched (a topology difference). */
  topoSkips: number;
  /** Worst uniqueness ratio over the anchor pairs (second / best). */
  minRatio: number;
  /** Median grade step per rank over the grade points of neighbouring trusted anchors, mm (≈ 0: the
   * sizes are drawn alike — an ungraded piece, or sizes that all took one line). */
  stepMm: number;
  sizes: GfitSizeVerdict[];
  /** Notch candidates (in/out excursions of the outline) per edge across the checked sizes. */
  notches: {
    e: number;
    kind: 'graded' | 'sign' | 'nonlinear' | 'split';
    ranks: number[];
    missing: number[];
  }[];
  /** Predicted rings for a rank from the trusted anchors — interpolation and the one-sided
   * extrapolations that exist — with the per-sample step |δ|. Empty when not predictable. */
  predict: (
    rank: number,
  ) => { pts: PtMm[]; step: number[]; how: 'interp' | 'extrap'; from: [number, number] }[];
};

type Size = {
  rank: number;
  anchor: boolean;
  o: GfitOutline;
  off: PtMm;
  /** Grade point → ring index (-1 missing). */
  idx: number[];
};

const sub = (a: PtMm, b: PtMm): PtMm => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a: PtMm, b: PtMm, w: number): PtMm => ({
  x: a.x + (b.x - a.x) * w,
  y: a.y + (b.y - a.y) * w,
});
const hyp = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

/** Points of a ring from i0 to i1 (cyclic, inclusive), extended by `ext` samples each side. */
function slice(p: readonly PtMm[], i0: number, i1: number, ext = 0): PtMm[] {
  const n = p.length;
  const len = (i1 - i0 + n) % n;
  const out: PtMm[] = [];
  for (let j = -ext; j <= len + ext; j++) out.push(p[(((i0 + j) % n) + n) % n]);
  return out;
}

/** K+1 points at equal arc fractions along an open polyline. */
function byArc(pts: readonly PtMm[], K: number): PtMm[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const out: PtMm[] = [];
  let j = 1;
  for (let k = 0; k <= K; k++) {
    const s = (L * k) / K;
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1];
    const b = pts[j] ?? a;
    const seg = cum[j] - cum[j - 1];
    out.push(seg > 1e-9 ? lerp(a, b, (s - cum[j - 1]) / seg) : { ...a });
  }
  return out;
}

/** Distance from p to the polyline q, searching segments around index `at` (± win). */
function nearOn(p: PtMm, q: readonly PtMm[], at: number, win: number): number {
  let best = Infinity;
  const lo = Math.max(0, Math.floor(at - win));
  const hi = Math.min(q.length - 2, Math.ceil(at + win));
  for (let i = lo; i <= hi; i++) best = Math.min(best, segNearest(p, q[i], q[i + 1]).d);
  return best;
}

function iou(a: PtMm[], b: PtMm[]): number {
  const A = bboxOf(a);
  const B = bboxOf(b);
  const ix = Math.max(0, Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX));
  const iy = Math.max(0, Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY));
  const I = ix * iy;
  const U = (A.maxX - A.minX) * (A.maxY - A.minY) + (B.maxX - B.minX) * (B.maxY - B.minY) - I;
  return U > 0 ? I / U : 0;
}

/** A predicate "p lies within `tol` of one of these polylines" over a segment grid (memoised on the
 * lines array: repeated fits of one family share it). */
const nearMemoG = new WeakMap<object, (p: PtMm) => boolean>();
export function nearLines(lines: readonly (readonly PtMm[])[], tol: number): (p: PtMm) => boolean {
  const hit0 = nearMemoG.get(lines);
  if (hit0) return hit0;
  const f = nearLines0(lines, tol);
  nearMemoG.set(lines, f);
  return f;
}
function nearLines0(lines: readonly (readonly PtMm[])[], tol: number): (p: PtMm) => boolean {
  const grid = new SegGrid(Math.max(1, 4 * tol));
  lines.forEach((l, k) => grid.addPolyline(k, l));
  return (p) => {
    let hit = false;
    grid.near(p, tol, (k, i) => {
      if (!hit && segNearest(p, lines[k][i], lines[k][i + 1]).d <= tol) hit = true;
    });
    return hit;
  };
}

const mean = (ps: readonly PtMm[]): PtMm => {
  let x = 0;
  let y = 0;
  for (const p of ps) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, ps.length), y: y / Math.max(1, ps.length) };
};

const q95 = (a: number[]) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))];
};

export type FitOpts = {
  tol?: GfitTol;
  /** Robust fit: an anchor out of tolerance leaves the model (default true; false = calibration). */
  robust?: boolean;
  /** Other sizes' drawn lines near this size (for the 'neighbour' cause); not this rank, not common.
   * Indexed once per rank (`nearLines`). */
  neighbourLines?: (rank: number) => readonly (readonly PtMm[])[];
  /** Force the frame (default: stacked when the anchors' boxes overlap). */
  frame?: 'stacked' | 'registered';
};

// one reading per outline and one match per pair, shared by repeated fits (other tolerances)
const outlineMemo = new WeakMap<readonly PtMm[], GfitOutline | null>();
const readOutline = (outer: readonly PtMm[]) => {
  let o = outlineMemo.get(outer);
  if (o === undefined) outlineMemo.set(outer, (o = analyseOutline(outer)));
  return o;
};
const matchMemo = new WeakMap<GfitOutline, WeakMap<GfitOutline, Map<string, GfitMatch | null>>>();
const matchOf = (a: GfitOutline, b: GfitOutline, offA: PtMm, offB: PtMm) => {
  let m1 = matchMemo.get(a);
  if (!m1) matchMemo.set(a, (m1 = new WeakMap()));
  let m2 = m1.get(b);
  if (!m2) m1.set(b, (m2 = new Map()));
  const k = `${offA.x},${offA.y},${offB.x},${offB.y}`;
  let m = m2.get(k);
  if (m === undefined) m2.set(k, (m = matchCorners(a, b, { offA, offB })));
  return m;
};

export function fitFamily(input: readonly GfitSizeIn[], opts: FitOpts = {}): GfitFamily {
  const tol = opts.tol ?? GFIT_TOL_DEFAULT;
  const robust = opts.robust !== false;
  const sizes: Size[] = [];
  for (const s of input) {
    const o = readOutline(s.outer);
    if (o) sizes.push({ rank: s.rank, anchor: s.anchor, o, off: { x: 0, y: 0 }, idx: [] });
  }
  sizes.sort((a, b) => a.rank - b.rank);
  const anchors = sizes.filter((s) => s.anchor);
  const base: GfitFamily = {
    model: false,
    frame: 'stacked',
    anchors: anchors.map((s) => s.rank),
    trusted: [],
    gradePoints: 0,
    strongGradePoints: 0,
    topoSkips: 0,
    minRatio: Infinity,
    stepMm: 0,
    sizes: sizes.map((s) => ({
      rank: s.rank,
      anchor: s.anchor,
      status: 'unpredictable',
      points: [],
      edges: [],
      score: 0,
      excursions: s.o.excursions.map((x) => ({ e: -1, t: -1, f: x.f, depth: x.depth, p: x.p })),
      corners: {
        strong: s.o.corners.filter((c) => c.strong).length,
        weak: s.o.corners.filter((c) => !c.strong).length,
      },
    })),
    notches: [],
    predict: () => [],
  };
  if (anchors.length < 2) return { ...base, why: 'anchors<2' };
  // the frame: sizes nested on one sheet share coordinates; separate blocks do not
  let stacked = true;
  for (let k = 1; k < anchors.length; k++)
    if (iou(anchors[k - 1].o.pts, anchors[k].o.pts) < 0.3) stacked = false;
  if (opts.frame) stacked = opts.frame === 'stacked';
  const frame: GfitFamily['frame'] = stacked ? 'stacked' : 'registered';
  if (!stacked) for (const s of sizes) s.off = mean(s.o.pts);
  // anchor pairs
  const matches: GfitMatch[] = [];
  let minRatio = Infinity;
  let topoSkips = 0;
  for (let k = 1; k < anchors.length; k++) {
    const m = matchOf(anchors[k - 1].o, anchors[k].o, anchors[k - 1].off, anchors[k].off);
    if (!m) return { ...base, frame, why: 'no-match' };
    matches.push(m);
    minRatio = Math.min(minRatio, m.ratio);
    topoSkips += m.skipStrongA + m.skipStrongB;
  }
  if (minRatio < 1.5) return { ...base, frame, minRatio, topoSkips, why: 'ambiguous' };
  // grade points: corners of the middle anchor carried through every anchor
  const mid = anchors.length >> 1;
  const fwd = matches.map((m) => new Map(m.pairs.map(([a, b]) => [a, b])));
  const bwd = matches.map((m) => new Map(m.pairs.map(([a, b]) => [b, a])));
  type GP = { corner: number[]; strong: boolean };
  const gps: GP[] = [];
  for (let c = 0; c < anchors[mid].o.corners.length; c++) {
    const corner = new Array<number>(anchors.length).fill(-1);
    corner[mid] = c;
    let ok = true;
    for (let k = mid; k + 1 < anchors.length && ok; k++) {
      const v = fwd[k].get(corner[k]);
      if (v === undefined) ok = false;
      else corner[k + 1] = v;
    }
    for (let k = mid; k - 1 >= 0 && ok; k--) {
      const v = bwd[k - 1].get(corner[k]);
      if (v === undefined) ok = false;
      else corner[k - 1] = v;
    }
    if (!ok) continue;
    const nStrong = corner.filter((ci, k) => anchors[k].o.corners[ci].strong).length;
    gps.push({ corner, strong: 2 * nStrong >= anchors.length });
  }
  if (gps.length < 2) return { ...base, frame, minRatio, topoSkips, why: 'grade-points<2' };
  // ring order of the middle anchor
  gps.sort(
    (a, b) => anchors[mid].o.corners[a.corner[mid]].i - anchors[mid].o.corners[b.corner[mid]].i,
  );
  const G = gps.length;
  anchors.forEach((s, k) => {
    s.idx = gps.map((g) => s.o.corners[g.corner[k]].i);
  });
  if (!stacked) for (const s of anchors) s.off = mean(s.idx.map((i) => s.o.pts[i]));
  // checked (non-anchor) sizes: matched to the nearest anchor; a strong grade point missing = topology
  const topo = new Set<number>();
  for (const s of sizes) {
    if (s.anchor) continue;
    let k = 0;
    for (let j = 1; j < anchors.length; j++)
      if (Math.abs(anchors[j].rank - s.rank) < Math.abs(anchors[k].rank - s.rank)) k = j;
    const A = anchors[k];
    const m = matchOf(A.o, s.o, A.off, stacked ? s.off : mean(s.o.pts));
    const map = new Map((m?.pairs ?? []).map(([a, b]) => [a, b]));
    s.idx = gps.map((g, gi) => {
      const cb = map.get(g.corner[k]);
      if (cb !== undefined) return s.o.corners[cb].i;
      if (g.strong) topo.add(s.rank);
      // a weak grade point: the ring point nearest the anchor's
      const target = A.o.pts[A.idx[gi]];
      const o = stacked ? { x: 0, y: 0 } : sub(mean(s.o.pts), A.off);
      let bi = 0;
      let bd = Infinity;
      s.o.pts.forEach((p, i) => {
        const d = hyp(p, { x: target.x + o.x, y: target.y + o.y });
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    if (!stacked) s.off = mean(s.idx.map((i) => s.o.pts[i]));
  }
  const byRank = new Map(sizes.map((s) => [s.rank, s]));
  const nearMemo = new Map<number, ((p: PtMm) => boolean) | null>();
  const nearOf = (r: number) => {
    if (!opts.neighbourLines) return null;
    let f = nearMemo.get(r);
    if (f === undefined) {
      const ls = opts.neighbourLines(r);
      nearMemo.set(r, (f = ls.length ? nearLines(ls, 0.6) : null));
    }
    return f;
  };
  const gpos = (s: Size, g: number) => sub(s.o.pts[s.idx[g]], s.off);
  const edgeLen = (s: Size, e: number) => {
    const n = s.o.pts.length;
    return (((s.idx[(e + 1) % G] - s.idx[e]) % n) + n) % n;
  };
  // monotone ring order: a size whose grade points do not run in ring order is a topology case
  const ordered = (s: Size) => {
    const n = s.o.pts.length;
    let tot = 0;
    for (let e = 0; e < G; e++) tot += edgeLen(s, e);
    return tot === n || tot === 0;
  };
  for (const s of sizes) if (!s.anchor && !ordered(s)) topo.add(s.rank);
  const badAnchor = anchors.find((s) => !ordered(s));
  if (badAnchor) return { ...base, frame, minRatio, topoSkips, why: 'no-match' };

  // prediction bases for rank r from trusted ranks T (r excluded): interpolation between the nearest
  // anchors around it, and extrapolation from the two nearest on each side (a size at a grade BREAK
  // — the step changes there, as size charts do — fails the interpolation but sits on both
  // one-sided extrapolations)
  type Basis = { r1: number; r2: number; w: number; how: 'interp' | 'extrap' };
  const bases = (r: number, T: ReadonlySet<number>) => {
    const tr = [...T].filter((x) => x !== r).sort((a, b) => a - b);
    const lo = tr.filter((x) => x < r);
    const hi = tr.filter((x) => x > r);
    const mk = (a: number, b: number, how: Basis['how']): Basis => ({
      r1: a,
      r2: b,
      w: (r - a) / (b - a),
      how,
    });
    return {
      I: lo.length && hi.length ? mk(lo[lo.length - 1], hi[0], 'interp') : null,
      L: lo.length >= 2 ? mk(lo[lo.length - 1], lo[lo.length - 2], 'extrap') : null,
      R: hi.length >= 2 ? mk(hi[0], hi[1], 'extrap') : null,
    };
  };
  const edgeK = (lenMm: number) => Math.max(8, Math.min(400, Math.round(lenMm)));
  // the canonical edge of a size (gauge applied), as K+1 arc samples
  const edgeOf = (s: Size, e: number, K: number) =>
    byArc(
      slice(s.o.pts, s.idx[e], s.idx[(e + 1) % G]).map((p) => sub(p, s.off)),
      K,
    );

  type Eval = {
    b: Basis;
    points: GfitPointResid[];
    edges: GfitEdgeResid[];
    score: number;
    worst: number;
    worstScore: number;
  };
  const evalMemo = new Map<string, Eval>();
  const evalBasis = (s: Size, b: Basis): Eval => {
    const key = `${s.rank}|${b.r1}|${b.r2}`;
    const hit = evalMemo.get(key);
    if (hit) return hit;
    const r = evalBasis0(s, b);
    evalMemo.set(key, r);
    return r;
  };
  const evalBasis0 = (s: Size, b: Basis): Eval => {
    const S1 = byRank.get(b.r1)!;
    const S2 = byRank.get(b.r2)!;
    const dr = Math.abs(b.r2 - b.r1);
    const mul = b.how === 'extrap' ? tol.extrapMul ?? 1 : 1;
    const points: GfitPointResid[] = [];
    const edges: GfitEdgeResid[] = [];
    let score = 0;
    for (let g = 0; g < G; g++) {
      const p1 = gpos(S1, g);
      const p2 = gpos(S2, g);
      const pred = lerp(p1, p2, b.w);
      const resid = hyp(pred, gpos(s, g));
      const step = hyp(p1, p2) / dr;
      const t = mul * (tol.ptMm + tol.ptStep * step);
      points.push({ g, strong: gps[g].strong, resid, step, tol: t });
      if (gps[g].strong) score = Math.max(score, resid / t);
    }
    const near = nearOf(s.rank);
    let worst = -1;
    let worstScore = -1;
    for (let e = 0; e < G; e++) {
      const len = Math.max(edgeLen(S1, e), edgeLen(S2, e), edgeLen(s, e)) * 0.5;
      const K = edgeK(len);
      const a1 = edgeOf(S1, e, K);
      const a2 = edgeOf(S2, e, K);
      const pred = a1.map((p, k) => lerp(p, a2[k], b.w));
      let step = 0;
      for (let k = 0; k <= K; k++) step = Math.max(step, hyp(a1[k], a2[k]) / dr);
      const ext = 6;
      const drawn = slice(s.o.pts, s.idx[e], s.idx[(e + 1) % G], ext).map((p) => sub(p, s.off));
      const M = drawn.length - 2 * ext;
      const win = Math.max(16, 0.08 * M);
      const ds: number[] = [];
      for (let k = 0; k <= K; k++) ds.push(nearOn(pred[k], drawn, ext + (k / K) * (M - 1), win));
      const t = mul * (tol.edgeMm + tol.edgeStep * step);
      let offMm = 0;
      let maxD = 0;
      let at: PtMm | undefined;
      let run = 0;
      let bestRun = 0;
      let onN = 0;
      let offN = 0;
      const winP = Math.max(16, 0.08 * K);
      for (let j = ext; j < ext + M; j++) {
        const d = nearOn(drawn[j], pred, ((j - ext) / Math.max(1, M - 1)) * K, winP);
        ds.push(d);
        if (d > maxD) {
          maxD = d;
          at = { x: drawn[j].x + s.off.x, y: drawn[j].y + s.off.y };
        }
        if (d > t) {
          offMm += 0.5;
          run += 0.5;
          bestRun = Math.max(bestRun, run);
          if (near) {
            offN++;
            if (near({ x: drawn[j].x + s.off.x, y: drawn[j].y + s.off.y })) onN++;
          }
        } else run = 0;
      }
      const p95 = q95(ds);
      edges.push({
        e,
        p95,
        max: Math.max(maxD, ...ds),
        step,
        tol: t,
        len,
        offMm,
        run: bestRun,
        offN,
        onN,
        ...(at ? { offAt: at } : {}),
      });
      const sc = p95 / t;
      score = Math.max(score, sc);
      if (sc > worstScore) {
        worstScore = sc;
        worst = e;
      }
    }
    return { b, points, edges, score, worst, worstScore };
  };

  const verdictOf = (s: Size, T: ReadonlySet<number>): GfitSizeVerdict => {
    const v0 = base.sizes.find((x) => x.rank === s.rank)!;
    const v: GfitSizeVerdict = { ...v0, points: [], edges: [], score: 0 };
    if (topo.has(s.rank)) return { ...v, status: 'topology' };
    const B = bases(s.rank, T);
    if (!B.I && !B.L && !B.R) return { ...v, status: 'unpredictable' };
    // calibration (robust off): the plain leave-one-out — interpolation, else extrapolation
    let pick: Eval;
    let how: GfitSizeVerdict['how'];
    if (!robust) {
      pick = evalBasis(s, (B.I ?? B.L ?? B.R)!);
      how = pick.b.how;
    } else {
      const I = B.I ? evalBasis(s, B.I) : null;
      if (I && I.score <= 1) {
        pick = I;
        how = 'interp';
      } else {
        const sides = [B.L, B.R].filter((x): x is Basis => !!x).map((b) => evalBasis(s, b));
        const sideOk = sides.length > 0 && sides.every((x) => x.score <= 1);
        if (sideOk) {
          pick = sides.reduce((a, x) => (x.score < a.score ? x : a));
          how = I ? 'break' : 'extrap';
        } else {
          // the best explanation carries the verdict
          const all = [...(I ? [I] : []), ...sides];
          pick = all.reduce((a, x) => (x.score < a.score ? x : a));
          how = pick.b.how;
        }
      }
    }
    const { b, score, worst, worstScore } = pick;
    v.points = pick.points;
    v.edges = pick.edges;
    v.score = score;
    v.how = how;
    v.from = [b.r1, b.r2];
    v.status = score > 1 ? 'disagrees' : 'ok';
    if (v.status === 'disagrees' && worst >= 0) {
      const we = v.edges[worst];
      // the worst place: the worst edge (a strong grade point worse than every edge = 'other')
      v.worstEdge = worst;
      v.offRunMm = we.run;
      v.onNeighbour = we.offN ? we.onN / we.offN : 0;
      v.offAt = we.offAt;
      v.cause =
        worstScore < score
          ? 'other'
          : we.offN > 0 && v.onNeighbour >= 0.6
            ? 'neighbour'
            : we.run > 0 && we.run <= 15 && we.max <= 8
              ? 'notch'
              : 'other';
    }
    // excursions located on edges
    v.excursions = s.o.excursions.map((x) => {
      const n = s.o.pts.length;
      const c = Math.round(x.f * n) % n;
      for (let e = 0; e < G; e++) {
        const L = edgeLen(s, e);
        const d = (((c - s.idx[e]) % n) + n) % n;
        if (d <= L) return { e, t: L ? d / L : 0, f: x.f, depth: x.depth, p: sub(x.p, s.off) };
      }
      return { e: -1, t: -1, f: x.f, depth: x.depth, p: sub(x.p, s.off) };
    });
    return v;
  };

  // robust fit: the worst anchor out of tolerance leaves the trusted set — at most a third of the
  // anchors, and never below 3; then a removed anchor that agrees with the rest comes back. Still a
  // trusted anchor out of tolerance: the anchors do not agree with each other ('inconsistent').
  const trusted = new Set(anchors.map((s) => s.rank));
  let inconsistent = false;
  if (robust) {
    const removed: number[] = [];
    const floor = Math.max(3, Math.ceil((2 * anchors.length) / 3));
    for (;;) {
      let worst: { r: number; sc: number } | null = null;
      for (const r of trusted) {
        const v = verdictOf(byRank.get(r)!, trusted);
        if (v.status === 'disagrees' && (!worst || v.score > worst.sc)) worst = { r, sc: v.score };
      }
      if (!worst) break;
      if (trusted.size - 1 < floor) {
        inconsistent = anchors.length >= 3;
        break;
      }
      trusted.delete(worst.r);
      removed.push(worst.r);
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const r of removed) {
        if (trusted.has(r)) continue;
        if (verdictOf(byRank.get(r)!, trusted).status === 'ok') {
          trusted.add(r);
          changed = true;
        }
      }
    }
  }
  const verdicts = sizes.map((s) => verdictOf(s, trusted));
  // notch candidates per edge over the checked sizes: the same count in every size → chains by
  // order along the edge, each 'graded' (one side, position linear in rank within 3 mm), 'sign'
  // (a bump in some sizes, a cut-in in others) or 'nonlinear' (position not graded); different
  // counts → 'split' (the notch is in some sizes only)
  const checked = verdicts.filter((v) => v.status === 'ok' || v.status === 'disagrees');
  const notches: GfitFamily['notches'] = [];
  for (let e = 0; e < G && checked.length >= 2; e++) {
    const per = checked.map((v) => ({
      rank: v.rank,
      xs: v.excursions.filter((x) => x.e === e).sort((p, q) => p.t - q.t),
    }));
    const counts = per.map((x) => x.xs.length);
    const k = Math.max(...counts);
    if (!k) continue;
    if (counts.some((c) => c !== k)) {
      notches.push({
        e,
        kind: 'split',
        ranks: per.filter((x) => x.xs.length === k).map((x) => x.rank),
        missing: per.filter((x) => x.xs.length < k).map((x) => x.rank),
      });
      continue;
    }
    for (let i = 0; i < k; i++) {
      const chain = per.map((x) => ({ rank: x.rank, x: x.xs[i] }));
      const signs = new Set(chain.map((c) => Math.sign(c.x.depth)));
      let kind: 'graded' | 'sign' | 'nonlinear' = signs.size > 1 ? 'sign' : 'graded';
      if (kind === 'graded')
        for (let j = 1; j + 1 < chain.length; j++) {
          const a0 = chain[j - 1];
          const a1 = chain[j + 1];
          const w = (chain[j].rank - a0.rank) / (a1.rank - a0.rank);
          if (hyp(lerp(a0.x.p, a1.x.p, w), chain[j].x.p) > 3) kind = 'nonlinear';
        }
      notches.push({ e, kind, ranks: chain.map((c) => c.rank), missing: [] });
    }
  }

  // predicted rings for a rank: interpolation and both one-sided extrapolations (whichever exist)
  const predict = (rank: number) => {
    const B = bases(rank, trusted);
    return [B.I, B.L, B.R]
      .filter((b): b is Basis => !!b)
      .map((b) => {
        const S1 = byRank.get(b.r1)!;
        const S2 = byRank.get(b.r2)!;
        const dr = Math.abs(b.r2 - b.r1);
        // the gauge of a predicted size: lerp of the two gauges (stacked: zero)
        const off = lerp(S1.off, S2.off, b.w);
        const pts: PtMm[] = [];
        const step: number[] = [];
        for (let e = 0; e < G; e++) {
          const len = Math.max(edgeLen(S1, e), edgeLen(S2, e)) * 0.5;
          const K = edgeK(len);
          const a1 = edgeOf(S1, e, K);
          const a2 = edgeOf(S2, e, K);
          for (let k = 0; k < K; k++) {
            const p = lerp(a1[k], a2[k], b.w);
            pts.push({ x: p.x + off.x, y: p.y + off.y });
            step.push(hyp(a1[k], a2[k]) / dr);
          }
        }
        return { pts, step, how: b.how, from: [b.r1, b.r2] as [number, number] };
      });
  };

  return {
    model: true,
    ...(inconsistent ? { why: 'inconsistent' as const } : {}),
    frame,
    anchors: anchors.map((s) => s.rank),
    trusted: [...trusted].sort((a, b) => a - b),
    gradePoints: G,
    strongGradePoints: gps.filter((g) => g.strong).length,
    topoSkips,
    minRatio,
    stepMm: (() => {
      const tr = anchors.filter((s) => trusted.has(s.rank));
      const st: number[] = [];
      for (let k = 1; k < tr.length; k++)
        for (let g = 0; g < G; g++)
          st.push(hyp(gpos(tr[k], g), gpos(tr[k - 1], g)) / (tr[k].rank - tr[k - 1].rank));
      st.sort((a, b) => a - b);
      return st.length ? st[st.length >> 1] : 0;
    })(),
    sizes: verdicts,
    notches,
    predict,
  };
}
