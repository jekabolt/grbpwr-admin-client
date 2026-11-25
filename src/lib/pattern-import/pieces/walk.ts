// The walk: one size's outline found by walking its own printed lines.
//
// The fill closes a cell by flooding between walls and can leave the size's line for a neighbour's
// stroke for a few millimetres. The walk does not flood. It takes the lines of the size, the
// common lines and the stretches where the lines of several sizes coincide (a fold, a grain edge:
// the sheet draws it once per size on the same place), and looks for the closed path through them
// round the piece. Nothing is drawn: two sides meet end to end, or in the point where they cross.
//
// A side that ends ON another side meets it there. The other side is cut at that point, so the
// corner stands where the printed line stops — the crossing of the two tangents can be
// millimetres away when the angle is sharp. Where the cut sides give no closed path the sides are
// walked as printed.
//
// Checked on the owner's reference set (`scripts/pattern-import/diag/walk-carry.mjs ref`).
import type {
  ChainSet,
  PieceCandidate,
  PieceEdit,
  PtMm,
  Seed,
  SizeRun,
} from 'lib/pattern-import/types';

import { bboxOf, dist, pointInPoly, SegGrid, segNearest, signedArea, simplify } from './geom';
import { backPt, trimmed } from './one-outline';

export const WALK = {
  /** A stretch is shared when the lines of at least this many sizes coincide on it. */
  sharedSizes: 4,
  /** Two lines coincide within this, mm. */
  coincideMm: 0.3,
  /** A shared stretch is at least this long, mm; a piece of a common line this long. */
  minSharedMm: 10,
  minCommonMm: 5,
  /** Lines farther than this outside the piece's box are not walked, mm. */
  padMm: 20,
  /** Two ends this close are one point, mm. */
  tightMm: 3,
  /** A corner is built when the sides, extended by at most this, meet, mm… */
  extendMm: 30,
  /** …or cut back by at most this, mm. */
  cutBackMm: 15,
  /** Sides closer to parallel than this (sine of the angle) have no corner. */
  minSin: 0.34,
  /** A side ends ON another side when its end is within this of it, mm… */
  onSideMm: 1,
  /** …and at least this far from that side's own ends, mm. */
  onSideOffEndMm: 3,
  /** The joins tried from one end. */
  joins: 4,
  /** The walk starts from the longest own line, then from this many next longest. */
  starts: 3,
  /** With no closed size of the piece: this many own lines nearest the label, within this reach. */
  loneStarts: 6,
  loneReachMm: 450,
  /** Closed paths collected before the best is taken, and the search's step limit. */
  paths: 12,
  maxSteps: 60000,
  /** The check: the two outlines differ when they are farther apart than this, mm… */
  differMm: 1,
  /** …over at least this length, mm. */
  differOverMm: 12,
  /** A path that turns back on itself by more than this, with legs this long, is round a dart… */
  spikeTurnRad: (140 * Math.PI) / 180,
  spikeLegMm: 10,
  /** …the tip of the dart being no longer than this, mm. */
  spikeTipMm: 20,
  /** A walk is shown only when its area sits between its closed neighbour sizes', within this. */
  areaSlack: 0.002,
};

type Box = { minX: number; minY: number; maxX: number; maxY: number };
/** `src`/`part`: the printed line this edge is a piece of, and its place along that line. */
type Edge = { pts: PtMm[]; len: number; shared: boolean; src: number; part: number };
type End = { e: Edge; w: 0 | 1; pt: PtMm; out: PtMm };
type Join = { to: End; cost: number; corner?: { at: PtMm; cutPrev: number; cutNext: number } };

const lenOf = (pts: readonly PtMm[]) =>
  pts.reduce((a, p, i) => (i ? a + dist(p, pts[i - 1]) : 0), 0);
const inBox = (p: PtMm, b: Box) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/** The parts of a polyline inside `box`, each at least `minMm` long. */
function clipped(pts: readonly PtMm[], box: Box, minMm: number): PtMm[][] {
  const out: PtMm[][] = [];
  let cur: PtMm[] = [];
  const flush = () => {
    if (cur.length >= 2 && lenOf(cur) >= minMm) out.push(cur);
    cur = [];
  };
  for (const p of pts) {
    if (inBox(p, box)) cur.push(p);
    else flush();
  }
  flush();
  return out;
}

