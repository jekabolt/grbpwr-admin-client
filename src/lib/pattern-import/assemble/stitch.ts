// assemble (F2) — registration by EDGE STITCHING: tiles whose drawing is cut at the page edge (reef,
// viola, Redcafe, wm, r4454) still share vertices across the seam — the overlap strip is printed on
// both pages (reef 12.7 mm, viola 20 mm), and where tiles abut, a line cut by the seam ends at the
// same sheet point on both sides. Every vertex pair votes for an offset in 0.1 mm bins; a peak ≥ 3×
// the runner-up (PATIMPORT.registrationMinPeakRatio) is accepted, then refined to the mean of the
// exact differences.

import { PATIMPORT } from 'lib/pattern-import/types';

import type { RawLink } from './recurrence';
import type { RegPage } from './regpage';

export type Rel = 'right' | 'below';

export type StitchOpts = {
  /** Largest overlap between neighbouring tiles, mm (viola 20, Redcafe/wm 24, reef 12.7). */
  maxOverlapMm: number;
  /** Largest gap between neighbouring tiles, mm. */
  maxGapMm: number;
  /** Largest misalignment across the seam (row not perfectly straight), mm. */
  maxShearMm: number;
  minVotes: number;
  /** Vote bin, mm (see STEP). Traced raster pages: 0.2 — their vertices are resampled. */
  binMm?: number;
  /** Tolerance of the refinement around the peak, mm. */
  refineTolMm?: number;
};

export const DEFAULT_STITCH: StitchOpts = {
  maxOverlapMm: 30,
  maxGapMm: 3,
  maxShearMm: 1,
  minVotes: 3,
};

/** Pages traced from a raster (F11, `IRPage.calibration` set): coarse bins, tolerant refine. */
export const TRACED_STITCH: StitchOpts = {
  ...DEFAULT_STITCH,
  maxShearMm: 2,
  binMm: 0.2,
  refineTolMm: 0.4,
};

/**
 * Vote bin. Tiles are cut from one drawing, so a vertex printed on both sides of a seam is the SAME
 * number on both pages up to float noise — a 0.01 mm bin (3×3 neighbourhood = ±0.015) keeps the
 * true peak whole while random coincidences of dense regions (letters drawn as curves, dashes)
 * spread over ~10⁵ bins. A 0.1 mm bin drowns reef's seams in that noise (measured).
 */
const DEFAULT_STEP = 0.01;

/** Bucket B's points by integer cell for neighbourhood queries. */
function grid(
  xs: Float64Array,
  ys: Float64Array,
  ox: number,
  oy: number,
  keep: (i: number) => boolean,
  cell: number,
) {
  const m = new Map<number, number[]>();
  for (let i = 0; i < xs.length; i++) {
    if (!keep(i)) continue;
    const k = Math.floor((xs[i] + ox) / cell) * 1_000_003 + Math.floor((ys[i] + oy) / cell);
    const l = m.get(k);
    if (l) l.push(i);
    else m.set(k, [i]);
  }
  return m;
}

/** Offset window (t_b − t_a) for B placed right of / below A. */
export function window(A: RegPage, B: RegPage, rel: Rel, o: StitchOpts) {
  const a = A.rect;
  const b = B.rect;
  if (rel === 'right') {
    const c = a.maxX - b.minX;
    const yc = (a.minY + a.maxY - b.minY - b.maxY) / 2;
    return {
      x0: c - o.maxOverlapMm,
      x1: c + o.maxGapMm,
      y0: yc - o.maxShearMm,
      y1: yc + o.maxShearMm,
    };
  }
  // below: y-up, so B's top meets A's bottom → t_b.y − t_a.y ≈ a.minY − b.maxY.
  const c = a.minY - b.maxY;
  const xc = (a.minX + a.maxX - b.minX - b.maxX) / 2;
  return {
    x0: xc - o.maxShearMm,
    x1: xc + o.maxShearMm,
    y0: c - o.maxGapMm,
    y1: c + o.maxOverlapMm,
  };
}

/**
 * Free vote: the best (dx, dy) = t_b − t_a inside the window for `rel`. null when nothing votes.
 * The returned link is NOT yet accepted — callers apply minVotes and the peak ratio.
 */
