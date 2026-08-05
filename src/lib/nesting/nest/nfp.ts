// No-fit polygons via convex decomposition — exact and numerically boring:
//   NFP(A, B) = ⋃ over convex parts (pa ∈ A, pb ∈ B) of hull(pa ⊕ −pb) ⊕ gap-octagon
// clipper2-js's own MinkowskiDiff/InflatePaths produce broken output on real polygons
// (phantom holes inside the NFP let pieces overlap; asymmetric offsets) — so Clipper is
// used ONLY to union convex parts. Two things keep that union tractable (a triangle ×
// triangle decomposition fed it 4 761+ overlapping paths and OOM'd the tab):
//   - pieces decompose to ~6-10 convex parts (Hertel–Mehlhorn merge), so a pair costs
//     ~36-100 hulls, not thousands;
//   - the union itself runs hierarchically in batches (unionBatched), so no single
//     boolean call ever sees more than UNION_BATCH paths.
//
// Cache tricks from SVGnest (MIT, algorithm only): rotation canonicalization
//   NFP(A@a, B@b) = Rot(a)·NFP(A@0, B@(b−a))
// plus the reflection identity
//   NFP(A@0, B@rel) = Rot(rel+180)·NFP(B@0, A@(360−rel))
// so each unordered pair is computed once (cache keyed minId|maxId|rel).
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { Pt, RotationDeg } from '../types';
import { toPath64 } from '../geom/clipper';
import { gapOctagon, minkowskiSumConvex, negate } from '../geom/convex';

export type PreparedPiece = {
  id: number;
  // Uninflated contour per rotation (cm, local origin) + bounds — placement geometry.
  polyAt: Record<RotationDeg, Pt[]>;
  boundsAt: Record<RotationDeg, { minX: number; minY: number; maxX: number; maxY: number }>;
  // Convex decomposition of the RDP-simplified contour at rotation 0 — NFP input.
  parts0: Pt[][];
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

function rotPart(part: readonly Pt[], rot: RotationDeg): Pt[] {
  if (rot === 0) return [...part];
  return part.map((p) => rotPt(p, rot));
}

function rotPath64(paths: Path64[], rot: RotationDeg): Path64[] {
  if (rot === 0) return paths;
  return paths.map((path) => {
    const out = new Path64();
    for (const q of path) {
      switch (rot) {
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

const UNION_BATCH = 32;

// Hierarchical union: never hand the boolean engine more than UNION_BATCH paths at once —
// clipper2-js's Union degrades catastrophically past ~100 overlapping inputs (measured:
// 64 paths 3 ms, 100 paths OOM).
export function unionBatched(parts: Path64[]): Path64[] {
  let layer = parts;
  while (layer.length > UNION_BATCH) {
    const next: Path64[] = [];
    for (let i = 0; i < layer.length; i += UNION_BATCH) {
      const res = Clipper.Union(layer.slice(i, i + UNION_BATCH), undefined, FillRule.NonZero) as Path64[];
      next.push(...res);
    }
    // A pathological layer that fails to shrink would loop forever — bail to one final call.
    if (next.length >= layer.length) return Clipper.Union(next, undefined, FillRule.NonZero) as Path64[];
    layer = next;
  }
  return Clipper.Union(layer, undefined, FillRule.NonZero) as Path64[];
}

export class NfpCache {
  private cache = new Map<string, Path64[]>();
  private gapOct: Pt[];
  computed = 0;

  // gapCm here must already include the RDP compensation (+2·rdpEps): NFP inputs are the
  // SIMPLIFIED contours, whose chords cut up to rdpEps inside convex runs on each piece,
  // so the octagon under-delivers by up to 2·rdpEps against the true contours otherwise.
  constructor(gapCm: number) {
    this.gapOct = gapOctagon(gapCm);
  }

  // Canonical NFP for the UNORDERED pair, at relative rotation `rel`, with the
  // lower-id piece in the A role. Everything else derives from it.
  private canonical(a: PreparedPiece, b: PreparedPiece, rel: RotationDeg): Path64[] {
    const key = `${a.id}|${b.id}|${rel}`;
    let paths = this.cache.get(key);
    if (!paths) {
      const parts: Path64[] = [];
      for (const pa of a.parts0) {
        for (const pb of b.parts0) {
          const hull = minkowskiSumConvex(pa, negate(rotPart(pb, rel)));
          const withGap = this.gapOct.length > 1 ? minkowskiSumConvex(hull, this.gapOct) : hull;
          parts.push(toPath64(withGap));
        }
      }
      paths = unionBatched(parts);
      this.cache.set(key, paths);
      this.computed++;
    }
    return paths;
  }

  // Precompute the canonical entry (NFP prepass) — same normalization as get().
  ensure(a: PreparedPiece, b: PreparedPiece, rel: RotationDeg): void {
    if (a.id <= b.id) {
      this.canonical(a, b, rel);
    } else {
      this.canonical(b, a, ((360 - rel) % 360) as RotationDeg);
    }
  }

  // NFP of (A at rotA) vs (B at rotB): forbidden positions of B's local origin relative
  // to A's, in the strip frame. Caller translates by A's position.
  get(a: PreparedPiece, rotA: RotationDeg, b: PreparedPiece, rotB: RotationDeg): Path64[] {
    const rel = ((((rotB - rotA) % 360) + 360) % 360) as RotationDeg;
    if (a.id <= b.id) {
      return rotPath64(this.canonical(a, b, rel), rotA);
    }
    // Reflection identity: NFP_0(a,b,rel) = Rot(rel+180)·NFP_0(b,a,(360−rel)); the output
    // rotation composes on top, so the total is a single exact 90°-multiple rotation.
    const relC = ((360 - rel) % 360) as RotationDeg;
    const total = (((rotA + rel + 180) % 360) + 360) % 360;
    return rotPath64(this.canonical(b, a, relC), total as RotationDeg);
  }
}