/** The lines of a file by size, and where they lie. */
export type WalkLines = {
  /** The lines of each size (closed ones with the first point repeated), by rank. */
  bySize: Map<number, PtMm[][]>;
  common: PtMm[][];
  /** Every segment of every size line; owner = index into `rankOf`. */
  grid: SegGrid;
  rankOf: number[];
  lines: PtMm[][];
};

export function walkLines(set: ChainSet, run: SizeRun): WalkLines {
  const rankOfClass = new Map<number, number>();
  for (const z of run.sizes) if (z.classId != null) rankOfClass.set(z.classId, z.rank);
  const open = (id: number): PtMm[] | null => {
    const ch = set.chains[id];
    if (!ch || ch.pts.length < 2) return null;
    return ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
  };
  const bySize = new Map<number, PtMm[][]>();
  const common: PtMm[][] = [];
  for (const c of set.classes) {
    if (c.role === 'common')
      for (const id of c.chains) {
        const pts = open(id);
        if (pts) common.push(pts);
      }
    const rank = rankOfClass.get(c.id);
    if (c.role !== 'size' || rank === undefined) continue;
    const list = bySize.get(rank) ?? [];
    for (const id of c.chains) {
      const pts = open(id);
      if (pts) list.push(pts);
    }
    bySize.set(rank, list);
  }
  const grid = new SegGrid(3);
  const rankOf: number[] = [];
  const lines: PtMm[][] = [];
  for (const rank of [...bySize.keys()].sort((a, b) => a - b))
    for (const pts of bySize.get(rank)!) {
      grid.addPolyline(lines.length, pts);
      rankOf.push(rank);
      lines.push(pts);
    }
  return { bySize, common, grid, rankOf, lines };
}

/**
 * The stretches inside `box` every size may walk: the common lines, and the stretches where the
 * lines of `WALK.sharedSizes` sizes coincide — each taken once, from the smallest size on it.
 */
export function sharedStretches(L: WalkLines, box: Box): PtMm[][] {
  const C = WALK;
  const out: PtMm[][] = [];
  const taken = new SegGrid(3);
  const take = (pts: PtMm[]) => {
    taken.addPolyline(out.length, pts);
    out.push(pts);
  };
  for (const pts of L.common) for (const part of clipped(pts, box, C.minCommonMm)) take(part);
  const isTaken = (p: PtMm) => {
    let hit = false;
    taken.near(p, C.coincideMm, (o, i) => {
      if (!hit && segNearest(p, out[o][i], out[o][i + 1]).d <= C.coincideMm) hit = true;
    });
    return hit;
  };
  const sizesAt = (p: PtMm) => {
    const ranks = new Set<number>();
    L.grid.near(p, C.coincideMm, (o, i) => {
      if (ranks.has(L.rankOf[o])) return;
      if (segNearest(p, L.lines[o][i], L.lines[o][i + 1]).d <= C.coincideMm) ranks.add(L.rankOf[o]);
    });
    return ranks.size;
  };
  for (const pts of L.lines) {
    let cur: PtMm[] = [];
    const flush = () => {
      if (cur.length >= 2 && lenOf(cur) >= C.minSharedMm) take(cur);
      cur = [];
    };
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const n = Math.max(1, Math.round(dist(a, b)));
      for (let q = 0; q <= n; q++) {
        const p = { x: a.x + ((b.x - a.x) * q) / n, y: a.y + ((b.y - a.y) * q) / n };
        if (!inBox(p, box)) {
          flush();
          continue;
        }
        if (sizesAt(p) >= C.sharedSizes && !isTaken(p)) cur.push(p);
        else flush();
      }
    }
    flush();
  }
  return out;
}

/**
 * An outline goes round once: its turns add up to one full turn, and none of them is a dart. A path that runs along a side,
 * loops through a dart and comes back over the same stretch (a side may be extended 30 mm to
 * meet another, so it can) turns twice or not at all — it is not an outline.
 */
