// The GLUED BOUNDARY of one operation input, read for the composite pass (composites.ts): the free
// edges of the input's pieces walked across the seams chosen inside the input. Two things the
// pool's own walk (geometry/composite.ts gluedRuns) does not do, both needed here:
//
//   · a PARTIAL seam leaves the rest of its long edge free. The walk knows the sewn stretch
//     (`range` / `partRange` on the seam) and keeps the remainder as a boundary part of its own:
//     the free top 79 of a side-back seam's 599 is armhole (12.10 corpus, card 8: the armhole
//     runs yoke 117 + that 79 + side panel 142 + front 219 against a cap of 576). The partial's
//     inner end is a junction like any seam end — the long piece's boundary runs straight through
//     it (a point in the middle of its edge), the short piece turns its corner there;
//   · the junction's KINK is reported, not gated. A sewing line read as a chain (the pool) breaks at
//     a hard corner; an OPENING a tube is set into (an armhole, a neckline) is one edge whatever
//     the flat sewn body's boundary does at its seams — a side panel's underarm meets the front's
//     armhole at 105° in the flat and the sleeve goes round it all the same. The caller says how
//     much kink a run may hold (`maxKinkDeg`; 45 reads as the pool does).
//
// Face-up pieces walk a shared seam oppositely: a seam's `a` side starts where its `b` side ends
// (the pool's convention; a partial's aligned end is a's start on b's end). Stacked layers (plies),
// folds (self seams) and composite seams hold their edges but open the boundary onto nothing.

import { cornerTurn, edgeIdsOf } from '../geometry/match';
import { dist } from '../geometry/segment';
import type { Edge, EdgeId, Mm, PieceGeom, Pt2, SeamCandidate } from '../types';

/**
 * A free stretch of the boundary: a whole edge, or the free remainder of a partially sewn one — an
 * `Edge` again (same id, its own length, notches, points), so the composite pass reads both alike.
 * `range` names the stretch on a remainder (mm along the real edge from its start).
 */
export type BoundaryPart = {
  edge: Edge;
  range?: [Mm, Mm];
  /** Boundary turn (deg) of the piece at the part's two ends: its corner, or ≈ 0 mid-edge. */
  turnS: number;
  turnE: number;
};

export type BoundaryRun = {
  parts: BoundaryPart[];
  closed: boolean;
  /** Kink (deg) of the glued boundary at each junction between consecutive parts (closed: n). */
  kinks: number[];
};

type Slot = {
  piece: PieceGeom;
  edge: Edge;
  /** Stretch of the edge (mm from its start). */
  from: Mm;
  to: Mm;
  free: boolean;
  /** The seam this slot is sewn by, and which side of it. */
  seam?: SeamCandidate;
  side?: 'a' | 'b';
  /** Resample indices of the stretch's two ends on the piece's contour. */
  s: number;
  e: number;
  /** The piece's turn at the two ends (a corner, or ≈ 0 in the middle of its edge). */
  turnS: number;
  turnE: number;
  /** Blocked: holds its edge, opens the boundary onto nothing (a ply, a fold, a composite). */
  blocked: boolean;
};

const EPS = 0.5;
/** A piece's own corner two of its free edges run across as one line (the pool's chain). */
export const SOFT_CORNER_DEG = 45;
/** A seam's end an opening (an armhole, a neckline) runs across whatever the flat kink. */
export const OPENING_KINK_DEG = 180;

/** Cumulative mm along an edge's points. */
function cumOf(e: Edge): number[] {
  const cum = [0];
  for (let j = 1; j < e.pts.length; j++) cum.push(cum[j - 1] + dist(e.pts[j], e.pts[j - 1]));
  return cum;
}
/** Index into the edge's points at `at` mm from its start. */
function idxAt(cum: readonly number[], at: Mm): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The stretch [from, to] of an edge as an edge of its own (same id). */
function subEdge(e: Edge, cum: readonly number[], from: Mm, to: Mm, rsLen: number): Edge {
  const i0 = idxAt(cum, from);
  const i1 = Math.max(i0 + 1, idxAt(cum, to));
  const pts: Pt2[] = e.pts.slice(i0, i1 + 1);
  let turnDeg = 0;
  for (let j = 1; j + 1 < pts.length; j++) {
    const a = pts[j - 1];
    const b = pts[j];
    const c = pts[j + 1];
    turnDeg +=
      (Math.atan2(
        (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
        (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]),
      ) *
        180) /
      Math.PI;
  }
  return {
    ...e,
    s: (e.s + i0) % rsLen,
    e: (e.s + i1) % rsLen,
    pts,
    lenMm: to - from,
    chordMm: dist(pts[0], pts[pts.length - 1]),
    turnDeg,
    notchesMm: e.notchesMm.filter((d) => d > from + EPS && d < to - EPS).map((d) => d - from),
  };
}

