// Bridge between cm-space Pt[] polygons and clipper2-js int64 paths.
//
// Empirically verified against clipper2-js@1.2.4 (see THIRD-PARTY.md):
// - `Clipper.Union(subject, undefined, fillRule)` — the 2nd positional arg is CLIP, not
//   the fill rule; passing the rule there throws "paths is not iterable".
// - `Clipper.MinkowskiDiff` and `Clipper.InflatePaths` are numerically BROKEN in this
//   port on real polygons (phantom interior holes, asymmetric offsets) — the NFP is
//   built by convex decomposition instead (nest/nfp.ts), and only the well-conditioned
//   boolean cases (union of convex parts, rect-minus-paths difference) run through here.
// - `Clipper.getBounds` is only reliable on a single Path64 — we keep our own bounds.
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { Pt } from '../types';

// 1 cm → 10 000 int units (1 µm resolution) — coarse enough to stay far from int53
// limits on a 50 m marker, fine enough that rounding is invisible at cutting tolerance.
export const SCALE = 10_000;

export function toPath64(poly: readonly Pt[]): Path64 {
  const p = new Path64();
  for (const q of poly) p.push(new Point64(Math.round(q.x * SCALE), Math.round(q.y * SCALE)));
  return p;
}

export function fromPath64(path: Path64): Pt[] {
  const out: Pt[] = [];
  for (const q of path) out.push({ x: q.x / SCALE, y: q.y / SCALE });
  return out;
}

// Coordinate-comparing consecutive dedupe (incl. the wrap pair). NOT Clipper.stripDuplicates:
// that compares points by REFERENCE (`lastPt !== path[i]`), a no-op on freshly built paths.
function dedupePath64(path: Path64): Path64 {
  const out = new Path64();
  for (const q of path) {
    const last = out[out.length - 1];
    if (last && last.x === q.x && last.y === q.y) continue;
    out.push(q);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) out.pop();
    else break;
  }
  return out;
}

// De-self-intersect one loop, keep the dominant region, return it CCW.
export function sanitizeLoop(poly: readonly Pt[]): Pt[] | null {
  const res = Clipper.Union([toPath64(poly)], undefined, FillRule.NonZero);
  let best: Path64 | null = null;
  let bestArea = -Infinity;
  for (const path of res) {
    const a = Math.abs(Clipper.area(path));
    if (a > bestArea) {
      bestArea = a;
      best = path;
    }
  }
  if (!best || bestArea < 1) return null;
  const pts = fromPath64(dedupePath64(best));
  return pts.length >= 3 ? pts : null;
}

export function rdpSimplify(poly: readonly Pt[], epsCm: number): Pt[] {
  if (epsCm <= 0 || poly.length <= 4) return [...poly];
  const res = Clipper.ramerDouglasPeucker(toPath64(poly), epsCm * SCALE);
  const pts = fromPath64(res);
  return pts.length >= 3 ? pts : [...poly];
}

// Feasible region for one placement step: IFP rectangle minus the union of translated
// NFPs of already-placed neighbours. Returns every path (outer boundaries AND hole
// boundaries) — the optimum sits on a vertex of either.
export function feasibleRegion(ifpRect: readonly Pt[], forbidden: Path64[]): Pt[][] {
  if (forbidden.length === 0) return [[...ifpRect]];
  const res = Clipper.Difference([toPath64(ifpRect)], forbidden, FillRule.NonZero);
  const out: Pt[][] = [];
  for (const path of res) {
    const pts = fromPath64(dedupePath64(path));
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

export function translatePath64(path: Path64, dxCm: number, dyCm: number): Path64 {
  const dx = Math.round(dxCm * SCALE);
  const dy = Math.round(dyCm * SCALE);
  const out = new Path64();
  for (const q of path) out.push(new Point64(q.x + dx, q.y + dy));
  return out;
}
