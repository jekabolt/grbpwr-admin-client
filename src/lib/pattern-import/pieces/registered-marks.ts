import type { BoxMm, ChainSet, IRPath, PieceCandidate, PtMm, Sheet, SizeRun } from '../types';
import { bboxOf, dist, pointInPoly } from './geom';
import { selfIntersects } from './gfit/checks';
import { triangleCorner, triangleStamp } from './triangle-panel';
import { printedMitre } from './clipped-mark-loop';

type Mark = { pts: PtMm[]; ids: number[]; corner?: boolean };
type Occ = { p: IRPath; op: number };
type Run = { nodes: Mark[]; cycle: boolean };
const first = (m: Mark) => m.pts[0],
  last = (m: Mark) => m.pts.at(-1)!;
const mid = (a: PtMm, b: PtMm) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];
const unit = (a: PtMm, b: PtMm) => {
  const d = dist(a, b);
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const dot = (a: PtMm, b: PtMm) => a.x * b.x + a.y * b.y;
const center = (p: IRPath) => {
  const b = bboxOf(p.pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};
function registeredPages(sheet: Sheet, pen: IRPath, box: BoxMm) {
  const poses = new Map(sheet.poses.filter((z) => z.file === pen.src.file).map((z) => [z.page, z]));
  const pages = new Map<number, Occ[]>();
  for (const source of sheet.paths) {
    const p = source.printedGlyph ? { ...source, closed: true, pts: source.printedGlyph } : source;
    const style = sheet.styles[p.style],
      ink = sheet.styles[pen.style],
      v = p.pts[0];
    if (
      !p.closed ||
      p.background ||
      !v ||
      !style.fill ||
      style.layer !== ink.layer ||
      String(style.strokeRgb) !== String(ink.strokeRgb) ||
      p.src.file !== pen.src.file ||
      v.x < box.minX ||
      v.x > box.maxX ||
      v.y < box.minY ||
      v.y > box.maxY
    )
      continue;
    const at = center(p);
    for (const src of [p.src, ...(p.stampCopies ?? [])]) {
      const pose = poses.get(src.page);
      if (!pose) continue;
      const { a, b, c, d, e, f } = pose.toSheet,
        det = a * d - b * c;
      const x = (d * (at.x - e) - c * (at.y - f)) / det,
        y = (a * (at.y - f) - b * (at.x - e)) / det;
      // Leave the fragment at the page boundary to its complete registered copy.
      if (Math.min(x, y, pose.widthMm - x, pose.heightMm - y) < 1.8) continue;
      const list = pages.get(src.page) ?? [];
      list.push({ p, op: src.op });
      pages.set(src.page, list);
    }
  }
  for (const list of pages.values()) list.sort((a, b) => a.op - b.op);
  return [...pages.values()];
}
/** A shared stamp identifies the same node on both tiles. Conflicting incoming
 * or outgoing operations invalidate the whole connected component. */
function runs(pages: { mark: Mark; op: number; end: number }[][], maxStep: number, maxGap: number) {
  const nodes = new Map<number, Mark>(),
    prev = new Map<number, Set<number>>(),
    next = new Map<number, Set<number>>();
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      const b = page[i],
        k = b.mark.ids[0];
      nodes.set(k, b.mark);
      if (!prev.has(k)) {
        prev.set(k, new Set());
        next.set(k, new Set());
      }
      if (i) {
        const a = page[i - 1],
          j = a.mark.ids[0];
        if (j !== k && b.op - a.end <= maxStep && dist(last(a.mark), first(b.mark)) <= maxGap) {
          prev.get(k)!.add(j);
          next.get(j)!.add(k);
        }
      }
    }
  }
  const seen = new Set<number>();
  const out: Run[] = [];
  for (const id of nodes.keys()) {
    if (seen.has(id)) continue;
    const stack = [id],
      group: number[] = [];
    seen.add(id);
    while (stack.length) {
      const j = stack.pop()!;
      group.push(j);
      for (const k of [...prev.get(j)!, ...next.get(j)!])
        if (!seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
    }
    if (group.some((j) => prev.get(j)!.size > 1 || next.get(j)!.size > 1)) continue;
    const start = group.find((j) => !prev.get(j)!.size) ?? id;
    let j: number | undefined = start;
    const sorted: Mark[] = [];
    do {
      sorted.push(nodes.get(j)!);
      j = next.get(j)!.values().next().value;
    } while (j !== undefined && j !== start);
    if (sorted.length === group.length) out.push({ nodes: sorted, cycle: j === start });
  }
  return out;
}
function triangles(pages: Occ[][], sample: IRPath[], step: number, seed: PtMm) {
  const key = triangleStamp(sample[0]);
  if (!key || sample.some((p) => !triangleStamp(p))) return;
  const pitch = median(
    sample.slice(1).map((p, i) => dist(triangleStamp(p)!.at, triangleStamp(sample[i])!.at)),
  );
  const rows = pages.map((list) =>
    list.flatMap(({ p, op }) => {
      const s = triangleStamp(p);
      if (
        s &&
        Math.abs(s.width / key.width - 1) < 0.22 &&
        Math.abs(s.length / key.length - 1) < 0.25
      )
        return [{ op, end: op, mark: { pts: [s.at], ids: [p.id], corner: false } }];
      const q = triangleCorner(p, key.width);
      return q ? [{ op, end: op, mark: { pts: [q], ids: [p.id], corner: true } }] : [];
    }),
  );
  const cycles = runs(rows, step * 4, pitch * 1.42).filter(({ nodes, cycle }) => {
    if (nodes.filter((m) => m.corner).length < 3) return false;
    const a = nodes[0],
      b = nodes.at(-1)!;
    if (!cycle && (!(a.corner || b.corner) || Math.abs(dist(first(a), last(b)) / pitch - 1) > 0.25))
      return false;
    return pointInPoly(
      seed,
      nodes.flatMap((m) => m.pts),
    );
  });
  if (cycles.length === 1) return cycles[0].nodes;
}
type Cal = { width: number; height: number; offset: number; pitch: number; radius: number };
function frame(p: IRPath) {
  const a = p.pts[0],
    b = p.pts.reduce((f, q) => (dist(a, q) > dist(a, f) ? q : f));
  const width = dist(a, b);
  if (!width || p.pts.length < 3) return;
  const u = unit(a, b),
    nx = -u.y,
    ny = u.x;
  const heights = p.pts.map((q) => (q.x - a.x) * nx + (q.y - a.y) * ny),
    h = Math.max(...heights),
    l = Math.min(...heights);
  if (h < -l || -l > 0.24 * h) return;
  return { width, height: h, nx, ny, base: mid(a, b), dir: u };
}
function round(p: IRPath) {
  const q = center(p),
    b = bboxOf(p.pts),
    w = b.maxX - b.minX,
    h = b.maxY - b.minY;
  if (
    p.pts.length < 6 ||
    dist(p.pts[0], p.pts.at(-1)!) > 0.01 ||
    Math.min(w, h) < 0.65 * Math.max(w, h)
  )
    return;
  return { at: q, radius: (w + h) / 4 };
}
function calibrate(sample: IRPath[]) {
  if (sample.length < 10 || sample.length % 5 !== 0) return;
  const marks = sample.map((p) => (round(p) ? 'd' : frame(p) ? 't' : '?')).join('');
  if (marks !== 'tttdd'.repeat(sample.length / 5)) return;
  const frames = sample.map(frame).filter((f): f is NonNullable<typeof f> => f !== undefined),
    dots = sample.map(round).filter((f): f is NonNullable<typeof f> => f !== undefined);
  const width = median(frames.map((f) => f.width)),
    height = median(frames.map((f) => f.height)),
    radius = median(dots.map((f) => f.radius));
  const f = frames[0],
    d = dots[0].at,
    offset = (d.x - f.base.x) * f.nx + (d.y - f.base.y) * f.ny;
  const pitch = dist(frame(sample[0])!.base, frame(sample[5])!.base);
  if (!(offset > 0 && offset < height && pitch > width)) return;
  return { width, height, offset, pitch, radius };
}
function packets(list: Occ[], key: Cal, step: number) {
  const out: { mark: Mark; op: number; end: number }[] = [];
  for (let i = 0; i + 4 < list.length; i++) {
    const v = list.slice(i, i + 5);
    if (v.some((t, j) => j && t.op - v[j - 1].op !== step)) continue;
    const tick = v.slice(0, 3).map((o) => frame(o.p)),
      dots = v.slice(3).map((o) => round(o.p));
    if (
      tick.some(
        (f) =>
          !f ||
          Math.abs(f.width / key.width - 1) > 0.25 ||
          Math.abs(f.height / key.height - 1) > 0.32,
      ) ||
      dots.some((d) => !d || Math.abs(d.radius / key.radius - 1) > 0.22)
    )
      continue;
    const centers = tick.map((f) => ({
      x: f!.base.x + f!.nx * key.offset,
      y: f!.base.y + f!.ny * key.offset,
    }));
    const pts = [centers[0], centers[1], dots[0]!.at, centers[2], dots[1]!.at];
    if (pts.slice(1).some((q, j) => dist(pts[j], q) > key.pitch * 0.36)) continue;
    out.push({ op: v[0].op, end: v[4].op, mark: { pts, ids: v.map((o) => o.p.id) } });
    i += 4;
  }
  return out;
}
function mitres(pages: Occ[][], sheet: Sheet) {
  const all: { q: PtMm; ids: number[] }[] = [];
  for (const page of pages) {
    const clips = new Map<string, { quad: PtMm[]; ids: Set<number> }>();
    for (const { p } of page) {
      const s = sheet.styles[p.style];
      if (!s.clipQuad || !s.clip) continue;
      const c = clips.get(s.clip) ?? { quad: s.clipQuad, ids: new Set<number>() };
      c.ids.add(p.id);
      clips.set(s.clip, c);
    }
    const caps = [...clips.values()].filter((c) => c.ids.size === 5);
    for (let i = 0; i < caps.length; i++)
      for (const other of caps.slice(i + 1)) {
        const m = printedMitre(caps[i].quad, other.quad);
        if (m && !all.some((c) => dist(c.q, m.vertex) < 0.008))
          all.push({ q: m.vertex, ids: [...caps[i].ids, ...other.ids] });
      }
  }
  return all;
}
function compound(pages: Occ[][], sample: IRPath[], step: number, seed: PtMm, sheet: Sheet) {
  const key = calibrate(sample);
  if (!key) return;
  const rows = pages.map((list) =>
    packets(
      list.filter((o) => !sheet.styles[o.p.style].clipQuad),
      key,
      step,
    ),
  );
  const strips = runs(rows, step * 2, key.pitch * 0.38).filter((s) => s.nodes.length >= 2);
  const corners = mitres(pages, sheet);
  if (!corners.length) return;
  const exemplar = packets(
    sample.slice(0, 5).map((p) => ({ p, op: p.src.op })),
    key,
    step,
  )[0]?.mark;
  if (!exemplar) return;
  const gap = key.pitch - dist(first(exemplar), last(exemplar));
  const visible = new Map<number, { q: PtMm; kind: 'dot' | 'tick' }>();
  for (const page of pages)
    for (const { p } of page) {
      if (visible.has(p.id) || sheet.styles[p.style].clipQuad) continue;
      const d = round(p);
      if (d && Math.abs(d.radius / key.radius - 1) < 0.15) {
        visible.set(p.id, { q: d.at, kind: 'dot' });
        continue;
      }
      const f = frame(p);
      if (
        f &&
        Math.abs(f.width / key.width - 1) < 0.15 &&
        Math.abs(f.height / key.height - 1) < 0.2
      )
        visible.set(p.id, {
          q: { x: f.base.x + f.nx * key.offset, y: f.base.y + f.ny * key.offset },
          kind: 'tick',
        });
    }
  const edges = strips.map((s) =>
    strips.flatMap((t, j) => {
      const end = s.nodes.at(-1)!,
        start = t.nodes[0],
        a = last(end),
        b = first(start),
        d = dist(a, b);
      if (!d || d > 1.65 * key.pitch) return [];
      const u = unit(end.pts.at(-2)!, a),
        v = unit(b, start.pts[1]),
        dir = unit(a, b);
      const joins: Mark[] = [];
      if (dot(u, dir) > 0.985 && dot(v, dir) > 0.985) {
        const ratio = dist(first(end), a) / dist(first(exemplar), last(exemplar));
        if (Math.abs(d / (ratio * gap) - 1) < 0.15) joins.push({ pts: [], ids: [] });
        // A packet straddling the page edge may be split between its two copies.
        // Require all five actual glyph axes at the printed phase and scale.
        if (Math.abs(d / (ratio * (gap + key.pitch)) - 1) < 0.05) {
          const actual: Mark = { pts: [], ids: [] };
          for (let k = 0; k < 5; k++) {
            const x = ratio * (gap + dist(first(exemplar), exemplar.pts[k]));
            const q = { x: a.x + dir.x * x, y: a.y + dir.y * x },
              kind = k === 2 || k === 4 ? 'dot' : 'tick';
            const found = [...visible].filter(([, m]) => m.kind === kind && dist(q, m.q) < 0.055);
            if (found.length !== 1) break;
            actual.pts.push(found[0][1].q);
            actual.ids.push(found[0][0]);
          }
          if (actual.ids.length === 5) joins.push(actual);
        }
      }
      for (const m of corners) {
        if (
          dist(a, m.q) > key.pitch ||
          dist(b, m.q) > key.pitch ||
          dot(unit(a, m.q), u) < 0.995 ||
          dot(unit(m.q, b), v) < 0.995
        )
          continue;
        // Both independently painted tangents must reach this shared mask seam.
        const across = (p: PtMm, q: PtMm, t: PtMm) =>
          Math.abs((p.x - q.x) * t.y - (p.y - q.y) * t.x);
        if (across(m.q, a, u) < 0.1 && across(m.q, b, v) < 0.1)
          joins.push({ pts: [m.q], ids: m.ids, corner: true });
      }
      return joins.map((join) => ({ j, join }));
    }),
  );
  const incoming = strips.map(() => 0);
  for (const list of edges) for (const e of list) incoming[e.j]++;
  const solutions: Mark[][] = [],
    seen = new Set<number>();
  for (let i = 0; i < strips.length; i++) {
    if (seen.has(i)) continue;
    let k = i;
    const found: Mark[] = [];
    do {
      if (seen.has(k) || edges[k].length !== 1 || incoming[k] !== 1) break;
      seen.add(k);
      found.push(...strips[k].nodes, edges[k][0].join);
      k = edges[k][0].j;
    } while (k !== i);
    if (
      k === i &&
      found.filter((m) => m.corner).length >= 3 &&
      pointInPoly(
        seed,
        found.flatMap((m) => m.pts),
      )
    )
      solutions.push(found);
  }
  if (solutions.length === 1) return solutions[0];
}
export function registeredMarkLoop(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  rank: number,
  seed: PtMm,
  candidates: PieceCandidate[],
) {
  const cls = set.classes.find((c) => c.id === run.sizes[rank]?.classId);
  const ev = cls?.evidence.filter((e) => e.kind === 'legend-sample');
  if (cls?.role !== 'size' || ev?.length !== 1 || ev[0].kind !== 'legend-sample') return;
  const ch = set.chains[ev[0].chain];
  if (!ch || ch.ranges.length < 6) return;
  const byId = new Map(sheet.paths.map((p) => [p.id, p])),
    sample = ch.ranges.flatMap((r) => byId.get(r.path) ?? []).sort((a, b) => a.src.op - b.src.op);
  if (
    sample.length !== ch.ranges.length ||
    sample.some((p) => !p.closed || !sheet.styles[p.style].fill)
  )
    return;
  const hi = candidates.find((c) => c.rank > rank && c.outcome === 'closed');
  if (!hi) return;
  const step = median(sample.slice(1).map((p, i) => p.src.op - sample[i].src.op));
  if (!step) return;
  const box = {
    minX: hi.bbox.minX - 8,
    maxX: hi.bbox.maxX + 8,
    minY: hi.bbox.minY - 8,
    maxY: hi.bbox.maxY + 8,
  };
  const pages = registeredPages(sheet, sample[0], box);
  const result = ch.markPeriod
    ? compound(pages, sample, step, seed, sheet)
    : triangles(pages, sample, step, seed);
  if (!result) return;
  const pts = result.flatMap((m) => m.pts),
    paths = new Set(result.flatMap((m) => m.ids));
  if (selfIntersects(pts)) return;
  return {
    pts,
    paths,
    walls: set.chains.filter((c) => c.ranges.some((r) => paths.has(r.path))).map((c) => c.id),
  };
}