export type VertexSet = 'content' | 'all';

export function verts(P: RegPage, set: VertexSet) {
  return set === 'all' ? { X: P.axs, Y: P.ays } : { X: P.xs, Y: P.ys };
}

export function stitchFree(
  A: RegPage,
  B: RegPage,
  rel: Rel,
  o: StitchOpts = DEFAULT_STITCH,
  set: VertexSet = 'content',
): RawLink | null {
  const w = window(A, B, rel, o);
  const STEP = o.binMm ?? DEFAULT_STEP;
  const { X: AX, Y: AY } = verts(A, set);
  const { X: BX, Y: BY } = verts(B, set);
  // Vertices of A that can coincide with something of B: inside B's rect moved by the window.
  const inA = (i: number) =>
    AX[i] >= B.rect.minX + w.x0 - 1 &&
    AX[i] <= B.rect.maxX + w.x1 + 1 &&
    AY[i] >= B.rect.minY + w.y0 - 1 &&
    AY[i] <= B.rect.maxY + w.y1 + 1 &&
    AX[i] >= A.rect.minX - 5 &&
    AX[i] <= A.rect.maxX + 5 &&
    AY[i] >= A.rect.minY - 5 &&
    AY[i] <= A.rect.maxY + 5;
  const inB = (i: number) =>
    BX[i] >= A.rect.minX - w.x1 - 1 &&
    BX[i] <= A.rect.maxX - w.x0 + 1 &&
    BY[i] >= A.rect.minY - w.y1 - 1 &&
    BY[i] <= A.rect.maxY - w.y0 + 1 &&
    BX[i] >= B.rect.minX - 5 &&
    BX[i] <= B.rect.maxX + 5 &&
    BY[i] >= B.rect.minY - 5 &&
    BY[i] <= B.rect.maxY + 5;
  // Index B by the coordinate ACROSS the seam's normal (y for 'right', x for 'below').
  const across = rel === 'right' ? BY : BX;
  const cell = 1;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < BX.length; i++) {
    if (!inB(i)) continue;
    const k = Math.floor(across[i] / cell);
    const l = buckets.get(k);
    if (l) l.push(i);
    else buckets.set(k, [i]);
  }
  const lo = rel === 'right' ? w.y0 : w.x0;
  const hi = rel === 'right' ? w.y1 : w.x1;
  const votes = new Map<number, number>();
  const OFF = 50_000;
  const KEY = 100_003;
  const enc = (ix: number, iy: number) => (ix + OFF) * KEY + (iy + OFF);
  // Each vertex of A spreads ONE vote over all its candidate partners (1/k each): a periodic row
  // of dots or dashes parallel to the seam (reef's dotted size lines) matches itself at every
  // multiple of its period and would otherwise out-vote the true offset (measured: 180.78 vs
  // 196.85 on reef F1→F2). Geometry that matches once keeps its full vote.
  const cand: number[] = [];
  for (let i = 0; i < AX.length; i++) {
    if (!inA(i)) continue;
    const ac = rel === 'right' ? AY[i] : AX[i];
    const k0 = Math.floor((ac - hi) / cell);
    const k1 = Math.floor((ac - lo) / cell);
    cand.length = 0;
    for (let k = k0; k <= k1; k++) {
      const l = buckets.get(k);
      if (!l) continue;
      for (const j of l) {
        const dx = AX[i] - BX[j];
        const dy = AY[i] - BY[j];
        if (dx < w.x0 || dx > w.x1 || dy < w.y0 || dy > w.y1) continue;
        cand.push(enc(Math.round(dx / STEP), Math.round(dy / STEP)));
      }
    }
    const wv = 1 / cand.length;
    for (const key of cand) votes.set(key, (votes.get(key) ?? 0) + wv);
  }
  if (!votes.size) return null;
  // 3×3 neighbourhood sums: a true offset with float noise straddles bins.
  let best = -1;
  let bx = 0;
  let by = 0;
  const sums: { ix: number; iy: number; s: number }[] = [];
  for (const key of votes.keys()) {
    const ix = Math.floor(key / KEY) - OFF;
    const iy = (key % KEY) - OFF;
    let s = 0;
    for (let u = -1; u <= 1; u++)
      for (let v = -1; v <= 1; v++) s += votes.get(enc(ix + u, iy + v)) ?? 0;
    sums.push({ ix, iy, s });
    if (s > best) {
      best = s;
      bx = ix;
      by = iy;
    }
  }
  let n2 = 0;
  for (const e of sums)
    if (Math.hypot((e.ix - bx) * STEP, (e.iy - by) * STEP) >= 1) n2 = Math.max(n2, e.s);
  const ref = refine(A, B, { dx: bx * STEP, dy: by * STEP }, o.refineTolMm ?? 0.05, set);
  return {
    a: A,
    b: B,
    dx: ref.dx,
    dy: ref.dy,
    method: 'edge-stitch',
    n: Math.round(best * 100) / 100,
    n2: Math.round(n2 * 100) / 100,
    spreadMm: ref.spread,
  };
}

