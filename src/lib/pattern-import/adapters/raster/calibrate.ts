// Per-page calibration from a printed test square (F11).
//
// Hypothesis from the Codex review: scanner stretch / skew dominate the error, not pixel pitch.
// A square gives 4 corners = 8 equations for the 6 affine unknowns, so it fixes anisotropic
// scale, skew AND the sheet's rotation on the glass. Corners are not taken from the traced
// vertices (thinning rounds them) but from the intersection of total-least-squares lines fitted
// to the dense middle 84 % of each side.

import type {
  Affine,
  IRPage,
  IRPath,
  Mm,
  PtMm,
  RasterCalibration,
  RasterSquare,
} from '../../types';
import { apply, fitAffine, IDENTITY, qr } from './affine';
import { simplifyDP } from './skeleton';
import type { RasterRef } from './types';

/** Common printed test squares: 1", 5 cm, 2", 10 cm, 4". */
export const SQUARE_CANDIDATES_MM = [25.4, 50, 50.8, 100, 101.6];

type Line = { px: number; py: number; dx: number; dy: number };

function fitLine(pts: PtMm[]): Line | null {
  if (pts.length < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const x = p.x - mx;
    const y = p.y - my;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(th), dy: Math.sin(th) };
}

function intersect(a: Line, b: Line): PtMm | null {
  const den = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
  return { x: a.px + t * a.dx, y: a.py + t * a.dy };
}

/** Densify a polyline to ≤ step mm spacing. */
function dense(pts: PtMm[], closed: boolean, step: number): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

const deg = (r: number) => (r * 180) / Math.PI;

/** Every closed (or nearly closed) path that is a square with near-right corners. */
export function findRasterSquares(page: IRPage): Omit<RasterSquare, 'sideMm' | 'residualMm'>[] {
  const out: Omit<RasterSquare, 'sideMm' | 'residualMm'>[] = [];
  const fillOf = new Map(page.styles.map((s) => [s.id, s.fill]));
  for (const p of page.paths) {
    if (fillOf.get(p.style)) continue;
    const sq = squareOf(p, page.page);
    if (sq) out.push(sq);
  }
  return out;
}

