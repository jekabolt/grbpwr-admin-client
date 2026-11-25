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
  /** Two ends this close are one point, mm… */
  tightMm: 3,
  /** …when the second lies no farther than this to the side of the first's line, mm, and the
   *  line does not turn back by more than this. */
  tightSideMm: 3,
  tightTurnRad: (120 * Math.PI) / 180,
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
  /** `walkedSizes`: the first, short try at one size round one label, ms. */
  sizesSliceMs: 120,
  /** The check: the two outlines differ when they are farther apart than this, mm… */
  differMm: 1,
  /** …over at least this length, mm. */
  differOverMm: 12,
  /** A path that turns back on itself by more than this, with legs this long, is round a dart… */
  spikeTurnRad: (140 * Math.PI) / 180,
  spikeLegMm: 10,
  /** …the tip of the dart being no longer than this, mm. */
  spikeTipMm: 20,
  /** An outline is ON a size's line within this, mm. */
  onOwnMm: 0.5,
  /** One outline is taken over the other when this share of its parting stretch is on the size's
   *  own line and this share of the other's is on another size's line. */
  ownToWin: 0.9,
  foreignToLose: 0.5,
  /** A line is a DISTANT size's when its nearest owner is this many sizes away; an outline that
   *  rides such lines for this many millimetres has leaked across the nest. */
  farSizes: 3,
  farLineMm: 15,
  /** …and the walk replaces it only when this share of the walk's parting stretch runs on a line
   *  of this size: a side stretched 30 mm to its corner across other sizes' lines is no repair
   *  (Leah G size 30). */
  leakPrinted: 0.7,
  /** A jog: two turns sharper than this, of opposite sense, no farther apart than the step,
   *  with runs this long before and after. */
  jogTurnRad: Math.PI / 6,
  jogStepMm: 8,
  jogLegMm: 10,
  /** By the neighbouring sizes: this share of the taken outline's parting stretch is between
   *  them or on an edge both share, and this share of the other's is not. */
  nestToWin: 0.9,
  nestToLose: 0.5,
  /** A corner is a wall for the fill when its sides stop at least this short of it, mm. */
  wallMinGapMm: 0.5,
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

/** The ends of the edges and how each may join another: a corner, or two ends that touch. */
function joinsAmong(edges: Edge[]) {
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
        // two ends that touch are ends of ONE line going on: in a dense nest the end of the next
        // size's line is as near, a millimetre to the side — joining it is the step sideways the
        // walk is there to avoid, and joining an end that points back is a spur (the owner,
        // 26 Nov, on Penelope B 26 and Matrix B 3XL)
        const side = Math.abs((q.pt.x - o.pt.x) * o.out.y - (q.pt.y - o.pt.y) * o.out.x);
        if (side <= C.tightSideMm && turn <= C.tightTurnRad)
          out.push({ to: q, cost: d + 1.5 * turn });
      }
    }
    out.sort((a, b) => a.cost - b.cost);
    const top = out.slice(0, C.joins);
    cache.set(o, top);
    return top;
  };
  return { ends, endOf, joinsOf };
}

