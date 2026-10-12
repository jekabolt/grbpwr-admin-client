// The solver: hard constraints as a board with an undo trail, ONE exact branch-and-bound over the
// variables of every operation of the card (an operation solved on its own would grab an edge a
// later operation needs — 12.10: card 49's yoke took the back's side seams), the greedy as its
// first incumbent, a node budget (deterministic: the same input explores the same nodes in the
// same order), and re-solve margins for the confidence words.
//
// Self-contained on purpose (05-ASSIGNMENT-DESIGN proposed an ILP via HiGHS WASM): a card has
// 20–400 variables, the «edge once» constraint makes it a matching, and the incumbent is the
// greedy — on the 14-card corpus the search closes in well under the node budget on every garment
// (the octagon bags' rings of identical triangles hit it and keep the incumbent). A dependency and a
// worker would buy nothing yet; they are a change to make when a card needs it, measured.
//
// Constraints (all hard):
//   · an edge is sewn once — except an edge of a ×2 mirrored block meeting two edges of ONE single
//     piece (its reflected copy is the other hand), and a straight designated ply edge carrying
//     the ply seam AND one single-layer piece between the plies (the sandwich);
//   · a PLY PAIR is one piece (two identical twins the order sews to each other — a double yoke,
//     collar plies): a seam onto an edge of one ply takes the corresponding edge of the other ply
//     too (the third piece is caught between both plies), and the plies' own seam joins
//     corresponding edges;
//   · joins only between distinct inputs of the operation (candidates.ts);
//   · (as COSTS, a notch band each — a facing traced like its shell, a bagged lining hem or a
//     dress's waist seam break them legitimately) face-up layout: two pieces sewn along edges
//     running UP their drawings meet from OPPOSITE sides of their drawings; a long straight level
//     edge onto a long upright one; two hems; a tall piece's hem onto another tall piece's top;
//   · left never meets right: a parity over pieces that have a hand or a mirror twin — a seam puts
//     its two pieces on one side (mirror twins meeting on their centre line are exempt) — and a
//     symmetric piece (a back, a yoke, a collar) has one orientation: the pieces sewn on its two
//     drawing sides are of opposite parity.

import { xSideOf, yMidOf } from '../geometry/plies';
import { isStraight, type CandidatePool } from '../geometry/match';
import type { Edge, EdgeId, PieceGeom } from '../types';
import {
  LAYOUT_PENALTY,
  MARGIN_NODE_BUDGET,
  type OpSolution,
  type Operation,
  type Solution,
  type Variable,
} from './model';

type Use = { piece: string; edge: EdgeId; ply: boolean };
type Trail = (() => void)[];

const chordAngle = (e: Edge) => {
  const p = e.pts[0];
  const q = e.pts[e.pts.length - 1];
  return Math.atan2(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
};
/** Chord within 25° of the drawing's vertical / horizontal. */
export const upright = (e: Edge) => chordAngle(e) <= (25 * Math.PI) / 180;
export const level = (e: Edge) => chordAngle(e) >= (65 * Math.PI) / 180;
const pkOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
const boxOf = (p: PieceGeom) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of p.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { w: x1 - x0, h: y1 - y0 };
};

/**
 * Edge correspondence of two identical twins: b's edge sequence fits a's at one rotation (twins.ts
 * shapeRelation 'same'); a.edges[i] ↔ b.edges[(i + r) % n]. Null when the sequences do not fit.
 */
function plyCorrespondence(a: PieceGeom, b: PieceGeom): Map<EdgeId, EdgeId> | null {
  const n = a.edges.length;
  if (n === 0 || n !== b.edges.length) return null;
  const ok = (x: number, y: number) => Math.abs(x - y) <= Math.max(5, 0.02 * x);
  for (let r = 0; r < n; r++) {
    let all = true;
    for (let i = 0; i < n && all; i++) all = ok(a.edges[i].lenMm, b.edges[(i + r) % n].lenMm);
    if (!all) continue;
    const m = new Map<EdgeId, EdgeId>();
    for (let i = 0; i < n; i++) {
      m.set(a.edges[i].id, b.edges[(i + r) % n].id);
      m.set(b.edges[(i + r) % n].id, a.edges[i].id);
    }
    return m;
  }
  return null;
}

