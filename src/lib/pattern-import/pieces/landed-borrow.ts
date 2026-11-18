// A stretch of ANOTHER size's line, used as a wall of this cell only.
//
// A shared edge (the waist every size stops on) is drawn as each size's own line, and the lines
// end at different corners. This size's side lands on a longer size's line, a few millimetres past
// where the bundle of ≥ 3 sizes stops. The fill was taking the short line and leaking at its end.
//
// The stretch is the part of the foreign line between two ends of this size's own lines (within
// 0.5 mm), or between one such landing and the near end of the foreign line. It is kept only where
// ≥ 3 other sizes run along it. A tail of at most TAIL_MM past that bundle is kept when it is the
// way to this size's own landing — the corner the shorter sizes never reached. The whole foreign
// line is never taken, and nothing is written into the rank.
import type { ChainId, ChainSet, PtMm } from 'lib/pattern-import/types';

import { dist, SegGrid, segNearest } from './geom';
import type { WallItem } from './snap';
import type { WallModel } from './walls';

const LAND_MM = 0.5;
/** Past the bundle of ≥ 3 sizes, still on the same line, up to this size's landing. */
const TAIL_MM = 12;
const MIN_SIZES = 3;

export const borrowLandedOff = () =>
  typeof process !== 'undefined' && !!process.env?.BORROW_LANDED_OFF;

type Line = { id: ChainId; rank: number; pts: PtMm[]; cum: number[]; len: number };

const cumOf = (pts: readonly PtMm[]) => {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
};

const pointAt = (pts: readonly PtMm[], cum: readonly number[], s: number): PtMm => {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-9 ? (s - cum[i - 1]) / seg : 0;
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  };
};

const ownDir = (pts: readonly PtMm[], atStart: boolean): PtMm => {
  const a = atStart ? pts[0] : pts[pts.length - 1];
  const b = atStart ? pts[Math.min(1, pts.length - 1)] : pts[Math.max(0, pts.length - 2)];
  const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  return { x: (a.x - b.x) / l, y: (a.y - b.y) / l };
};

const clip = (ln: Line, a0: number, b0: number): PtMm[] => {
  const a = Math.max(0, Math.min(a0, b0));
  const b = Math.min(ln.len, Math.max(a0, b0));
  if (b - a < 0.5) return [];
  const out: PtMm[] = [pointAt(ln.pts, ln.cum, a)];
  for (let i = 1; i < ln.pts.length - 1; i++)
    if (ln.cum[i] > a && ln.cum[i] < b) out.push(ln.pts[i]);
  out.push(pointAt(ln.pts, ln.cum, b));
  return out;
};

/**
 * Walls for rank `r`: clips of other sizes' lines between this size's landings. Empty when
 * `BORROW_LANDED_OFF=1`.
 */