const sideIds = (c: SeamCandidate, s: 'a' | 'b'): EdgeId[] =>
  (s === 'a' ? c.aParts ?? [c.a] : c.bParts ?? [c.b]).flatMap(edgeIdsOf);

/**
 * The sewn stretch of each edge of a seam side: `partRange` by edge, else `range` on a single-edge
 * side (mm along the run = along the edge), else the whole edge.
 */
function sewnOf(c: SeamCandidate, s: 'a' | 'b', ids: EdgeId[], lenOf: (id: EdgeId) => Mm) {
  const out = new Map<EdgeId, [Mm, Mm]>();
  const rg = c.range?.[s];
  for (const id of ids) {
    const L = lenOf(id);
    const pr = c.partRange?.[id];
    const r: [Mm, Mm] = pr
      ? [Math.max(0, pr[0]), Math.min(L, pr[1])]
      : rg && ids.length === 1
        ? [Math.max(0, rg[0]), Math.min(L, rg[1])]
        : [0, L];
    out.set(id, r);
  }
  return out;
}

/**
 * The boundary runs of `pieces` glued by `seams` (seams whose sides all lie on these pieces; the
 * caller filters). A run is a chain of free parts joined across the pieces' corners and the seams'
 * ends; it breaks where the kink at a junction exceeds `maxKinkDeg`, where the walk enters a seam
 * away from its start (a partial's unaligned end is a START only on the long edge's sewn stretch —
 * the remainder leads into it), and at a blocked slot. Closed runs are soft loops (an armhole with
 * every seam round it sewn). Second and later identical layers (a ply pair) are not walked:
 * `skipPiece` says which.
 */
