// PATTERN-IMPORT · one-shot leave-one-out grade measurement (bundled by grade-loo.mjs).
// One PDF in, one GRADELOO JSON line out. Not part of the pipeline: it only reads closed
// outlines and reports how far a linear grade misses them.
//
// Correspondence (the whole difficulty), basis outlines only — the held-out contour is not an input:
//   1. CCW, drop the duplicated close. No translation: the sizes are nested on one sheet.
//   2. Corners: |turn| over ±2 mm, the strictest threshold in 70…22° at which every basis
//      outline has the same count ≥ 3; maxima within 4 mm collapse to the sharper one.
//   3. Cyclic shift onto the median-value outline: turn signs agree, cost is the sum of squared
//      corner distances. The start is the corner that moves least across the basis (a shared edge).
//   4. Each edge between matched corners is cut by arc fraction into the same count (1.5 mm on
//      the longer edge). Index i is the same place on the piece.
//   5. If that set of corners does not exist, fall back to arc length from the vertex nearest a
//      stable landmark of the median outline. That fallback is where a smooth neckline / sleeve
//      cap / a notch present in only one size goes wrong.
//
// Prediction is linear in parseSizeToken's value (00 → −2, 0 → 0, 2 → 2, …), not in the rank index.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { proposeSeeds, seedLabel } from 'lib/pattern-import/pieces';
import {
  bboxOf,
  dist,
  polyLen,
  quantile,
  resample,
  SegGrid,
  segNearest,
  signedArea,
} from 'lib/pattern-import/pieces/geom';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import type {
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
  SizeRun,
  SourceDoc,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { fillSample } from './pieces-run';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const TURN_MM = 2;
const CORNER_GAP_MM = 4;
const THRESHOLDS = [70, 55, 40, 30, 22];
const EDGE_STEP_MM = 1.5;
const SAMPLE_MM = 0.5;

type Method = 'near2' | 'far2' | 'near3';

type Hot = {
  spanMm: number;
  spanFrac: number;
  relX: number;
  relY: number;
  depthMm: number;
  concave: boolean;
  pieceW: number;
  pieceH: number;
};

type AlignInfo = {
  align: 'corners' | 'arc';
  corners: number;
  margin: number | null;
  stableMm: number;
  ambiguous: boolean;
  matchMm: number;
};

type Row = AlignInfo & {
  label: string;
  value: number;
  method: Method;
  from: string[];
  samePair: boolean;
  extrapolated: boolean;
  p95: number;
  max: number;
  dAreaMm2: number;
  dAreaPct: number;
  hot: Hot | null;
};

type Contour = {
  label: string;
  value: number;
  ring: PtMm[];
};

const r3 = (n: number) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);

function ringOf(pts: readonly PtMm[]): PtMm[] {
  const src = pts.map((p) => ({ x: p.x, y: p.y }));
  let p = src;
  if (p.length > 1 && dist(p[0], p[p.length - 1]) < 0.05) p = p.slice(0, -1);
  const out: PtMm[] = [];
  for (const q of p) if (!out.length || dist(q, out[out.length - 1]) > 0.02) out.push(q);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) < 0.05) out.pop();
  if (out.length > 2 && signedArea(out) < 0) out.reverse();
  return out;
}

function pointAlong(pts: readonly PtMm[], i: number, distMm: number, dir: 1 | -1): PtMm {
  const n = pts.length;
  let left = distMm;
  let k = i;
  for (let s = 0; s < n; s++) {
    const j = (k + dir + n) % n;
    const L = dist(pts[k], pts[j]);
    if (L >= left && L > 1e-9) {
      const t = left / L;
      return { x: pts[k].x + (pts[j].x - pts[k].x) * t, y: pts[k].y + (pts[j].y - pts[k].y) * t };
    }
    left -= L;
    k = j;
    if (left <= 1e-9) return pts[k];
  }
  return pts[i];
}

/** Signed turn in degrees at vertex i, measured over ±2 mm. Positive = left = convex on a CCW ring. */
function turnDeg(pts: readonly PtMm[], i: number): number {
  const a = pointAlong(pts, i, TURN_MM, -1);
  const b = pointAlong(pts, i, TURN_MM, 1);
  const p = pts[i];
  const ux = p.x - a.x;
  const uy = p.y - a.y;
  const vx = b.x - p.x;
  const vy = b.y - p.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu < 1e-6 || lv < 1e-6) return 0;
  const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
  const ang = (Math.acos(c) * 180) / Math.PI;
  return ux * vy - uy * vx >= 0 ? ang : -ang;
}

