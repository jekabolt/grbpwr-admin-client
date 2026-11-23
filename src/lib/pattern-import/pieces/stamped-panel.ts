import type { IRPath, PtMm, Style } from '../types';
import { capsulePanel } from './capsule-panel';
import { mixedPanel } from './mixed-fold-panel';
import { trianglePanel } from './triangle-panel';
import { conflictingSections, ringPanel } from './ring-sections';
import { dist, segNearest, segIntersect } from './geom';
type Ink = { p: IRPath; start: PtMm; end: PtMm; pts: PtMm[] };
const close = (a: PtMm, b: PtMm, t: number) => dist(a, b) < t;
function nearEdges(p: PtMm, outline: PtMm[]) {
  return Math.min(...outline.map((a, i) => segNearest(p, a, outline[(i + 1) % outline.length]).d));
}
function cornerMark(p: IRPath, style: Style, pitch: number) {
  const box = style.clip?.split(':').at(-1)?.split(',').map(Number);
  return (
    box?.length === 4 && Math.max(box[2] - box[0], box[3] - box[1]) < 2 * pitch && p.pts.length >= 2
  );
}
function matchingDash(s: Style, t: Style) {
  const d = s.dash,
    r = t.dash;
  return (
    !s.fill &&
    d &&
    r &&
    d.length === r.length &&
    s.widthMm === t.widthMm &&
    d.every((v, i) => Math.abs(v / d[1] - r[i] / r[1]) < 0.035) &&
    Math.abs(d[1] / r[1] - 1) < 0.3
  );
}
/** Segment the monotonically painted size bands using the distinct keyed dashed
 * sizes on either side. Restart at each tile; an absent bound yields no evidence. */