export function boundaryRuns(
  pieces: readonly PieceGeom[],
  seams: readonly SeamCandidate[],
  maxKinkDeg: number,
  skipPiece: (k: string) => boolean = () => false,
): BoundaryRun[] {
  const edgeOf = new Map<EdgeId, { piece: PieceGeom; edge: Edge }>();
  for (const p of pieces) for (const e of p.edges) edgeOf.set(e.id, { piece: p, edge: e });
  const lenOf = (id: EdgeId) => edgeOf.get(id)?.edge.lenMm ?? 0;

  // Sewn stretches per edge, with the seam and the side.
  type Sewn = { from: Mm; to: Mm; seam: SeamCandidate; side: 'a' | 'b'; blocked: boolean };
  const sewnBy = new Map<EdgeId, Sewn[]>();
  for (const c of seams) {
    if (c.kind === 'closure-not-seam' || c.kind === 'surface') continue;
    const blocked = c.kind === 'composite' || c.evidence.self || c.evidence.twin === 'identical';
    for (const side of ['a', 'b'] as const) {
      const ids = sideIds(c, side);
      if (!ids.every((id) => edgeOf.has(id))) continue;
      for (const [id, r] of sewnOf(c, side, ids, lenOf))
        sewnBy.set(id, [
          ...(sewnBy.get(id) ?? []),
          { from: r[0], to: r[1], seam: c, side, blocked },
        ]);
    }
  }

  // Slots per piece in ring order: an edge whole (free or sewn), or its sewn stretch and the free
  // remainder(s) round it.
  const slotsOf = new Map<string, Slot[]>();
  const slotOfSeamSide = new Map<SeamCandidate, { a: Slot[]; b: Slot[] }>();
  const sewnSlot = (c: SeamCandidate) => {
    let x = slotOfSeamSide.get(c);
    if (!x) {
      x = { a: [], b: [] };
      slotOfSeamSide.set(c, x);
    }
    return x;
  };
  for (const p of pieces) {
    if (skipPiece(p.pieceKey)) continue;
    const n = p.rs.length;
    const slots: Slot[] = [];
    for (const e of p.edges) {
      const cum = cumOf(e);
      const turnAtMm = (at: Mm): number => {
        if (at <= EPS) return cornerTurn(p, e.s);
        if (at >= e.lenMm - EPS) return cornerTurn(p, e.e);
        return cornerTurn(p, (e.s + idxAt(cum, at)) % n);
      };
      const mk = (from: Mm, to: Mm, sewn?: Sewn): Slot => {
        const whole = from <= EPS && to >= e.lenMm - EPS;
        const edge = whole ? e : subEdge(e, cum, from, to, n);
        return {
          piece: p,
          edge,
          from,
          to,
          free: !sewn,
          seam: sewn?.seam,
          side: sewn?.side,
          s: edge.s,
          e: edge.e,
          turnS: turnAtMm(from),
          turnE: turnAtMm(to),
          blocked: !!sewn?.blocked,
        };
      };
      const list = (sewnBy.get(e.id) ?? [])
        .filter((x) => x.to - x.from > EPS)
        .sort((x, y) => x.from - y.from);
      if (!list.length) {
        slots.push(mk(0, e.lenMm));
        continue;
      }
      // Two seams on one edge (a sandwich, a ×2 block): the edge is held whole, opens onto the first.
      if (list.length > 1 || list[0].to - list[0].from >= e.lenMm - 2 * EPS) {
        const s0 = mk(0, e.lenMm, list[0]);
        if (list.length > 1) s0.blocked = true;
        slots.push(s0);
        if (!s0.blocked) sewnSlot(list[0].seam)[list[0].side].push(s0);
        continue;
      }
      const x = list[0];
      if (x.from > EPS) slots.push(mk(0, x.from));
      const sw = mk(x.from, x.to, x);
      slots.push(sw);
      if (!sw.blocked) sewnSlot(x.seam)[x.side].push(sw);
      if (x.to < e.lenMm - EPS) slots.push(mk(x.to, e.lenMm));
    }
    slotsOf.set(p.pieceKey, slots);
  }
  // A seam side's slots in the side's walk order (its parts list), so "the side's last slot" and
  // "its first slot" are known.
  for (const [c, x] of slotOfSeamSide)
    for (const side of ['a', 'b'] as const) {
      const order = sideIds(c, side);
      x[side].sort(
        (u, v) => order.indexOf(u.edge.id) - order.indexOf(v.edge.id) || u.from - v.from,
      );
      // A side with a slot missing (its piece skipped, an edge blocked twice): not crossable.
      if (x[side].length !== order.length) x[side] = [];
    }

  const nextSlot = (sl: Slot): Slot | null => {
    const L = slotsOf.get(sl.piece.pieceKey);
    if (!L) return null;
    const i = L.indexOf(sl);
    return i < 0 ? null : L[(i + 1) % L.length];
  };

  /**
   * The free slot after `f`: the next slot of its piece, or — when that one is sewn — the slot after
   * the seam's other side's last slot on the other piece. Returns the junction's kink and whether a
   * seam was crossed (else the junction is the piece's own corner).
   */
  const stepAfter = (f: Slot): { slot: Slot; kink: number; crossed: boolean } | null => {
    let cur = f;
    let kink = f.turnE;
    let crossed = false;
    for (let hop = 0; hop < 6; hop++) {
      const nx = nextSlot(cur);
      if (!nx) return null;
      if (nx.free) return { slot: nx, kink, crossed };
      if (nx.blocked || !nx.seam || !nx.side) return null;
      const sides = slotOfSeamSide.get(nx.seam);
      if (!sides) return null;
      const mine = sides[nx.side];
      const theirs = sides[nx.side === 'a' ? 'b' : 'a'];
      // Entered away from the side's start: not a junction we know.
      if (!mine.length || mine[0] !== nx || !theirs.length) return null;
      const last = theirs[theirs.length - 1];
      kink += last.turnE - 180;
      crossed = true;
      cur = last;
    }
    return null;
  };

  const free: Slot[] = [];
  for (const p of pieces)
    for (const sl of slotsOf.get(p.pieceKey) ?? []) if (sl.free) free.push(sl);
  const succ = new Map<Slot, { slot: Slot; kink: number }>();
  const pred = new Set<Slot>();
  for (const f of free) {
    const s = stepAfter(f);
    if (!s || !s.slot.free) continue;
    // A piece's own corner joins two of its edges only when soft (the pool's chain); a seam's end
    // is crossed up to the caller's kink.
    if (Math.abs(s.kink) > (s.crossed ? maxKinkDeg : SOFT_CORNER_DEG)) continue;
    if (pred.has(s.slot)) continue;
    succ.set(f, s);
    pred.add(s.slot);
  }
  const partOf = (sl: Slot): BoundaryPart => {
    const L = edgeOf.get(sl.edge.id)?.edge.lenMm ?? sl.edge.lenMm;
    const whole = sl.from <= EPS && sl.to >= L - EPS;
    return {
      edge: sl.edge,
      ...(whole ? {} : { range: [sl.from, sl.to] as [Mm, Mm] }),
      turnS: sl.turnS,
      turnE: sl.turnE,
    };
  };
  const seen = new Set<Slot>();
  const runs: BoundaryRun[] = [];
  const walk = (start: Slot, closed: boolean) => {
    const parts: BoundaryPart[] = [];
    const kinks: number[] = [];
    let cur: Slot | undefined = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      parts.push(partOf(cur));
      const s = succ.get(cur);
      if (!s) break;
      kinks.push(s.kink);
      cur = s.slot;
    }
    if (!closed) kinks.length = Math.max(0, parts.length - 1);
    runs.push({ parts, closed, kinks });
  };
  // Open runs start where nothing leads in; what is left lies on closed loops.
  for (const f of free) if (!pred.has(f) && !seen.has(f)) walk(f, false);
  for (const f of free) if (!seen.has(f)) walk(f, true);
  return runs;
}