function search(edges: Edge[], seed: PtMm, lone: boolean, stop?: () => boolean): Walked | null {
  const C = WALK;
  const { endOf, joinsOf } = joinsAmong(edges);
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
      // out of time (a display-only caller): what was found so far stands
      if (stop && (steps & 127) === 0 && stop()) break;
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

/** A corner of a size its printed sides stop short of: the two ends and the point they meet in. */
export type CornerWall = { a: PtMm; at: PtMm; b: PtMm; gapMm: number };

/**
 * The corners the lines of one size build inside `box`, each taken alone — no closed path is
 * asked for. Two ends make a corner when each is the other's best join and at least one side
 * must be extended to reach the point (sides that already cross need no wall). These are the
 * places the fill leaks through: the wall a, at, b closes one on the size's own lines.
 */
export function cornerWalls(
  own: readonly PtMm[][],
  shared: readonly PtMm[][],
  box: Box,
): CornerWall[] {
  const edges: Edge[] = [
    ...own
      .flatMap((pts) => clipped(pts, box, 3))
      .map((pts) => ({ pts, len: lenOf(pts), shared: false, src: 0, part: 0 })),
    ...shared.map((pts) => ({ pts, len: lenOf(pts), shared: true, src: 0, part: 0 })),
  ].map((e, src) => ({ ...e, src }));
  cutWhereSidesEnd(edges);
  const { ends, joinsOf } = joinsAmong(edges);
  const out: CornerWall[] = [];
  const done = new Set<End>();
  for (const o of ends) {
    if (done.has(o)) continue;
    const j = joinsOf(o)[0];
    if (!j?.corner || joinsOf(j.to)[0]?.to !== o) continue;
    // a corner between two shared stretches is no size's own
    if (o.e.shared && j.to.e.shared) continue;
    const gapMm = dist(o.pt, j.corner.at) + dist(j.corner.at, j.to.pt);
    if (j.corner.cutPrev > 0 || j.corner.cutNext > 0 || gapMm < WALK.wallMinGapMm) continue;
    done.add(o);
    done.add(j.to);
    out.push({ a: o.pt, at: j.corner.at, b: j.to.pt, gapMm });
  }
  return out;
}

/**
 * A path over the size's printed lines from `a` to `b`, two points of one outline that lie on
 * those lines — for mending a stretch of the fill's outline between them without building the
 * whole outline again (the fill gives the route, the lines the geometry; `docs/pattern-import/
 * research-25nov.md`, Round 2 §1). The path leaves a line for another only at a join: a corner
 * the two build, or two ends that touch. Two lines that merely run side by side do not exchange
 * paths, so a step from one onto the next cannot be in it.
 * null = a or b is on no line, or no path within `maxMm`.
 */
export function spanPath(
  own: readonly PtMm[][],
  shared: readonly PtMm[][],
  box: Box,
  a: PtMm,
  b: PtMm,
  maxMm: number,
  /** The way the outline is going at `a` and at `b` (unit vectors): the path leaves `a` and
   *  reaches `b` that way, never backwards along the line first. */
  going?: { a: PtMm; b: PtMm },
): { pts: PtMm[]; lenMm: number; joins: number } | null {
  const C = WALK;
  const edges: Edge[] = [
    ...own
      .flatMap((pts) => clipped(pts, box, 3))
      .map((pts) => ({ pts, len: lenOf(pts), shared: false, src: 0, part: 0 })),
    ...shared.map((pts) => ({ pts, len: lenOf(pts), shared: true, src: 0, part: 0 })),
  ].map((e, src) => ({ ...e, src }));
  cutWhereSidesEnd(edges);
  const { endOf, joinsOf } = joinsAmong(edges);
  /** where a point sits on the lines: the edge, the distance along it, how far off it is */
  const locate = (p: PtMm) => {
    let best: { e: Edge; s: number; d: number } | null = null;
    for (const e of edges) {
      let acc = 0;
      for (let k = 1; k < e.pts.length; k++) {
        const near = segNearest(p, e.pts[k - 1], e.pts[k]);
        const seg = dist(e.pts[k - 1], e.pts[k]);
        // of two lines equally near, the size's own
        if (
          near.d <= C.onOwnMm &&
          (!best ||
            near.d < best.d - 1e-6 ||
            (best.e.shared && !e.shared && near.d <= best.d + 0.1))
        )
          best = { e, s: acc + near.u * seg, d: near.d };
        acc += seg;
      }
    }
    return best;
  };
  const from = locate(a);
  const to = locate(b);
  if (!from || !to) return null;
  /** the part of an edge between two distances along it, in that order */
  const part = (e: Edge, s0: number, s1: number): PtMm[] => {
    const rev = s1 < s0;
    const [lo, hi] = rev ? [s1, s0] : [s0, s1];
    const cut = trimmed(e.pts, lo, Math.max(0, e.len - hi));
    return rev ? cut.reverse() : cut;
  };
  /** the direction of an edge at a distance along it */
  const dirAt = (e: Edge, s0: number): PtMm => {
    const seg = part(e, Math.max(0, s0 - 2), Math.min(e.len, s0 + 2));
    const [p, q] = [seg[0], seg[seg.length - 1]];
    const d = dist(p, q) || 1;
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  };
  const along = (e: Edge, s0: number, g: PtMm | undefined) => {
    if (!g) return 0;
    const d = dirAt(e, s0);
    return Math.sign(d.x * g.x + d.y * g.y);
  };
  const leave = along(from.e, from.s, going?.a); // +1: towards the edge's end, −1: its start
  const reach = along(to.e, to.s, going?.b);
  if (from.e === to.e) {
    const way = Math.sign(to.s - from.s);
    if ((leave && way !== leave) || (reach && way !== reach)) return null;
    const pts = part(from.e, from.s, to.s);
    return { pts, lenMm: Math.abs(to.s - from.s), joins: 0 };
  }
  // cheapest first: the length travelled, and three times the cost of each join
  type Node = { at: End; cost: number; len: number; via: Node | null; join: Join | null };
  const open: Node[] = [];
  const [f0, f1] = endOf.get(from.e)!;
  if (leave <= 0) open.push({ at: f0, cost: from.s, len: from.s, via: null, join: null });
  if (leave >= 0)
    open.push({
      at: f1,
      cost: from.e.len - from.s,
      len: from.e.len - from.s,
      via: null,
      join: null,
    });
  const done = new Map<End, number>();
  let goal: (Node & { last: Join }) | null = null;
  while (open.length) {
    open.sort((x, y) => y.cost - x.cost);
    const cur = open.pop()!;
    if (goal && cur.cost >= goal.cost) break;
    if ((done.get(cur.at) ?? Infinity) <= cur.cost) continue;
    done.set(cur.at, cur.cost);
    for (const j of joinsOf(cur.at)) {
      const e = j.to.e;
      if (e === from.e) continue;
      if (e === to.e) {
        // entered by its start it is travelled forwards, by its end backwards
        if (reach && reach !== (j.to.w === 0 ? 1 : -1)) continue;
        const rest = j.to.w === 0 ? to.s : e.len - to.s;
        const cost = cur.cost + 3 * j.cost + rest;
        if (cur.len + rest <= maxMm && (!goal || cost < goal.cost))
          goal = { at: j.to, cost, len: cur.len + rest, via: cur, join: null, last: j };
        continue;
      }
      const [e0, e1] = endOf.get(e)!;
      const len = cur.len + e.len;
      if (len > maxMm) continue;
      open.push({
        at: j.to.w === 0 ? e1 : e0,
        cost: cur.cost + 3 * j.cost + e.len,
        len,
        via: cur,
        join: j,
      });
    }
  }
  if (!goal) return null;
  // back from the goal: the edges crossed whole, each with the join that led into it
  const legs: { e: Edge; rev: boolean; into: Join }[] = [];
  for (let n: Node | null = goal.via; n && n.join; n = n.via)
    legs.unshift({ e: n.join.to.e, rev: n.join.to.w === 1, into: n.join });
  const startEnd = (() => {
    let n: Node = goal.via!;
    while (n.via) n = n.via;
    return n.at;
  })();
  const pts: PtMm[] = [];
  const joinsInOrder: Join[] = [...legs.map((l) => l.into), goal.last];
  const headCut = (j: Join) => j.corner?.cutNext ?? 0;
  const tailCut = (j: Join) => j.corner?.cutPrev ?? 0;
  // first line
  {
    const e = from.e;
    const endS = startEnd.w === 0 ? 0 : e.len;
    const cut = tailCut(joinsInOrder[0]);
    pts.push(
      ...part(
        e,
        from.s,
        startEnd.w === 0 ? Math.min(from.s, endS + cut) : Math.max(from.s, endS - cut),
      ),
    );
    if (joinsInOrder[0].corner) pts.push(joinsInOrder[0].corner.at);
  }
  legs.forEach((l, k) => {
    const next = joinsInOrder[k + 1];
    pts.push(...trimmed(l.rev ? [...l.e.pts].reverse() : l.e.pts, headCut(l.into), tailCut(next)));
    if (next.corner) pts.push(next.corner.at);
  });
  // last line, from the end the path came in by to b
  {
    const e = to.e;
    const inS = goal.last.to.w === 0 ? 0 : e.len;
    const cut = headCut(goal.last);
    pts.push(
      ...part(
        e,
        goal.last.to.w === 0 ? Math.min(to.s, inS + cut) : Math.max(to.s, inS - cut),
        to.s,
      ),
    );
  }
  return { pts, lenMm: goal.len, joins: joinsInOrder.length };
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
  /** Asked now and then during the search: true = give up (the sizes step's time budget). */
  stop?: () => boolean,
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
  return search(cut, seed, lone, stop) ?? (stop?.() ? null : search(edges(), seed, lone, stop));
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
 * Whose printed line an outline runs on where it parts from the other outline: the stretch of
 * `a` farther than `WALK.differMm` from `b`, split into
 * - own: a line of this size is under it — or the lines of the sizes next to it on both sides
 *   are (`block`: the sheet draws one line for a block of sizes and the reader gives it to one);
 * - foreign: only lines of other sizes are under it;
 * - nobody's: no size line at all (a common line, a line of no row, nothing).
 * `ownAloneMm` counts the own length without the block rule.
 */
export function whoseLine(
  L: WalkLines,
  rank: number,
  a: readonly PtMm[],
  b: readonly PtMm[],
): { ownMm: number; ownAloneMm: number; foreignMm: number; nobodyMm: number } {
  const C = WALK;
  const g = new SegGrid(3);
  g.addPolyline(0, b, true);
  const out = { ownMm: 0, ownAloneMm: 0, foreignMm: 0, nobodyMm: 0 };
  const ranksAll = [...L.bySize.keys()];
  const below = Math.max(...ranksAll.filter((r) => r < rank), -Infinity);
  const above = Math.min(...ranksAll.filter((r) => r > rank), Infinity);
  const next = [below, above].filter(Number.isFinite);
  for (let k = 0; k < a.length; k++) {
    const p = a[k];
    const q = a[(k + 1) % a.length];
    const n = Math.max(1, Math.round(dist(p, q)));
    const step = dist(p, q) / n;
    for (let t = 0; t < n; t++) {
      const m = { x: p.x + ((q.x - p.x) * (t + 0.5)) / n, y: p.y + ((q.y - p.y) * (t + 0.5)) / n };
      let d = 40;
      g.near(m, 40, (_o, i) => {
        d = Math.min(d, segNearest(m, b[i], b[(i + 1) % b.length]).d);
      });
      if (d <= C.differMm) continue;
      const ranks = new Set<number>();
      L.grid.near(m, C.onOwnMm, (o, i) => {
        if (ranks.has(L.rankOf[o])) return;
        if (segNearest(m, L.lines[o][i], L.lines[o][i + 1]).d <= C.onOwnMm) ranks.add(L.rankOf[o]);
      });
      const alone = ranks.has(rank);
      const block = next.length > 0 && next.every((r) => ranks.has(r));
      if (alone) out.ownAloneMm += step;
      if (alone || block) out.ownMm += step;
      else if (ranks.size) out.foreignMm += step;
      else out.nobodyMm += step;
    }
  }
  return out;
}

/**
 * How much of an outline lies on the line of a DISTANT size: no line of its own size under it,
 * the lines of one to three other sizes are, and the nearest of them is `WALK.farSizes` or more
 * sizes away. On the reference set a verified outline rides its neighbour's line now and then
 * (the reader gives a line a block shares to one of them), and almost never the line of a size
 * three away; an outline judged bad does — the fill leaked across the nest
 * (`diag/ref-owner-map.ts`: caught 21 of 63 bad sizes, flagged 15 of 548 verified).
 */
export function farLineMm(L: WalkLines, rank: number, outer: readonly PtMm[]): number {
  const C = WALK;
  let mm = 0;
  for (let k = 0; k < outer.length; k++) {
    const p = outer[k];
    const q = outer[(k + 1) % outer.length];
    const n = Math.max(1, Math.round(dist(p, q)));
    const step = dist(p, q) / n;
    for (let t = 0; t < n; t++) {
      const m = { x: p.x + ((q.x - p.x) * (t + 0.5)) / n, y: p.y + ((q.y - p.y) * (t + 0.5)) / n };
      const ranks = new Set<number>();
      L.grid.near(m, C.onOwnMm, (o, i) => {
        if (ranks.has(L.rankOf[o])) return;
        if (segNearest(m, L.lines[o][i], L.lines[o][i + 1]).d <= C.onOwnMm) ranks.add(L.rankOf[o]);
      });
      if (!ranks.size || ranks.size > 3 || ranks.has(rank)) continue;
      if (Math.min(...[...ranks].map((r) => Math.abs(r - rank))) >= C.farSizes) mm += step;
    }
  }
  return mm;
}

/**
 * The jogs of an outline: a short step sideways — two sharp turns of opposite sense a few
 * millimetres apart, with a long run before and after. The outline leaves one printed line for
 * the next and goes on beside it: the fill's jump onto another stroke, at the scale of 1–3 mm.
 * No cut has one (the owner, 26 Nov, on 16 of them: "there must be no step"). Found by the shape
 * of the outline alone — the reader's sizes are not asked.
 */
export function jogsOf(outer: readonly PtMm[]): { at: PtMm; stepMm: number }[] {
  const C = WALK;
  const s = simplify([...outer, outer[0]], 0.3).slice(0, -1);
  const n = s.length;
  if (n < 5) return [];
  const turn: number[] = [];
  const leg: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = s[(i - 1 + n) % n];
    const b = s[i];
    const c = s[(i + 1) % n];
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    turn.push(d);
    leg.push(dist(b, c));
  }
  const out: { at: PtMm; stepMm: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(turn[i]) < C.jogTurnRad || leg[(i - 1 + n) % n] < C.jogLegMm) continue;
    let acc = 0;
    for (let k = 1; k < n; k++) {
      const j = (i + k) % n;
      acc += leg[(j - 1 + n) % n];
      if (acc > C.jogStepMm) break;
      if (Math.abs(turn[j]) < C.jogTurnRad) continue;
      // the opposite sense, back to about the direction it came in, and a long run after
      if (
        Math.sign(turn[j]) !== Math.sign(turn[i]) &&
        Math.abs(turn[i] + turn[j]) < Math.PI / 6 &&
        leg[j] >= C.jogLegMm
      )
        out.push({ at: s[i], stepMm: acc });
      break;
    }
  }
  return out;
}