function squareOf(p: IRPath, pageIx: number): Omit<RasterSquare, 'sideMm' | 'residualMm'> | null {
  let pts = p.pts;
  if (pts.length < 4) return null;
  if (!p.closed) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1.5) return null;
    pts = pts.slice(0, -1);
  }
  let per = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    per += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (per < 60 || per > 900) return null;
  // Coarse polygon: rotate the ring to start far from a corner-ish vertex, then DP at 1 % of side.
  const flat: number[] = [];
  // Start at the vertex farthest from the centroid (a corner) so the ring's seam sits on a corner.
  let cx = 0;
  let cy = 0;
  for (const q of pts) {
    cx += q.x;
    cy += q.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let far = 0;
  let fd = -1;
  pts.forEach((q, i) => {
    const d = Math.hypot(q.x - cx, q.y - cy);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  for (let k = 0; k <= pts.length; k++) {
    const q = pts[(far + k) % pts.length];
    flat.push(q.x, q.y);
  }
  const poly = simplifyDP(flat, Math.max(0.5, per / 4 / 60));
  const corners: PtMm[] = [];
  for (let k = 0; k < poly.length - 2; k += 2) corners.push({ x: poly[k], y: poly[k + 1] });
  if (corners.length !== 4) return null;
  // Right angles and equal sides (coarse).
  const sides = corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const sMean = sides.reduce((s, v) => s + v, 0) / 4;
  if (sides.some((s) => Math.abs(s / sMean - 1) > 0.05)) return null;
  for (let i = 0; i < 4; i++) {
    const a = corners[(i + 3) % 4];
    const b = corners[i];
    const c = corners[(i + 1) % 4];
    const ang = Math.abs(deg(Math.atan2(a.y - b.y, a.x - b.x) - Math.atan2(c.y - b.y, c.x - b.x)));
    const a90 = Math.abs(((ang + 360) % 180) - 90);
    if (a90 > 4) return null;
  }
  // Refine: TLS line per side over the middle 84 %, from the dense trace.
  const d = dense(pts, true, 0.2);
  const lines: Line[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const ux = (b.x - a.x) / sides[i];
    const uy = (b.y - a.y) / sides[i];
    const sel: PtMm[] = [];
    for (const q of d) {
      const t = ((q.x - a.x) * ux + (q.y - a.y) * uy) / sides[i];
      const off = Math.abs(-(q.x - a.x) * uy + (q.y - a.y) * ux);
      if (t > 0.08 && t < 0.92 && off < 1.0) sel.push(q);
    }
    const L = fitLine(sel);
    if (!L) return null;
    lines.push(L);
  }
  const fine: PtMm[] = [];
  for (let i = 0; i < 4; i++) {
    const c = intersect(lines[(i + 3) % 4], lines[i]);
    if (!c) return null;
    fine.push(c);
  }
  // Orientation: CCW in y-up.
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = fine[i];
    const b = fine[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) fine.reverse();
  const len = (i: number) => {
    const a = fine[i];
    const b = fine[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  // Side angles folded into (−45°, 45°]: the sheet's rotation.
  const fold = (r: number) => {
    let a = deg(r) % 90;
    if (a > 45) a -= 90;
    if (a <= -45) a += 90;
    return a;
  };
  const angs = [0, 1, 2, 3].map((i) => {
    const a = fine[i];
    const b = fine[(i + 1) % 4];
    return fold(Math.atan2(b.y - a.y, b.x - a.x));
  });
  // Which pair is "horizontal": the one whose raw direction is nearer the x axis.
  const a0 = fine[0];
  const a1 = fine[1];
  const firstHorizontal = Math.abs(a1.x - a0.x) >= Math.abs(a1.y - a0.y);
  const pairA = (len(0) + len(2)) / 2;
  const pairB = (len(1) + len(3)) / 2;
  const v0 = { x: fine[1].x - fine[0].x, y: fine[1].y - fine[0].y };
  const v1 = { x: fine[2].x - fine[1].x, y: fine[2].y - fine[1].y };
  const cosC = (v0.x * v1.x + v0.y * v1.y) / (Math.hypot(v0.x, v0.y) * Math.hypot(v1.x, v1.y));
  return {
    page: pageIx,
    cornersMm: fine,
    measuredWMm: firstHorizontal ? pairA : pairB,
    measuredHMm: firstHorizontal ? pairB : pairA,
    angleDeg: angs.reduce((s, v) => s + v, 0) / 4,
    skewDeg: deg(Math.asin(Math.max(-1, Math.min(1, cosC)))),
  };
}

/** Affine taking the measured corners onto an axis-aligned square of `side` about their centroid. */
function squareAffine(corners: PtMm[], side: Mm): { affine: Affine; residualMm: Mm } {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  const dst = corners.map((p) => ({
    x: cx + (Math.sign(p.x - cx) * side) / 2,
    y: cy + (Math.sign(p.y - cy) * side) / 2,
  }));
  // Rotation up to 45° would make sign() ambiguous; a scan is never rotated that much, but guard.
  const keys = new Set(dst.map((q) => `${q.x > cx}|${q.y > cy}`));
  if (keys.size !== 4) throw new Error('square: ambiguous corner assignment');
  const affine = fitAffine(corners, dst);
  let r2 = 0;
  corners.forEach((p, i) => {
    const q = apply(affine, p.x, p.y);
    r2 += (q.x - dst[i].x) ** 2 + (q.y - dst[i].y) ** 2;
  });
  return { affine, residualMm: Math.sqrt(r2 / 4) };
}

/**
 * Calibrate one traced (uncalibrated) page. `square`: the best matching test square on the page;
 * `inherit`: the scanner factor of another page about this page's centre; `none`: identity.
 */
export function calibrate(page: IRPage, ref: RasterRef): RasterCalibration {
  if (ref.kind === 'none') {
    return {
      method: 'none',
      affine: IDENTITY,
      square: null,
      confidence: 0,
      notes: ['no reference'],
    };
  }
  if (ref.kind === 'inherit') {
    const q = qr(ref.from.affine);
    const cx = page.widthMm / 2;
    const cy = page.heightMm / 2;
    const L = { a: q.r11, b: 0, c: q.r12, d: q.r22 };
    const affine: Affine = {
      ...L,
      e: cx - (L.a * cx + L.c * cy),
      f: cy - (L.b * cx + L.d * cy),
    };
    return {
      method: ref.from.method === 'none' ? 'none' : 'inherited',
      affine: ref.from.method === 'none' ? IDENTITY : affine,
      square: null,
      confidence: ref.from.method === 'none' ? 0 : 0.5,
      notes: [
        `scanner factor inherited from page ${ref.from.square?.page ?? '?'} (stretch x ${q.r11.toFixed(5)}, y ${q.r22.toFixed(5)}, shear ${q.r12.toFixed(5)}); rotation not corrected`,
      ],
    };
  }
  const found = findRasterSquares(page);
  let best: { sq: (typeof found)[number]; side: Mm; err: number } | null = null;
  for (const sq of found) {
    const m = (sq.measuredWMm + sq.measuredHMm) / 2;
    const cands = ref.sideMm ? [ref.sideMm] : SQUARE_CANDIDATES_MM;
    const tol = ref.sideMm ? 0.06 : 0.04;
    for (const side of cands) {
      const err = Math.abs(m / side - 1);
      if (err > tol) continue;
      if (!best || err < best.err - 1e-6 || (Math.abs(err - best.err) < 1e-6 && side > best.side)) {
        best = { sq, side, err };
      }
    }
  }
  if (!best) {
    return {
      method: 'none',
      affine: IDENTITY,
      square: null,
      confidence: 0,
      notes: [
        found.length
          ? `square-like boxes found (${found.map((f) => f.measuredWMm.toFixed(1)).join(', ')} mm) but none matches ${ref.sideMm ?? SQUARE_CANDIDATES_MM.join('/')} mm`
          : 'no test square on this page',
      ],
    };
  }
  const { affine, residualMm } = squareAffine(best.sq.cornersMm, best.side);
  return {
    method: 'test-square',
    affine,
    square: { ...best.sq, sideMm: best.side, residualMm },
    confidence: ref.sideMm ? 0.95 : 0.85,
    notes: [
      `square ${best.side} mm measured ${best.sq.measuredWMm.toFixed(3)} × ${best.sq.measuredHMm.toFixed(3)} mm, rotation ${best.sq.angleDeg.toFixed(3)}°, skew ${best.sq.skewDeg.toFixed(3)}°`,
    ],
  };
}

/** Pure: the page with every coordinate mapped through the calibration, which it then carries. */
export function applyCalibration(page: IRPage, calib: RasterCalibration): IRPage {
  const A = calib.affine;
  if (A === IDENTITY) return { ...page, calibration: calib };
  const mapBox = (b: IRPage['rasters'][number]['bbox']) => {
    const c = [
      apply(A, b.minX, b.minY),
      apply(A, b.maxX, b.minY),
      apply(A, b.minX, b.maxY),
      apply(A, b.maxX, b.maxY),
    ];
    return {
      minX: Math.min(...c.map((p) => p.x)),
      minY: Math.min(...c.map((p) => p.y)),
      maxX: Math.max(...c.map((p) => p.x)),
      maxY: Math.max(...c.map((p) => p.y)),
    };
  };
  return {
    ...page,
    paths: page.paths.map((p) => ({ ...p, pts: p.pts.map((q) => apply(A, q.x, q.y)) })),
    rasters: page.rasters.map((r) => ({ ...r, bbox: mapBox(r.bbox) })),
    calibration: calib,
  };
}