function turnsOnce(outer: readonly PtMm[]): boolean {
  // measured on the outline without its sub-millimetre steps: two ends that overlap by a hair
  // step back and forth, and each such step is half a turn of its own
  const pts = simplify(
    outer.filter((p, i) => dist(p, outer[(i + 1) % outer.length]) > 1e-6),
    1,
  );
  if (pts.length < 3) return false;
  let sum = 0;
  const n = pts.length;
  const turn: number[] = [];
  const leg: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const u = Math.atan2(b.y - a.y, b.x - a.x);
    const v = Math.atan2(c.y - b.y, c.x - b.x);
    let d = v - u;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    sum += d;
    turn.push(d);
    leg.push(dist(b, c));
  }
  if (Math.abs(Math.abs(sum) - 2 * Math.PI) >= 0.5) return false;
  // a dart: the path goes in along one leg and out along the other, turning back on itself at
  // the tip. The tip is one vertex, or — where the legs cross just before it — a few within some
  // millimetres. No corner of a cut turns back that sharply: the walk has no outline here rather
  // than a wrong one.
  for (let i = 0; i < n; i++) {
    if (leg[(i - 1 + n) % n] < WALK.spikeLegMm) continue;
    let acc = 0;
    let tip = 0;
    for (let k = 0; k < n && tip <= WALK.spikeTipMm; k++) {
      acc += turn[(i + k) % n];
      // into the piece: against the way the outline goes round (a narrow tab turns back too,
      // but with it)
      if (
        Math.sign(acc) !== Math.sign(sum) &&
        Math.abs(acc) > WALK.spikeTurnRad &&
        leg[(i + k) % n] >= WALK.spikeLegMm
      )
        return false;
      tip += leg[(i + k) % n];
    }
  }
  return true;
}

/** A side that ends ON another side cuts it there (in place). */
function cutWhereSidesEnd(edges: Edge[]): void {
  const C = WALK;
  const cuts = new Map<Edge, { s: number; k: number; u: number }[]>();
  for (const e of edges)
    for (const pt of [e.pts[0], e.pts[e.pts.length - 1]])
      for (const o of edges) {
        if (o === e) continue;
        let acc = 0;
        let best: { d: number; s: number; k: number; u: number } | null = null;
        for (let k = 1; k < o.pts.length; k++) {
          const near = segNearest(pt, o.pts[k - 1], o.pts[k]);
          const segLen = dist(o.pts[k - 1], o.pts[k]);
          if (near.d <= C.onSideMm && (!best || near.d < best.d))
            best = { d: near.d, s: acc + near.u * segLen, k, u: near.u };
          acc += segLen;
        }
        if (best && best.s > C.onSideOffEndMm && best.s < o.len - C.onSideOffEndMm) {
          const list = cuts.get(o) ?? [];
          list.push(best);
          cuts.set(o, list);
        }
      }
  for (const [o, list] of cuts) {
    list.sort((a, b) => a.s - b.s);
    const parts: PtMm[][] = [];
    let cur: PtMm[] = [o.pts[0]];
    let kPrev = 1;
    let last = 0;
    for (const c of list) {
      if (c.s - last < C.onSideOffEndMm) continue;
      for (let k = kPrev; k < c.k; k++) cur.push(o.pts[k]);
      const a = o.pts[c.k - 1];
      const b = o.pts[c.k];
      const q = { x: a.x + (b.x - a.x) * c.u, y: a.y + (b.y - a.y) * c.u };
      cur.push(q);
      parts.push(cur);
      cur = [q];
      kPrev = c.k;
      last = c.s;
    }
    for (let k = kPrev; k < o.pts.length; k++) cur.push(o.pts[k]);
    parts.push(cur);
    edges.splice(
      edges.indexOf(o),
      1,
      ...parts
        .filter((p) => lenOf(p) >= 1)
        .map((pts, part) => ({ pts, len: lenOf(pts), shared: o.shared, src: o.src, part })),
    );
  }
}

export type Walked = {
  outer: PtMm[];
  /** Length walked on the size's own lines and on shared stretches, mm. */
  ownMm: number;
  sharedMm: number;
  /** Corners built where two sides cross. */
  corners: number;
};