/**
 * How an outline sits against the closed outlines of the sizes next to it, where it parts from
 * the other outline (the stretch of `a` farther than `WALK.differMm` from `b`):
 * - between: outside the smaller size and inside the larger — where a size's own line is;
 * - shared: on the outlines of BOTH — an edge every size shares (a fold, a grain edge);
 * - oneSided: on the outline of one neighbour only — a line that is that neighbour's;
 * - against: inside the smaller size or outside the larger — sizes of one piece nest.
 */
export function nestOf(
  below: readonly PtMm[],
  above: readonly PtMm[],
  a: readonly PtMm[],
  b: readonly PtMm[],
): { betweenMm: number; sharedMm: number; oneSidedMm: number; againstMm: number } {
  const C = WALK;
  const grid = (poly: readonly PtMm[]) => {
    const g = new SegGrid(3);
    g.addPolyline(0, poly, true);
    return (p: PtMm) => {
      let d = 40;
      g.near(p, 40, (_o, i) => {
        d = Math.min(d, segNearest(p, poly[i], poly[(i + 1) % poly.length]).d);
      });
      return d;
    };
  };
  const [toB, toLo, toHi] = [grid(b), grid(below), grid(above)];
  const out = { betweenMm: 0, sharedMm: 0, oneSidedMm: 0, againstMm: 0 };
  for (let k = 0; k < a.length; k++) {
    const p = a[k];
    const q = a[(k + 1) % a.length];
    const n = Math.max(1, Math.round(dist(p, q)));
    const step = dist(p, q) / n;
    for (let t = 0; t < n; t++) {
      const m = { x: p.x + ((q.x - p.x) * (t + 0.5)) / n, y: p.y + ((q.y - p.y) * (t + 0.5)) / n };
      if (toB(m) <= C.differMm) continue;
      const onLo = toLo(m) <= C.onOwnMm;
      const onHi = toHi(m) <= C.onOwnMm;
      if (onLo && onHi) out.sharedMm += step;
      else if (onLo || onHi) out.oneSidedMm += step;
      else if (pointInPoly(m, below) || !pointInPoly(m, above)) out.againstMm += step;
      else out.betweenMm += step;
    }
  }
  return out;
}