/** The constraint state shared across the operations of one card, with an undo trail. */
export class Board {
  readonly uses = new Map<EdgeId, Use[]>();
  /** Parity union-find over pieces in play (and the orientation node of each symmetric piece). */
  private readonly parent = new Map<string, string>();
  private readonly parity = new Map<string, number>();
  private readonly inPlay = new Set<string>();
  private readonly trail: Trail = [];
  private readonly geom: Map<string, PieceGeom>;
  /** Ply pairs: edge → the corresponding edge of the other ply. */
  private readonly plyMate = new Map<EdgeId, EdgeId>();
  /** The second ply of each pair (CLR_1 to CLR): a tie between the plies goes to the first. */
  private readonly secondPly = new Set<string>();
  /** Every piece of a validated ply pair. */
  private readonly plyPieces = new Set<string>();
  /** Every edge of the card by index, and how many seams hold it (the search bound reads these). */
  readonly edgeIndex = new Map<EdgeId, number>();
  readonly useCount: Int32Array;
  /** Edges that may carry a ply seam AND one single-layer piece: straight, designated, on a ply. */
  private readonly sandwichable = new Set<EdgeId>();
  /** Per edge index: 2 when the edge may be sewn twice (a sandwich, a ×2 block), else 1. */
  readonly capacity: Uint8Array;

  constructor(
    private readonly P: CandidatePool,
    /** The order's operations: a ply pair is two identical twins the order sews to each other. */
    ops: readonly Operation[],
  ) {
    this.geom = new Map(P.pieces.map((p) => [p.pieceKey, p]));
    for (const p of P.pieces)
      for (const e of p.edges) this.edgeIndex.set(e.id, this.edgeIndex.size);
    this.useCount = new Int32Array(this.edgeIndex.size);
    for (const r of P.runs) {
      if (r.chain || !P.designated.has(r.id) || !isStraight(r)) continue;
      if (r.piece.twinOf.some((t) => t.kind === 'identical')) this.sandwichable.add(r.id);
    }
    this.capacity = new Uint8Array(this.edgeIndex.size).fill(1);
    for (const p of P.pieces)
      for (const e of p.edges)
        if (this.sandwichable.has(e.id) || P.bothHands.has(p.pieceKey))
          this.capacity[this.edgeIndex.get(e.id)!] = 2;
    const L = '\u0000L';
    const R = '\u0000R';
    this.link(L, R, 1);
    for (const p of P.pieces) {
      if (p.hand && !P.bothHands.has(p.pieceKey)) {
        this.link(p.pieceKey, p.hand === 'L' ? L : R, 0);
        this.inPlay.add(p.pieceKey);
      }
      for (const t of p.twinOf) {
        if (t.kind !== 'mirror') continue;
        this.link(p.pieceKey, t.key, 1);
        this.inPlay.add(p.pieceKey);
        this.inPlay.add(t.key);
      }
    }
    // Ply pairs: exactly one identical twin each, and the order SEWS the two to each other — each
    // alone an input of one operation (a yoke and its facing, two collar plies). A ring of identical
    // bag panels is not one, nor two identical halves that merely end up in one unit, nor two
    // identical plackets sewn first to the two fronts and only then met as parts of larger units
    // (12.10 corpus, card 9: read as plies, the right placket's seam was moved onto the left one).
    const together = (a: string, b: string) =>
      ops.some((op) => {
        const ia = op.inputs.findIndex((X) => X.includes(a));
        const ib = op.inputs.findIndex((X) => X.includes(b));
        return (
          ia >= 0 &&
          ib >= 0 &&
          ia !== ib &&
          op.inputs[ia].length === 1 &&
          op.inputs[ib].length === 1 &&
          // (two identical sleeves set onto the body in one step are the left and the right
          // sleeve, not two plies — card 9, names unreadable)
          op.classes[ia] !== 'sleeve' &&
          op.classes[ib] !== 'sleeve'
        );
      });
    for (const p of P.pieces) {
      const ids = p.twinOf.filter((t) => t.kind === 'identical');
      if (ids.length !== 1) continue;
      const q = this.geom.get(ids[0].key);
      if (!q || q.twinOf.filter((t) => t.kind === 'identical').length !== 1) continue;
      if (p.pieceKey > q.pieceKey || !together(p.pieceKey, q.pieceKey)) continue;
      const m = plyCorrespondence(p, q);
      if (!m) continue;
      for (const [k, v] of m) this.plyMate.set(k, v);
      this.plyPieces.add(p.pieceKey);
      this.plyPieces.add(q.pieceKey);
      // One piece: the plies share their orientation.
      this.link(`\u0000O:${p.pieceKey}`, `\u0000O:${q.pieceKey}`, 0);
      // Both plies take every seam onto the pair; the seam is REPORTED on the ply the card names
      // first (CLR, not CLR_1) — the one with the shorter name, then the smaller.
      const second =
        p.name.length !== q.name.length
          ? p.name.length > q.name.length
            ? p
            : q
          : p.name > q.name
            ? p
            : q;
      this.secondPly.add(second.pieceKey);
    }
    this.trail.length = 0;
  }