function search(edges: Edge[], seed: PtMm, lone: boolean): Walked | null {
  const C = WALK;
  const ends: End[] = [];
  for (const e of edges)
    for (const w of [0, 1] as const) {
      const pt = w ? e.pts[e.pts.length - 1] : e.pts[0];
      const from = backPt(e.pts, w, 5);
      const d = dist(from, pt) || 1;
      ends.push({ e, w, pt, out: { x: (pt.x - from.x) / d, y: (pt.y - from.y) / d } });
    }
  const endOf = new Map<Edge, [End, End]>();
  for (let i = 0; i < ends.length; i += 2) endOf.set(ends[i].e, [ends[i], ends[i + 1]]);
  const cache = new Map<End, Join[]>();
  const joinsOf = (o: End): Join[] => {
    const hit = cache.get(o);
    if (hit) return hit;
    const out: Join[] = [];
    for (const q of ends) {
      if (q === o) continue;
      const d = dist(q.pt, o.pt);
      if (d > C.extendMm + C.cutBackMm + C.tightMm) continue;
      const cr = o.out.x * q.out.y - o.out.y * q.out.x;
      if (Math.abs(cr) >= C.minSin) {
        const wx = q.pt.x - o.pt.x;
        const wy = q.pt.y - o.pt.y;
        const t = (wx * q.out.y - wy * q.out.x) / cr;
        const r = (wx * o.out.y - wy * o.out.x) / cr;
        if (
          t >= -C.cutBackMm &&
          r >= -C.cutBackMm &&
          t <= C.extendMm &&
          r <= C.extendMm &&
          Math.min(o.e.len, q.e.len) > Math.max(-t, -r) + 2
        ) {
          out.push({
            to: q,
            cost: Math.abs(t) + Math.abs(r) + 1,
            corner: {
              at: { x: o.pt.x + t * o.out.x, y: o.pt.y + t * o.out.y },
              cutPrev: Math.max(0, -t),
              cutNext: Math.max(0, -r),
            },
          });
          continue;
        }
      }
      if (d <= C.tightMm) {
        const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y))));
        out.push({ to: q, cost: d + 1.5 * turn });
      }
    }
    out.sort((a, b) => a.cost - b.cost);
    const top = out.slice(0, C.joins);
    cache.set(o, top);
    return top;
  };
  /** A side as the outline takes it: the edge, its direction, what is cut off its ends. */
  type Laid = { e: Edge; rev: boolean; head: number; tail: number; corner?: PtMm };
  const outlineOf = (laid: Laid[]): PtMm[] =>
    laid.flatMap((x) => [
      ...trimmed(x.rev ? [...x.e.pts].reverse() : x.e.pts, x.head, x.tail),
      ...(x.corner ? [x.corner] : []),
    ]);
  const piecesOf = new Map<number, Edge[]>();
  for (const e of edges) piecesOf.set(e.src, [...(piecesOf.get(e.src) ?? []), e]);
  /**
   * A path that leaves a printed line and comes back to the SAME line farther on has two ways
   * between those points: the turn it took and the line itself. A dart, a notch, a pocket line
   * are turns INTO the piece — the cut runs on along the line. A tab or an extension turns OUT
   * of it. The outline is the outer of the two, so the larger area stands. The walk took the
   * turn only because the path with the most own line is preferred, and a dart's legs are drawn
   * in the size's own pen (Leah B TOP FRONT, the owner, 25 Nov).
   */
  const straightened = (path: Laid[]): Laid[] => {
    let cur = path;
    for (let pass = 0; pass < 20; pass++) {
      let better: Laid[] | null = null;
      const areaNow = Math.abs(signedArea(outlineOf(cur)));
      for (let k = 0; k < cur.length && !better; k++)
        for (let m = k + 2; m < cur.length && !better; m++) {
          const a = cur[k];
          const b = cur[m];
          if (a.e.src !== b.e.src || a.rev !== b.rev) continue;
          const [lo, hi] = a.rev ? [b.e.part, a.e.part] : [a.e.part, b.e.part];
          if (hi - lo < 2) continue;
          const between = (piecesOf.get(a.e.src) ?? []).filter((e) => e.part > lo && e.part < hi);
          if (between.length !== hi - lo - 1 || between.some((e) => cur.some((x) => x.e === e)))
            continue;
          between.sort((x, y) => (a.rev ? y.part - x.part : x.part - y.part));
          const alt: Laid[] = [
            ...cur.slice(0, k),
            { ...a, tail: 0, corner: undefined },
            ...between.map((e) => ({ e, rev: a.rev, head: 0, tail: 0 })),
            { ...b, head: 0 },
            ...cur.slice(m + 1),
          ];
          if (Math.abs(signedArea(outlineOf(alt))) > areaNow * 1.0001) better = alt;
        }
      if (!better) break;
      cur = better;
    }
    return cur;
  };
  // from the longest of the size's own lines; a line that runs past the piece on both ends is in
  // no closed path, so the next longest are tried after it
  if (!lone) {
    for (const start of edges
      .filter((e) => !e.shared)
      .sort((a, b) => b.len - a.len)
      .slice(0, C.starts)) {
      const got = from(start);
      if (got) return got;
    }
    return null;
  }
  // a piece with no closed size: there is no box of its own, so the lines nearest the label
  // start the walk, and of the closed paths the one with the largest SHARE of own line stands
  // (the longest own length would take the path round a larger neighbour piece)
  const nearSeed = (e: Edge) => Math.min(...e.pts.map((p) => dist(p, seed)));
  let pick: (Walked & { share: number }) | null = null;
  for (const start of edges
    .filter((e) => !e.shared && e.len >= 20)
    .sort((a, b) => nearSeed(a) - nearSeed(b))
    .slice(0, C.loneStarts)) {
    const got = from(start);
    if (!got) continue;
    const share = got.ownMm / (lenOf([...got.outer, got.outer[0]]) || 1);
    if (!pick || share > pick.share) pick = { ...got, share };
  }
  return (
    pick && { outer: pick.outer, ownMm: pick.ownMm, sharedMm: pick.sharedMm, corners: pick.corners }
  );

  function from(start: Edge): Walked | null {
    const [goal, first] = endOf.get(start)!;
    type State = {
      at: End;
      path: { e: Edge; rev: boolean }[];
      joins: Join[];
      cost: number;
      seq: number;
    };
    // cheapest first; of two equally cheap the later found (as a sort of the whole stack would give)
    const heap: State[] = [];
    const less = (a: State, b: State) => a.cost < b.cost || (a.cost === b.cost && a.seq > b.seq);
    const push = (s: State) => {
      heap.push(s);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (!less(heap[i], heap[p])) break;
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      }
    };
    const pop = (): State => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    let seq = 0;
    push({ at: first, path: [{ e: start, rev: false }], joins: [], cost: 0, seq: seq++ });
    let best: (Walked & { cost: number }) | null = null;
    let found = 0;
    for (let steps = 0; heap.length && found < C.paths && steps < C.maxSteps; steps++) {
      const cur = pop();
      for (const j of joinsOf(cur.at)) {
        if (j.to === goal) {
          found++;
          const joins = [...cur.joins, j];
          const n = cur.path.length;
          const laid = straightened(
            cur.path.map((x, k) => ({
              e: x.e,
              rev: x.rev,
              head: joins[(k - 1 + n) % n].corner?.cutNext ?? 0,
              tail: joins[k].corner?.cutPrev ?? 0,
              corner: joins[k].corner?.at,
            })),
          );
          const outer = outlineOf(laid);
          const corners = laid.filter((x) => x.corner).length;
          if (outer.length < 3 || !turnsOnce(outer) || !pointInPoly(seed, outer)) continue;
          const ownMm = laid.reduce((a, x) => a + (x.e.shared ? 0 : x.e.len), 0);
          const sharedMm = laid.reduce((a, x) => a + (x.e.shared ? x.e.len : 0), 0);
          const cost = cur.cost + j.cost;
          // the path with the most of the size's own line; of two alike the cheaper to join
          if (!best || ownMm > best.ownMm || (ownMm === best.ownMm && cost < best.cost))
            best = { outer, ownMm, sharedMm, corners, cost };
          continue;
        }
        if (cur.path.some((x) => x.e === j.to.e)) continue;
        const [e0, e1] = endOf.get(j.to.e)!;
        push({
          at: j.to.w === 0 ? e1 : e0,
          path: [...cur.path, { e: j.to.e, rev: j.to.w === 1 }],
          joins: [...cur.joins, j],
          cost: cur.cost + j.cost,
          seq: seq++,
        });
      }
    }
    if (!best) return null;
    return { outer: best.outer, ownMm: best.ownMm, sharedMm: best.sharedMm, corners: best.corners };
  }
}

