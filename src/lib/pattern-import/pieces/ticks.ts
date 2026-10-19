// pieces/ (MOOD TICKS) — a size's END TICK across a strip read as that size's end.
//
// Mood draws a waistband / strap / band as a long strip: every size draws the two long sides in
// one place (an overlay) and the common start end, each up to its own length, and closes its far
// end with a short cross line in its own pen — the end tick (naxos B-SHORTS WAISTBAND: XS ends at
// y ≈ 1321 … 5XL at 610; cirrus H-WAISTBAND). recover files such a tick as common (no other size
// runs beside it: splitShared) or ignore, and the overlaid sides are lone stretches (walls of every
// rank), so every size's fill closed on the largest size's outline.
//
// D3: a cross line is size r's end only with ≥ 2 of these, all naming r (never by proximity alone):
//   pen    its look is r's pen (declared dash / recovered motif / solid width), no other size's;
//   sides  r's own lines END at both its ends (≤ TICK_REACH_MM along it, ≤ TICK_PERP_MM across),
//          running away from it on ONE side, perpendicular to it — and r runs on past neither end
//          (a chord across r's outline — a facing fold — has r's line on both sides);
//   trend  among the parallel cross lines of the strip (its ladder), the sizes the others name by
//          pen or sides come in order with r's place: the larger the size, the farther from the
//          body, ≥ 2 of them.
// A proven tick is a KNIFE of rank r in the fill (pieces/fill.ts): r's region is cut along it,
// carried to the strip's side lines, and r keeps its body side; the stretches carried past the
// drawn tick are derived band cuts (gate G15). A region of rank r that runs past a LARGER size's
// proven end is no outline of r (it closed on another size's lines): a leak, never a closed piece.
// Anything less stays as it was (the one-size reading asks).
import type { ChainId, ChainSet, PtMm, SizeRun, Style } from 'lib/pattern-import/types';

import { dist, SegGrid, segNearest } from './geom';
import { chainLook, onPen, rankLooks } from './identity';

/** A tick's end and its side line: along the tick, at most this far apart, mm (Mood corners: p90 7–9, max 15). */
export const TICK_REACH_MM = 18;
/** …and across it, mm. */
const TICK_PERP_MM = 10;
/** A tick: a straight cross line this long, mm. */
const TICK_MIN_MM = 15;
const TICK_MAX_MM = 300;
/** Straight: no point farther off its chord, mm. */
const TICK_DEV_MM = 0.6;
/** A side line runs perpendicular to the tick: |cos| at most. */
const SIDE_COS = 0.35;
/** A side line is a real line, not a stub, mm. */
const SIDE_MIN_MM = 20;
/** r's line on the far side of the tick (r runs on past it): this far past the tick line, mm. */
const PAST_MM = 3;
/** The knife overshoots the side lines by this much (the raster cut must part the region), mm. */
const OVERSHOOT_MM = 1;
/** A strip's two sides are parallel (|cos| at least) and square to its ticks (|cos| at most). */
const STRIP_PARALLEL = 0.995;
const STRIP_SQUARE = 0.1;
/** At most this many tick candidates on a sheet (else no ladder is read). */
const MAX_CANDS = 1500;
/** Strip sides: walked this far at most, in steps, gaps up to SIDE_GAP_MM bridged, mm. */
const STRIP_MAX_MM = 3000;
const SIDE_STEP_MM = 2;
const SIDE_GAP_MM = 6;
/** Beside points: this far outside the strip's side lines, mm. */
const BESIDE_MM = 4;
/** Body / far probe points: this far off the tick's middle, mm. */
const PROBE_MM = 2;

export type EndTick = {
  rank: number;
  chain: ChainId;
  /** The tick carried to the strip's side lines (with a small overshoot): the fill's knife. */
  knife: [PtMm, PtMm];
  /** Stretches of the knife beyond the drawn tick, side line to tick end (derived band cuts). */
  carried: [PtMm, PtMm][];
  /** A point just inside rank r's body (its kept side) and one just past the tick. */
  inPt: PtMm;
  outPt: PtMm;
  /** Points just outside the strip's two sides at the tick: a region holding one is not the strip. */
  beside: [PtMm, PtMm];
  evidence: ('pen' | 'sides' | 'trend')[];
  /** The strip it crosses: proven ticks of one strip share it. */
  strip: number;
};

