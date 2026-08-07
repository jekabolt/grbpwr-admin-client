// Convex primitives for the NFP: Andrew-monotone hull, exact convex Minkowski sum (hull
// of pairwise vertex sums), and a circumscribed gap octagon (clearance never under-
// delivers: the octagon contains the true disk).
import type { Pt } from '../types';

export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper); // CCW
}

// Minkowski sum of two convex polygons — exact as the hull of all pairwise sums (sizes
// here are tiny: triangles × octagon at most, so O(n·m) is nothing).
export function minkowskiSumConvex(a: readonly Pt[], b: readonly Pt[]): Pt[] {
  const sums: Pt[] = [];
  for (const p of a) for (const q of b) sums.push({ x: p.x + q.x, y: p.y + q.y });
  return convexHull(sums);
}

export function negate(poly: readonly Pt[]): Pt[] {
  return poly.map((p) => ({ x: -p.x, y: -p.y }));
}

// Circumscribed regular octagon of radius r (contains the r-disk).
export function gapOctagon(r: number): Pt[] {
  if (r <= 0) return [{ x: 0, y: 0 }];
  const R = r / Math.cos(Math.PI / 8);
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 8) * (2 * i + 1);
    pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }
  return pts;
}
