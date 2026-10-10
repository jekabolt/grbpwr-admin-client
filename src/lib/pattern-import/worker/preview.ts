// What the wizard DRAWS of a sheet: the stroked lines, simplified to a screen tolerance and capped
// in points, as transferable Float32Arrays (x0,y0,x1,y1,…; a closed path repeats its first point).
// The geometry itself stays in the worker session — the main thread only ever gets this picture.
import type { IRPath, PtMm, Style } from '../types';
import { simplify } from '../write/geom';

/** Total points the preview may carry: enough for a dense Burda sheet, light for the SVG. */
const POINT_BUDGET = 250_000;
/** Fills smaller than this (mm, long side) are glyphs — skipped; bigger fills (arrows) drawn. */
const FILL_MIN_MM = 25;

function longSide(pts: readonly PtMm[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return Math.max(x1 - x0, y1 - y0);
}

function pack(pts: readonly PtMm[], closed: boolean): Float32Array {
  const n = pts.length + (closed ? 1 : 0);
  const a = new Float32Array(n * 2);
  for (let i = 0; i < pts.length; i++) {
    a[i * 2] = pts[i].x;
    a[i * 2 + 1] = pts[i].y;
  }
  if (closed) {
    a[pts.length * 2] = pts[0].x;
    a[pts.length * 2 + 1] = pts[0].y;
  }
  return a;
}

/** Sheet / chain lines → preview polylines. Tolerance grows until the point budget holds. */
export function previewOf(
  paths: readonly Pick<IRPath, 'pts' | 'closed' | 'style'>[],
  styles: readonly Style[] | null,
  extentMm: number,
): Float32Array[] {
  const keep = paths.filter((p) => {
    if (p.pts.length < 2) return false;
    const st = styles?.[p.style];
    return !st?.fill || longSide(p.pts) >= FILL_MIN_MM;
  });
  // Start at ~1/4000 of the sheet (0.3 mm on a 1.2 m sheet) — well under a screen pixel at fit.
  let eps = Math.max(0.05, extentMm / 4000);
  for (let round = 0; round < 6; round++) {
    const out: Float32Array[] = [];
    let total = 0;
    for (const p of keep) {
      const s = p.pts.length > 2 ? simplify(p.pts, p.closed, eps) : p.pts;
      if (s.length < 2) continue;
      total += s.length;
      out.push(pack(s, p.closed && s.length > 2));
    }
    if (total <= POINT_BUDGET) return out;
    eps *= 2.5;
  }
  // Still over budget after ×244: keep the longest lines only.
  const ranked = keep
    .map((p) => ({ p, len: longSide(p.pts) }))
    .sort((a, b) => b.len - a.len)
    .slice(0, 20_000);
  return ranked.map(({ p }) => pack(simplify(p.pts, p.closed, eps), p.closed));
}

export const buffersOf = (arrays: readonly Float32Array[]): ArrayBuffer[] =>
  arrays.map((a) => a.buffer as ArrayBuffer);

/**
 * Chains → one preview polyline PER CHAIN, index = ChainId (an empty array where a chain is not
 * drawn), so the legend can light a class's lines and the pieces step can pick a line by click.
 * Same tolerance ladder as `previewOf`; lines are never dropped, only simplified harder.
 */
export function chainPreviewOf(
  chains: readonly Pick<IRPath, 'pts' | 'closed'>[],
  extentMm: number,
): Float32Array[] {
  let eps = Math.max(0.05, extentMm / 4000);
  let out: Float32Array[] = [];
  for (let round = 0; round < 8; round++) {
    out = [];
    let total = 0;
    for (const c of chains) {
      if (c.pts.length < 2) {
        out.push(new Float32Array(0));
        continue;
      }
      const s = c.pts.length > 2 ? simplify(c.pts, c.closed, eps) : c.pts;
      const keep = s.length >= 2 ? s : [c.pts[0], c.pts[c.pts.length - 1]];
      total += keep.length;
      out.push(pack(keep, c.closed && keep.length > 2));
    }
    if (total <= POINT_BUDGET) return out;
    eps *= 2.5;
  }
  return out;
}
