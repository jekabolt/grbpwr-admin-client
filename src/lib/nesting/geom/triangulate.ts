// Ear-clipping triangulation of a simple CCW polygon. Used to decompose pieces into
// convex parts for the exact Minkowski NFP — clipper2-js's own MinkowskiDiff/InflatePaths
// proved numerically unreliable (phantom holes, asymmetric offsets; see THIRD-PARTY.md).
import type { Pt } from '../types';

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

// poly must be simple and CCW (pieces.ts guarantees both). Falls back to a fan when the
// clipper stalls on numeric degeneracy — for near-simple input the fan is still usable.
export function triangulate(poly: readonly Pt[]): Array<[Pt, Pt, Pt]> {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[poly[0], poly[1], poly[2]]];

  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const tris: Array<[Pt, Pt, Pt]> = [];
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
      tris.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // numeric stall — fan out the rest
  }

  if (idx.length === 3) {
    tris.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]]);
  } else if (idx.length > 3) {
    for (let i = 1; i < idx.length - 1; i++) {
      tris.push([poly[idx[0]], poly[idx[i]], poly[idx[i + 1]]]);
    }
  }
  return tris;
}
