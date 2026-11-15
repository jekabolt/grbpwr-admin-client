// Variant D of the grade prediction: every anchor of the family, not only the two around the size.
//
// The pair prediction (checks.ts predictPair, "C") lerps the two nearest anchors: exact when the
// grade is clean, but one bad neighbour carries straight into the drawn stretch (at the edge of the
// size run it is doubled by the extrapolation). D maps every other anchor into the pair's sample
// space and fits each sample as a continuous piecewise-linear function of the rank (0–2 breaks, each
// piece over ≥ 3 sizes — size charts change step), Huber-weighted on residuals smoothed along the
// ring, so a size that is wrong over a stretch counts as a zone and loses its weight there.
// Leave-one-out on 19 files (journal "Grade over all sizes (variant D)"): equal to C on clean data,
// with one bumped neighbour > 2 mm in 5.3 % of the hides inside the run (C 12.8 %) and 61 % at the
// edge (C 99 %); below 4 sizes it equals C. Used by repairSize only where C is fragile: the edge
// step and families whose anchors disagree a little (GFIT_REPAIR.gradeAll*).
import type { PtMm } from 'lib/pattern-import/types';

import { predictPair } from './checks';
import type { GfitOutline } from './outline';

/** Robust-weight smoothing along the ring: ± this many samples (~10 mm at 0.7 mm per sample). */
const WIN = 7;
/** Huber δ floor, mm: residuals below it are noise of the reader, not a disagreement. */
const DELTA_MIN = 0.8;
const ITERS = 4;

type Series = { x: Float64Array; y: Float64Array };

const basisRow = (v: number, breaks: readonly number[]) => [
  1,
  v,
  ...breaks.map((b) => Math.max(0, v - b)),
];

/** Gauss–Jordan on [A | B] with two right-hand columns (x, y). */
function solve(A: number[][], B: number[][], m: number): number[][] | null {
  const M = A.map((r, i) => [...r, ...B[i]]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let q = c; q < m + 2; q++) M[r][q] -= f * M[c][q];
    }
  }
  return M.slice(0, m).map((r, i) => [r[m] / r[i], r[m + 1] / r[i]]);
}

/**
 * Fit every sample of the ring over the sizes and evaluate at `at`. `sub` > 1 fits every sub-th
 * sample only (break selection). Returns the prediction and the mean weighted squared residual.
 */
function fitSeries(
  vs: readonly number[],
  S: readonly Series[],
  breaks: readonly number[],
  at: number,
  sub = 1,
) {
  const J = vs.length;
  const n = S[0].x.length;
  const m = 2 + breaks.length;
  const X = vs.map((v) => basisRow(v, breaks));
  const bk = basisRow(at, breaks);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  let w = Array.from({ length: n }, () => new Float64Array(J).fill(1));
  const rs = Array.from({ length: J }, () => new Float64Array(n));
  const idx: number[] = [];
  for (let i = 0; i < n; i += sub) idx.push(i);
  let cost = 0;
  for (let it = 0; it < ITERS; it++) {
    cost = 0;
    let cnt = 0;
    for (const i of idx) {
      const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
      const B = Array.from({ length: m }, () => [0, 0]);
      for (let j = 0; j < J; j++) {
        const wj = w[i][j];
        for (let a = 0; a < m; a++) {
          for (let b = 0; b < m; b++) A[a][b] += wj * X[j][a] * X[j][b];
          B[a][0] += wj * X[j][a] * S[j].x[i];
          B[a][1] += wj * X[j][a] * S[j].y[i];
        }
      }
      for (let a = 0; a < m; a++) A[a][a] += 1e-9;
      const c = solve(A, B, m);
      if (!c) continue;
      let qx = 0;
      let qy = 0;
      for (let a = 0; a < m; a++) {
        qx += c[a][0] * bk[a];
        qy += c[a][1] * bk[a];
      }
      px[i] = qx;
      py[i] = qy;
      for (let j = 0; j < J; j++) {
        let fx = 0;
        let fy = 0;
        for (let a = 0; a < m; a++) {
          fx += c[a][0] * X[j][a];
          fy += c[a][1] * X[j][a];
        }
        const r2 = (S[j].x[i] - fx) ** 2 + (S[j].y[i] - fy) ** 2;
        rs[j][i] = r2;
        cost += w[i][j] * r2;
        cnt++;
      }
    }
    cost = cnt ? cost / cnt : Infinity;
    // residuals smoothed along the ring (cyclic) → Huber weights per sample and size
    const nw = Array.from({ length: n }, () => new Float64Array(J).fill(1));
    for (const i of idx) {
      const sm = new Float64Array(J);
      for (let j = 0; j < J; j++) {
        let s = 0;
        let c = 0;
        for (let d = -WIN; d <= WIN; d++) {
          const q = (((i + d * sub) % n) + n) % n;
          if (sub > 1 && q % sub) continue;
          s += rs[j][q];
          c++;
        }
        sm[j] = Math.sqrt(s / Math.max(1, c));
      }
      const med = [...sm].sort((a, b) => a - b)[(J - 1) >> 1];
      const delta = Math.max(DELTA_MIN, 1.5 * med);
      for (let j = 0; j < J; j++) nw[i][j] = sm[j] <= delta ? 1 : delta / sm[j];
    }
    w = nw;
  }
  return { px, py, cost };
}

