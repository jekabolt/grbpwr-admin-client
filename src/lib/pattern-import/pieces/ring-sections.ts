import type { IRPath, PtMm, Style } from '../types';
import { bboxOf, dist, segIntersect } from './geom';
const center = (p: IRPath) => {
  const b = bboxOf(p.pts);
  return { x: (b.maxX + b.minX) / 2, y: (b.maxY + b.minY) / 2 };
};
/** A single clipped ring crosses the mask twice. The common diameter of
 * its two separately clipped impressions locates the centre of the turn. */
export function maskCrossings(p: IRPath, mask: PtMm[]) {
  const hits: PtMm[] = [];
  for (let i = 0; i < p.pts.length; i++)
    for (let j = 0; j < mask.length; j++) {
      const hit = segIntersect(
        p.pts[i],
        p.pts[(i + 1) % p.pts.length],
        mask[j],
        mask[(j + 1) % mask.length],
      );
      if (hit && hits.every((h) => dist(h, hit.p) > 0.001)) hits.push(hit.p);
    }
  return hits;
}
export function maskCenter(p: IRPath, mask: PtMm[]) {
  const hits = maskCrossings(p, mask);
  return hits.length === 2
    ? { x: (hits[0].x + hits[1].x) / 2, y: (hits[0].y + hits[1].y) / 2 }
    : undefined;
}
export function ringPanel(rows: IRPath[], styles: Style[], sample: IRPath[]) {
  if (
    sample.length < 5 ||
    sample.some((p) => !p.closed || p.pts.length < 5 || styles[p.style].fill)
  )
    return;
  const cs = sample.map(center),
    pitch = dist(cs[0], cs[1]);
  if (!pitch || cs.slice(1).some((p, i) => Math.abs(dist(p, cs[i]) / pitch - 1) > 0.07)) return;
  const r = dist(sample[0].pts[0], cs[0]);
  if (
    !r ||
    r * 2 >= pitch ||
    sample.some((p) => p.pts.some((v) => Math.abs(dist(v, center(p)) / r - 1) > 0.22))
  )
    return;
  const marks: { at: PtMm; ids: number[]; pg: number; op: number }[] = [],
    halves: { p: IRPath; at: PtMm }[] = [];
  for (const p of rows) {
    if (!p.closed || p.pts.length < 5) continue;
    const at = center(p),
      st = styles[p.style];
    if (!st.localClipPolygon) {
      if (p.pts.every((pt) => Math.abs(dist(at, pt) / r - 1) < 0.35))
        marks.push({ at, ids: [p.id], pg: p.src.page, op: p.src.op });
    } else {
      const at = maskCenter(p, st.localClipPolygon);
      if (at) halves.push({ p, at });
    }
  }
  const cuts = new Map<number, number>();
  const corners: typeof marks = [];
  for (let i = 0; i < halves.length; i++)
    for (const b of halves.slice(i + 1)) {
      const a = halves[i];
      if (a.p.src.page !== b.p.src.page || a.p.style === b.p.style || dist(a.at, b.at) > 0.035)
        continue;
      const pg = a.p.src.page,
        op = Math.min(a.p.src.op, b.p.src.op);
      cuts.set(pg, Math.min(cuts.get(pg) ?? Infinity, op));
      corners.push({
        at: { x: (a.at.x + b.at.x) / 2, y: (a.at.y + b.at.y) / 2 },
        ids: [a.p.id, b.p.id],
        pg,
        op,
      });
    }
  if (corners.length !== 4) return;
  const nodes = [...corners, ...marks.filter((m) => m.op < (cuts.get(m.pg) ?? Infinity))];
  const graph = nodes.map((a, i) =>
    nodes.flatMap((b, j) =>
      j !== i && Math.abs(dist(a.at, b.at) / pitch - 1) < (i < 4 || j < 4 ? 0.27 : 0.07) ? [j] : [],
    ),
  );
  let prev = -1,
    i = 0;
  const visited = new Set<number>(),
    pts: PtMm[] = [],
    ids: number[] = [];
  while (!visited.has(i)) {
    visited.add(i);
    const ns = graph[i];
    if (ns.length !== 2) return;
    pts.push(nodes[i].at);
    ids.push(...nodes[i].ids);
    const next = ns[0] === prev ? ns[1] : ns[0];
    prev = i;
    i = next;
  }
  if (i === 0 && corners.every((_, j) => visited.has(j))) return { pts, ids };
}

/** A mixed filled pen can paint different transverse centres on the two masks
 * of a turn. Keep both witnesses when their offsets disagree. */
export function conflictingSections(
  rows: IRPath[],
  styles: Style[],
  sample: IRPath[],
  pagePaths: IRPath[],
) {
  if (!sample.every((p) => p.closed && styles[p.style].fill)) return;
  const first = sample[0],
    last = Math.max(...sample.map((s) => s.src.op));
  const glyphs = pagePaths
    .filter(
      (p) =>
        p.closed &&
        styles[p.style].fill &&
        p.src.file === first.src.file &&
        p.src.page === first.src.page &&
        p.src.op >= first.src.op &&
        p.src.op <= last,
    )
    .sort((a, b) => a.src.op - b.src.op);
  if (new Set(glyphs.map((p) => p.pts.length)).size < 2) return;
  const period = glyphs.findIndex(
    (_, n) =>
      n >= 2 &&
      n * 2 <= glyphs.length &&
      glyphs.slice(n).every((p, i) => p.pts.length === glyphs[i].pts.length),
  );
  if (period < 2) return;
  const counts = new Map<string, number>();
  for (const p of pagePaths) {
    const s = styles[p.style];
    if (s.fill && s.localClipPolygon && s.clip) counts.set(s.clip, (counts.get(s.clip) ?? 0) + 1);
  }
  const sections = rows.flatMap((p) => {
    const mask = styles[p.style].localClipPolygon;
    if (!p.closed || !mask || counts.get(styles[p.style].clip!) !== period) return [];
    const hit = maskCrossings(p, mask);
    if (hit.length < 2) return [];
    let a = hit[0],
      b = a,
      width = 0;
    for (const q of hit)
      for (const v of hit) {
        const d = dist(q, v);
        if (d > width) {
          width = d;
          a = q;
          b = v;
        }
      }
    return width > 0.25 && width < 1.5
      ? [{ p, a, b, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }]
      : [];
  });
  for (let i = 0; i < sections.length; i++)
    for (const b of sections.slice(i + 1)) {
      const a = sections[i];
      if (a.p.src.page !== b.p.src.page || a.p.style === b.p.style) continue;
      const d = dist(a.at, b.at);
      if (d > 0.075 && d < 0.35 && Math.abs(dist(a.a, a.b) - dist(b.a, b.b)) < 0.3)
        return { alternatives: [a.at, b.at], ids: [a.p.id, b.p.id] };
    }
}