export function stampedPanel(
  paths: IRPath[],
  styles: Style[],
  sample: IRPath[],
  before: Style,
  after: Style,
  outer: PtMm[],
  pagePaths: IRPath[] = paths,
) {
  if (sample.length < 4) return;
  const pen = styles[sample[0].style],
    len = dist(sample[0].pts[0], sample[0].pts.at(-1)!);
  const pitch = dist(sample[0].pts[0], sample[1].pts[0]);

  const bounds = new Map<number, { lo: number; hi: number }>();
  for (const p of pagePaths) {
    if (p.src.file !== sample[0].src.file) continue;
    const b = bounds.get(p.src.page) ?? { lo: -Infinity, hi: Infinity };
    if (matchingDash(styles[p.style], before)) b.lo = Math.max(b.lo, p.src.op);
    if (matchingDash(styles[p.style], after)) b.hi = Math.min(b.hi, p.src.op);
    bounds.set(p.src.page, b);
  }
  const stamps: Ink[] = [],
    masked: IRPath[] = [];
  const band = paths.filter((p) => {
    const b = bounds.get(p.src.page),
      s = styles[p.style];
    if (
      !b ||
      (!Number.isFinite(b.lo) && !Number.isFinite(b.hi)) ||
      p.src.op <= b.lo ||
      p.src.op >= b.hi ||
      p.background ||
      p.src.file !== sample[0].src.file ||
      s.fill !== pen.fill ||
      s.dash?.length ||
      s.widthMm !== pen.widthMm ||
      String(s.strokeRgb) !== String(pen.strokeRgb) ||
      s.layer !== pen.layer
    )
      return false;
    return nearEdges(p.pts[0], outer) < 2 * pitch;
  });
  if (pen.fill) {
    const simple = trianglePanel(band, sample) ?? capsulePanel(band, styles, sample, pagePaths);
    if (simple) return simple;
    const conflict = conflictingSections(band, styles, sample, pagePaths);
    if (conflict) return mixedPanel(paths, styles, sample, outer, pagePaths) ?? conflict;
    return;
  }
  if (sample[0].closed) return ringPanel(band, styles, sample);
  if (
    sample.some((p) => p.closed || p.pts.length !== 2) ||
    !len ||
    pitch <= len ||
    sample.slice(1).some((p, i) => Math.abs(dist(p.pts[0], sample[i].pts[0]) / pitch - 1) > 0.06)
  )
    return;
  for (const p of band) {
    if (p.closed) continue;
    const s = styles[p.style];
    const start = p.pts[0],
      end = p.pts.at(-1)!;
    if (!start || nearEdges(start, outer) > 2 * pitch) continue;
    if (cornerMark(p, s, pitch)) {
      masked.push(p);
      continue;
    }
    if (Math.abs(dist(start, end) / len - 1) < 0.27) stamps.push({ p, start, end, pts: p.pts });
  }
  // Intersect the two cut impressions at each turn. Small flattened source
  // vertices coincide at the split even if neither end of the impression does.
  const corners: { p: IRPath; q: IRPath; at: PtMm }[] = [];
  for (let i = 0; i < masked.length; i++)
    for (const q of masked.slice(i + 1)) {
      const p = masked[i];
      if (p.src.page !== q.src.page || p.style === q.style || dist(p.pts[0], q.pts[0]) > 2 * pitch)
        continue;
      let d = 0.035,
        at: PtMm | undefined;
      for (const a of p.pts)
        for (const b of q.pts) {
          const h = dist(a, b);
          if (h < d) {
            d = h;
            at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          }
        }
      if (p.pts.length === 2 || q.pts.length === 2) {
        for (let h = 1; h < p.pts.length; h++)
          for (let j = 1; j < q.pts.length; j++) {
            const a = p.pts[h - 1],
              b = p.pts[h],
              c = q.pts[j - 1],
              e = q.pts[j];
            const hit = segIntersect(a, b, c, e);
            if (hit) {
              d = 0;
              at = hit.p;
              continue;
            }
            for (const [point, start, end] of [
              [a, c, e],
              [b, c, e],
              [c, a, b],
              [e, a, b],
            ]) {
              const sep = segNearest(point, start, end).d;
              if (sep < d) {
                d = sep;
                at = point;
              }
            }
          }
      }
      if (at && nearEdges(at, outer) < pitch / 2) corners.push({ p, q, at });
    }
  const ratio = (pitch - len) / len;
  const next = stamps.map((a) =>
    stamps.filter((b) => {
      const L = dist(a.start, a.end),
        g = dist(a.end, b.start);
      if (Math.abs(g / L - ratio) > 0.105) return false;
      const align = (p: PtMm, q: PtMm, u: PtMm, v: PtMm) =>
        ((q.x - p.x) * (v.x - u.x) + (q.y - p.y) * (v.y - u.y)) / (dist(p, q) * dist(u, v));
      return (
        align(a.start, a.end, a.end, b.start) > 0.93 && align(a.end, b.start, b.start, b.end) > 0.93
      );
    }),
  );
  const prev = new Map<Ink, number>();
  for (const ns of next) for (const b of ns) prev.set(b, (prev.get(b) ?? 0) + 1);
  const sides: { v: PtMm[]; ids: number[]; from: number; to: number }[] = [];
  for (const first of stamps.filter((a) => !prev.has(a))) {
    let a = first;
    const ids: number[] = [],
      v: PtMm[] = [];
    while (ids.length <= stamps.length) {
      v.push(...a.pts);
      ids.push(a.p.id);
      const ns = next[stamps.indexOf(a)];
      if (ns.length !== 1 || prev.get(ns[0]) !== 1) break;
      a = ns[0];
    }
    if (ids.length < 4) continue;
    const adjacent = (p: PtMm) =>
      corners.flatMap((c, i) => (close(c.at, p, pitch * 1.25) ? [i] : []));
    const x = adjacent(v[0]),
      y = adjacent(v.at(-1)!);
    if (x.length === 1 && y.length === 1 && x[0] !== y[0])
      sides.push({ v, ids, from: x[0], to: y[0] });
  }
  const pts: PtMm[] = [],
    ids: number[] = [],
    seen = new Set<number>();
  if (sides.length !== 4) return;
  let side = sides[0];
  for (let i = 0; i < 4; i++) {
    if (seen.has(side.from)) return;
    seen.add(side.from);
    const c = corners[side.from];
    pts.push(c.at, ...side.v);
    ids.push(c.p.id, c.q.id, ...side.ids);
    const ns = sides.filter((s) => s.from === side.to);
    if (ns.length !== 1) return;
    side = ns[0];
  }
  if (side !== sides[0]) return;
  return { pts, ids };
}