function turnsOf(pts: readonly PtMm[]): number[] {
  return pts.map((_, i) => turnDeg(pts, i));
}

/** Sharper corners win; another corner within 4 mm is the same corner. */
function cornerIdx(ring: readonly PtMm[], tr: readonly number[], T: number): number[] {
  const cand = tr
    .map((d, i) => ({ i, a: Math.abs(d) }))
    .filter((c) => c.a >= T)
    .sort((a, b) => b.a - a.a);
  const keep: number[] = [];
  for (const c of cand) {
    if (keep.some((k) => dist(ring[k], ring[c.i]) < CORNER_GAP_MM)) continue;
    keep.push(c.i);
  }
  keep.sort((a, b) => a - b);
  return keep;
}

function bestShift(
  refPts: readonly PtMm[],
  refC: readonly number[],
  refTr: readonly number[],
  othPts: readonly PtMm[],
  othC: readonly number[],
  othTr: readonly number[],
): { s: number; cost: number; second: number | null } | null {
  const K = refC.length;
  let best: { s: number; cost: number } | null = null;
  let second: number | null = null;
  for (let s = 0; s < K; s++) {
    let cost = 0;
    let ok = true;
    for (let k = 0; k < K; k++) {
      const i = refC[k];
      const j = othC[(k + s) % K];
      const si = Math.sign(refTr[i]);
      const sj = Math.sign(othTr[j]);
      if (si !== 0 && sj !== 0 && si !== sj) {
        ok = false;
        break;
      }
      const dx = refPts[i].x - othPts[j].x;
      const dy = refPts[i].y - othPts[j].y;
      cost += dx * dx + dy * dy;
    }
    if (!ok) continue;
    if (!best || cost < best.cost - 1e-6) {
      if (best) second = second == null ? best.cost : Math.min(second, best.cost);
      best = { s, cost };
    } else if (second == null || cost < second) second = cost;
  }
  return best ? { s: best.s, cost: best.cost, second } : null;
}

function edgePoints(pts: readonly PtMm[], i0: number, i1: number): PtMm[] {
  const n = pts.length;
  const out: PtMm[] = [pts[i0]];
  let i = i0;
  for (let s = 0; s < n; s++) {
    i = (i + 1) % n;
    out.push(pts[i]);
    if (i === i1) break;
  }
  return out;
}

