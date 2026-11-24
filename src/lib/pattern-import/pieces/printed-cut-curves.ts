import type { IRPath, PtMm } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { dist, SegGrid, segNearest, signedArea } from './geom';

const cross = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
// This fallback covers sampled curves beyond the straight reader's 12-corner polygon domain.
export const MAX_PRINTED_CORNERS = 12;
function curved(p: IRPath) {
  let turns = 0;
  for (let i = 1; i < p.pts.length - 1; i++) {
    const a = p.pts[i - 1],
      b = p.pts[i],
      c = p.pts[i + 1];
    if (Math.abs(cross(a, b, c)) > 0.01 * dist(a, c) && ++turns > MAX_PRINTED_CORNERS) return true;
  }
  return false;
}
/** Reject intersections, including non-adjacent touches and segments that double back. */
function simple(ring: PtMm[]) {
  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i + ring.length - 1) % ring.length],
      p = ring[i],
      next = ring[(i + 1) % ring.length];
    if (
      Math.abs(cross(prev, p, next)) < 1e-8 &&
      (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y) < 0
    )
      return false;
  }
  const edges = ring
    .map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return {
        i,
        a,
        b,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      };
    })
    .sort((a, b) => a.minX - b.minX);
  const sign = (v: number) => (Math.abs(v) < 1e-8 ? 0 : Math.sign(v));
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (let j = i + 1; j < edges.length && edges[j].minX <= a.maxX; j++) {
      const b = edges[j],
        gap = Math.abs(a.i - b.i);
      if (gap === 1 || gap === ring.length - 1 || a.maxY < b.minY || b.maxY < a.minY) continue;
      if (
        sign(cross(a.a, a.b, b.a)) * sign(cross(a.a, a.b, b.b)) <= 0 &&
        sign(cross(b.a, b.b, a.a)) * sign(cross(b.a, b.b, a.b)) <= 0
      )
        return false;
    }
  }
  return true;
}
/** A complete ordered cycle with one graded curve carrying a legend rank beside the range label. */
export function curvedCut(paths: IRPath[], ranks: Set<string>, owners: Map<number, Set<string>>) {
  const curves = paths.filter(curved);
  if (curves.length !== 1) return;
  const curveOwners = owners.get(curves[0].id);
  if (curveOwners?.size !== 1 || !ranks.has([...curveOwners][0])) return;
  const first = paths.reduce((best, p, i) => (p.id < paths[best].id ? i : best), 0);
  const ordered = paths.slice(first).concat(paths.slice(0, first));
  const pts = ordered.flatMap((p) => p.pts);
  const ring = pts.filter((p, i) => dist(p, pts[(i + pts.length - 1) % pts.length]) > 1e-6);
  const area = signedArea(ring);
  if (!area || !simple(ring)) return;
  if (area < 0) ring.reverse();
  return { outer: ring, paths: ordered };
}
function nearRing(a: PtMm[], b: PtMm[], tol: number) {
  const grid = new SegGrid(4);
  grid.addPolyline(0, b, true);
  function near(p: PtMm) {
    let found = false;
    grid.near(p, tol, (_id, i) => {
      if (!found && segNearest(p, b[i], b[(i + 1) % b.length]).d <= tol) found = true;
    });
    return found;
  }
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      n = Math.max(1, Math.ceil(dist(p, q) / 0.5));
    for (let j = 0; j < n; j++)
      if (!near({ x: p.x + ((q.x - p.x) * j) / n, y: p.y + ((q.y - p.y) * j) / n })) return false;
  }
  return true;
}
/** Each printed pen may flatten the same physical curve up to the PDF sagitta. */
export function samePrintedCurve(a: PtMm[], b: PtMm[]) {
  const tol = 2 * PATIMPORT.sagittaMm;
  return nearRing(a, b, tol) && nearRing(b, a, tol);
}