/** Greedy breaks (0–2) over the interior sizes, each linear piece over ≥ 3 sizes. */
function chooseBreaks(vs: readonly number[], S: readonly Series[]): number[] {
  const J = vs.length;
  let best: number[] = [];
  let bestCost = fitSeries(vs, S, [], vs[0], 4).cost;
  for (let round = 0; round < 2; round++) {
    let pick: { b: number[]; c: number } | null = null;
    for (let t = 2; t <= J - 3; t++) {
      const b = [...best, vs[t]].sort((p, q) => p - q);
      const ts = b.map((x) => vs.indexOf(x));
      if (ts.some((x, i) => i > 0 && x - ts[i - 1] < 2)) continue;
      const c = fitSeries(vs, S, b, vs[0], 4).cost;
      if (!pick || c < pick.c) pick = { b, c };
    }
    // a break must explain a quarter of the cost, and more than reader noise
    if (!pick || bestCost - pick.c < 0.25 * bestCost || bestCost - pick.c < 0.15) break;
    best = pick.b;
    bestCost = pick.c;
  }
  return best;
}

/**
 * Carry the reference samples `A0` onto another size: each sample is projected onto `PR` (the
 * reference in the pair space reference ↔ other) and the same place on `Po` (the other size in that
 * space) is taken. Walks forward with a local window after the first sample.
 */
function mapPair(A0: readonly PtMm[], PR: readonly PtMm[], Po: readonly PtMm[]): PtMm[] {
  const m = PR.length;
  const out: PtMm[] = [];
  let s0 = -1;
  const segAt = (q: PtMm, s: number) => {
    const a = PR[s];
    const b = PR[(s + 1) % m];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u =
      l2 > 1e-12 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    return { d: Math.hypot(q.x - a.x - u * dx, q.y - a.y - u * dy), u };
  };
  for (const q of A0) {
    let best = { d: Infinity, s: 0, u: 0 };
    const span = s0 < 0 ? m : 81;
    for (let o = 0; o < span; o++) {
      const s = s0 < 0 ? o : (((s0 - 40 + o) % m) + m) % m;
      const r = segAt(q, s);
      if (r.d < best.d) best = { d: r.d, s, u: r.u };
    }
    s0 = best.s;
    const a = Po[best.s];
    const b = Po[(best.s + 1) % m];
    out.push({ x: a.x + (b.x - a.x) * best.u, y: a.y + (b.y - a.y) * best.u });
  }
  return out;
}

export type GradeAllMember = { rank: number; o: GfitOutline };

/**
 * The size `rank` predicted from all `members` (the pair r1/r2 among them), in the sample space of
 * predictPair(o1, o2) — the same samples as the pair prediction, so step and corridor stay the
 * pair's. Stacked frame only (registered sizes carry their own gauge). Null when fewer than 4
 * members map onto the pair's corners (D equals C there) or the pair does not match.
 */
export function predictAll(
  o1: GfitOutline,
  o2: GfitOutline,
  r1: number,
  r2: number,
  members: readonly GradeAllMember[],
  rank: number,
  frame: 'stacked' | 'registered',
): { pts: PtMm[]; sizes: number; breaks: number } | null {
  if (frame !== 'stacked') return null;
  const dr = r2 - r1;
  const A = predictPair(o1, o2, 0, dr, frame);
  const B = predictPair(o1, o2, 1, dr, frame);
  if (!A || !B || A.pts.length !== B.pts.length) return null;
  const rows: { rank: number; pts: PtMm[] }[] = [
    { rank: r1, pts: A.pts },
    { rank: r2, pts: B.pts },
  ];
  for (const s of members) {
    if (s.rank === r1 || s.rank === r2 || s.rank === rank) continue;
    const Q0 = predictPair(o1, s.o, 0, s.rank - r1, frame);
    const Q1 = predictPair(o1, s.o, 1, s.rank - r1, frame);
    if (!Q0 || !Q1 || Q0.pts.length !== Q1.pts.length) continue;
    rows.push({ rank: s.rank, pts: mapPair(A.pts, Q0.pts, Q1.pts) });
  }
  if (rows.length < 4) return null;
  rows.sort((a, b) => a.rank - b.rank);
  const vs = rows.map((r) => r.rank);
  const S = rows.map((r) => ({
    x: Float64Array.from(r.pts, (p) => p.x),
    y: Float64Array.from(r.pts, (p) => p.y),
  }));
  const breaks = rows.length >= 5 ? chooseBreaks(vs, S) : [];
  const f = fitSeries(vs, S, breaks, rank);
  return {
    pts: Array.from(f.px, (x, i) => ({ x, y: f.py[i] })),
    sizes: rows.length,
    breaks: breaks.length,
  };
}
