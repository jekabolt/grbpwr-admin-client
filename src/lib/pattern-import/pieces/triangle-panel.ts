import type { IRPath, PtMm } from '../types';
import { dist, segNearest } from './geom';
type Mark = { p: IRPath; at: PtMm; axis?: PtMm };
function foot(a: PtMm, b: PtMm, c: PtMm) {
  const x = b.x - a.x,
    y = b.y - a.y,
    t = ((c.x - a.x) * x + (c.y - a.y) * y) / (x * x + y * y);
  return { x: a.x + t * x, y: a.y + t * y };
}
export function triangleStamp(p: IRPath) {
  const v = dist(p.pts[0], p.pts.at(-1)!) < 0.001 ? p.pts.slice(0, -1) : p.pts;
  if (!p.closed || v.length < 3 || v.length > 6) return;
  const a = v[0],
    t = v.at(-1)!,
    b = v[v.length - 2],
    f = foot(a, b, t);
  const w = dist(t, f),
    l = dist(a, b);
  if (!w || !l || v.slice(1, -2).some((q) => segNearest(q, a, b).d > 0.045)) return;
  return {
    width: w,
    length: l,
    at: { x: (a.x + b.x + t.x - f.x) / 2, y: (a.y + b.y + t.y - f.y) / 2 },
    axis: { x: (b.x - a.x) / l, y: (b.y - a.y) / l },
  };
}
export function triangleCorner(p: IRPath, w: number) {
  if (p.pts.length < 7) return;
  const [a, b, c] = p.pts,
    u = dist(a, b),
    v = dist(b, c);
  if (!u || !v || Math.abs(u - v) > 0.17 * w || Math.max(u, v) > 1.6 * w) return;
  const x = (b.x - a.x) / u,
    y = (b.y - a.y) / u,
    t = (c.x - b.x) / v,
    z = (c.y - b.y) / v;
  const d = x * z - y * t;
  if (d < 0.4) return;
  const h = w / 2,
    intersection = ((z - y) * h * z + (t - x) * h * t) / d;
  return { x: b.x + h * y + x * intersection, y: b.y - h * x + y * intersection };
}
export function trianglePanel(rows: IRPath[], sample: IRPath[]) {
  const units = sample.map(triangleStamp);
  if (units.length < 5 || units.some((s) => !s)) return;
  const first = units[0]!,
    pitch = dist(first.at, units[1]!.at);
  if (units.slice(1).some((s, i) => Math.abs(dist(s!.at, units[i]!.at) / pitch - 1) > 0.08)) return;
  const nodes: Mark[] = [],
    cap: Mark[] = [];
  for (const p of rows) {
    const s = triangleStamp(p);
    if (
      s &&
      Math.abs(s.width / first.width - 1) < 0.12 &&
      Math.abs(s.length / first.length - 1) < 0.22
    ) {
      nodes.push({ p, at: s.at, axis: s.axis });
      continue;
    }
    const at = triangleCorner(p, first.width);
    if (at) cap.push({ p, at });
  }
  return markCycle(nodes, cap, pitch);
}
export function markCycle(regular: Mark[], corners: Mark[], pitch: number) {
  const marks = [...corners, ...regular];
  const aligned = (a: Mark, b: Mark) =>
    !a.axis ||
    Math.abs((b.at.x - a.at.x) * a.axis.x + (b.at.y - a.at.y) * a.axis.y) > 0.9 * dist(a.at, b.at);
  const links = marks.map((a, i) =>
    marks.flatMap((b, j) =>
      i !== j &&
      aligned(a, b) &&
      aligned(b, a) &&
      Math.abs(dist(a.at, b.at) / pitch - 1) <
        (i < corners.length || j < corners.length ? 0.3 : 0.075)
        ? [j]
        : [],
    ),
  );
  const cycles: { pts: PtMm[]; ids: number[] }[] = [];
  const seen = new Set<number>();
  for (let start = 0; start < corners.length; start++) {
    if (seen.has(start)) continue;
    const ids: number[] = [],
      pts: PtMm[] = [];
    let i = start,
      prev = -1,
      n = 0;
    while (!seen.has(i) && links[i].length === 2) {
      seen.add(i);
      if (i < corners.length) n++;
      ids.push(marks[i].p.id);
      pts.push(marks[i].at);
      const next = links[i].find((j) => j !== prev)!;
      prev = i;
      i = next;
    }
    if (i === start && n === 4) cycles.push({ pts, ids });
  }
  if (cycles.length === 1) return cycles[0];
}
