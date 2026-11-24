// Offline local-span experiment. Both endpoints and their outward continuations come from the
// target's visible ink. The only shape input is a different size's closed ring.
import { dist, quantile, resample, segNearest } from 'lib/pattern-import/pieces/geom';
import type { PtMm } from 'lib/pattern-import/types';

export type Tip = { p: PtMm; inner: PtMm };
const length = (line: readonly PtMm[]) =>
  line.slice(1).reduce((sum, p, i) => sum + dist(p, line[i]), 0);
export function spanError(a: readonly PtMm[], b: readonly PtMm[]) {
  const one = (line: readonly PtMm[], other: readonly PtMm[]) =>
    resample(line, 0.5, false).map((p) => {
      let best = Infinity;
      for (let i = 1; i < other.length; i++)
        best = Math.min(best, segNearest(p, other[i - 1], other[i]).d);
      return best;
    });
  const ds = [...one(a, b), ...one(b, a)];
  return { p95: quantile(ds, 0.95), max: Math.max(...ds) };
}
function aligned(tip: Tip, point: PtMm) {
  const dx = tip.p.x - tip.inner.x,
    dy = tip.p.y - tip.inner.y;
  return (
    (dx * (point.x - tip.p.x) + dy * (point.y - tip.p.y)) /
      (dist(tip.p, tip.inner) * dist(tip.p, point)) >=
    Math.cos((5 * Math.PI) / 180)
  );
}
export function straightSpan(a: Tip, b: Tip) {
  return aligned(a, b.p) && aligned(b, a.p) ? [a.p, b.p] : null;
}
export function referenceSpan(a: Tip, b: Tip, ring: readonly PtMm[]) {
  const n = ring.length;
  if (n < 3 || dist(a.p, b.p) < 1.5) return null;
  const project = (p: PtMm) => {
    let best = { i: 0, d: Infinity, q: p, u: 0 };
    for (let i = 0; i < n; i++) {
      const s = segNearest(p, ring[i], ring[(i + 1) % n]);
      if (s.d < best.d) best = { i, ...s };
    }
    return best;
  };
  let head = project(a.p),
    tail = project(b.p);
  if (Math.max(head.d, tail.d) > 20) return null;
  const reverse = head.i + head.u > tail.i + tail.u;
  if (reverse) [head, tail] = [tail, head];
  const inner = [head.q, ...ring.slice(head.i + 1, tail.i + 1), tail.q];
  const wrap = [
    head.q,
    ...ring.slice(0, head.i + 1).reverse(),
    ...ring.slice(tail.i + 1).reverse(),
    tail.q,
  ];
  const arc = length(inner) <= length(wrap) ? inner : wrap;
  if (reverse) arc.reverse();
  const u = arc[0],
    v = arc[arc.length - 1],
    l = dist(u, v);
  const ab = dist(a.p, b.p);
  if (l < 0.01 || Math.abs(ab / l - 1) > 0.15 || length(arc) > 2 * ab) return null;
  const dx = v.x - u.x,
    dy = v.y - u.y,
    tx = b.p.x - a.p.x,
    ty = b.p.y - a.p.y;
  const cos = (dx * tx + dy * ty) / (l * l),
    sin = (dx * ty - dy * tx) / (l * l);
  const path = arc.map((p) => ({
    x: a.p.x + cos * (p.x - u.x) - sin * (p.y - u.y),
    y: a.p.y + sin * (p.x - u.x) + cos * (p.y - u.y),
  }));
  const samples = resample(path, 0.5, false);
  const start = samples.find((p) => dist(p, a.p) >= 2);
  const end = samples
    .slice()
    .reverse()
    .find((p) => dist(p, b.p) >= 2);
  return start && end && aligned(a, start) && aligned(b, end) ? path : null;
}