/**
 * Vertex pairs that agree with offset d (t_b − t_a) within tol: their count, the mean exact
 * offset and the spread. Only vertices inside the overlap of the two placed rectangles count.
 */
export function refine(
  A: RegPage,
  B: RegPage,
  d: { dx: number; dy: number },
  tol: number,
  set: VertexSet = 'all',
  marginMm = 2,
): { n: number; dx: number; dy: number; spread: number } {
  const { X: AX, Y: AY } = verts(A, set);
  const { X: BX, Y: BY } = verts(B, set);
  // The overlap of the two placed pages, widened by the margin: for windowed tiles (the whole
  // neighbouring drawing printed beyond the edge) the agreement extends far past the seam.
  const ox0 = Math.max(A.rect.minX, B.rect.minX + d.dx) - marginMm;
  const ox1 = Math.min(A.rect.maxX, B.rect.maxX + d.dx) + marginMm;
  const oy0 = Math.max(A.rect.minY, B.rect.minY + d.dy) - marginMm;
  const oy1 = Math.min(A.rect.maxY, B.rect.maxY + d.dy) + marginMm;
  if (ox0 > ox1 || oy0 > oy1) return { n: 0, dx: d.dx, dy: d.dy, spread: 0 };
  const cell = Math.max(0.5, tol * 2);
  const g = grid(
    BX,
    BY,
    d.dx,
    d.dy,
    (i) => {
      const x = BX[i] + d.dx;
      const y = BY[i] + d.dy;
      return x >= ox0 && x <= ox1 && y >= oy0 && y <= oy1;
    },
    cell,
  );
  let n = 0;
  let sx = 0;
  let sy = 0;
  const ex: number[] = [];
  const ey: number[] = [];
  for (let i = 0; i < AX.length; i++) {
    const x = AX[i];
    const y = AY[i];
    if (x < ox0 || x > ox1 || y < oy0 || y > oy1) continue;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let hit = -1;
    let hd = Infinity;
    for (let u = -1; u <= 1; u++)
      for (let v = -1; v <= 1; v++) {
        const l = g.get((cx + u) * 1_000_003 + (cy + v));
        if (!l) continue;
        for (const j of l) {
          const ddx = x - (BX[j] + d.dx);
          const ddy = y - (BY[j] + d.dy);
          if (Math.abs(ddx) > tol || Math.abs(ddy) > tol) continue;
          const dd = Math.hypot(ddx, ddy);
          if (dd < hd) {
            hd = dd;
            hit = j;
          }
        }
      }
    if (hit < 0) continue;
    const ddx = x - BX[hit];
    const ddy = y - BY[hit];
    n++;
    sx += ddx;
    sy += ddy;
    ex.push(ddx);
    ey.push(ddy);
  }
  if (!n) return { n: 0, dx: d.dx, dy: d.dy, spread: 0 };
  const mx = sx / n;
  const my = sy / n;
  let spread = 0;
  for (let i = 0; i < n; i++) spread = Math.max(spread, Math.abs(ex[i] - mx), Math.abs(ey[i] - my));
  return { n, dx: mx, dy: my, spread };
}

export function accepted(l: RawLink | null, o: StitchOpts = DEFAULT_STITCH): l is RawLink {
  return !!l && l.n >= o.minVotes && l.n >= PATIMPORT.registrationMinPeakRatio * l.n2;
}