type Cand = {
  id: ChainId;
  a: PtMm;
  b: PtMm;
  L: number;
  u: PtMm;
  nu: PtMm;
  pen: number[];
  /** ranks whose own lines end at both ends, with the body side (+1 / −1 along nu) */
  sides: Map<number, number>;
  /** the side segment met at each end (for the knife), any size line */
  sideAt: [{ p: PtMm; q: PtMm } | null, { p: PtMm; q: PtMm } | null];
  /** the rank F3 / the wall model already gave it (null: none) */
  ranked: number | null;
  /** per end: the side lines that run on past it on both sides */
  passing: [Set<ChainId>, Set<ChainId>];
};

function probeOff(k: string): boolean {
  return typeof process !== 'undefined' && !!process.env?.[k];
}

const dot = (a: PtMm, b: PtMm) => a.x * b.x + a.y * b.y;
const sub = (a: PtMm, b: PtMm): PtMm => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: PtMm, b: PtMm, k = 1): PtMm => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** A point `mm` along a chain from its end `end` (or its other end, if shorter). */
function walkFrom(pts: readonly PtMm[], end: 0 | 1, mm: number): PtMm {
  const seq = end === 0 ? pts : pts.slice().reverse();
  let left = mm;
  for (let i = 1; i < seq.length; i++) {
    const l = dist(seq[i - 1], seq[i]);
    if (l >= left) {
      const k = left / (l || 1);
      return {
        x: seq[i - 1].x + (seq[i].x - seq[i - 1].x) * k,
        y: seq[i - 1].y + (seq[i].y - seq[i - 1].y) * k,
      };
    }
    left -= l;
  }
  return seq[seq.length - 1];
}

/** Intersection of the infinite lines p + t·u and a–b (null when parallel). */
function lineHit(p: PtMm, u: PtMm, a: PtMm, b: PtMm): PtMm | null {
  const s = sub(b, a);
  const den = u.x * s.y - u.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const q = sub(a, p);
  const t = (q.x * s.y - q.y * s.x) / den;
  return add(p, u, t);
}

/**
 * The proven end ticks of an identity run. `ranks` = the wall model's own lines per rank (the
 * ticks themselves are in none of them).
 */
