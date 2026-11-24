import type { Chain, IRPath, PtMm, Sheet } from '../types';
import { bboxOf, dist, pointInPoly, segNearest } from './geom';
import { triangleCorner, triangleStamp } from './triangle-panel';
import { selfIntersects } from './gfit/checks';

export function projectOntoCycle(pts: PtMm[]) {
  let length = 0;
  const segs = pts
    .map((a, i) => {
      const b = pts[(i + 1) % pts.length],
        l = dist(a, b),
        start = length;
      length += l;
      return { a, b, l, start };
    })
    .filter((s) => s.l > 0);
  return (p: PtMm) => {
    let d = Infinity,
      arc = 0,
      axis = { x: 0, y: 0 };
    for (const { a, b, l, start } of segs) {
      const q = segNearest(p, a, b);
      if (q.d < d) {
        d = q.d;
        arc = start + q.u * l;
        axis = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      }
    }
    return { d, arc, axis };
  };
}

export type MarkNode = { path: IRPath; at: PtMm; axis?: PtMm; corner?: boolean };
export type SourceRing = { outer: PtMm[]; paths: number[]; walls: number[] };

/** Order the source impressions along a nearly closed class chain. Check their
 * heights, base lengths, tangent, pitch and independent corner impressions. */
export function readTriangleRing(sheet: Sheet, key: IRPath[], own: Chain[], seed: PtMm) {
  if (key.length < 5) return;
  const units = key.map(triangleStamp);
  const first = units[0];
  if (!first || units.some((s) => !s || Math.abs(s.width / first.width - 1) > 0.05)) return;
  const pitch = dist(first.at, units[1]!.at);
  if (units.slice(1).some((u, i) => Math.abs(dist(u!.at, units[i]!.at) / pitch - 1) > 0.08)) return;
  const loops: SourceRing[] = [];
  const pen = sheet.styles[key[0].style];
  for (const chain of own) {
    const guide = chain.pts;
    if (guide.length < 5 || !pointInPoly(seed, guide) || dist(guide[0], guide.at(-1)!) > 8 * pitch)
      continue;
    const box = bboxOf(guide),
      locate = projectOntoCycle(guide),
      nodes: { m: MarkNode; arc: number }[] = [];
    for (const p of [...sheet.paths, ...(sheet.materialMarks ?? [])]) {
      const a = p.pts[0],
        style = sheet.styles[p.style];
      if (
        !p.closed ||
        p.background ||
        !p.visibleMotif ||
        p.src.file !== key[0].src.file ||
        !style.fill ||
        style.layer !== pen.layer ||
        String(style.strokeRgb) !== String(pen.strokeRgb) ||
        a.x < box.minX - pitch ||
        a.x > box.maxX + pitch ||
        a.y < box.minY - pitch ||
        a.y > box.maxY + pitch
      )
        continue;
      const stamp = triangleStamp(p);
      const m: MarkNode | undefined =
        stamp &&
        Math.abs(stamp.width / first.width - 1) < 0.12 &&
        Math.abs(stamp.length / first.length - 1) < 0.22
          ? { path: p, ...stamp }
          : undefined;
      const at = m?.at ?? triangleCorner(p, first.width);
      if (!at) continue;
      const g = locate(at);
      if (
        g.d > pitch / 2 ||
        (m?.axis && Math.abs(g.axis.x * m.axis.x + g.axis.y * m.axis.y) < 0.93)
      )
        continue;
      nodes.push({ m: m ?? { path: p, at, corner: true }, arc: g.arc });
    }
    nodes.sort((a, b) => a.arc - b.arc);
    const marks = nodes.map((n) => n.m).filter((m, i, v) => !i || dist(m.at, v[i - 1].at) > 0.025);
    if (marks.length < key.length || marks.filter((m) => m.corner).length < 3) continue;
    const bad = marks.some((m, i) => {
      const n = marks[(i + 1) % marks.length],
        d = dist(m.at, n.at),
        delta = pitch * 0.15;
      if (m.corner || n.corner) return d > 2 * pitch;
      if (Math.abs(d - pitch) < delta) return false;
      return m.path.src.page === n.path.src.page || Math.abs(d - 2 * pitch) > delta;
    });
    if (bad) continue;
    const outer = marks.map((m) => m.at);
    if (!selfIntersects(outer))
      loops.push({ outer, paths: marks.map((m) => m.path.id), walls: [chain.id] });
  }
  if (loops.length === 1) return loops[0];
}