/**
 * The closed walk round `seed` over the size's `own` lines and the `shared` stretches, inside
 * `box`. null = the size has no line there, or no closed path goes round the point.
 */
export function walkOutline(
  own: readonly PtMm[][],
  shared: readonly PtMm[][],
  box: Box,
  seed: PtMm,
  /** The piece has no closed size: start near the label, take the path most on the own line. */
  lone = false,
): Walked | null {
  const edges = (): Edge[] =>
    [
      ...own
        .flatMap((pts) => clipped(pts, box, 3))
        .map((pts) => ({ pts, len: lenOf(pts), shared: false, src: 0, part: 0 })),
      ...shared.map((pts) => ({ pts, len: lenOf(pts), shared: true, src: 0, part: 0 })),
    ].map((e, src) => ({ ...e, src }));
  const cut = edges();
  if (!cut.some((e) => !e.shared)) return null;
  cutWhereSidesEnd(cut);
  return search(cut, seed, lone) ?? search(edges(), seed, lone);
}

/** Where two closed outlines are farther apart than `WALK.differMm`: the longest such stretch of `a`. */
export function differs(
  a: readonly PtMm[],
  b: readonly PtMm[],
): { maxMm: number; overMm: number; at: PtMm } | null {
  const C = WALK;
  const g = new SegGrid(3);
  g.addPolyline(0, b, true);
  const far = (p: PtMm) => {
    let d = 40;
    g.near(p, 40, (_o, i) => {
      d = Math.min(d, segNearest(p, b[i], b[(i + 1) % b.length]).d);
    });
    return d;
  };
  let run = 0;
  let runMax = 0;
  let runAt: PtMm | null = null;
  let best: { maxMm: number; overMm: number; at: PtMm } | null = null;
  const close = () => {
    if (runAt && (!best || run > best.overMm)) best = { maxMm: runMax, overMm: run, at: runAt };
    run = 0;
    runMax = 0;
    runAt = null;
  };
  for (let k = 0; k < a.length; k++) {
    const p = a[k];
    const q = a[(k + 1) % a.length];
    const n = Math.max(1, Math.round(dist(p, q)));
    const step = dist(p, q) / n;
    for (let t = 0; t < n; t++) {
      const m = { x: p.x + ((q.x - p.x) * (t + 0.5)) / n, y: p.y + ((q.y - p.y) * (t + 0.5)) / n };
      const d = far(m);
      if (d > C.differMm) {
        run += step;
        if (d > runMax) {
          runMax = d;
          runAt = m;
        }
      } else close();
    }
  }
  close();
  const out = best as { maxMm: number; overMm: number; at: PtMm } | null;
  return out && out.overMm >= C.differOverMm ? out : null;
}

