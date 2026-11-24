import type { IRPath, PtMm, Style } from '../types';
import { dist, segIntersect, segNearest } from './geom';

const mid = (a: PtMm, b: PtMm) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const cross = (a: PtMm, b: PtMm) => a.x * b.y - a.y * b.x;
const minus = (a: PtMm, b: PtMm) => ({ x: a.x - b.x, y: a.y - b.y });
const shift = (p: PtMm, u: PtMm, t: number) => ({ x: p.x + u.x * t, y: p.y + u.y * t });
const dot = (a: PtMm, b: PtMm) => a.x * b.x + a.y * b.y;
function unit(a: PtMm, b: PtMm) {
  const n = dist(a, b);
  return { x: (b.x - a.x) / n, y: (b.y - a.y) / n };
}
const oval = (p: IRPath) =>
  p.pts.length >= 8 &&
  dist(p.pts[0], p.pts.at(-1)!) < 0.002 &&
  p.pts
    .slice(1)
    .every(
      (q, i) => dist(q, p.pts[i]) < 0.85 * dist(p.pts[0], p.pts[Math.floor(p.pts.length / 2)]),
    );
function section(p: IRPath) {
  const a = p.pts[0],
    b = p.pts.at(-1)!;
  if (!oval(p)) return { a, b: dist(a, b) < 0.002 ? p.pts.at(-2)! : b };
  // The PDF starts an oval at a longitudinal pole. Unequal subdivision of
  // its two halves can move the opposite pole away from the middle index.
  const xs = p.pts.map((v) => v.x),
    ys = p.pts.map((v) => v.y);
  const target = {
    x: Math.max(...xs) + Math.min(...xs) - a.x,
    y: Math.max(...ys) + Math.min(...ys) - a.y,
  };
  const q = p.pts.reduce((best, v) => (dist(v, target) < dist(best, target) ? v : best));
  return { a, b: q };
}
type Mark = { at: PtMm; axis: PtMm; id: number; station: number; pg: number };
export function mixedPanel(
  local: IRPath[],
  styles: Style[],
  sample: IRPath[],
  outer: PtMm[],
  pagePaths: IRPath[],
) {
  const sorted = sample.slice().sort((a, b) => a.src.op - b.src.op);
  const clipped = sorted.findIndex((p) => !p.visibleMotif || p.unknownFill);
  const key = clipped < 0 ? sorted : sorted.slice(0, clipped);
  if (key.length < 15 || key.some((p) => !p.closed || p.pts.length < 3 || !styles[p.style].fill))
    return;
  const stride = key[1].src.op - key[0].src.op;
  if (stride <= 0 || key.some((p, i) => i && p.src.op - key[i - 1].src.op !== stride)) return;
  const flags = key.map(oval);
  const period = flags.findIndex(
    (_, n) => n >= 3 && 3 * n <= key.length && flags.slice(n).every((f, i) => f === flags[i]),
  );
  if (period < 3 || !flags.includes(true) || !flags.includes(false)) return;
  const first = key.find((p) => !oval(p))!,
    axis = unit(first.pts[0], first.pts.at(-1)!);
  if (!Number.isFinite(axis.x)) return;
  const normal = { x: -axis.y, y: axis.x };
  const ordinate = (p: PtMm) => dot(minus(p, first.pts[0]), normal);
  const ellipses = key.filter(oval);
  const offsets = ellipses.map((p) => {
    const { a, b } = section(p);
    return ordinate(mid(a, b));
  });
  if (Math.max(...offsets) - Math.min(...offsets) > 0.015) return;
  const offset = Math.abs(offsets[0]);
  const widths = ellipses.map(
    (p) => Math.max(...p.pts.map(ordinate)) - Math.min(...p.pts.map(ordinate)),
  );
  const width = Math.max(...widths),
    pitch = dist(key[0].pts[0], key[period].pts[0]);
  if (!(offset > 0 && pitch > 3 * width && pitch < 12 * width)) return;
  const ticks = key.filter((p) => !oval(p)),
    baseLength = dist(ticks[0].pts[0], ticks[0].pts.at(-1)!);
  if (ticks.some((p) => Math.abs(dist(p.pts[0], p.pts.at(-1)!) - baseLength) > 0.03)) return;
  const allowed = new Set(local.map((p) => p.id));
  const pen = styles[first.style],
    ordered = pagePaths
      .filter((p) => {
        const s = styles[p.style];
        return (
          p.src.file === first.src.file &&
          s.fill &&
          s.layer === pen.layer &&
          s.widthMm === pen.widthMm &&
          String(s.strokeRgb) === String(pen.strokeRgb) &&
          p.closed &&
          p.pts.length >= 3 &&
          !p.background
        );
      })
      .sort((a, b) => a.src.page - b.src.page || a.src.op - b.src.op);
  const starts: number[] = [];
  let length = 0;
  for (let i = 0; i < outer.length; i++) {
    starts.push(length);
    length += dist(outer[i], outer[(i + 1) % outer.length]);
  }
  function project(at: PtMm) {
    let best = Infinity,
      station = 0;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i],
        b = outer[(i + 1) % outer.length];
      if (
        at.x < Math.min(a.x, b.x) - pitch ||
        at.x > Math.max(a.x, b.x) + pitch ||
        at.y < Math.min(a.y, b.y) - pitch ||
        at.y > Math.max(a.y, b.y) + pitch
      )
        continue;
      const h = segNearest(at, a, b);
      if (h.d < best) {
        best = h.d;
        station = starts[i] + dist(a, b) * h.u;
      }
    }
    return { best, station };
  }
  const marks: Mark[] = [];
  for (let i = 0; i < ordered.length; ) {
    let j = i + 1;
    while (
      j < ordered.length &&
      ordered[j].src.page === ordered[i].src.page &&
      ordered[j].src.op === ordered[j - 1].src.op + stride &&
      ordered[j].style === ordered[i].style
    )
      j++;
    const batch = ordered.slice(i, j);
    i = j;
    if (batch.length < period || styles[batch[0].style].localClipPolygon) continue;

    // Check the local repeat, including order, not just the number of round marks.
    const pattern = flags.slice(0, period).map(Number).join(''),
      twice = pattern + pattern;
    let good = 0;
    for (let k = 0; k + period <= batch.length; k++)
      if (
        twice.includes(
          batch
            .slice(k, k + period)
            .map((p) => Number(oval(p)))
            .join(''),
        )
      )
        good++;
    if (good / (batch.length - period + 1) < 0.65) continue;
    for (const p of batch) {
      if (!allowed.has(p.id) || !p.visibleMotif || p.unknownFill) continue;
      const { a, b } = section(p);
      if (dist(a, b) < 0.002) continue;
      let at = mid(a, b);
      const u = unit(a, b);
      if (oval(p)) {
        const bounds = p.pts.map((q) => dot(minus(q, at), u));
        if (Math.abs(Math.min(...bounds) + Math.max(...bounds)) > 0.035) continue;
        const transverse = p.pts.map((q) => cross(u, minus(q, at)));
        const w = Math.max(...transverse) - Math.min(...transverse);
        if (
          !widths.some((v) => Math.abs(w - v) < 0.035) ||
          dist(a, b) < width * 0.55 ||
          dist(a, b) > width * 1.5
        )
          continue;
      } else {
        if (p.pts.length > 7 && dist(a, p.pts.at(-1)!) < 0.002) continue;
        if (dist(a, b) < baseLength * 0.4 || dist(a, b) > baseLength * 1.35 || p.pts.length < 4)
          continue;
        const side = Math.sign(cross(u, minus(p.pts[1], a)));
        at = shift(at, { x: -u.y, y: u.x }, offset * side);
      }
      const { best, station } = project(at);
      if (best > pitch * 0.65) continue;
      marks.push({ at, axis: u, id: p.id, station, pg: p.src.page });
    }
  }
  marks.sort((a, b) => a.station - b.station);
  if (marks.length < period * 10) return;
  const pts: PtMm[] = [],
    ids: number[] = [];
  const masks = local.filter((p) => styles[p.style].localClipPolygon?.length === 4);
  let turns = 0;
  for (let i = 0; i < marks.length; i++) {
    const a = marks[i],
      b = marks[(i + 1) % marks.length],
      gap = dist(a.at, b.at);
    if (gap < 0.001) continue;
    if (gap > pitch * 1.7) return;
    pts.push(a.at);
    ids.push(a.id);
    const sin = cross(a.axis, b.axis);
    if (Math.abs(sin) < 0.23) {
      const delta = minus(b.at, a.at);
      if (Math.max(Math.abs(cross(a.axis, delta)), Math.abs(cross(b.axis, delta))) > 0.06) return;
      continue;
    }
    const t = cross(minus(b.at, a.at), b.axis) / sin,
      k = shift(a.at, a.axis, t);
    if (dist(a.at, k) > pitch * 1.4 || dist(b.at, k) > pitch * 1.4) return;
    const agree = (q: Mark, v: Mark) =>
      Math.abs(cross(q.axis, v.axis)) < 0.025 && Math.abs(cross(q.axis, minus(q.at, v.at))) < 0.035;
    if (
      !agree(a, marks[(i + marks.length - 1) % marks.length]) ||
      !agree(b, marks[(i + 2) % marks.length])
    )
      return;
    // A cut between complementary masks must also agree with the midpoint of their common edge.
    const nearby = masks.filter(
      (p) =>
        (p.src.page === a.pg || p.src.page === b.pg) &&
        styles[p.style].localClipPolygon!.some((q) => dist(q, k) < width * 2),
    );
    if (nearby.length) {
      let match = false;
      for (const p of nearby)
        for (const q of nearby) {
          if (q.style === p.style || q.src.page !== p.src.page) continue;
          const common = styles[p.style].localClipPolygon!.filter((v) =>
            styles[q.style].localClipPolygon!.some((w) => dist(v, w) < 0.002),
          );
          if (common.length !== 2 || dist(mid(common[0], common[1]), k) >= 0.035) continue;
          const touches = (path: IRPath) => {
            const on =
              path.visibleFill?.filter((v) => segNearest(v, common[0], common[1]).d < 0.004) ?? [];
            return on.some((v) => on.some((w) => dist(v, w) > width * 0.2));
          };
          if (touches(p) && touches(q)) {
            match = true;
            ids.push(p.id, q.id);
            break;
          }
        }
      if (!match) return;
    }
    pts.push(k);
    turns++;
  }
  if (turns < 3) return;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue;
      if (segIntersect(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length]))
        return;
    }
  return { pts, ids: [...new Set(ids)] };
}
