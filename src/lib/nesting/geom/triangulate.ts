// Convex decomposition of a simple CCW polygon: ear-clipping triangulation followed by a
// greedy Hertel–Mehlhorn merge of triangles across shared diagonals. The NFP is built
// per CONVEX PART, not per triangle — a 70-vertex piece decomposes to ~8 parts instead
// of ~70 triangles, which keeps the pairwise Minkowski count (and the one Clipper.Union
// per NFP) small enough for the boolean engine (T_A·T_B unions of triangle sums OOM'd it).
//
// clipper2-js's own MinkowskiDiff/InflatePaths proved numerically unreliable (phantom
// holes, asymmetric offsets; see THIRD-PARTY.md) — hence this hand-rolled path.
import type { Pt } from '../types';
import { convexHull } from './convex';

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

type IndexTri = [number, number, number];

// Ear-clip to INDEX triangles. When the clip stalls on numeric degeneracy the remainder
// is returned so the caller can over-cover it with its convex hull — a fan would
// UNDER-cover a concave remainder, and an under-covered NFP lets pieces overlap on the
// delivered marker (the one failure mode worse than a slow one).
function earClipIndices(poly: readonly Pt[]): { tris: IndexTri[]; stalledRest: number[] | null } {
  const n = poly.length;
  const tris: IndexTri[] = [];
  if (n < 3) return { tris, stalledRest: null };
  if (n === 3) return { tris: [[0, 1, 2]], stalledRest: null };

  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  let guard = 0;

  while (idx.length > 3 && guard < 10000) {
    guard++;
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or degenerate corner — not an ear
      let contains = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inTriangle(poly[j], a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return { tris, stalledRest: [...idx] };
  }

  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return { tris, stalledRest: null };
}

// Is the merged index loop convex (CCW, tolerating collinear runs)?
function isConvexLoop(loop: readonly number[], poly: readonly Pt[]): boolean {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = poly[loop[(i - 1 + n) % n]];
    const b = poly[loop[i]];
    const c = poly[loop[(i + 1) % n]];
    if (cross(a, b, c) < -1e-9) return false;
  }
  return true;
}

export type ConvexDecomposition = {
  // Convex parts, CCW, covering the polygon exactly (or over-covering on `degenerate`).
  parts: Pt[][];
  // True when ear clipping stalled and the remainder was over-covered by its hull.
  degenerate: boolean;
};

// Greedy Hertel–Mehlhorn: repeatedly remove a diagonal whose two neighbouring parts merge
// into a convex loop. Not optimal (that's O(n³) dynamic programming) but within 4× of
// optimal by the classic bound, and measured 69 triangles → ~8 parts on garment pieces.
export function convexParts(poly: readonly Pt[]): ConvexDecomposition {
  const { tris, stalledRest } = earClipIndices(poly);
  const parts: Array<number[] | null> = tris.map((t) => [...t]);

  // Directed edge a→b of each live part; the twin b→a is the same diagonal in another
  // part. Rebuilt lazily after merges via the `edgeOwner` map updates.
  const edgeOwner = new Map<string, number>();
  const ekey = (a: number, b: number) => `${a}|${b}`;
  const registerPart = (pi: number) => {
    const loop = parts[pi]!;
    for (let i = 0; i < loop.length; i++) edgeOwner.set(ekey(loop[i], loop[(i + 1) % loop.length]), pi);
  };
  const unregisterPart = (pi: number) => {
    const loop = parts[pi]!;
    for (let i = 0; i < loop.length; i++) {
      const k = ekey(loop[i], loop[(i + 1) % loop.length]);
      if (edgeOwner.get(k) === pi) edgeOwner.delete(k);
    }
  };
  for (let i = 0; i < parts.length; i++) registerPart(i);

  let merged = true;
  while (merged) {
    merged = false;
    for (let pi = 0; pi < parts.length; pi++) {
      const p = parts[pi];
      if (!p) continue;
      for (let i = 0; i < p.length; i++) {
        const a = p[i];
        const b = p[(i + 1) % p.length];
        const qi = edgeOwner.get(ekey(b, a));
        if (qi == null || qi === pi || !parts[qi]) continue;
        const q = parts[qi]!;
        // Merge across diagonal a→b: walk p from b around to a, then q from a around to b.
        const bInP = p.indexOf(b);
        const aInQ = q.indexOf(a);
        const loop: number[] = [];
        for (let k = 0; k < p.length - 1; k++) loop.push(p[(bInP + k) % p.length]);
        for (let k = 0; k < q.length - 1; k++) loop.push(q[(aInQ + k) % q.length]);
        if (!isConvexLoop(loop, poly)) continue;
        unregisterPart(pi);
        unregisterPart(qi);
        parts[qi] = null;
        parts[pi] = loop;
        registerPart(pi);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }

  const out: Pt[][] = [];
  for (const p of parts) {
    if (p) out.push(p.map((i) => poly[i]));
  }
  if (stalledRest && stalledRest.length >= 3) {
    const hull = convexHull(stalledRest.map((i) => poly[i]));
    if (hull.length >= 3) out.push(hull);
  }
  return { parts: out, degenerate: stalledRest != null };
}