/**
 * The walk beside the fill.
 *
 * A closed size is walked as a check: where the walk's outline and the fill's differ the candidate
 * carries the walk's (`walk`) for the operator to choose; the fill's outline is not changed.
 *
 * An open size is walked as a proposal (`walk.open`): a closed path of printed lines and built
 * corners round the piece label. It stands only when its area sits between the nearest closed
 * sizes of the piece — or, where the piece has no closed size, when the proposals of its sizes
 * grow with the size. Nothing is closed without the operator's word.
 */
export function walkChecks(
  set: ChainSet,
  run: SizeRun,
  seeds: readonly Seed[],
  families: readonly { seed: number; candidates: PieceCandidate[] }[],
): void {
  for (const f of families) for (const c of f.candidates) delete c.walk;
  if (run.sizes.length < 2) return;
  const L = walkLines(set, run);
  if (!L.lines.length) return;
  const areaOf = (pts: readonly PtMm[]) => Math.abs(signedArea(pts));
  const grown = (b: Box, by: number): Box => ({
    minX: b.minX - by,
    minY: b.minY - by,
    maxX: b.maxX + by,
    maxY: b.maxY + by,
  });
  for (const f of families) {
    const seed = seeds.find((x) => x.id === f.seed);
    if (!seed) continue;
    const closed = f.candidates.filter(
      (c) => c.outcome === 'closed' && c.outer.length > 3 && c.rankFrom !== 'one-outline',
    );
    // open, or refused (the fill could not tell which line is which size: the walk takes each
    // size's own lines and does not have to)
    const open = f.candidates.filter((c) => c.outcome === 'leak' || c.outcome === 'refused');
    if (!closed.length && !open.length) continue;
    const lone = !closed.length;
    const box = lone
      ? grown(
          { minX: seed.at.x, minY: seed.at.y, maxX: seed.at.x, maxY: seed.at.y },
          WALK.loneReachMm,
        )
      : grown(bboxOf(closed.flatMap((c) => c.outer)), WALK.padMm);
    let shared: PtMm[][] | null = null;
    const between = (rank: number, area: number, among: { rank: number; area: number }[]) => {
      const below = among.filter((o) => o.rank < rank).sort((x, y) => y.rank - x.rank)[0];
      const above = among.filter((o) => o.rank > rank).sort((x, y) => x.rank - y.rank)[0];
      const lo = below?.area ?? 0;
      const hi = above?.area ?? Infinity;
      const [a0, a1] = [Math.min(lo, hi), Math.max(lo, hi)];
      return area >= a0 * (1 - WALK.areaSlack) && area <= a1 * (1 + WALK.areaSlack);
    };
    const anchors = closed.map((c) => ({ rank: c.rank, area: areaOf(c.outer) }));
    for (const c of closed) {
      const own = L.bySize.get(c.rank);
      if (!own?.length) continue;
      shared ??= sharedStretches(L, box);
      const b = bboxOf(c.outer);
      const at = pointInPoly(seed.at, c.outer)
        ? seed.at
        : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const w = walkOutline(own, shared, box, at);
      if (!w) continue;
      const d = differs(w.outer, c.outer) ?? differs(c.outer, w.outer);
      if (!d) continue;
      // a walk that went round something else is no rival: sizes of one piece nest
      if (
        !between(
          c.rank,
          areaOf(w.outer),
          anchors.filter((o) => o.rank !== c.rank),
        )
      )
        continue;
      const per = lenOf([...w.outer, w.outer[0]]);
      c.walk = {
        outer: w.outer,
        ownShare: per ? w.ownMm / per : 0,
        maxMm: d.maxMm,
        overMm: d.overMm,
        at: d.at,
      };
    }
    // the open sizes
    const found: { c: PieceCandidate; w: Walked; area: number }[] = [];
    for (const c of open) {
      const own = L.bySize.get(c.rank);
      if (!own?.length) continue;
      shared ??= sharedStretches(L, box);
      const w = walkOutline(own, shared, box, seed.at, lone);
      if (!w) continue;
      const area = areaOf(w.outer);
      if (!lone && !between(c.rank, area, anchors)) continue;
      found.push({ c, w, area });
    }
    // with no closed size to measure against: the longest run of proposals that grow with the size
    let keep = found;
    if (lone && found.length) {
      const byRank = [...found].sort((x, y) => x.c.rank - y.c.rank);
      const best: number[] = byRank.map(() => 1);
      const prev: number[] = byRank.map(() => -1);
      for (let i = 0; i < byRank.length; i++)
        for (let j = 0; j < i; j++)
          if (byRank[j].area <= byRank[i].area * (1 + WALK.areaSlack) && best[j] + 1 > best[i]) {
            best[i] = best[j] + 1;
            prev[i] = j;
          }
      let k = best.indexOf(Math.max(...best));
      keep = [];
      for (; k >= 0; k = prev[k]) keep.push(byRank[k]);
      // one size alone proves nothing about the others
      if (keep.length < 2 && open.length > 1) keep = [];
    }
    for (const { c, w } of keep) {
      const per = lenOf([...w.outer, w.outer[0]]);
      c.walk = {
        outer: w.outer,
        ownShare: per ? w.ownMm / per : 0,
        maxMm: 0,
        overMm: 0,
        at: c.leakAt ?? seed.at,
        open: true,
      };
    }
  }
}