export function landedBorrowWalls(set: ChainSet, model: WallModel): WallItem[][] {
  const n = model.byRank.length;
  const out: WallItem[][] = Array.from({ length: n }, () => []);
  if (borrowLandedOff() || model.mode !== 'graded') return out;
  const rankOf = new Map<number, number>();
  const lines: Line[] = [];
  model.byRank.forEach((ids, rank) => {
    for (const id of ids) {
      const c = set.chains[id];
      if (!c || c.closed || c.pts.length < 2) continue;
      rankOf.set(id, rank);
      const cum = cumOf(c.pts);
      lines.push({ id, rank, pts: c.pts, cum, len: cum[cum.length - 1] });
    }
  });
  if (lines.length < MIN_SIZES + 1) return out;
  const grid = new SegGrid(8);
  lines.forEach((ln, i) => grid.addPolyline(i, ln.pts));
  const arcOf = (ln: Line, p: PtMm): number | null => {
    let best = LAND_MM;
    let arc = -1;
    for (let i = 0; i + 1 < ln.pts.length; i++) {
      const h = segNearest(p, ln.pts[i], ln.pts[i + 1]);
      if (h.d < best) {
        best = h.d;
        arc = ln.cum[i] + h.u * (ln.cum[i + 1] - ln.cum[i]);
      }
    }
    return arc < 0 ? null : arc;
  };
  /** How many other ranks run ALONG the host within LAND_MM. A side that only ends on it does not. */
  const support = (host: Line, s: number, self: number) => {
    const p = pointAt(host.pts, host.cum, s);
    const q = pointAt(host.pts, host.cum, Math.min(host.len, s + 1));
    const hx = q.x - p.x;
    const hy = q.y - p.y;
    const hl = Math.hypot(hx, hy) || 1;
    const seen = new Set<number>();
    grid.near(p, LAND_MM + 1, (oi, si) => {
      const o = lines[oi];
      if (!o || o.rank === self || seen.has(o.rank)) return;
      const a = o.pts[si];
      const b = o.pts[si + 1] ?? o.pts[0];
      if (segNearest(p, a, b).d > LAND_MM) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      if (Math.abs(dx * hx + dy * hy) / (L * hl) < 0.95) return;
      seen.add(o.rank);
    });
    return seen.size;
  };
  for (let r = 0; r < n; r++) {
    const own = lines.filter((ln) => ln.rank === r);
    const ends: PtMm[] = [];
    for (const ln of own) {
      ends.push(ln.pts[0], ln.pts[ln.pts.length - 1]);
    }
    const hosts = new Map<number, { arc: number; along: boolean }[]>();
    for (const p of ends) {
      const src = own.find(
        (ln) => dist(ln.pts[0], p) < 1e-6 || dist(ln.pts[ln.pts.length - 1], p) < 1e-6,
      );
      const atStart = !!src && dist(src.pts[0], p) < 1e-6;
      const dir = src ? ownDir(src.pts, atStart) : null;
      const seen = new Set<number>();
      grid.near(p, LAND_MM, (oi) => {
        if (seen.has(oi)) return;
        seen.add(oi);
        const host = lines[oi];
        if (!host || host.rank === r) return;
        const arc = arcOf(host, p);
        if (arc == null) return;
        const hp = pointAt(host.pts, host.cum, arc);
        const step = Math.min(2, host.len / 2);
        const hq = pointAt(
          host.pts,
          host.cum,
          Math.min(host.len, Math.max(0, arc + (arc < host.len / 2 ? step : -step))),
        );
        const hx = hq.x - hp.x;
        const hy = hq.y - hp.y;
        const hl = Math.hypot(hx, hy) || 1;
        const along = !!dir && Math.abs(dir.x * hx + dir.y * hy) / hl > 0.95;
        const hit = { arc, along };
        const a = hosts.get(oi);
        if (a) a.push(hit);
        else hosts.set(oi, [hit]);
      });
    }
    for (const [oi, arcs] of hosts) {
      const host = lines[oi];
      const land = [...arcs].sort((a, b) => a.arc - b.arc);
      const marks = [land[0]];
      for (const s of land) if (s.arc - marks[marks.length - 1].arc > 0.5) marks.push(s);
      // one landing: only the short run to the near end of the foreign line, and only when the
      // own line meets it (a corner), not when the own line already runs along it
      const spans: [number, number][] = [];
      if (marks.length === 1) {
        const s = marks[0];
        if (s.along) continue;
        const end = s.arc < host.len - s.arc ? 0 : host.len;
        if (Math.abs(s.arc - end) <= TAIL_MM && Math.abs(s.arc - end) >= 0.5)
          spans.push([s.arc, end]);
      } else {
        for (let i = 0; i + 1 < marks.length; i++) {
          // both ends running along the host is this pen's own edge, dashes included
          if (marks[i].along && marks[i + 1].along) continue;
          spans.push([marks[i].arc, marks[i + 1].arc]);
        }
      }
      for (const [a, b] of spans) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (hi - lo < 0.5) continue;
        // the whole foreign line, end to end, is never this size's wall
        if (lo <= 0.5 && hi >= host.len - 0.5) continue;
        // ≥ 3 other sizes along the stretch. A tail past the bundle, at a landing, may be the
        // corner the shorter sizes never reached; a gap in the middle is not.
        let prefix = 0;
        let gap = 0;
        let pending = 0;
        let supported = 0;
        let head = true;
        let prev = lo;
        for (let s = lo; s <= hi + 1e-6; s += 1) {
          const at = Math.min(s, hi);
          const step = at - prev;
          prev = at;
          if (support(host, at, r) >= MIN_SIZES) {
            head = false;
            if (pending > gap) gap = pending;
            pending = 0;
            supported++;
          } else if (head) prefix += step;
          else pending += step;
        }
        if (!supported || prefix > TAIL_MM || pending > TAIL_MM || gap > 0) continue;
        const pts = clip(host, lo, hi);
        if (pts.length >= 2) out[r].push({ chain: host.id, pts });
      }
    }
  }
  return out;
}