  mark(): number {
    return this.trail.length;
  }
  undo(to: number) {
    while (this.trail.length > to) this.trail.pop()!();
  }

  private find(k: string): [string, number] {
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      this.parity.set(k, 0);
      this.trail.push(() => {
        this.parent.delete(k);
        this.parity.delete(k);
      });
    }
    let r = k;
    let p = 0;
    while (this.parent.get(r) !== r) {
      p ^= this.parity.get(r) ?? 0;
      r = this.parent.get(r) ?? r;
    }
    return [r, p];
  }
  /** parity(a) xor parity(b) = rel; false on contradiction (nothing changed then). */
  private link(a: string, b: string, rel: number): boolean {
    const [ra, pa] = this.find(a);
    const [rb, pb] = this.find(b);
    if (ra === rb) return (pa ^ pb) === rel;
    const prevParity = this.parity.get(ra) ?? 0;
    this.parent.set(ra, rb);
    this.parity.set(ra, pa ^ pb ^ rel);
    this.trail.push(() => {
      this.parent.set(ra, ra);
      this.parity.set(ra, prevParity);
    });
    return true;
  }
  /** Would `link` be consistent (nothing changed)? */
  private canLink(a: string, b: string, rel: number): boolean {
    const [ra, pa] = this.find(a);
    const [rb, pb] = this.find(b);
    return ra !== rb || (pa ^ pb) === rel;
  }

  private edgeOf(id: EdgeId): Edge | undefined {
    return this.geom.get(pkOf(id))?.edges.find((e) => e.id === id);
  }
  /** The run's main edge for the side tests (the longer part of a chain). */
  private mainEdge(ids: readonly EdgeId[]): Edge | undefined {
    let best: Edge | undefined;
    for (const id of ids) {
      const e = this.edgeOf(id);
      if (e && (!best || e.lenMm > best.lenMm)) best = e;
    }
    return best;
  }

  /** The edges a side occupies: its own, plus the ply mates of a non-ply seam on a ply edge. */
  private occupied(mine: readonly EdgeId[], v: Variable): EdgeId[] {
    if (v.ply || v.self) return [...mine];
    const out = [...mine];
    for (const e of mine) {
      const m = this.plyMate.get(e);
      if (m) out.push(m);
    }
    return out;
  }

  /**
   * The static facts of a variable, once: the edges each side occupies and the parity links it
   * asks for. Returns the face-up layout penalty (0 = every rule kept) for the caller's benefit.
   */
  annotate(v: Variable): number {
    v.occA = this.occupied(v.ea, v);
    v.occB = this.occupied(v.eb, v);
    v.links = this.links(v);
    return this.layoutPenalty(v);
  }

  /** Can the variable's edges still be sewn (edge once, with the exceptions)? */
  free(v: Variable): boolean {
    // The plies' own seam joins corresponding edges.
    if (v.ply && v.ea.length === 1 && v.eb.length === 1) {
      const m = this.plyMate.get(v.ea[0]);
      if (m && m !== v.eb[0]) return false;
    }
    const sides: [EdgeId[], EdgeId[], string, EdgeId[], string][] = [
      [v.occA, v.ea, v.pa, v.eb, v.pb],
      [v.occB, v.eb, v.pb, v.ea, v.pa],
    ];
    for (const [occ, mine, me, theirs, them] of sides)
      for (const e of occ) {
        const uses = this.uses.get(e) ?? [];
        if (uses.length === 0) continue;
        if (uses.length > 1) return false;
        const u = uses[0];
        // ×2 mirrored block: its edge meets two edges of the same single piece.
        if (
          this.P.bothHands.has(me) &&
          !this.P.bothHands.has(them) &&
          u.piece === them &&
          u.edge !== theirs[0]
        )
          continue;
        // Sandwich: a straight designated ply edge carries the ply seam and one single-layer piece.
        if (this.sandwichable.has(e) && mine.length === 1 && u.ply !== v.ply) {
          const g = this.geom.get(v.ply ? u.piece : them);
          if (g && !g.twinOf.some((t) => t.kind === 'identical')) continue;
        }
        return false;
      }
    return true;
  }

  /**
   * Face-up layout. Pieces are drawn face up and upright (grain up); two pieces sewn along edges
   * that run UP their drawings lie side by side, so the shared edge is on OPPOSITE sides of the two
   * drawings (a front's side seam on its outer side, the back's on its outer side — which is the
   * other sign). Identical plies stack face to face (same sign) and a ×2 / mirrored-cut block has
   * a reflected copy: both exempt. A level edge (a yoke bottom, a hem) is never sewn onto an upright
   * one (a side seam) when both are long and straight.
   */
  private layoutPenalty(v: Variable): number {
    if (v.self || v.ply) return 0;
    if (this.P.bothHands.has(v.pa) || this.P.bothHands.has(v.pb)) return 0;
    if (this.P.mirroredCut.has(v.pa) || this.P.mirroredCut.has(v.pb)) return 0;
    const a = this.geom.get(v.pa);
    const b = this.geom.get(v.pb);
    const ea = this.mainEdge(v.ea);
    const eb = this.mainEdge(v.eb);
    if (!a || !b || !ea || !eb) return 0;
    let broken = 0;
    const ua = upright(ea);
    const ub = upright(eb);
    if (ua && ub) {
      const sa = xSideOf(a, ea);
      const sb = xSideOf(b, eb);
      if (sa !== 0 && sb !== 0 && sa === sb) broken++;
    }
    const long = (e: Edge) => e.lenMm >= 150 && e.chordMm / e.lenMm >= 0.95;
    if (long(ea) && long(eb) && ((ua && level(eb)) || (ub && level(ea)))) broken++;
    // Hems. Two level edges at the BOTTOM of their pieces are two hems — not sewn to each other
    // (face up, two pieces stacked meet top to bottom; only a shoulder meets top to top, folded;
    // a bagged lining hem is the exception, paid for). And the bottom edge of a TALL piece (a
    // front, a back panel) is its hem: sewn to a band or a facing, not to the top of another tall
    // piece (a panel seam runs between a short upper piece and the panel below it; a dress's waist
    // seam between two tall pieces pays).
    if (level(ea) && level(eb)) {
      const la = yMidOf(a, ea);
      const lb = yMidOf(b, eb);
      if (la < 0.25 && lb < 0.25) broken++;
      const tall = (p: PieceGeom) => {
        const bx = boxOf(p);
        return bx.h >= 500 && bx.h >= 1.5 * bx.w;
      };
      if (((la < 0.25 && lb > 0.75) || (lb < 0.25 && la > 0.75)) && tall(a) && tall(b)) broken++;
    }
    return broken * LAYOUT_PENALTY;
  }

  /**
   * The parity links a variable asks for: two pieces in play on one side (mirror twins on their
   * centre line exempt); a piece in play against a symmetric piece P links to P's orientation
   * node by the drawing side of P it is sewn on (two pieces on P's two sides are of opposite
   * parity; a piece on P's centre — a hem, a neckline — says nothing).
   */
  private links(v: Variable): [string, string, number][] {
    if (v.self || v.ply) return [];
    const aIn = this.inPlay.has(v.pa);
    const bIn = this.inPlay.has(v.pb);
    if (aIn && bIn) return v.mirror ? [] : [[v.pa, v.pb, 0]];
    const exempt = (k: string) => this.P.bothHands.has(k) || this.P.mirroredCut.has(k);
    if (exempt(v.pa) || exempt(v.pb)) return [];
    const a = this.geom.get(v.pa);
    const b = this.geom.get(v.pb);
    const ea = this.mainEdge(v.ea);
    const eb = this.mainEdge(v.eb);
    if (!a || !b || !ea || !eb) return [];
    const sa = xSideOf(a, ea);
    const sb = xSideOf(b, eb);
    if (aIn || bIn) {
      // A piece in play on a symmetric piece: the side of the symmetric piece says its parity.
      const [handedKey, centreKey, side] = aIn ? [v.pa, v.pb, sb] : [v.pb, v.pa, sa];
      if (side === 0) return [];
      return [[handedKey, `\u0000O:${centreKey}`, side > 0 ? 0 : 1]];
    }
    // Two symmetric pieces (a yoke and a back): sewn along edges on their drawings' sides, the two
    // drawings face the same way when the sides agree — upright edges (side by side) excepted,
    // where opposite sides mean the same way (layoutOk already asks for opposite sides there).
    if (sa === 0 || sb === 0) return [];
    const sideBySide = upright(ea) && upright(eb);
    return [[`\u0000O:${v.pa}`, `\u0000O:${v.pb}`, sideBySide ? 0 : sa === sb ? 0 : 1]];
  }

  feasible(v: Variable): boolean {
    if (!this.free(v)) return false;
    for (const [a, b, rel] of v.links) if (!this.canLink(a, b, rel)) return false;
    return true;
  }

  /** Take the variable (caller checked `feasible`). Undone by `undo(mark)`. */
  apply(v: Variable) {
    for (const [occ, theirs, them] of [
      [v.occA, v.eb, v.pb],
      [v.occB, v.ea, v.pa],
    ] as [EdgeId[], EdgeId[], string][])
      for (const e of occ) {
        const prev = this.uses.get(e);
        this.uses.set(e, [...(prev ?? []), { piece: them, edge: theirs[0], ply: v.ply }]);
        const ix = this.edgeIndex.get(e);
        if (ix !== undefined) this.useCount[ix]++;
        this.trail.push(() => {
          if (prev) this.uses.set(e, prev);
          else this.uses.delete(e);
          if (ix !== undefined) this.useCount[ix]--;
        });
      }
    for (const [a, b, rel] of v.links) this.link(a, b, rel);
  }

  /** The piece is one ply of a validated pair. */
  isPly(k: string): boolean {
    return this.plyPieces.has(k);
  }
  /** The second ply of a pair (a tie between the plies goes to the first). */
  isSecondPly(k: string): boolean {
    return this.secondPly.has(k);
  }
  /** The corresponding edge on the other ply of a pair, if the edge is on one. */
  plyMateOf(e: EdgeId): EdgeId | undefined {
    return this.plyMate.get(e);
  }
  /**
   * The edge can still take ONE single-layer piece: nothing on it, or only the plies' own seam on a
   * straight designated ply edge (the sandwich — a stand's neck edge carries its ply seam and the
   * neckline).
   */
  sandwichFree(e: EdgeId, curvedOk = false): boolean {
    const uses = this.uses.get(e) ?? [];
    if (uses.length === 0) return true;
    if (uses.length !== 1 || !uses[0].ply) return false;
    // (a composite onto a ply pair — the neckline between the two plies of a stand — sits on the
    // designated ply edge whether it is straight or not)
    return this.sandwichable.has(e) || (curvedOk && this.P.designated.has(e));
  }

  /** Mark edges used by a seam outside the search (a forced seam, a closure). */
  occupy(ids: readonly EdgeId[], other: readonly EdgeId[], ply = false) {
    const them = other[0] ? pkOf(other[0]) : '';
    for (const e of ids) {
      this.uses.set(e, [...(this.uses.get(e) ?? []), { piece: them, edge: other[0] ?? '', ply }]);
      const ix = this.edgeIndex.get(e);
      if (ix !== undefined) this.useCount[ix]++;
    }
  }
}

