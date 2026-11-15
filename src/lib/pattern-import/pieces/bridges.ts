// pieces/ (F4b) — derived bridges over wall gaps. The fill draws them; the operator does not.
//
// Two closes, and they are not the same:
//   • a dangling end that stops short of ANOTHER wall (a size line ending before the common hem,
//     a dash that ends a gap early) — a straight segment to the nearest wall, ≤ 3 mm;
//   • two dangling ends that point at each other (one stroke broken in two, a tile seam) — a
//     straight segment between those ends, ≤ `FACING_BRIDGE_MM`. A cut line and its stitch line
//     do not point at each other, so this close does not pair them.
// Bridges are never drawn by the source: every candidate that uses one carries it in `derived`.
import type { PtMm } from 'lib/pattern-import/types';

import { dist, SegGrid, segNearest } from './geom';
import type { WallItem } from './snap';

export type Bridge = { from: PtMm; to: PtMm; lengthMm: number };

/** Two ends that continue one stroke may sit this far apart and still be one line, mm. */
export const FACING_BRIDGE_MM = 12;
/** Each end's outward tangent lies within this cosine of the gap (~45°). */
const FACING_COS = 0.7;

/**
 * Bridges for one rank's walls: from every dangling end (no other wall within `touchMm`) to the
 * nearest point of another wall item within `maxMm` (or of the same item, ≥ 10 mm away along it —
 * a loop that does not quite close). Pairs of facing ends give one bridge.
 */
export function wallBridges(items: readonly WallItem[], maxMm = 3, touchMm = 0.5): Bridge[] {
  const grid = new SegGrid(4);
  const cum: number[][] = [];
  items.forEach((it, i) => {
    grid.addPolyline(i, it.pts, it.closed);
    const c = [0];
    for (let k = 1; k < it.pts.length; k++) c.push(c[k - 1] + dist(it.pts[k - 1], it.pts[k]));
    cum.push(c);
  });
  /** nearest wall point to p within r, skipping item `self` within `skipArc` mm of arc `arc`. */
  const nearest = (p: PtMm, r: number, self: number, arc: number, skipArc: number) => {
    let best: { q: PtMm; d: number } | null = null;
    grid.near(p, r, (o, s) => {
      const pts = items[o].pts;
      const a = pts[s];
      const b = s + 1 < pts.length ? pts[s + 1] : pts[0];
      const h = segNearest(p, a, b);
      if (h.d > r || (best && h.d >= best.d)) return;
      if (o === self) {
        const c = cum[o];
        const at = (c[s] ?? 0) + h.u * dist(a, b);
        if (Math.abs(at - arc) < skipArc) return;
      }
      best = { q: h.q, d: h.d };
    });
    return best as { q: PtMm; d: number } | null;
  };
  const out: Bridge[] = [];
  items.forEach((it, i) => {
    if (it.closed || it.pts.length < 2) return;
    const L = cum[i][cum[i].length - 1];
    if (L < 2) return;
    for (const [p, arc] of [
      [it.pts[0], 0],
      [it.pts[it.pts.length - 1], L],
    ] as [PtMm, number][]) {
      if (nearest(p, touchMm, i, arc, 5)) continue; // already touching a wall
      const h = nearest(p, maxMm, i, arc, 10);
      if (!h || h.d <= touchMm) continue;
      // facing ends: the other end already bridged to (about) here
      if (out.some((b) => dist(b.from, h.q) < 0.6 && dist(b.to, p) < 0.6)) continue;
      out.push({ from: p, to: h.q, lengthMm: h.d });
    }
  });
  return out;
}

/** Outward unit tangent at a stroke end, measured back over ~3 mm of the stroke. */
function outward(pts: readonly PtMm[], atStart: boolean): PtMm {
  const k = atStart ? 0 : pts.length - 1;
  const step = atStart ? 1 : -1;
  const end = pts[k];
  let j = k;
  const limit = atStart ? pts.length - 1 : 0;
  while (j !== limit && dist(pts[j], end) < 3) j += step;
  const dx = end.x - pts[j].x;
  const dy = end.y - pts[j].y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/**
 * Bridges between two dangling ends that point at each other, up to `maxMm`. One stroke drawn as
 * two chains (a tile seam, a pen that lifted) is one line again. An end already on a wall, and the
 * two ends of a stroke shorter than 10 mm, are not paired: a notch mouth stays open.
 */
export function facingBridges(
  items: readonly WallItem[],
  maxMm = FACING_BRIDGE_MM,
  touchMm = 0.5,
): Bridge[] {
  const grid = new SegGrid(4);
  const cum: number[][] = [];
  items.forEach((it, i) => {
    grid.addPolyline(i, it.pts, it.closed);
    const c = [0];
    for (let k = 1; k < it.pts.length; k++) c.push(c[k - 1] + dist(it.pts[k - 1], it.pts[k]));
    cum.push(c);
  });
  const touching = (p: PtMm, self: number, arc: number) => {
    let hit = false;
    grid.near(p, touchMm, (o, s) => {
      if (hit) return;
      const pts = items[o].pts;
      const a = pts[s];
      const b = s + 1 < pts.length ? pts[s + 1] : pts[0];
      const h = segNearest(p, a, b);
      if (h.d > touchMm) return;
      if (o === self) {
        const at = (cum[o][s] ?? 0) + h.u * dist(a, b);
        if (Math.abs(at - arc) < 5) return;
      }
      hit = true;
    });
    return hit;
  };
  type End = { p: PtMm; d: PtMm; item: number; length: number };
  const ends: End[] = [];
  items.forEach((it, i) => {
    if (it.closed || it.pts.length < 2) return;
    const L = cum[i][cum[i].length - 1];
    if (L < 2) return;
    for (const [p, arc, atStart] of [
      [it.pts[0], 0, true],
      [it.pts[it.pts.length - 1], L, false],
    ] as [PtMm, number, boolean][]) {
      if (touching(p, i, arc)) continue;
      ends.push({ p, d: outward(it.pts, atStart), item: i, length: L });
    }
  });
  const cell = Math.max(4, maxMm);
  const buckets = new Map<string, number[]>();
  const bucket = (p: PtMm) => `${Math.round(p.x / cell)}:${Math.round(p.y / cell)}`;
  ends.forEach((e, i) => {
    const k = bucket(e.p);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  });
  const pairs: { a: number; b: number; mm: number }[] = [];
  for (let i = 0; i < ends.length; i++) {
    const A = ends[i];
    const cx = Math.round(A.p.x / cell);
    const cy = Math.round(A.p.y / cell);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const j of buckets.get(`${x}:${y}`) ?? []) {
          if (j <= i) continue;
          const B = ends[j];
          if (A.item === B.item && A.length < 10) continue;
          const dx = B.p.x - A.p.x;
          const dy = B.p.y - A.p.y;
          const mm = Math.hypot(dx, dy);
          if (mm <= touchMm || mm > maxMm) continue;
          if ((A.d.x * dx + A.d.y * dy) / mm <= FACING_COS) continue;
          if ((B.d.x * -dx + B.d.y * -dy) / mm <= FACING_COS) continue;
          pairs.push({ a: i, b: j, mm });
        }
  }
  pairs.sort((p, q) => p.mm - q.mm);
  const used = new Uint8Array(ends.length);
  const out: Bridge[] = [];
  for (const p of pairs) {
    if (used[p.a] || used[p.b]) continue;
    used[p.a] = 1;
    used[p.b] = 1;
    out.push({ from: ends[p.a].p, to: ends[p.b].p, lengthMm: p.mm });
  }
  return out;
}
