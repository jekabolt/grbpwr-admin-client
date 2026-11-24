import type { IRPath, PtMm, Style } from '../types';
import { dist } from './geom';
import { maskCrossings } from './ring-sections';
function capsule(p: IRPath) {
  if (!p.closed || p.pts.length < 6) return;
  let a = p.pts[0],
    b = a,
    length = 0;
  for (let i = 0; i < p.pts.length; i++)
    for (const q of p.pts.slice(i + 1)) {
      const d = dist(p.pts[i], q);
      if (d > length) {
        a = p.pts[i];
        b = q;
        length = d;
      }
    }
  if (length === 0) return;
  const x = (b.x - a.x) / length,
    y = (b.y - a.y) / length,
    offset = p.pts.map((q) => (q.y - a.y) * x - (q.x - a.x) * y);
  return {
    a,
    b,
    at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    length,
    width: Math.max(...offset) - Math.min(...offset),
    x,
    y,
  };
}
export function capsulePanel(
  rows: IRPath[],
  styles: Style[],
  sample: IRPath[],
  pagePaths: IRPath[],
) {
  const units = sample.map(capsule),
    key = units[0];
  if (
    !key ||
    key.length < 6 * key.width ||
    units.length < 4 ||
    units.some((u) => !u || Math.abs(u.length / key.length - 1) > 0.08)
  )
    return;
  const pitch = dist(key.at, units[1]!.at);
  if (units.slice(1).some((u, i) => Math.abs(dist(u!.at, units[i]!.at) / pitch - 1) > 0.07)) return;
  const stampCount = pagePaths.filter(
    (p) =>
      p.src.file === sample[0].src.file &&
      p.src.page === sample[0].src.page &&
      p.src.op >= sample[0].src.op &&
      p.src.op < sample[1].src.op &&
      styles[p.style].fill,
  ).length;
  const counts = new Map<string, number>();
  for (const p of pagePaths) {
    const st = styles[p.style];
    if (st.fill && st.localClipPolygon && st.clip) counts.set(st.clip, (counts.get(st.clip) ?? 0) + 1);
  }
  const marks: { p: IRPath; g: NonNullable<ReturnType<typeof capsule>> }[] = [],
    caps: { p: IRPath; hits: PtMm[] }[] = [];
  for (const p of rows) {
    if (!p.closed) continue;
    const mask = styles[p.style].localClipPolygon;
    if (mask) {
      const hits = maskCrossings(p, mask);
      if (hits.length >= 2) caps.push({ p, hits });
      continue;
    }
    const g = capsule(p);
    if (g && Math.abs(g.length / key.length - 1) < 0.22 && Math.abs(g.width / key.width - 1) < 0.5)
      marks.push({ p, g });
  }
  const pairs: {
    at: PtMm;
    ids: number[];
    page: number;
    op: number;
    stride: number;
    complete: boolean;
  }[] = [];
  for (let i = 0; i < caps.length; i++)
    for (const b of caps.slice(i + 1)) {
      const a = caps[i];
      if (a.p.src.page !== b.p.src.page || a.p.style === b.p.style) continue;
      const same = a.hits
        .filter((q) => b.hits.some((p) => dist(p, q) < 0.028))
        .filter((q, i, v) => v.slice(0, i).every((p) => dist(p, q) > 0.04));
      if (same.length !== 2) continue;
      const width = dist(same[0], same[1]);
      if (width < key.width * 0.85 || width > key.width * 2.5) continue;
      const at = { x: (same[0].x + same[1].x) / 2, y: (same[0].y + same[1].y) / 2 };

      pairs.push({
        at,
        ids: [a.p.id, b.p.id],
        page: a.p.src.page,
        op: Math.min(a.p.src.op, b.p.src.op),
        stride: Math.abs(a.p.src.op - b.p.src.op),
        complete: [a, b].every((h) => counts.get(styles[h.p.style].clip!) === stampCount),
      });
    }
  const strides = new Set(pairs.filter((c) => c.complete).map((c) => c.stride));
  if (strides.size !== 1) return;
  const eligible = pairs.filter((c) => strides.has(c.stride)),
    corners = eligible.filter((c, i) =>
      eligible.slice(0, i).every((p) => dist(p.at, c.at) > 0.025),
    );
  if (corners.length !== 4) return;
  const body = marks.filter(
    (m) => !corners.some((c) => c.page === m.p.src.page && c.op < m.p.src.op),
  );
  const along = (g: typeof key, q: PtMm) =>
    Math.abs((q.x - g.at.x) * g.x + (q.y - g.at.y) * g.y) > dist(g.at, q) * 0.94;
  const edges = body.map(({ g }, i) =>
    body.flatMap((m, j) =>
      i !== j &&
      Math.abs(dist(g.at, m.g.at) / pitch - 1) < 0.13 &&
      along(g, m.g.at) &&
      along(m.g, g.at)
        ? [j]
        : [],
    ),
  );
  const sides: { from: number; to: number; pts: PtMm[]; ids: number[] }[] = [],
    seen = new Set<number>();
  for (let i = 0; i < body.length; i++) {
    if (edges[i].length !== 1 || seen.has(i)) continue;
    let k = i,
      prev = -1;
    const seq: number[] = [];
    while (!seen.has(k)) {
      seen.add(k);
      seq.push(k);
      const ns = edges[k].filter((n) => n !== prev);
      if (ns.length !== 1) break;
      prev = k;
      k = ns[0];
    }
    if (seq.length < 4 || edges[seq.at(-1)!].length !== 1) continue;
    const end = (j: number) => {
      const g = body[j].g;
      return corners.flatMap((c, n) =>
        dist(c.at, g.at) < 1.35 * pitch && along(g, c.at) ? [n] : [],
      );
    };
    const a = end(seq[0]),
      b = end(seq.at(-1)!);
    if (a.length !== 1 || b.length !== 1 || a[0] === b[0]) continue;
    let last = corners[a[0]].at;
    const pts: PtMm[] = [];
    for (const j of seq) {
      const g = body[j].g;
      const pair = dist(g.a, last) < dist(g.b, last) ? [g.a, g.b] : [g.b, g.a];
      pts.push(...pair);
      last = pair[1];
    }
    sides.push({ from: a[0], to: b[0], pts, ids: seq.map((j) => body[j].p.id) });
  }
  if (sides.length !== 4) return;
  const pts: PtMm[] = [],
    ids: number[] = [];
  let n = sides[0].from;
  for (let i = 0; i < 4; i++) {
    const j = sides.findIndex((s) => s.from === n || s.to === n);
    if (j < 0) return;
    const s = sides.splice(j, 1)[0];
    pts.push(corners[n].at, ...(s.from === n ? s.pts : s.pts.reverse()));
    ids.push(...corners[n].ids, ...s.ids);
    n = s.from === n ? s.to : s.from;
  }
  if (dist(corners[n].at, pts[0]) < 0.001) return { pts, ids };
}