/**
 * The operator's choices between the two outlines (`PieceEdit` 'outline'; the last one for a size
 * stands). New candidates are returned for the chosen sizes — the fill's own are not changed, so
 * taking an answer back gives the question again.
 */
export function applyOutlineChoices<F extends { seed: number; candidates: PieceCandidate[] }>(
  families: F[],
  edits: readonly PieceEdit[],
): F[] {
  const picks = new Map<string, 'walk' | 'fill'>();
  for (const e of edits) if (e.kind === 'outline') picks.set(`${e.seed}:${e.rank}`, e.take);
  if (!picks.size) return families;
  return families.map((f) => ({
    ...f,
    candidates: f.candidates.map((c) => {
      const take = picks.get(`${f.seed}:${c.rank}`);
      if (!take || !c.walk) return c;
      if (take === 'fill') return { ...c, walk: { ...c.walk, answer: 'fill' as const } };
      // an open size the walk closed: it is a closed size now, with no gap
      const from: PieceCandidate = { ...c };
      if (c.walk.open) {
        from.outcome = 'closed';
        delete from.leakAt;
      }
      return {
        ...from,
        outer: c.walk.outer,
        areaMm2: Math.abs(signedArea(c.walk.outer)),
        bbox: bboxOf(c.walk.outer),
        rankFrom: 'walk' as const,
        walk: { ...c.walk, answer: 'walk' as const, fillOuter: c.outer },
      };
    }),
  }));
}
