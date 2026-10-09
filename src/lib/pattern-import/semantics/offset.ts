// offsetContour — the parallel curve of a piece outline, CLIPPER-BASED (08-CONTRACT §2), never
// `lib/nesting/geom/offset.ts` (that one falls back to the convex hull: on a front it fills the
// armhole and the neckline, and the hull would go to layer 1 = the line the cutter follows).
//
// Why not `ClipperOffset` itself: clipper2-js 1.2.4 ports `OffsetPoint(group, path, j, ref k)` with
// `k` by VALUE, so every vertex is joined against the LAST edge's normal. Measured on a 100 mm
// square, +10 mm: Miter gives bbox x ∈ [−10, 100] (one side never moves), Round loses 15 % of the
// area. So the raw offset is built here, exactly as Clipper builds it (edge shifted by d, convex
// corner = round arc whose chords stay within `arcTolMm` of the circle, concave corner =
// "perp, vertex, perp" so the reversal is a closed sliver), and Clipper's own cleanup does the
// rest: Union with FillRule.Positive on 1 µm integers — the part of clipper2-js that works.
//
// The result is the d-level set of the distance to the source, so EVERY point of it is |d| from
// the source (minus at most the arc chord sagitta). That is what the report measures; a hull
// collapse, a bitten bay or a lost lobe all show as a deviation, a second loop or a hole.

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
export const MAX_DEVIATION_MM = 0.2;

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

/** Raw (self-overlapping) offset of a CCW loop by signed d (d > 0 = outward). */
function rawOffset(src: readonly PtMm[], d: number, arcTol: number): PtMm[] {
  const n = src.length;
  const nrm: PtMm[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // CCW: the interior is on the left → outward normal on the right.
    nrm[i] = L > 0 ? { x: (b.y - a.y) / L, y: -(b.x - a.x) / L } : { x: 0, y: 0 };
  }
  const ad = Math.abs(d);
  const stepAng = 2 * Math.acos(Math.max(-1, 1 - Math.min(arcTol, ad) / ad));
  const out: PtMm[] = [];
  for (let j = 0; j < n; j++) {
    const k = (j - 1 + n) % n;
    const nk = nrm[k];
    const nj = nrm[j];
    const P = src[j];
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
 * Max |distance(result → source) − |d||, sampled every 0.5 mm along the result. A true parallel
 * curve is 0 (+ chord sagitta). A hull collapse, a bitten bay or a stray lobe is not.
 */
export function parallelDeviation(
  result: readonly PtMm[],
  src: readonly PtMm[],
  d: number,
): number {
  const ad = Math.abs(d);
  const idx = new SegIndex([{ pts: src, closed: true }], 5);
  let dev = 0;
  for (const p of sampleAlong(result, true, 0.5)) {
    const e = idx.nearest(p, ad * 3 + 10);
    dev = Math.max(dev, Number.isFinite(e) ? Math.abs(e - ad) : ad * 3 + 10);
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
  opts: { arcTolMm?: number } = {},
): OffsetResult {
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
  const raw = rawOffset(src, mm, opts.arcTolMm ?? ARC_TOL_MM);
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
  const hull = srcHull < HULL_RATIO_MAX && hr >= HULL_RATIO_MAX;
  if (hull)
    reasons.push(`collapsed to the convex hull (${hr.toFixed(4)} vs source ${srcHull.toFixed(4)})`);
  const dev = best.length ? parallelDeviation(best, src, mm) : Infinity;
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
