// A10 (Codex final #5) · an overview page as a REDUCED COPY of the pattern: its closed outlines
// have the shapes of the tile pages' whole pieces (a piece small enough to close on one tile) at a
// smaller scale. Evidence independent of the classifier's tile-grid lattice: piece outlines only,
// rectangles (tile frames, grid cells, test squares) left out. Shapes compare by Hu's invariants
// h1…h4 (log10) of the outline rasterised at a fixed resolution — scale and rotation free, as N2's
// count evidence (sizes/count-evidence.ts `blobShapes`).
import type { Chain, PtMm } from 'lib/pattern-import/types';

export const REDUCED_COPY = {
  /** Raster side (px) the longest side of an outline is drawn at. */
  rasterPx: 96,
  /** Max |Δ log10 h_k| over h1…h4 for "the same shape" (N2: 0.12). */
  sameShape: 0.12,
  /** An outline filling this share of its box or more is a rectangle (frame, cell, square). */
  rectFill: 0.93,
  /** The overview draws pieces at most at this scale … */
  maxScale: 0.7,
  /** … and at least at this one (smaller is not a drawing of pieces). */
  minScale: 0.04,
  /** Overview outlines smaller than this (mm²) are lettering / marks. */
  minOverviewMm2: 60,
  /** Matched outlines needed, and how far their scales may spread (max / min). */
  minMatches: 3,
  /** Share of the overview's outlines that must be matched tile pieces. */
  minShare: 0.8,
  maxSpread: 1.3,
  /** A9: a match belongs to the accepted scale cluster within ± this share of its scale. */
  clusterTol: 0.1,
  /** Outlines compared per page side (largest first). */
  cap: 40,
};

export type Shape = { areaMm2: number; hu: number[] };

const areaOf = (q: readonly PtMm[]) => {
  let a = 0;
  for (let k = 0, j = q.length - 1; k < q.length; j = k++)
    a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
  return Math.abs(a) / 2;
};

/** Hu's h1…h4 (log10) of a closed outline, rasterised (even-odd fill) at `rasterPx`. */
export function outlineHu(q: readonly PtMm[]): number[] | null {
  if (q.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of q) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const side = Math.max(maxX - minX, maxY - minY);
  if (!(side > 0)) return null;
  const k = REDUCED_COPY.rasterPx / side;
  const W = Math.ceil((maxX - minX) * k) + 1;
  const H = Math.ceil((maxY - minY) * k) + 1;
  let m = 0;
  let sx = 0;
  let sy = 0;
  const px: number[] = [];
  for (let r = 0; r < H; r++) {
    const y = minY + (r + 0.5) / k;
    // crossings of this scanline, even-odd
    const xs: number[] = [];
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      const a = q[j];
      const b = q[i];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((u, v) => u - v);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      const c0 = Math.max(0, Math.ceil((xs[t] - minX) * k - 0.5));
      const c1 = Math.min(W - 1, Math.floor((xs[t + 1] - minX) * k - 0.5));
      for (let c = c0; c <= c1; c++) {
        px.push(c, r);
        m++;
        sx += c;
        sy += r;
      }
    }
  }
  if (m < 50) return null;
  const cx = sx / m;
  const cy = sy / m;
  let m20 = 0;
  let m11 = 0;
  let m02 = 0;
  let m30 = 0;
  let m21 = 0;
  let m12 = 0;
  let m03 = 0;
  for (let i = 0; i < px.length; i += 2) {
    const x = px[i] - cx;
    const y = px[i + 1] - cy;
    m20 += x * x;
    m11 += x * y;
    m02 += y * y;
    m30 += x * x * x;
    m21 += x * x * y;
    m12 += x * y * y;
    m03 += y * y * y;
  }
  const e2 = m ** 2;
  const e3 = m ** 2.5;
  const [n20, n11, n02, n30, n21, n12, n03] = [
    m20 / e2,
    m11 / e2,
    m02 / e2,
    m30 / e3,
    m21 / e3,
    m12 / e3,
    m03 / e3,
  ];
  const h = [
    n20 + n02,
    (n20 - n02) ** 2 + 4 * n11 ** 2,
    (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2,
    (n30 + n12) ** 2 + (n21 + n03) ** 2,
  ];
  return h.map((v) => Math.log10(Math.max(v, 1e-12)));
}

