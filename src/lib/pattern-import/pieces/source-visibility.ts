import type { BoxMm, IRPath, PtMm } from '../types';

export type VisibleEdges = true | [number, number][];

/** Intervals in the source ring's edge numbering, preserved by sheet transforms. */
export function visibleEdges(points: PtMm[], box: BoxMm, closed = true): VisibleEdges | undefined {
  if (box.minX > box.maxX || box.minY > box.maxY) return;
  const inside = (p: PtMm) =>
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  if (points.every(inside)) return true;
  const spans: [number, number][] = [];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    let lo = 0,
      hi = 1;
    for (const [v, d, min, max] of [
      [a.x, b.x - a.x, box.minX, box.maxX],
      [a.y, b.y - a.y, box.minY, box.maxY],
    ]) {
      if (!d) {
        if (v < min || v > max) hi = -1;
        continue;
      }
      const t = (min - v) / d,
        u = (max - v) / d;
      lo = Math.max(lo, Math.min(t, u));
      hi = Math.min(hi, Math.max(t, u));
    }
    if (lo >= hi) continue;
    const last = spans.at(-1);
    if (last && last[1] === i + lo) last[1] = i + hi;
    else spans.push([i + lo, i + hi]);
  }
  return spans.length ? spans : undefined;
}

export function fullyVisibleSourcePath(path: IRPath, tileRoundingMm = 0): boolean {
  if (!path.closed || path.background || path.pts.length < 3) return false;
  if (path.visibleEdges === true || path.paintCopies?.some((c) => c.edges === true)) return true;
  const spans = [
    ...(path.visibleEdges ?? []),
    ...(path.paintCopies ?? []).flatMap((c) => (c.edges === true ? [] : c.edges)),
  ].sort((a, b) => a[0] - b[0]);
  // Visible intervals use fractional edge indices. Adjacent tiles may round the
  // same clip intersection independently. Bound the total uncovered arc length.
  let missingMm = 0;
  let end = 0;
  for (const [lo, hi] of spans) {
    if (lo > end + 1e-7) {
      if (end === 0 || end % 1 === 0 || Math.floor(lo) !== Math.floor(end)) return false;
      const i = Math.floor(end);
      const a = path.pts[i],
        b = path.pts[(i + 1) % path.pts.length];
      missingMm += (lo - end) * Math.hypot(b.x - a.x, b.y - a.y);
      if (missingMm > tileRoundingMm) return false;
    }
    end = Math.max(end, hi);
  }
  return end >= path.pts.length - 1e-7;
}