// ── the joint search ───────────────────────────────────────────────────────────────────────

/** Union-find over one operation's inputs with an undo trail (components for the objective). */
class Inputs {
  private readonly parent: number[];
  comps: number;
  private readonly trail: (() => void)[] = [];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.comps = n;
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r];
    return r;
  }
  merges(a: number, b: number): boolean {
    return a !== b && this.find(a) !== this.find(b);
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    this.parent[ra] = rb;
    this.comps--;
    this.trail.push(() => {
      this.parent[ra] = ra;
      this.comps++;
    });
  }
  mark() {
    return this.trail.length;
  }
  undo(to: number) {
    while (this.trail.length > to) this.trail.pop()!();
  }
}

type Search = {
  best: { chosen: Variable[]; objective: number };
  nodes: number;
  budget: number;
  aborted: boolean;
};

/**
 * Exact branch-and-bound over all variables (sorted best first): include / exclude, bound = value
 * so far + the positive benefits still ahead + the slack that joining the operations' remaining
 * components could still save. The greedy incumbent comes first, so a search cut short by the
 * budget still returns at least the greedy's answer.
 */
function search(
  vars: readonly Variable[],
  ops: readonly Operation[],
  board: Board,
  /** The operations' input components so far (shared across the card's components; restored). */
  inputs: readonly Inputs[],
  budget: number,
  forbid?: Variable,
): Search {
  const n = vars.length;
  // Upper bound on what the variables from i on can still add: every variable uses one edge on each
  // side and an edge is sewn once, so Σ benefit ≤ ½ Σ_edges max benefit of a variable on that edge —
  // over the edges still free at this node (the sandwich / ×2 exceptions are rare and small: the
  // bound stays a bound in practice; the incumbent, not the bound, is what the answer rests on when
  // it does not). Also: a variable both of whose sides are taken adds nothing.
  // An edge of capacity 2 (a sandwich, a ×2 block) may take two variables: it contributes its two
  // best; an edge already holding one seam has one place left.
  const E = board.useCount.length;
  const cap = board.capacity;
  const idx = (ids: readonly EdgeId[]) =>
    Int32Array.from(ids.map((e) => board.edgeIndex.get(e) ?? -1).filter((x) => x >= 0));
  const ia = vars.map((v) => idx(v.ea));
  const ib = vars.map((v) => idx(v.eb));
  const max1 = new Float64Array(E);
  const max2 = new Float64Array(E);
  const touched = new Int32Array(E);
  let positives = 0;
  while (positives < n && vars[positives].benefit > 0) positives++;
  const suffixBound = (i: number): number => {
    const uc = board.useCount;
    let nt = 0;
    for (let j = i; j < positives; j++) {
      const b = vars[j].benefit;
      const A = ia[j];
      const B = ib[j];
      let fa = false;
      for (let k = 0; k < A.length && !fa; k++) fa = uc[A[k]] < cap[A[k]];
      let fb = false;
      for (let k = 0; k < B.length && !fb; k++) fb = uc[B[k]] < cap[B[k]];
      if (!fa || !fb) continue;
      for (const arr of [A, B])
        for (let k = 0; k < arr.length; k++) {
          const e = arr[k];
          if (uc[e] >= cap[e]) continue;
          if (max1[e] === 0) touched[nt++] = e;
          if (b > max1[e]) {
            max2[e] = max1[e];
            max1[e] = b;
          } else if (b > max2[e]) max2[e] = b;
        }
    }
    let sum = 0;
    for (let k = 0; k < nt; k++) {
      const e = touched[k];
      sum += max1[e] + (cap[e] - uc[e] >= 2 ? max2[e] : 0);
      max1[e] = 0;
      max2[e] = 0;
    }
    return sum / 2;
  };
  // …and the slack an operation can still save: one component per remaining variable of it.
  const remaining: number[][] = ops.map(() => new Array(n + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let o = 0; o < ops.length; o++)
      remaining[o][i] = remaining[o][i + 1] + (vars[i].op === o && !vars[i].self ? 1 : 0);
  const canSave = (i: number) => {
    let t = 0;
    for (let o = 0; o < ops.length; o++)
      t += ops[o].slack * Math.min(inputs[o].comps - 1, remaining[o][i]);
    return t;
  };
  // Operations with no variable here pay a constant: left out of the objective.
  const live = ops.map((_, o) => vars.some((v) => v.op === o));
  const base = ops.reduce((t, op, o) => t + (live[o] ? op.slack * (inputs[o].comps - 1) : 0), 0);
  // Slack relative to the state the search started in (what THESE variables can still save).
  const slackNow = () => {
    let t = 0;
    for (let o = 0; o < ops.length; o++) if (live[o]) t += ops[o].slack * (inputs[o].comps - 1);
    return t - base;
  };
  const objective = (value: number) => value - slackNow();
  const joins = (v: Variable) => !v.self && inputs[v.op].merges(v.ia, v.ib);
  const take = (v: Variable) => {
    board.apply(v);
    if (!v.self) inputs[v.op].union(v.ia, v.ib);
  };

  // Greedy incumbent: repeatedly the best feasible variable by benefit + the operation's slack when
  // it joins two of its components; stop when nothing is worth taking.
  const incumbent: Variable[] = [];
  const m0 = board.mark();
  const im0 = inputs.map((u) => u.mark());
  {
    const taken = new Set<Variable>();
    for (;;) {
      let pick: Variable | null = null;
      let pickKey = 0;
      for (const v of vars) {
        if (v === forbid || taken.has(v)) continue;
        const key = v.benefit + (joins(v) ? ops[v.op].slack : 0);
        if (key <= 0 || key <= pickKey) continue;
        if (!board.feasible(v)) continue;
        pick = v;
        pickKey = key;
      }
      if (!pick) break;
      taken.add(pick);
      take(pick);
      incumbent.push(pick);
    }
  }
  const S: Search = {
    best: {
      chosen: [...incumbent],
      objective: objective(incumbent.reduce((t, v) => t + v.benefit, 0)),
    },
    nodes: 0,
    budget,
    aborted: false,
  };
  board.undo(m0);
  inputs.forEach((u, o) => u.undo(im0[o]));

  const chosen: Variable[] = [];
  const dfs = (i: number, value: number) => {
    if (S.aborted) return;
    if (++S.nodes > S.budget) {
      S.aborted = true;
      return;
    }
    if (i === n) {
      const obj = objective(value);
      if (obj > S.best.objective) S.best = { chosen: [...chosen], objective: obj };
      return;
    }
    // Upper bound: the matching bound ahead, and the slack still savable.
    if (value - slackNow() + suffixBound(i) + canSave(i) <= S.best.objective) return;
    const v = vars[i];
    if (v !== forbid && board.feasible(v)) {
      const m = board.mark();
      const im = inputs.map((u) => u.mark());
      take(v);
      chosen.push(v);
      dfs(i + 1, value + v.benefit);
      chosen.pop();
      inputs.forEach((u, o) => u.undo(im[o]));
      board.undo(m);
    }
    // Exclude: a negative benefit never helps unless it joins components — the bound handles it.
    dfs(i + 1, value);
  };
  dfs(0, 0);
  board.undo(m0);
  inputs.forEach((u, o) => u.undo(im0[o]));
  return S;
}

/**
 * Components of variables that share an edge (ply mates included) or a PARITY node (a piece in
 * play, a symmetric piece's orientation): a seam's hand is decided together with the seams that
 * decide it (12.10 corpus, card 9: the shoulders alone are a tie between the back's two sides —
 * solved apart, the tie fell by id, crossed, and the side seams that say which way were then
 * infeasible). Solved one after another, biggest evidence first: what a component decides (edges,
 * parity, an operation's components) is on the board when the next one is searched. Exact within
 * a component; across components the coupling is only through the board.
 */
function componentsOf(vars: readonly Variable[]): Variable[][] {
  const parent = vars.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  const byKey = new Map<string, number>();
  vars.forEach((v, i) => {
    const keys = [
      ...v.occA,
      ...v.occB,
      ...v.links.flatMap(([a, b]) => [`\u0000P${a}`, `\u0000P${b}`]),
    ];
    for (const e of keys) {
      const j = byKey.get(e);
      if (j === undefined) byKey.set(e, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Variable[]>();
  vars.forEach((v, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), v]);
  });
  // vars are sorted best first: a group's first member is its best; groups by that, then by id.
  return [...groups.values()].sort(
    (a, b) => b[0].benefit - a[0].benefit || (a[0].id < b[0].id ? -1 : 1),
  );
}

/** Components among each operation's inputs after the chosen variables. */
const perOperation = (ops: readonly Operation[], chosen: readonly Variable[]): OpSolution[] =>
  ops.map((op, o) => {
    const u = new Inputs(op.inputs.length);
    const mine = chosen.filter((v) => v.op === o);
    for (const v of mine) if (!v.self) u.union(v.ia, v.ib);
    const words: string[] = [];
    if (op.slack > 0 && u.comps > 1)
      words.push(
        `«${op.label}»: ${u.comps} of its ${op.inputs.length} inputs stay apart — no candidate edge pair of matching length between them (left to the composite pass and the doll's order proposals)`,
      );
    return { op, chosen: mine, components: u.comps, words };
  });

export function solveCard(
  vars: readonly Variable[],
  ops: readonly Operation[],
  board: Board,
  /** Node budget for the card's search, and for all the margin re-solves (deterministic). */
  budget: number,
  marginBudget: number,
  /** Seams a person confirmed, already on the board: they join their operation's inputs. */
  fixed: readonly Variable[],
  clock: () => number,
): Solution {
  const t0 = clock();
  const inputs = ops.map((op) => new Inputs(op.inputs.length));
  for (const v of fixed) if (!v.self) inputs[v.op].union(v.ia, v.ib);
  const chosen: Variable[] = [];
  const margin = new Map<Variable, number>();
  let objective = 0;
  let nodes = 0;
  let exact = true;
  let left = budget;
  let marginLeft = marginBudget;
  for (const comp of componentsOf(vars)) {
    const S = search(comp, ops, board, inputs, Math.max(1, left));
    nodes += S.nodes;
    left -= S.nodes;
    exact &&= !S.aborted;
    // A margin is published only when both searches are exact: an aborted re-solve would call a
    // seam sure for want of nodes.
    for (const v of S.best.chosen) {
      if (S.aborted || marginLeft < MARGIN_NODE_BUDGET) break;
      const S2 = search(comp, ops, board, inputs, MARGIN_NODE_BUDGET, v);
      marginLeft -= S2.nodes;
      if (!S2.aborted) margin.set(v, S.best.objective - S2.best.objective);
    }
    // Commit the component's seams (no undo past here).
    for (const v of S.best.chosen) {
      board.apply(v);
      if (!v.self) inputs[v.op].union(v.ia, v.ib);
      chosen.push(v);
    }
    objective += S.best.objective;
  }
  return {
    chosen,
    objective,
    nodes,
    exact,
    ms: clock() - t0,
    margin,
    perOp: perOperation(ops, chosen),
  };
}