/** The closed, non-rectangular outlines of a page at least `minMm2`, largest first, with shapes. */
export function shapesOf(chains: readonly Chain[], minMm2: number): Shape[] {
  const keep: { pts: readonly PtMm[]; a: number }[] = [];
  for (const c of chains) {
    if (!c.closed) continue;
    const a = areaOf(c.pts);
    if (a < minMm2) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of c.pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (a >= REDUCED_COPY.rectFill * (maxX - minX) * (maxY - minY)) continue;
    keep.push({ pts: c.pts, a });
  }
  keep.sort((x, y) => y.a - x.a);
  const out: Shape[] = [];
  for (const k of keep.slice(0, REDUCED_COPY.cap)) {
    const hu = outlineHu(k.pts);
    if (hu) out.push({ areaMm2: k.a, hu });
  }
  return out;
}

export type ReducedCopy = {
  matches: number;
  of: number;
  scale: number;
  /**
   * A9 (Codex re-check #1/#3): how many DIFFERENT tile pieces (Hu-distinct) the matches INSIDE the
   * accepted scale cluster (± `clusterTol` of `scale`) are.
   */
  pieces?: number;
  /** A9 (Codex re-check #3): every piece-sized outline of the page is a match inside that cluster. */
  clustered?: boolean;
};

/**
 * The overview's outlines that are a whole tile piece at a smaller scale: each overview outline
 * matched to a distinct tile outline of the same shape, scale √(area ratio) within
 * [minScale, maxScale]; evidence when at least `minMatches` agree on one scale (spread ≤
 * `maxSpread`) and they are at least `minShare` of the page's outlines, and no outline of real
 * piece size (`pieceMm2`) is left unexplained. Null = no such evidence.
 */
export function reducedCopy(
  overview: readonly Shape[],
  tiles: readonly Shape[],
  pieceMm2 = Infinity,
): ReducedCopy | null {
  const used = new Set<number>();
  const scales: number[] = [];
  const hits: { o: Shape; t: number; s: number }[] = [];
  const matched = new Set<Shape>();
  for (const o of overview) {
    let best = -1;
    let bestD = Infinity;
    for (let t = 0; t < tiles.length; t++) {
      if (used.has(t)) continue;
      const s = Math.sqrt(o.areaMm2 / tiles[t].areaMm2);
      if (s < REDUCED_COPY.minScale || s > REDUCED_COPY.maxScale) continue;
      const d = Math.max(...o.hu.map((h, k) => Math.abs(h - tiles[t].hu[k])));
      if (d <= REDUCED_COPY.sameShape && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best >= 0) {
      used.add(best);
      hits.push({ o, t: best, s: Math.sqrt(o.areaMm2 / tiles[best].areaMm2) });
      matched.add(o);
      scales.push(Math.sqrt(o.areaMm2 / tiles[best].areaMm2));
    }
  }
  // Codex r5 #2: an outline of real piece size the tiles do not explain may be a piece itself
  if (overview.some((o) => o.areaMm2 >= pieceMm2 && !matched.has(o))) return null;
  if (scales.length < REDUCED_COPY.minMatches) return null;
  scales.sort((a, b) => a - b);
  const med = scales[Math.floor(scales.length / 2)];
  // the largest group of scales within the spread around the median
  const agree = scales.filter(
    (s) => s / med <= REDUCED_COPY.maxSpread && med / s <= REDUCED_COPY.maxSpread,
  );
  if (agree.length < REDUCED_COPY.minMatches) return null;
  // … and nearly all the page's outlines are such reduced pieces
  if (agree.length < REDUCED_COPY.minShare * overview.length) return null;
  // A9 (Codex re-check #3): only the matches inside the accepted scale cluster count — four copies
  // of one piece at 0.30 and another piece at 0.60 are ONE piece reduced, not a copy of the sheet
  const scale = Math.round(med * 1000) / 1000;
  const inCluster = hits.filter((h) => Math.abs(h.s / med - 1) <= REDUCED_COPY.clusterTol);
  const clustered = overview
    .filter((o) => o.areaMm2 >= Math.min(pieceMm2, Infinity))
    .every((o) => inCluster.some((h) => h.o === o));
  // the matched tile shapes grouped by shape: copies of one piece drawn twice are one piece
  const kinds: number[][] = [];
  for (const { t } of inCluster)
    if (
      !kinds.some((h) => h.every((v, k) => Math.abs(v - tiles[t].hu[k]) <= REDUCED_COPY.sameShape))
    )
      kinds.push(tiles[t].hu);
  return {
    matches: agree.length,
    of: overview.length,
    scale,
    pieces: kinds.length,
    clustered,
  };
}