export function endTicks(
  set: ChainSet,
  run: SizeRun,
  ranks: readonly ChainId[][],
  styles: ReadonlyMap<number, Style> | undefined,
): EndTick[] {
  if (!styles || probeOff('MOOD_TICKS_OFF') || run.sizes.length < 3) return [];
  const { identity, looks } = rankLooks(set, run, styles);
  if (!identity) return [];
  const n = run.sizes.length;
  const rankOfChain = new Map<ChainId, number>();
  ranks.forEach((ids, r) => ids.forEach((id) => rankOfChain.set(id, r)));
  const roleOf = new Map<ChainId, string>();
  for (const k of set.classes) for (const id of k.chains) roleOf.set(id, k.role);
  const opIgnored = new Set(
    (set.assigned ?? []).map((a) => a.chain).filter((id) => roleOf.get(id) === 'ignore'),
  );
  // ranked chain ends, for the sides evidence
  type End = { r: number; id: ChainId; p: PtMm; q: PtMm };
  const ends: End[] = [];
  for (const [id, r] of rankOfChain) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < SIDE_MIN_MM) continue;
    for (const e of [0, 1] as const) {
      const p = e === 0 ? c.pts[0] : c.pts[c.pts.length - 1];
      ends.push({ r, id, p, q: walkFrom(c.pts, e, 6) });
    }
  }
  const endGrid = new SegGrid(10);
  ends.forEach((e, i) => endGrid.addSeg(i, 0, e.p, e.p));
  const grid = new SegGrid(8);
  for (const id of rankOfChain.keys()) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) grid.addPolyline(id, c.pts);
  }
  // the strip's side lines, for the knife only (geometry, no rank): size lines, orphans, common
  const sideGrid = new SegGrid(8);
  for (const c of set.chains)
    if (
      c &&
      c.pts.length >= 2 &&
      (rankOfChain.has(c.id) || roleOf.get(c.id) === 'common' || set.orphans.includes(c.id))
    )
      sideGrid.addPolyline(c.id, c.pts);
  /** (chain, segment) pairs of ranked lines (or, `sides`, of side lines) near p, each once. */
  const segsNear = (p: PtMm, rad: number, g = grid) => {
    const seen = new Set<number>();
    const out: { id: ChainId; i: number }[] = [];
    g.near(p, rad, (id, i) => {
      const k = id * 100000 + i;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id, i });
    });
    return out;
  };
  const RAD = TICK_REACH_MM + TICK_PERP_MM;

  const cands: Cand[] = [];
  for (const c of set.chains) {
    if (!c || c.closed || c.pts.length < 2) continue;
    // a tick F3 already ranked (naxos strap: XS's end is in the XS class) is proven for that rank only
    const ranked = rankOfChain.get(c.id);
    const role = roleOf.get(c.id);
    if (role === 'internal' || role === 'grain' || role === 'seam') continue;
    // LINEFIX: a line the operator called no size line ends no size
    if (opIgnored.has(c.id)) continue;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const L = dist(a, b);
    if (L < TICK_MIN_MM || L > TICK_MAX_MM || c.lengthMm > 1.03 * L) continue;
    let dev = 0;
    for (const p of c.pts) dev = Math.max(dev, segNearest(p, a, b).d);
    if (dev > TICK_DEV_MM) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const nu = { x: -u.y, y: u.x };
    // where a point stands in the tick's frame: along (0 at a, L at b) and across
    const frame = (p: PtMm) => ({ al: dot(sub(p, a), u), h: dot(sub(p, a), nu) });
    const nearEnd = (al: number, end: 0 | 1) =>
      end === 0 ? al >= -TICK_REACH_MM && al <= 3 : al >= L - 3 && al <= L + TICK_REACH_MM;
    // sides: per end, the ranks whose own line ends there, perpendicular, and the side it runs to
    const atEnd: Map<number, number>[] = [new Map(), new Map()];
    const conflict = new Set<number>();
    const seenE = new Set<number>();
    const nearEnds: End[] = [];
    for (const p of [a, b])
      endGrid.near(p, RAD, (i) => {
        if (!seenE.has(i)) {
          seenE.add(i);
          nearEnds.push(ends[i]);
        }
      });
    for (const e of nearEnds) {
      const f = frame(e.p);
      if (Math.abs(f.h) > TICK_PERP_MM) continue;
      const end: 0 | 1 | -1 = nearEnd(f.al, 0) ? 0 : nearEnd(f.al, 1) ? 1 : -1;
      if (end < 0) continue;
      const d = sub(e.q, e.p);
      const dl = Math.hypot(d.x, d.y) || 1;
      if (Math.abs(dot(d, u) / dl) > SIDE_COS) continue;
      const s = Math.sign(dot(d, nu));
      if (!s) continue;
      const m = atEnd[end];
      if (m.has(e.r) && m.get(e.r) !== s) conflict.add(e.r);
      m.set(e.r, s);
    }
    const sides = new Map<number, number>();
    for (const [r, s] of atEnd[0]) {
      if (conflict.has(r) || atEnd[1].get(r) !== s) continue;
      // r runs on past an end (its line on the far side of the tick there): a chord, not its end
      let past = false;
      for (const p of [a, b]) {
        for (const { id, i } of segsNear(p, RAD)) {
          if (rankOfChain.get(id) !== r) continue;
          const q = set.chains[id].pts;
          const p0 = frame(q[i]);
          const p1 = frame(q[i + 1]);
          // the part of the segment past the tick (h·s < −PAST_MM), inside an end window
          const lo = Math.min(p0.h * s, p1.h * s);
          if (lo >= -PAST_MM) continue;
          const k0 = p0.h * s < -PAST_MM ? 0 : (-PAST_MM * s - p0.h) / (p1.h - p0.h || 1e-9);
          const k1 = p1.h * s < -PAST_MM ? 1 : (-PAST_MM * s - p0.h) / (p1.h - p0.h || 1e-9);
          for (const k of [k0, (k0 + k1) / 2, k1]) {
            const al = p0.al + (p1.al - p0.al) * k;
            const h = p0.h + (p1.h - p0.h) * k;
            if (Math.abs(h) <= RAD && (nearEnd(al, 0) || nearEnd(al, 1))) past = true;
          }
          if (past) break;
        }
        if (past) break;
      }
      if (!past) sides.set(r, s);
    }
    // pen
    const l = chainLook(c, styles);
    const pen = l ? looks.flatMap((pn, r) => (pn.length && onPen(l, pn) ? [r] : [])) : [];
    if (pen.length !== 1 && !sides.size) continue;
    // the side segment met at each end: the nearest perpendicular size line (any rank) crossing
    // the tick's line within reach — for the knife
    const sideAt: Cand['sideAt'] = [null, null];
    for (const end of [0, 1] as const) {
      let best: { p: PtMm; q: PtMm; k: number } | null = null;
      for (const { id, i } of segsNear(end === 0 ? a : b, RAD, sideGrid)) {
        if (id === c.id) continue;
        const oc = set.chains[id];
        {
          const p0 = oc.pts[i];
          const p1 = oc.pts[i + 1];
          const sl = dist(p0, p1);
          if (sl < 1e-6 || Math.abs(dot(sub(p1, p0), u) / sl) > SIDE_COS) continue;
          const f0 = frame(p0);
          const f1 = frame(p1);
          const x = lineHit(a, u, p0, p1);
          if (!x) continue;
          const al = dot(sub(x, a), u);
          if (!nearEnd(al, end)) continue;
          // the segment reaches the tick's line (or stops ≤ TICK_PERP_MM short of it)
          const gap = f0.h * f1.h <= 0 ? 0 : Math.min(Math.abs(f0.h), Math.abs(f1.h));
          if (gap > TICK_PERP_MM) continue;
          const k = Math.abs(end === 0 ? al : al - L) + gap;
          if (!best || k < best.k) best = { p: p0, q: p1, k };
        }
      }
      sideAt[end] = best ? { p: best.p, q: best.q } : null;
    }
    if (!sideAt[0] || !sideAt[1]) continue;
    // a strip has two parallel sides, square to its ticks (a size's short corner edge in a nest
    // meets two lines at an angle)
    {
      const d0 = sub(sideAt[0].q, sideAt[0].p);
      const d1 = sub(sideAt[1].q, sideAt[1].p);
      const l0 = Math.hypot(d0.x, d0.y) || 1;
      const l1 = Math.hypot(d1.x, d1.y) || 1;
      if (Math.abs(dot(d0, d1)) / (l0 * l1) < STRIP_PARALLEL) continue;
      if (Math.abs(dot(d0, u)) / l0 > STRIP_SQUARE || Math.abs(dot(d1, u)) / l1 > STRIP_SQUARE)
        continue;
    }
    // a strip: at each end a side line runs on PAST the tick on both sides (the larger sizes' sides
    // overlaid there) — the tick is a size's end inside the strip, not the strip's own end
    const passing: [Set<ChainId>, Set<ChainId>] = [new Set(), new Set()];
    for (const end of [0, 1] as const) {
      const span = new Map<ChainId, { lo: number; hi: number }>();
      for (const { id, i } of segsNear(end === 0 ? a : b, RAD, sideGrid)) {
        if (id === c.id) continue;
        const q = set.chains[id].pts;
        const sl = dist(q[i], q[i + 1]);
        if (sl < 1e-6 || Math.abs(dot(sub(q[i + 1], q[i]), u) / sl) > SIDE_COS) continue;
        const x = lineHit(a, u, q[i], q[i + 1]);
        if (!x) continue;
        const al = dot(sub(x, a), u);
        if (!nearEnd(al, end)) continue;
        const h0 = frame(q[i]).h;
        const h1 = frame(q[i + 1]).h;
        const e = span.get(id) ?? { lo: Infinity, hi: -Infinity };
        e.lo = Math.min(e.lo, h0, h1);
        e.hi = Math.max(e.hi, h0, h1);
        span.set(id, e);
      }
      for (const [id, e] of span) if (e.lo < -PAST_MM && e.hi > PAST_MM) passing[end].add(id);
    }
    cands.push({
      id: c.id,
      a,
      b,
      L,
      u,
      nu,
      pen: pen.length === 1 ? pen : [],
      sides,
      sideAt,
      ranked: ranked ?? null,
      passing,
    });
  }
  if (!cands.length) return [];
  // a sheet of thousands of straight size-pen cross lines is no strip ladder (Codex: quadratic work)
  if (cands.length > MAX_CANDS) return [];
  /**
   * How far each side line of c's strip runs on, drawn, from the tick along ±nu (gaps ≤ SIDE_GAP_MM
   * allowed): [toward −nu, toward +nu] — the stretch of the strip its other ticks may lie in.
   */
  const reachOf = new Map<Cand, [number, number]>();
  const stripReach = (c: Cand): [number, number] => {
    const got = reachOf.get(c);
    if (got) return got;
    const xs = [0, 1].map((e) => {
      const sa = c.sideAt[e as 0 | 1]!;
      return lineHit(c.a, c.u, sa.p, sa.q) ?? (e ? c.b : c.a);
    });
    const covered = (p: PtMm) => {
      let hit = false;
      sideGrid.near(p, 1.2, (id, i) => {
        if (hit || id === c.id) return;
        const q = set.chains[id].pts;
        if (!q[i + 1]) return;
        // a side line runs along the strip (a cross line over the sample is no side)
        const d = sub(q[i + 1], q[i]);
        const dl = Math.hypot(d.x, d.y);
        if (dl < 1e-6 || Math.abs(dot(d, c.nu)) / dl < 0.98) return;
        if (segNearest(p, q[i], q[i + 1]).d <= 1.2) hit = true;
      });
      return hit;
    };
    const walk = (dir: number) =>
      Math.min(
        ...xs.map((x0) => {
          let last = 0;
          for (let d = SIDE_STEP_MM; d <= STRIP_MAX_MM; d += SIDE_STEP_MM) {
            if (covered(add(x0, c.nu, dir * d))) last = d;
            else if (d - last > SIDE_GAP_MM) break;
          }
          return last;
        }),
      );
    const r: [number, number] = [walk(-1), walk(1)];
    reachOf.set(c, r);
    return r;
  };

  // tentative rank of a candidate from pen or sides alone (unique and agreeing)
  const tentative = (c: Cand): number => {
    const sr = c.sides.size === 1 ? [...c.sides.keys()][0] : -1;
    const pr = c.pen.length === 1 ? c.pen[0] : -1;
    if (pr >= 0 && sr >= 0) return pr === sr ? pr : -1;
    if (pr >= 0) return c.sides.size > 1 && !c.sides.has(pr) ? -1 : pr;
    return sr;
  };
  // ladder: parallel candidates over the same stretch of the strip
  // ladder: parallel candidates across the SAME strip — over one stretch of it, and between them
  // its two side lines run on drawn (Codex: aligned pieces metres apart are no ladder)
  const ladders = new Map<Cand, Cand[]>();
  const ladderOf = (c: Cand): Cand[] => {
    const got = ladders.get(c);
    if (got) return got;
    const [neg, posR] = stripReach(c);
    const lad = cands.filter((o) => {
      if (o === c) return true;
      if (Math.abs(dot(o.u, c.u)) < 0.995) return false;
      const lo = Math.min(dot(sub(o.a, c.a), c.u), dot(sub(o.b, c.a), c.u));
      const hi = Math.max(dot(sub(o.a, c.a), c.u), dot(sub(o.b, c.a), c.u));
      const ov = Math.min(hi, c.L) - Math.max(lo, 0);
      if (ov < 0.6 * Math.min(c.L, hi - lo)) return false;
      const p = pos(o, c);
      return p >= -neg - 1 && p <= posR + 1;
    });
    ladders.set(c, lad);
    return lad;
  };
  /** Other ticks across the same strip: parallel, at another place, both ends on its side lines. */
  const stripMates = (c: Cand): number => {
    const ps = new Set<number>();
    for (const o of ladderOf(c)) {
      if (o === c) continue;
      const p = pos(o, c);
      if (Math.abs(p - pos(c, c)) <= 0.5) continue;
      const e1 = dot(sub(o.a, c.a), c.u);
      const e2 = dot(sub(o.b, c.a), c.u);
      const lo = Math.min(e1, e2);
      const hi = Math.max(e1, e2);
      if (Math.abs(lo) <= TICK_REACH_MM && Math.abs(hi - c.L) <= TICK_REACH_MM)
        ps.add(Math.round(p));
    }
    return ps.size;
  };
  const pos = (c: Cand, ref: Cand) =>
    dot(sub({ x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 }, ref.a), ref.nu);
  /** trend(c, r): ≥ 2 other ladder members named in order with r, larger sizes farther from the body. */
  /** The body side (±1 along c.nu) when the ladder's order proves r's place; 0 = not proven. */
  const trendMemo = new Map<string, number>();
  const trend = (c: Cand, r: number): number => {
    const key = `${c.id}:${r}`;
    const got = trendMemo.get(key);
    if (got !== undefined) return got;
    const v = trend0(c, r);
    trendMemo.set(key, v);
    return v;
  };
  const trend0 = (c: Cand, r: number): number => {
    const lad = ladderOf(c);
    const rows: { p: number; r: number; s: number | null }[] = [];
    const pc = pos(c, c);
    for (const o of lad) {
      if (o === c) continue;
      const t = tentative(o);
      if (t < 0) continue;
      const p = pos(o, c);
      if (Math.abs(p - pc) <= 0.5) continue; // a copy of this tick (a tile overlap)
      rows.push({
        p,
        r: t,
        s: o.sides.get(t) != null ? o.sides.get(t)! * Math.sign(dot(o.nu, c.nu)) : null,
      });
    }
    if (rows.length < 2) return 0;
    rows.push({ p: pc, r, s: c.sides.get(r) ?? null });
    rows.sort((x, y) => x.p - y.p);
    // copies at one place carry one rank; several sizes at one place are an overlay (the strip's
    // shared start end, every size drawing it): no place in the order. A rank at two places breaks it
    const seq: { p: number; r: number }[] = [];
    const kept: typeof rows = [];
    for (let i = 0; i < rows.length; ) {
      let j = i;
      while (j + 1 < rows.length && Math.abs(rows[j + 1].p - rows[i].p) <= 0.5) j++;
      const grp = rows.slice(i, j + 1);
      const rs = new Set(grp.map((x) => x.r));
      if (rs.size === 1) {
        seq.push({ p: rows[i].p, r: rows[i].r });
        kept.push(...grp);
      } else if (grp.some((x) => x.p === pc)) return 0;
      i = j + 1;
    }
    if (probeOff('MOOD_TICKS_DEBUG'))
      console.log(`TREND c${c.id} r${r} ${seq.map((x) => `${x.r}@${x.p.toFixed(0)}`).join(' ')}`);
    if (new Set(seq.map((x) => x.r)).size !== seq.length || seq.length < 3) return 0;
    const up = seq.every((x, i) => i === 0 || x.r > seq[i - 1].r);
    const down = seq.every((x, i) => i === 0 || x.r < seq[i - 1].r);
    if (!up && !down) return 0;
    // body side: toward the smaller sizes; every sided member must agree
    const bodyDir = up ? -1 : 1; // ranks grow with p (up) → the body lies toward −p
    return kept.every((x) => x.s == null || x.s === bodyDir) ? bodyDir : 0;
  };

  const debug = probeOff('MOOD_TICKS_DEBUG');
  const out: EndTick[] = [];
  for (const c of cands) {
    const named = new Set<number>([...c.pen, ...c.sides.keys()]);
    let pick: { r: number; ev: EndTick['evidence'] } | null = null;
    for (const r of named) {
      const ev: EndTick['evidence'] = [];
      if (c.pen.length === 1 && c.pen[0] === r) ev.push('pen');
      if (c.sides.has(r)) ev.push('sides');
      if (ev.length < 2 && trend(c, r)) ev.push('trend');
      if (debug) console.log(`TICK c${c.id} r${r} pen=${c.pen} sides=${[...c.sides]} ev=${ev}`);
      if (ev.length < 2) continue;
      // two sizes proven for one line: neither
      if (pick) {
        pick = null;
        break;
      }
      pick = { r, ev };
    }
    if (!pick) continue;
    // pen against sides (the pen names another size): no; nor a line ranked as another size
    if (c.pen.length === 1 && c.pen[0] !== pick.r) continue;
    if (c.ranked != null && c.ranked !== pick.r) continue;
    // only a size's end INSIDE a strip (another size's side runs on past both its ends): the strip's
    // own far end and a size's short edge elsewhere stay as they were
    const r0 = pick.r;
    const band = c.passing.every((ids) => [...ids].some((id) => rankOfChain.get(id) !== r0));
    if (!band || stripMates(c) < 2) continue;
    // the body side: from r's own sides, else from the ladder's order (toward the smaller sizes)
    const s = c.sides.get(pick.r) ?? trend(c, pick.r);
    if (!s) continue;
    // the knife: the tick's line from side line to side line
    const xa = lineHit(c.a, c.u, c.sideAt[0]!.p, c.sideAt[0]!.q);
    const xb = lineHit(c.a, c.u, c.sideAt[1]!.p, c.sideAt[1]!.q);
    if (!xa || !xb) continue;
    const ala = dot(sub(xa, c.a), c.u);
    const alb = dot(sub(xb, c.a), c.u);
    if (ala < -TICK_REACH_MM || ala > 3 || alb < c.L - 3 || alb > c.L + TICK_REACH_MM) continue;
    const carried: [PtMm, PtMm][] = [];
    if (ala < -0.3) carried.push([xa, c.a]);
    if (alb > c.L + 0.3) carried.push([c.b, xb]);
    const mid = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
    out.push({
      rank: pick.r,
      chain: c.id,
      knife: [add(xa, c.u, -OVERSHOOT_MM), add(xb, c.u, OVERSHOOT_MM)],
      carried,
      inPt: add(mid, c.nu, s * PROBE_MM),
      outPt: add(mid, c.nu, -s * PROBE_MM),
      beside: [add(xa, c.u, -BESIDE_MM), add(xb, c.u, BESIDE_MM)],
      evidence: pick.ev,
      strip: c.id,
    });
  }
  // strips: proven ticks that are each other's strip mates (parallel, over one stretch) share one
  const byId = new Map(cands.map((c) => [c.id, c]));
  const root = new Map(out.map((t) => [t.chain, t.chain]));
  const find = (x: ChainId): ChainId => {
    while (root.get(x) !== x) x = root.get(x)!;
    return x;
  };
  for (const t of out) {
    const lad = new Set(ladderOf(byId.get(t.chain)!).map((o) => o.id));
    for (const o of out) if (o !== t && lad.has(o.chain)) root.set(find(o.chain), find(t.chain));
  }
  for (const t of out) t.strip = find(t.chain);
  void n;
  return out;
}