/**
 * Which of the two outlines of a closed size the program would take itself (the owner, 25 Nov:
 * the operator answers what the program cannot close or understand, nothing else).
 *
 * Not by whose line the reader says it is: Leah F size 20 — the walk ran 100 % on "its own"
 * line, the neighbour's end line the reader had given it, 7.4 mm off the verified outline
 * (`whoseLine` measures that and decides nothing). By the sizes next to it: one outline is
 * taken when it lies between its neighbours or on an edge both share, and the other lies on one
 * neighbour's line or against the nesting. undefined = no closed neighbour on both sides, or the
 * program cannot tell.
 */
export function outlineVerdict(
  below: readonly PtMm[] | undefined,
  above: readonly PtMm[] | undefined,
  walk: readonly PtMm[],
  fill: readonly PtMm[],
): { take: 'walk' | 'fill' } | undefined {
  if (!below || !above || below.length < 3 || above.length < 3) return undefined;
  const C = WALK;
  const w = nestOf(below, above, walk, fill);
  const f = nestOf(below, above, fill, walk);
  type N = typeof w;
  const all = (o: N) => o.betweenMm + o.sharedMm + o.oneSidedMm + o.againstMm || 1;
  const good = (o: N) => (o.betweenMm + o.sharedMm) / all(o) >= C.nestToWin;
  const bad = (o: N) => (o.oneSidedMm + o.againstMm) / all(o) >= C.nestToLose;
  if (good(w) && bad(f)) return { take: 'walk' };
  if (good(f) && bad(w)) return { take: 'fill' };
  return undefined;
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
      const lower = closed.filter((o) => o.rank < c.rank).sort((x, y) => y.rank - x.rank)[0];
      const upper = closed.filter((o) => o.rank > c.rank).sort((x, y) => x.rank - y.rank)[0];
      const verdict = outlineVerdict(lower?.outer, upper?.outer, w.outer, c.outer);
      // the fill leaked across the nest: its outline rides the line of a distant size and the
      // walk's does not. The one case the program repairs itself — on the reference set 16
      // repairs and no verified outline spoilt (the 4 it moved the owner called nearer the truth)
      const who = whoseLine(L, c.rank, w.outer, c.outer);
      const parted = who.ownMm + who.foreignMm + who.nobodyMm || 1;
      const leak =
        farLineMm(L, c.rank, c.outer) >= WALK.farLineMm &&
        farLineMm(L, c.rank, w.outer) < WALK.farLineMm &&
        who.ownAloneMm / parted >= WALK.leakPrinted;
      // …and its small form: the fill's outline steps from one line onto the next, the walk's
      // runs on without a step, on this size's line (12 on the reference set, none the owner
      // called wrong; where the walk has a jog of its own neither outline is taken)
      const jog =
        jogsOf(c.outer).length > 0 &&
        !jogsOf(w.outer).length &&
        who.ownAloneMm / parted >= WALK.leakPrinted;
      c.walk = {
        outer: w.outer,
        ownShare: per ? w.ownMm / per : 0,
        maxMm: d.maxMm,
        overMm: d.overMm,
        at: d.at,
        ...(leak || jog
          ? {
              verdict: 'walk' as const,
              ...(leak ? { leak: true as const } : {}),
              ...(jog ? { jog: true as const } : {}),
            }
          : verdict
            ? { verdict: verdict.take }
            : {}),
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
 * The outlines of every size before any fill: round each piece label the size's own lines are
 * walked, and of a piece's sizes the longest run whose areas grow with the size stands (one size
 * alone proves nothing). For the sizes step, which shows the row it lights as the outlines it
 * closes; nothing is decided by it.
 *
 * `budgetMs` bounds the work, since most of the time goes to the labels nothing closes round: every
 * walk first gets a short slice (`WALK.sizesSliceMs`), and those it cut short are walked again in
 * full, the labels that closed most first, while time is left. `partial` = some were not. A big
 * sheet does not fit: Kalla (19 labels × 18 sizes) needs about two minutes and gets 15 of its 180
 * outlines in 8 s — to show those the walk has to run after the step is on the screen, row by row.
 */
export function walkedSizes(
  set: ChainSet,
  run: SizeRun,
  seeds: readonly Seed[],
  budgetMs = Infinity,
  now: () => number = Date.now,
): { byRank: Map<number, PtMm[][]>; partial: boolean } {
  const byRank = new Map<number, PtMm[][]>();
  if (run.sizes.length < 2 || !seeds.length) return { byRank, partial: false };
  const L = walkLines(set, run);
  if (!L.lines.length) return { byRank, partial: false };
  const ranks = [...L.bySize.keys()].sort((a, b) => a - b);
  const t0 = now();
  const out = () => now() - t0 > budgetMs;
  type Label = {
    seed: Seed;
    box: Box;
    shared: PtMm[][];
    found: Map<number, PtMm[]>;
    cut: number[];
  };
  const labels: Label[] = [];
  let partial = false;
  const walk = (l: Label, rank: number, sliceMs: number): boolean => {
    const own = L.bySize.get(rank);
    if (!own?.length) return true;
    const t = now();
    let stopped = false;
    const w = walkOutline(own, l.shared, l.box, l.seed.at, true, () => {
      stopped ||= now() - t > sliceMs || out();
      return stopped;
    });
    if (w) l.found.set(rank, w.outer);
    return !!w || !stopped;
  };
  for (const seed of seeds) {
    if (out()) {
      partial = true;
      break;
    }
    const box: Box = {
      minX: seed.at.x - WALK.loneReachMm,
      minY: seed.at.y - WALK.loneReachMm,
      maxX: seed.at.x + WALK.loneReachMm,
      maxY: seed.at.y + WALK.loneReachMm,
    };
    const l: Label = { seed, box, shared: sharedStretches(L, box), found: new Map(), cut: [] };
    labels.push(l);
    for (const rank of ranks) if (!walk(l, rank, WALK.sizesSliceMs)) l.cut.push(rank);
  }
  for (const l of [...labels].sort((a, b) => b.found.size - a.found.size))
    for (const rank of l.cut) {
      if (out()) {
        partial = true;
        break;
      }
      if (!walk(l, rank, Infinity) && out()) partial = true;
    }
  for (const l of labels) {
    const found = [...l.found]
      .sort((a, b) => a[0] - b[0])
      .map(([rank, outer]) => ({ rank, outer, area: Math.abs(signedArea(outer)) }));
    if (found.length < 2) continue;
    const best = found.map(() => 1);
    const prev = found.map(() => -1);
    for (let i = 0; i < found.length; i++)
      for (let j = 0; j < i; j++)
        if (found[j].area <= found[i].area * (1 + WALK.areaSlack) && best[j] + 1 > best[i]) {
          best[i] = best[j] + 1;
          prev[i] = j;
        }
    let k = best.indexOf(Math.max(...best));
    if (best[k] < 2) continue;
    for (; k >= 0; k = prev[k]) {
      const list = byRank.get(found[k].rank) ?? [];
      list.push(found[k].outer);
      byRank.set(found[k].rank, list);
    }
  }
  return { byRank, partial };
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

/**
 * The repairs the program makes itself: a closed size whose fill outline leaked onto the line of
 * a distant size (`walk.leak`) or steps from one line onto the next (`walk.jog`) takes the walk's
 * outline. New candidates are returned; the fill's
 * outline stays on the candidate as `walk.fillOuter`.
 */
export function applyLeakRepairs<F extends { seed: number; candidates: PieceCandidate[] }>(
  families: F[],
): F[] {
  if (!families.some((f) => f.candidates.some((c) => c.walk?.leak || c.walk?.jog))) return families;
  return families.map((f) => ({
    ...f,
    candidates: f.candidates.map((c) =>
      (c.walk?.leak || c.walk?.jog) && !c.walk.answer
        ? {
            ...c,
            outer: c.walk.outer,
            areaMm2: Math.abs(signedArea(c.walk.outer)),
            bbox: bboxOf(c.walk.outer),
            rankFrom: 'walk' as const,
            walk: { ...c.walk, answer: 'walk' as const, auto: true as const, fillOuter: c.outer },
          }
        : c,
    ),
  }));
}
