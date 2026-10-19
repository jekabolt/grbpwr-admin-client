// pieces/ (F4b) — short derived bridges over wall gaps.
//
// A pattern drawn with an end of a line stopping 1–3 mm short of the line it meets (a size line
// that ends before the common hem, a dash phase that ends a gap early) lets the fill leak out or
// run into the neighbour piece. A BRIDGE is a straight segment from such a dangling end to the
// nearest wall of the same rank, only when that is ≤ `maxMm` away. Bridges are never drawn by the
// source: every candidate that uses one carries it in `derived` so the operator sees it.
import type { PtMm } from 'lib/pattern-import/types';

import { dist, SegGrid, segNearest } from './geom';
import type { WallItem } from './snap';

export type Bridge = { from: PtMm; to: PtMm; lengthMm: number };

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