/** n points from fraction 0 inclusive to 1 exclusive along an open polyline. */
function byArcOpen(pts: readonly PtMm[], n: number): PtMm[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const out: PtMm[] = [];
  for (let k = 0; k < n; k++) {
    if (L <= 1e-9) {
      out.push({ x: pts[0].x, y: pts[0].y });
      continue;
    }
    const s = (L * k) / n;
    let j = 1;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const seg = cum[j] - cum[j - 1];
    const t = seg > 1e-9 ? (s - cum[j - 1]) / seg : 0;
    const a = pts[j - 1];
    const b = pts[j];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function sampleClosed(pts: readonly PtMm[], n: number): PtMm[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  cum.push(cum[cum.length - 1] + dist(pts[pts.length - 1], pts[0]));
  const L = cum[cum.length - 1] || 1;
  const ring = [...pts, pts[0]];
  const out: PtMm[] = [];
  for (let k = 0; k < n; k++) {
    const s = (L * k) / n;
    let j = 1;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const seg = cum[j] - cum[j - 1];
    const t = seg > 1e-9 ? (s - cum[j - 1]) / seg : 0;
    const a = ring[j - 1];
    const b = ring[j];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function resampleEdges(rings: readonly PtMm[][], corners: number[][]): PtMm[][] {
  const K = corners[0].length;
  const out: PtMm[][] = rings.map(() => []);
  for (let e = 0; e < K; e++) {
    const edges = rings.map((r, z) => edgePoints(r, corners[z][e], corners[z][(e + 1) % K]));
    const n = Math.max(2, Math.round(Math.max(...edges.map((ed) => polyLen(ed))) / EDGE_STEP_MM));
    edges.forEach((ed, z) => out[z].push(...byArcOpen(ed, n)));
  }
  return out;
}

function outgoing(pts: readonly PtMm[], i: number): PtMm {
  const j = (i + 1) % pts.length;
  const L = dist(pts[i], pts[j]) || 1;
  return { x: (pts[j].x - pts[i].x) / L, y: (pts[j].y - pts[i].y) / L };
}

function dot(a: PtMm, b: PtMm): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Same point count, same index = same place. `rings[0]` is the reference (caller puts the
 * median-value size there). Returns null when the corner phase is not a plausible match.
 */
function matchCorners(
  rings: PtMm[][],
  tr: number[][],
  cs: number[][],
): (AlignInfo & { pts: PtMm[][] }) | null {
  const shifts = cs.map(() => 0);
  let worstMargin = Infinity;
  let ambiguous = false;
  let matchSs = 0;
  let pairs = 0;
  for (let z = 1; z < rings.length; z++) {
    const m = bestShift(rings[0], cs[0], tr[0], rings[z], cs[z], tr[z]);
    if (!m) return null;
    shifts[z] = m.s;
    if (m.second != null) worstMargin = Math.min(worstMargin, m.second / Math.max(m.cost, 1e-9));
    if (m.second != null && m.second < 1.5 * Math.max(m.cost, 1)) ambiguous = true;
    matchSs += m.cost;
    pairs += cs[0].length;
  }
  const rms = Math.sqrt(matchSs / Math.max(1, pairs));
  // a wrong phase pairs a hem with a shoulder; a real grade of 00 against 32 does not
  if (rms > 150) return null;
  const shifted = cs.map((c, z) => c.map((_, i) => c[(i + shifts[z]) % c.length]));
  const K = shifted[0].length;
  let bestK = 0;
  let bestSpread = Infinity;
  for (let i = 0; i < K; i++) {
    const pts = shifted.map((c, z) => rings[z][c[i]]);
    const mean = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    let mx = 0;
    for (const p of pts) mx = Math.max(mx, dist(p, mean));
    if (mx < bestSpread) {
      bestSpread = mx;
      bestK = i;
    }
  }
  const rot = shifted.map((c) => c.slice(bestK).concat(c.slice(0, bestK)));
  return {
    pts: resampleEdges(rings, rot),
    align: 'corners',
    corners: K,
    margin: Number.isFinite(worstMargin) ? worstMargin : null,
    stableMm: bestSpread,
    ambiguous,
    matchMm: rms,
  };
}

/** Arc-length fallback. The origin is the vertex nearest a high-turn landmark of ring 0. */
function arcAlign(rings: PtMm[][]): AlignInfo & { pts: PtMm[][] } {
  const tr = turnsOf(rings[0]);
  const order = tr.map((d, i) => ({ i, a: Math.abs(d) })).sort((a, b) => b.a - a.a);
  const strong = order.filter((c) => c.a >= 20).slice(0, 12);
  const use = strong.length >= 1 ? strong : order.slice(0, 4);
  let bestWorst = Infinity;
  let picks = rings.map(() => 0);
  for (const c of use) {
    const p = rings[0][c.i];
    const tang = outgoing(rings[0], c.i);
    const got: number[] = [];
    let worst = 0;
    for (let z = 0; z < rings.length; z++) {
      if (z === 0) {
        got.push(c.i);
        continue;
      }
      let bi = 0;
      let bd = Infinity;
      let bdot = -Infinity;
      for (let i = 0; i < rings[z].length; i++) {
        const d = dist(rings[z][i], p);
        const dt = dot(outgoing(rings[z], i), tang);
        if (d < bd - 0.5 || (Math.abs(d - bd) <= 0.5 && dt > bdot)) {
          bd = d;
          bi = i;
          bdot = dt;
        }
      }
      got.push(bi);
      worst = Math.max(worst, bd);
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      picks = got;
    }
  }
  const n = Math.max(
    80,
    Math.min(700, Math.round(Math.max(...rings.map((r) => polyLen(r, true))) / EDGE_STEP_MM)),
  );
  const pts = rings.map((r, z) => sampleClosed(r.slice(picks[z]).concat(r.slice(0, picks[z])), n));
  return {
    pts,
    align: 'arc',
    corners: 0,
    margin: null,
    stableMm: Number.isFinite(bestWorst) ? bestWorst : 1e6,
    ambiguous: false,
    matchMm: Number.isFinite(bestWorst) ? bestWorst : 1e6,
  };
}

function align(ringsIn: readonly PtMm[][]): AlignInfo & { pts: PtMm[][] } {
  const rings = ringsIn.map(ringOf);
  if (rings.some((r) => r.length < 4))
    return arcAlign(rings.map((r) => (r.length ? r : [{ x: 0, y: 0 }])));
  const tr = rings.map(turnsOf);
  for (const T of THRESHOLDS) {
    const cs = rings.map((r, i) => cornerIdx(r, tr[i], T));
    const k = cs[0].length;
    if (k >= 3 && cs.every((c) => c.length === k)) {
      const hit = matchCorners(rings, tr, cs);
      if (hit) return hit;
    }
  }
  return arcAlign(rings);
}

function refFirst(basis: readonly Contour[]): Contour[] {
  const s = basis.slice().sort((a, b) => a.value - b.value);
  const mid = s[(s.length - 1) >> 1];
  return [mid, ...s.filter((x) => x !== mid)];
}

function lerp2(a: readonly PtMm[], b: readonly PtMm[], va: number, vb: number, vk: number): PtMm[] {
  const w = (vk - va) / (vb - va);
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * w,
    y: p.y + (b[i].y - p.y) * w,
  }));
}

/** Least squares x = a + b·v, y likewise, one fit per corresponded index. */
function fit3(pts: readonly PtMm[][], vs: readonly number[], vk: number): PtMm[] {
  let s1 = 0;
  let sv = 0;
  let svv = 0;
  for (const v of vs) {
    s1 += 1;
    sv += v;
    svv += v * v;
  }
  const det = s1 * svv - sv * sv;
  return pts[0].map((_, i) => {
    let sx = 0;
    let svx = 0;
    let sy = 0;
    let svy = 0;
    for (let k = 0; k < vs.length; k++) {
      sx += pts[k][i].x;
      svx += vs[k] * pts[k][i].x;
      sy += pts[k][i].y;
      svy += vs[k] * pts[k][i].y;
    }
    const ax = (sx * svv - sv * svx) / det;
    const bx = (s1 * svx - sv * sx) / det;
    const ay = (sy * svv - sv * svy) / det;
    const by = (s1 * svy - sv * sy) / det;
    return { x: ax + bx * vk, y: ay + by * vk };
  });
}

type Target = {
  line: PtMm[];
  grid: SegGrid;
  area: number;
  per: number;
  boxW: number;
  boxH: number;
  minX: number;
  minY: number;
};

function prepareTarget(real: readonly PtMm[]): Target {
  const line = [...real, real[0]];
  const grid = new SegGrid(8);
  grid.addPolyline(0, line);
  const box = bboxOf(real);
  return {
    line,
    grid,
    area: Math.abs(signedArea(real)),
    per: polyLen(real as PtMm[], true),
    boxW: Math.max(1e-6, box.maxX - box.minX),
    boxH: Math.max(1e-6, box.maxY - box.minY),
    minX: box.minX,
    minY: box.minY,
  };
}

function distTo(p: PtMm, t: Target): number {
  for (const r of [6, 24, 96, 400]) {
    let d = Infinity;
    t.grid.near(p, r, (_o, i) => {
      const dd = segNearest(p, t.line[i], t.line[i + 1]).d;
      if (dd < d) d = dd;
    });
    if (d <= r) return d;
  }
  let d = Infinity;
  for (let i = 0; i < t.line.length - 1; i++) {
    const dd = segNearest(p, t.line[i], t.line[i + 1]).d;
    if (dd < d) d = dd;
  }
  return d;
}

function leftOf(a: PtMm, b: PtMm, p: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return (dx * (p.y - a.y) - dy * (p.x - a.x)) / L;
}

function hotOf(samples: { p: PtMm; d: number }[], t: Target, p95: number): Hot | null {
  if (p95 < 1 || !samples.length) return null;
  const thr = Math.max(1, p95 * 0.5);
  const n = samples.length;
  const bad = samples.map((s) => s.d >= thr);
  if (!bad.some(Boolean)) return null;
  const per = Math.max(t.per, n * SAMPLE_MM);
  let s0 = 0;
  let e0 = n - 1;
  const origin = bad.findIndex((b) => !b);
  if (origin >= 0) {
    let bestSum = -1;
    for (let k = 0; k < n; k++) {
      const i = (origin + k) % n;
      if (!bad[i] || bad[(i - 1 + n) % n]) continue;
      let sum = 0;
      let e = i;
      for (let u = 0; u < n; u++) {
        const j = (i + u) % n;
        if (!bad[j]) break;
        sum += samples[j].d;
        e = j;
      }
      if (sum > bestSum) {
        bestSum = sum;
        s0 = i;
        e0 = e;
      }
    }
  }
  const len = origin < 0 ? n : ((e0 - s0 + n) % n) + 1;
  const spanMm = len * SAMPLE_MM;
  const mid = samples[(s0 + Math.floor(len / 2)) % n].p;
  const a = samples[s0].p;
  const b = samples[e0].p;
  const depth = leftOf(a, b, mid);
  return {
    spanMm: r3(spanMm),
    spanFrac: r3(spanMm / per),
    relX: r3((mid.x - t.minX) / t.boxW),
    relY: r3((mid.y - t.minY) / t.boxH),
    depthMm: r3(depth),
    concave: depth > 1.5,
    pieceW: r3(t.boxW),
    pieceH: r3(t.boxH),
  };
}

function measure(
  pred: readonly PtMm[],
  t: Target,
  p95Gate: boolean,
): {
  p95: number;
  max: number;
  dAreaMm2: number;
  dAreaPct: number;
  hot: Hot | null;
} {
  const samples = resample(pred, SAMPLE_MM, true).map((p) => ({ p, d: distTo(p, t) }));
  const ds = samples.map((s) => s.d);
  const p95 = ds.length ? quantile(ds, 0.95) : Infinity;
  let max = 0;
  for (const d of ds) if (d > max) max = d;
  const area = Math.abs(signedArea(pred));
  const dArea = area - t.area;
  return {
    p95,
    max,
    dAreaMm2: dArea,
    dAreaPct: t.area > 1 ? (dArea / t.area) * 100 : 0,
    hot: p95Gate ? hotOf(samples, t, p95) : null,
  };
}

function sameValues(a: readonly Contour[], b: readonly Contour[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a.map((x) => x.value));
  return b.every((x) => s.has(x.value));
}

function closest(others: readonly Contour[], k: number, v: number): Contour[] {
  return others
    .slice()
    .sort((a, b) => Math.abs(a.value - v) - Math.abs(b.value - v) || a.value - b.value)
    .slice(0, k);
}

function farthest(others: readonly Contour[], v: number): Contour[] {
  return others
    .slice()
    .sort((a, b) => Math.abs(b.value - v) - Math.abs(a.value - v) || a.value - b.value)
    .slice(0, 2);
}

function predictRow(
  target: Contour,
  basisIn: readonly Contour[],
  method: Method,
  samePair: boolean,
): Row {
  const basis = refFirst(basisIn);
  const aligned = align(basis.map((b) => b.ring));
  const vs = basis.map((b) => b.value);
  const pred =
    method === 'near3'
      ? fit3(aligned.pts, vs, target.value)
      : lerp2(aligned.pts[0], aligned.pts[1], vs[0], vs[1], target.value);
  const real = ringOf(target.ring);
  const prep = prepareTarget(real);
  const err = measure(pred, prep, true);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const { pts: _pts, ...info } = aligned;
  return {
    ...info,
    label: target.label,
    value: target.value,
    method,
    from: basis
      .slice()
      .sort((a, b) => a.value - b.value)
      .map((b) => b.label),
    samePair,
    extrapolated: target.value < lo - 1e-6 || target.value > hi + 1e-6,
    p95: err.p95,
    max: err.max,
    dAreaMm2: err.dAreaMm2,
    dAreaPct: err.dAreaPct,
    hot: err.hot,
  };
}

/** Leave-one-out over one piece. Contours must already carry parsed size values. */
export function gradeContours(contours: readonly Contour[]): Row[] {
  const rows: Row[] = [];
  for (const t of contours) {
    const others = contours.filter((c) => c !== t);
    if (others.length < 2) continue;
    const near = closest(others, 2, t.value);
    const far = farthest(others, t.value);
    const same = sameValues(near, far);
    rows.push(predictRow(t, near, 'near2', same));
    rows.push(predictRow(t, far, 'far2', same));
    if (others.length >= 3) rows.push(predictRow(t, closest(others, 3, t.value), 'near3', false));
  }
  return rows;
}

function roundRow(row: Row): Row {
  return {
    ...row,
    margin: row.margin == null ? null : r3(row.margin),
    stableMm: r3(row.stableMm),
    matchMm: r3(row.matchMm),
    p95: r3(row.p95),
    max: r3(row.max),
    dAreaMm2: r3(row.dAreaMm2),
    dAreaPct: r3(row.dAreaPct),
  };
}

function derivedMm(c: PieceCandidate): number {
  let L = 0;
  for (const d of c.derived ?? []) {
    if (d.kind === 'shared-rank' || d.pts.length < 2) continue;
    L += polyLen(d.pts, false);
  }
  return L;
}

function continuityMm(c: PieceCandidate): number {
  let L = 0;
  for (const e of c.continuity ?? []) if (e.pts.length >= 2) L += polyLen(e.pts, false);
  return L;
}

function hintOf(cands: readonly PieceCandidate[], textOf: Map<number, string>): string {
  const bits: string[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    for (const id of c.textsInside ?? []) {
      const t = textOf.get(id)?.replace(/\s+/g, ' ').trim();
      if (!t || t.length > 48 || seen.has(t)) continue;
      seen.add(t);
      bits.push(t);
      if (bits.length >= 6) return bits.join(' · ');
    }
  }
  return bits.join(' · ');
}

function gradeFamily(
  f: PieceFamily,
  run: SizeRun,
  seeds: readonly Seed[],
  textOf: Map<number, string>,
) {
  const seed = seeds.find((s) => s.id === f.seed);
  const label = (seed && seedLabel(seed)) || `#${f.seed}`;
  const outcomes: Record<string, number> = {};
  const byRank = new Map<number, PieceCandidate>();
  let dup = 0;
  for (const c of f.candidates) {
    outcomes[c.outcome] = (outcomes[c.outcome] ?? 0) + 1;
    if (c.outcome !== 'closed' || c.outer.length < 3) continue;
    const prev = byRank.get(c.rank);
    if (prev) dup++;
    if (!prev || c.areaMm2 > prev.areaMm2) byRank.set(c.rank, c);
  }
  const sizes: {
    rank: number;
    label: string;
    value: number | null;
    areaMm2: number;
    rankFrom: string | null;
    derivedMm: number;
    continuityMm: number;
  }[] = [];
  const contours: Contour[] = [];
  const seenVal = new Map<number, string>();
  const notes: string[] = [];
  if (dup) notes.push(`${dup} ranks had two closed outlines; the larger area was kept`);
  for (const c of [...byRank.values()].sort((a, b) => a.rank - b.rank)) {
    const src = run.sizes.find((s) => s.rank === c.rank) ?? run.sizes[c.rank];
    const raw = src?.label?.trim() ?? '';
    const tok = (raw && (parseSizeToken(raw, true) ?? parseSizeToken(raw))) || null;
    const dMm = derivedMm(c);
    const cMm = continuityMm(c);
    sizes.push({
      rank: c.rank,
      label: tok?.label || raw || `#${c.rank}`,
      value: tok ? tok.value : null,
      areaMm2: r3(c.areaMm2),
      rankFrom: c.rankFrom ?? null,
      derivedMm: r3(dMm),
      continuityMm: r3(cMm),
    });
    if (!tok) {
      notes.push(`size rank ${c.rank} label ${JSON.stringify(raw)} did not parse`);
      continue;
    }
    const other = seenVal.get(tok.value);
    if (other) {
      notes.push(
        `labels ${other} and ${tok.label} are the same value ${tok.value}; the first is kept`,
      );
      continue;
    }
    seenVal.set(tok.value, tok.label);
    contours.push({ label: tok.label, value: tok.value, ring: c.outer });
  }
  const odd = sizes.filter(
    (s) => s.rankFrom && !['class', 'innerPlug', 'bundleRank', 'single'].includes(s.rankFrom),
  );
  if (odd.length) notes.push(`rankFrom ${odd.map((s) => `${s.label}:${s.rankFrom}`).join(', ')}`);
  const bridged = sizes.filter((s) => s.derivedMm > 8);
  if (bridged.length)
    notes.push(`derived bridge > 8 mm on ${bridged.map((s) => s.label).join(', ')}`);
  const cont = sizes.filter((s) => s.continuityMm > 8);
  if (cont.length) notes.push(`continuity wall > 8 mm on ${cont.map((s) => s.label).join(', ')}`);
  if (!f.monotone) notes.push('fill flagged the family not monotone');
  const ordered = contours.slice().sort((a, b) => a.value - b.value);
  let areaFalls = false;
  for (let i = 1; i < ordered.length; i++) {
    const prev = sizes.find((s) => s.label === ordered[i - 1].label);
    const cur = sizes.find((s) => s.label === ordered[i].label);
    if (prev && cur && cur.areaMm2 < prev.areaMm2 * 0.98) areaFalls = true;
  }
  if (areaFalls) notes.push('area falls as the size value rises');
  const eligible = ordered.length >= 3;
  if (!eligible) notes.push(`closed parsed sizes ${ordered.length} < 3`);
  const rows = eligible ? gradeContours(ordered).map(roundRow) : [];
  const arc = rows.filter((r) => r.align === 'arc').length;
  const amb = rows.filter((r) => r.ambiguous).length;
  if (arc) notes.push(`arc-length fallback on ${arc} of ${rows.length} predictions`);
  if (amb) notes.push(`ambiguous corner phase on ${amb} predictions`);
  return {
    seed: f.seed,
    label,
    hint: hintOf(f.candidates, textOf),
    monotone: f.monotone,
    outcomes,
    closed: byRank.size,
    parsed: ordered.length,
    eligible,
    notes,
    sizes,
    rows,
  };
}

function shortName(name: string): string {
  if (/leah/i.test(name)) return 'Leah';
  if (/dyanna/i.test(name)) return 'Dyanna';
  if (/cassandra/i.test(name)) return 'Cassandra';
  return name.replace(/\.pdf$/i, '');
}

export async function main(argv: string[]) {
  if (argv[0] === '--selftest') {
    selfTest();
    console.log('GRADELOO {"selftest":"ok"}');
    return;
  }
  const pdf = argv[0];
  const name = basename(pdf);
  const cache = resolve(process.env.REGRESS_CACHE ?? '/tmp/patimport-regress-cache');
  const cp = resolve(cache, `${name.replace(/\W+/g, '_')}.json`);
  const t0 = Date.now();
  const out: Record<string, unknown> = { name, short: shortName(name) };
  try {
    let doc: SourceDoc;
    if (existsSync(cp)) {
      console.error(`${shortName(name)}: cache hit`);
      doc = JSON.parse(readFileSync(cp, 'utf8')) as SourceDoc;
    } else {
      console.error(`${shortName(name)}: extracting`);
      const b = readFileSync(pdf);
      doc = await extractPdf(
        {
          id: '0',
          name,
          bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        },
        DEFAULT_EXTRACT_OPTS,
      );
      mkdirSync(dirname(cp), { recursive: true });
      writeFileSync(cp, JSON.stringify(doc));
    }
    console.error(`${shortName(name)}: chains`);
    const docs = [doc];
    const sheet = assembleSheet(docs, classifyPages(docs), 0);
    const texts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
    const { set } = buildChainsDetailed(
      sheet,
      {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
      { extraTexts: texts, fileNames: new Map([['0', name]]) },
    );
    const run = detectSizeRun(sheet, set, [doc.file]);
    console.error(`${shortName(name)}: fill (${run.sizes.length} sizes)`);
    const seeds = proposeSeeds(sheet, set);
    const prep = {
      sample: { id: name, files: [name], sheet: 0 },
      sheet,
      set,
      run,
      docTexts: texts,
      files: [{ id: '0', name }],
      ms: { assemble: 0, chains: 0 },
    };
    const sr = fillSample(prep as never, seeds, null);
    console.error(`${shortName(name)}: grade ${sr.families.length} families`);
    const textOf = new Map(sheet.texts.map((t) => [t.id, t.text]));
    const pieces = sr.families.map((f) => gradeFamily(f, run, seeds, textOf));
    out.run = run.sizes.map((s) => {
      const tok = s.label ? parseSizeToken(s.label, true) ?? parseSizeToken(s.label) : null;
      return { rank: s.rank, label: s.label, value: tok ? tok.value : null };
    });
    out.encoding = run.encoding;
    out.families = sr.families.length;
    out.eligible = pieces.filter((p) => p.eligible).length;
    out.pieces = pieces;
    out.seconds = Math.round((Date.now() - t0) / 1000);
    console.error(
      `${shortName(name)}: done ${out.seconds}s, eligible ${out.eligible}/${out.families}`,
    );
  } catch (e) {
    out.error = String((e as Error).message ?? e).slice(0, 300);
    console.error(`${shortName(name)}: ${out.error}`);
  }
  console.log(`GRADELOO ${JSON.stringify(out)}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`selftest: ${msg}`);
}

/** Rectangle growing from the left and bottom edges. `quad` bows the width by 0.15·v². */
function gradedRect(value: number, quad: boolean, divs: number): PtMm[] {
  const w = 100 + 2 * value + (quad ? 0.15 * value * value : 0);
  const h = 180;
  const edge = (a: PtMm, b: PtMm) => {
    const pts: PtMm[] = [];
    for (let i = 0; i < divs; i++) {
      const t = i / divs;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return pts;
  };
  return [
    ...edge({ x: 0, y: 0 }, { x: w, y: 0 }),
    ...edge({ x: w, y: 0 }, { x: w, y: h }),
    ...edge({ x: w, y: h }, { x: 0, y: h }),
    ...edge({ x: 0, y: h }, { x: 0, y: 0 }),
  ];
}

function selfTest() {
  const tok = (s: string) => parseSizeToken(s, true);
  const a = tok('00');
  const b = tok('0');
  const c = tok('2');
  const d = tok('4');
  assert(!!a && !!b && !!c && !!d, 'tokens parse');
  assert(
    a!.value === -2 && b!.value === 0 && c!.value === 2 && d!.value === 4,
    `values ${a?.value} ${b?.value}`,
  );
  assert(
    b!.value - a!.value === 2 && c!.value - b!.value === 2 && d!.value - c!.value === 2,
    'step 2',
  );

  // -2 is a rotated clockwise ring with a different point count; 2 is corners only.
  // Value weights are not rank weights: -2, 0, 8 is not evenly spaced in index.
  const cw = gradedRect(-2, false, 3).slice().reverse();
  const linear: Contour[] = [
    { label: '-2', value: -2, ring: cw.slice(5).concat(cw.slice(0, 5)) },
    { label: '0', value: 0, ring: gradedRect(0, false, 4) },
    { label: '2', value: 2, ring: gradedRect(2, false, 1) },
    { label: '8', value: 8, ring: gradedRect(8, false, 4) },
  ];
  const rows = gradeContours(linear);
  const at = (v: number, m: Method) => rows.find((r) => r.value === v && r.method === m);
  const mid = at(0, 'near2');
  assert(!!mid, 'near2 of 0');
  assert(mid!.align === 'corners', `linear align ${mid!.align}`);
  assert(mid!.p95 < 0.15, `linear near2 p95 ${mid!.p95}`);
  assert(!mid!.extrapolated, '0 is bracketed by its two nearest');
  assert(mid!.from.join(',') === '-2,2', `near basis ${mid!.from}`);
  const mid3 = at(0, 'near3');
  assert(!!mid3 && mid3.p95 < 0.15, `linear near3 p95 ${mid3?.p95}`);
  const far = at(0, 'far2');
  assert(!!far && far.p95 < 0.15, `linear far2 p95 ${far?.p95}`);
  assert(far!.from.join(',') === '-2,8', `far basis ${far!.from}`);
  const end = at(-2, 'near2');
  assert(!!end && end.extrapolated && end.p95 < 0.15, `linear extrapolation p95 ${end?.p95}`);

  const quad: Contour[] = [-2, 0, 2, 8].map((v) => ({
    label: String(v),
    value: v,
    ring: gradedRect(v, true, 4),
  }));
  const qNear = gradeContours(quad).find((r) => r.value === 0 && r.method === 'near2');
  const qFar = gradeContours(quad).find((r) => r.value === 0 && r.method === 'far2');
  assert(!!qNear && qNear.p95 > 0.3, `quadratic neighbour residual p95 ${qNear?.p95}`);
  assert(
    !!qFar && qFar.p95 > 1.2,
    `quadratic far residual p95 ${qFar?.p95} (the line should miss)`,
  );
  console.error(
    `selftest ok · linear p95 ${mid!.p95.toFixed(3)} · quadratic near ${qNear!.p95.toFixed(3)} far ${qFar!.p95.toFixed(3)} · 00→${a!.value}`,
  );
}
