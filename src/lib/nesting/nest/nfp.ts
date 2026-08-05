// No-fit polygons via convex decomposition — exact and numerically boring:
//   NFP(A, B) = ⋃ over triangles (ta ∈ A, tb ∈ B) of hull(ta ⊕ −tb) ⊕ gap-octagon
// clipper2-js's own MinkowskiDiff/InflatePaths were tried first and produce broken
// output on real polygons (phantom holes inside the NFP let pieces overlap; asymmetric
// offsets) — so Clipper is used ONLY to union the convex parts, its well-conditioned
// case. Verified by the harness test: rectangles nest flush at exactly the gap.
//
// Cache tricks from SVGnest (MIT, algorithm only): rotation canonicalization
// NFP(A@a, B@b) = Rot(a)·NFP(A@0, B@(b−a)), lazily computed, shared across the GA.
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { Pt, RotationDeg } from '../types';
import { toPath64 } from '../geom/clipper';
import { gapOctagon, minkowskiSumConvex, negate } from '../geom/convex';
import { triangulate } from '../geom/triangulate';

export type PreparedPiece = {
  id: number;
  // Uninflated contour per rotation (cm, local origin) + bounds — placement geometry.
  polyAt: Record<RotationDeg, Pt[]>;
  boundsAt: Record<RotationDeg, { minX: number; minY: number; maxX: number; maxY: number }>;
  // Convex decomposition of the RDP-simplified contour at rotation 0 — NFP input.
  tris0: Array<[Pt, Pt, Pt]>;
  areaCm2: number;
};

function rotPt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

function rotTri(t: readonly [Pt, Pt, Pt], rot: RotationDeg): [Pt, Pt, Pt] {
  return [rotPt(t[0], rot), rotPt(t[1], rot), rotPt(t[2], rot)];
}

export class NfpCache {
  private cache = new Map<string, Path64[]>();
  private gapOct: Pt[];
  computed = 0;

  constructor(gapCm: number) {
    // Full gap on the NFP side only (pieces stay uninflated), so min piece separation = gap.
    this.gapOct = gapOctagon(gapCm);
  }

  // NFP of (A at rotA) vs (B at rotB): forbidden positions of B's local origin relative
  // to A's, in A-local coordinates rotated to the strip frame. Caller translates by A's
  // position. Canonical form computed at rel = rotB − rotA, rotated by rotA on the way out.
  get(a: PreparedPiece, rotA: RotationDeg, b: PreparedPiece, rotB: RotationDeg): Path64[] {
    const rel = ((((rotB - rotA) % 360) + 360) % 360) as RotationDeg;
    const key = `${a.id}|${b.id}|${rel}`;
    let canonical = this.cache.get(key);
    if (!canonical) {
      const parts: Path64[] = [];
      for (const ta of a.tris0) {
        for (const tb of b.tris0) {
          const hull = minkowskiSumConvex(ta, negate(rotTri(tb, rel)));
          const withGap = this.gapOct.length > 1 ? minkowskiSumConvex(hull, this.gapOct) : hull;
          parts.push(toPath64(withGap));
        }
      }
      // Union of overlapping CONVEX polygons — the boolean engine's easy case.
      canonical = Clipper.Union(parts, undefined, FillRule.NonZero) as Path64[];
      this.cache.set(key, canonical);
      this.computed++;
    }
    if (rotA === 0) return canonical;
    return canonical.map((path) => {
      const out = new Path64();
      for (const q of path) {
        switch (rotA) {
          case 90:
            out.push(new Point64(-q.y, q.x));
            break;
          case 180:
            out.push(new Point64(-q.x, -q.y));
            break;
          case 270:
            out.push(new Point64(q.y, -q.x));
            break;
        }
      }
      return out;
    });
  }
}

export function prepareTris(poly: readonly Pt[]): Array<[Pt, Pt, Pt]> {
  return triangulate(poly);
}
