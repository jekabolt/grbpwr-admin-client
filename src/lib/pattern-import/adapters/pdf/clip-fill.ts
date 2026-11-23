import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { PtMm } from 'lib/pattern-import/types';

function side(a: PtMm, b: PtMm, p: PtMm) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** The four half-planes must bound one convex region. Normalize its winding. */
export function convexQuad(pts: PtMm[]): PtMm[] | undefined {
  if (pts.length !== 4) return;
  const turns = pts.map((p, i) => side(p, pts[(i + 1) % 4], pts[(i + 2) % 4]));
  if (turns.every((v) => v > 0)) return pts;
  if (turns.every((v) => v < 0)) return pts.slice().reverse();
}

/** Clip a single fill to straight mask edges. Multiple disjoint spans require a
 * multipolygon representation, so leave that case to the original path reader. */
export function clipFill(pts: PtMm[], masks: PtMm[][]): PtMm[] | undefined {
  const asIntPath = (points: PtMm[]) => {
    const path = new Path64();
    for (const p of points) path.push(new Point64(Math.round(p.x * 1e5), Math.round(p.y * 1e5)));
    return path;
  };
  let ring = pts;
  for (const mask of masks) {
    for (let i = 0; i < mask.length; i++) {
      const a = mask[i],
        b = mask[(i + 1) % mask.length];
      const ds = ring.map((p) => side(a, b, p));
      if (ds.every((d) => d >= 0)) continue;
      if (ds.every((d) => d <= 0)) return [];
      const next: PtMm[] = [];
      let transitions = 0;
      for (let j = 0; j < ring.length; j++) {
        const k = (j + 1) % ring.length;
        if (ds[j] >= 0) next.push(ring[j]);
        if (ds[j] >= 0 !== ds[k] >= 0) {
          if (++transitions > 2) {
            let paths = [asIntPath(pts)];
            for (const quad of masks)
              paths = Clipper.Intersect(paths, [asIntPath(quad)], FillRule.NonZero);
            if (paths.length > 1) return undefined;
            return Array.from(paths[0] ?? [], (p) => ({ x: p.x / 1e5, y: p.y / 1e5 }));
          }
          if (ds[j] && ds[k]) {
            const t = ds[j] / (ds[j] - ds[k]);
            next.push({
              x: ring[j].x + t * (ring[k].x - ring[j].x),
              y: ring[j].y + t * (ring[k].y - ring[j].y),
            });
          }
        }
      }
      if (next.length < 3) return [];
      ring = next;
    }
  }
  return ring;
}
