// COMPOSITE candidates per operation (05-ASSIGNMENT-DESIGN phase 3): what the pair pool cannot see
// because one side of the seam runs over SEVERAL pieces of a unit the order built earlier — an
// armhole (front + back), a neckline (front + yoke + front), one placket onto the two pieces of a
// front (12.10 corpus, card 6: placket 668 onto 124 + 544). Read AFTER the pair solve, operation by
// operation in the order's sequence: each input's glued boundary (geometry/composite.ts gluedRuns —
// the free edges walked across the seams chosen inside that input, soft junctions only) gives runs;
// every contiguous sub-run of parts is a candidate side (the stand's 425 sits on three of the five
// edges the neckline runs over — the plackets' tops are not under it), a single edge with notches
// near both ends also as its INNER stretch between two such notches (a stand sewn between its CF
// notches: 25 … 450 of 475). Sides of two distinct inputs are scored by length (exact, or eased up
// to SKELETON.lenRelEased), notches read face up (A from its start, B from its end), ends that true
// up (open runs), and taken best first per operation, each edge once, onto the solver's board.
//
// What a composite may claim is bounded by the ORDER: only between inputs of one operation the
// pair solve left apart (or an operation whose inputs are a tube / ring and the body), never a
// second seam between inputs already joined.

import { edgeIdsOf } from '../geometry/match';
import { yMidOf } from '../geometry/plies';
import { cornerTurn, type CandidatePool, type PoolCand } from '../geometry/match';
import {
  SKELETON,
  type Edge,
  type EdgeId,
  type PieceGeom,
  type SeamCandidate,
  type SeamEvidence,
} from '../types';
import { boundaryRuns, OPENING_KINK_DEG, SOFT_CORNER_DEG, type BoundaryPart } from './boundary';
import { roleOf } from './costs';
import { TUBE_CLASSES, type OpSolution, type Operation } from './model';
import { level, type Board } from './solve';

/** A notch this close to an edge's end is an allowance mark: the edge is sewn from it inward. */
const END_NOTCH_MM = 40;
/** Longest run (parts) a sub-run is enumerated over (a neckline over nine small back edges). */
const MAX_PARTS = 14;
/** Composite ends: summed end error (deg) at which the ends term is 0. */
const ENDS_SCALE_DEG = 60;
/** A composite side over several parts pays the pool's chain penalty once. */
const CHAIN = SKELETON.chainPenalty;
/**
 * A tube / ring onto the body (a cap into an armhole, a collar onto a neckline): the order itself
 * says the two inputs meet along one edge each, so a composite that joins them is worth this on top
 * of its evidence — and such operations accept down to COMPOSITE_TUBE_ACCEPT (a cap and an armhole
 * rarely carry agreeing notches).
 */
const TUBE_JOIN_BONUS = 0.1;
const COMPOSITE_TUBE_ACCEPT = 0.55;
/** The shortest edge a tube / ring meets the body along (a child's armhole is longer). */
const TUBE_MIN_MM = 250;
/**
 * A closed tube loop onto an open body run: the pool's reading of the two edges past the run's ends
 * (the seam that closes the opening — a shoulder) must score at least this (accept − 2 ambiguity):
 * a near miss of the pair solve, not any coincidence the pool kept.
 */
const CLOSES_AT_FLOOR = SKELETON.accept - 2 * SKELETON.ambiguity;
/** A strip (a facing, a band): the piece's box is at least this many times longer than wide. */
export const STRIP_ASPECT = 4;
/** Sides of two inputs compared at most (a boundary of 150 small pieces is not walked pairwise). */
const MAX_PAIRS = 250_000;

type Side = {
  id: string;
  /** The parts in walk order: whole edges, or the free remainder of a partially sewn edge (same
   * id, its own length and notches — boundary.ts). */
  parts: Edge[];
  pieces: Set<string>;
  lenMm: number;
  /** Notches, mm from the side's start (over the sewn stretch). */
  notchesMm: number[];
  closed: boolean;
  turnStart: number;
  turnEnd: number;
  hand: PieceGeom['hand'];
  /** Inner stretch of a single edge (mm from the edge's start), when not the whole edge. */
  range?: [number, number];
  /** Parts that are a remainder of a partially sewn edge: the free stretch, mm along that edge. */
  partRange?: Record<EdgeId, [number, number]>;
  /**
   * A whole open run: the free edges the boundary continues with past its two ends (its pieces'
   * ring neighbours) — where the opening would close if those two were sewn to each other.
   */
  ends?: { before: Edge; after: Edge };
};

type Comp = {
  a: Side;
  b: Side;
  score: number;
  evidence: SeamEvidence;
  ia: number;
  ib: number;
  /** A tube / ring onto the body, and which side is the body (0 = a, 1 = b). */
  body?: 0 | 1;
};

const pkOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
const ladder = (err: number): 0 | 0.3 | 0.7 | 1 =>
  err <= SKELETON.notchTolMm ? 1 : err <= 8 ? 0.7 : err <= 15 ? 0.3 : 0;

/**
 * Sides of one input: the glued boundary's runs' sub-runs and the free single edges (with inner
 * stretches). `free(id, remainder)`: the edge may still take a seam — a remainder of a partially
 * sewn edge is free unless a composite took it already.
 */
function sidesOf(
  pieces: readonly PieceGeom[],
  seams: readonly SeamCandidate[],
  free: (id: EdgeId, remainder: boolean) => boolean,
  secondPly: (k: string) => boolean,
  /** Kink (deg) a run holds at a seam's end: an opening runs across any (boundary.ts). */
  maxKinkDeg: number,
  debugRuns?: (line: string) => void,
): Side[] {
  const geom = new Map(pieces.map((p) => [p.pieceKey, p]));
  const out: Side[] = [];
  const handOf = (parts: Edge[]) => {
    const hs = new Set(parts.map((e) => geom.get(e.pieceKey)?.hand ?? null));
    hs.delete(null);
    return hs.size === 1 ? [...hs][0] : null;
  };
  const partId = (x: BoundaryPart) =>
    x.range ? `${x.edge.id}@${Math.round(x.range[0])}-${Math.round(x.range[1])}` : x.edge.id;
  const emit = (
    parts: BoundaryPart[],
    closed: boolean,
    turnStart: number,
    turnEnd: number,
    ends?: Side['ends'],
  ) => {
    if (parts.some((x) => !free(x.edge.id, !!x.range))) return;
    const notchesMm: number[] = [];
    let at = 0;
    for (const x of parts) {
      for (const d of x.edge.notchesMm) notchesMm.push(at + d);
      at += x.edge.lenMm;
    }
    if (at < SKELETON.minSeamMm) return;
    const partRange: Record<EdgeId, [number, number]> = {};
    for (const x of parts) if (x.range) partRange[x.edge.id] = x.range;
    out.push({
      id: parts.map(partId).join('|'),
      parts: parts.map((x) => x.edge),
      pieces: new Set(parts.map((x) => x.edge.pieceKey)),
      lenMm: at,
      notchesMm,
      closed,
      turnStart,
      turnEnd,
      hand: handOf(parts.map((x) => x.edge)),
      ...(Object.keys(partRange).length ? { partRange } : {}),
      ...(ends ? { ends } : {}),
    });
  };
  // The free whole edge before / after a part on its piece's ring (the piece's own neighbour).
  const neighbour = (x: BoundaryPart, dir: -1 | 1): Edge | undefined => {
    const p = geom.get(x.edge.pieceKey);
    if (!p || p.edges.length < 2) return undefined;
    const i = p.edges.findIndex((e) => e.id === x.edge.id);
    if (i < 0) return undefined;
    const e = p.edges[(i + dir + p.edges.length) % p.edges.length];
    // (a remainder's far end is the seam's inner end, not a corner of the piece)
    if (x.range && (dir < 0 ? x.range[0] > 0.5 : x.range[1] < p.edges[i].lenMm - 0.5))
      return undefined;
    return e.kind === 'edge' && free(e.id, false) ? e : undefined;
  };
  // The boundary's runs and every contiguous sub-run of their parts (closed runs wrap). A run inside
  // one piece (two edges across a soft corner) is the pool's chain, not a composite side: its
  // parts are read as singles below.
  const runs = boundaryRuns(pieces, seams, maxKinkDeg, secondPly);
  if (debugRuns)
    for (const r of runs)
      if (r.parts.length > 1 || r.parts.some((x) => x.range))
        debugRuns(
          `${r.closed ? 'loop' : 'run'} ${r.parts.map((x) => `${partId(x)} ${Math.round(x.edge.lenMm)}`).join(' | ')} · kinks ${r.kinks.map((k) => k.toFixed(0)).join(',')} · free ${r.parts.map((x) => (free(x.edge.id, !!x.range) ? 'y' : 'n')).join('')}`,
        );
  const remainders: BoundaryPart[] = [];
  for (const r of runs) {
    for (const x of r.parts) if (x.range) remainders.push(x);
    if (new Set(r.parts.map((x) => x.edge.pieceKey)).size < 2) continue;
    const n = Math.min(r.parts.length, MAX_PARTS);
    if (r.closed) emit(r.parts, true, 0, 0);
    for (let i = 0; i < r.parts.length; i++)
      for (let len = 1; len <= n; len++) {
        if (!r.closed && i + len > r.parts.length) break;
        if (r.closed && len >= r.parts.length) break;
        const parts = Array.from({ length: len }, (_, k) => r.parts[(i + k) % r.parts.length]);
        // The run's own ends are junctions we know; a sub-run's cut end is a seam's end — the
        // boundary turn there is the piece's corner (≈ 0 at the inner end of a partial seam on
        // its long edge). The whole run knows what the boundary goes on with past its ends.
        const whole = !r.closed && len === r.parts.length;
        const before = whole ? neighbour(parts[0], -1) : undefined;
        const after = whole ? neighbour(parts[parts.length - 1], 1) : undefined;
        emit(
          parts,
          false,
          parts[0].turnS,
          parts[parts.length - 1].turnE,
          before && after && before !== after ? { before, after } : undefined,
        );
      }
  }
  const seen = new Set(out.map((s) => s.id));
  // The free remainder of a partially sewn edge, alone.
  for (const x of remainders) {
    if (seen.has(partId(x)) || secondPly(x.edge.pieceKey)) continue;
    seen.add(partId(x));
    emit([x], false, x.turnS, x.turnE);
  }
  // A single edge whose two neighbours are sewn to each other (the sleeve's underarm, a self seam)
  // is a closed loop — the cap; it meets the armhole loop.
  const selfSeams = seams.filter((c) => pkOf(c.a) === pkOf(c.b) && !c.aParts && !c.bParts);
  const cappedBy = (p: PieceGeom, e: Edge) =>
    selfSeams.some((c) => {
      if (pkOf(c.a) !== p.pieceKey) return false;
      const ea = p.edges.find((x) => x.id === c.a);
      const eb = p.edges.find((x) => x.id === c.b);
      if (!ea || !eb) return false;
      const touches = (x: Edge) => x.e === e.s || x.s === e.e;
      return touches(ea) && touches(eb);
    });
  // Single free edges (also those of a one-piece input and inside no run), and their inner
  // stretches between a notch near each end.
  for (const p of pieces) {
    if (secondPly(p.pieceKey)) continue;
    // A placket's sewing edge is the one its drills (buttons, buttonholes) are measured from; its
    // other long edge, unmarked, is the fold.
    const marked = new Set(
      (p.marks ?? [])
        .filter((m) => (m.kind === 'drill' || m.kind === 'buttonhole') && m.nearEdge)
        .map((m) => m.nearEdge!.edge),
    );
    const isPlacket = roleOf(p) === 'placket';
    for (const e of p.edges) {
      if (e.kind !== 'edge' || !free(e.id, false)) continue;
      if (
        isPlacket &&
        !marked.has(e.id) &&
        p.edges.some(
          (x) => x !== e && marked.has(x.id) && Math.abs(x.lenMm - e.lenMm) <= 0.02 * e.lenMm,
        )
      )
        continue;
      if (!seen.has(e.id)) {
        const capped = cappedBy(p, e);
        emit(
          [{ edge: e, turnS: cornerTurn(p, e.s), turnE: cornerTurn(p, e.e) }],
          capped,
          capped ? 0 : cornerTurn(p, e.s),
          capped ? 0 : cornerTurn(p, e.e),
        );
      }
      const heads = e.notchesMm.filter((d) => d <= END_NOTCH_MM);
      const tails = e.notchesMm.filter((d) => d >= e.lenMm - END_NOTCH_MM);
      for (const h of heads)
        for (const t of tails) {
          if (t - h < SKELETON.minSeamMm) continue;
          out.push({
            id: `${e.id}@${Math.round(h)}-${Math.round(t)}`,
            parts: [e],
            pieces: new Set([p.pieceKey]),
            lenMm: t - h,
            notchesMm: e.notchesMm.filter((d) => d > h && d < t).map((d) => d - h),
            closed: false,
            turnStart: 0,
            turnEnd: 0,
            hand: p.hand,
            range: [h, t],
          });
        }
    }
  }
  return out;
}

/** Notch agreement of two open sides read face up (b from its end): 1 / 0.7 / 0.3 / 0; 0.5 = none. */
function notches(
  a: Side,
  b: Side,
): { ns: number; matched: number; said: 0 | 0.3 | 0.7 | 1 | null } {
  const na = a.notchesMm;
  const nb = b.notchesMm.map((d) => b.lenMm - d).reverse();
  if (na.length === 0 && nb.length === 0) return { ns: 0.5, matched: 0, said: null };
  if (na.length === 0 || nb.length === 0) return { ns: 0.4, matched: 0, said: 0 };
  // Scale b onto a (an eased side): positions as shares, errors in a's mm.
  const scale = a.lenMm / b.lenMm;
  const hit = (d: number) => nb.some((x) => Math.abs(x * scale - d) <= 8);
  const matched = na.filter(hit).length;
  if (na.length === nb.length) {
    const err = Math.max(...na.map((d, i) => Math.abs(d - nb[i] * scale)));
    const l = ladder(err);
    if (l >= 0.7) return { ns: l, matched: na.length, said: l };
  }
  // The end notches agree (ease spread over the middle).
  const ends = ladder(
    Math.max(
      Math.abs(na[0] - nb[0] * scale),
      Math.abs(a.lenMm - na[na.length - 1] - (b.lenMm - b.notchesMm[0]) * scale),
    ),
  );
  if (ends >= 0.7) return { ns: 0.7, matched: Math.max(matched, 2), said: 0.7 };
  const share = matched / Math.max(na.length, nb.length);
  const said: 0 | 0.3 | 0.7 | 1 = share >= 0.66 ? 0.7 : share > 0 ? 0.3 : 0;
  return { ns: said, matched, said };
}

function scoreSides(
  a: Side,
  b: Side,
  tube: boolean,
  label: string,
  geom: ReadonlyMap<string, PieceGeom>,
  /** The open side is an opening that closes at a seam the solve did not take (words), read as a loop. */
  closesAt?: string,
): Comp | null {
  if (a.closed !== b.closed && !closesAt) return null;
  const loop = a.closed || b.closed;
  for (const k of a.pieces) if (b.pieces.has(k)) return null;
  if (a.hand && b.hand && a.hand !== b.hand) return null;
  // Twins (the two plies of a stand, the left and the right front) meet as the pool's pairs, never
  // as a composite; an inner stretch (a stand between its CF notches) only onto a run over pieces.
  for (const k of a.pieces) if (geom.get(k)?.twinOf.some((t) => b.pieces.has(t.key))) return null;
  if (a.range && b.range) return null;
  // (an inner stretch onto a run with a remainder would carry both `range` and `partRange` —
  // readers take `range` first and would cut the run wrong)
  if ((a.range && b.partRange) || (b.range && a.partRange)) return null;
  if ((a.range && b.parts.length < 2) || (b.range && a.parts.length < 2)) return null;
  const dLenMm = Math.abs(a.lenMm - b.lenMm);
  const relLen = dLenMm / Math.max(a.lenMm, b.lenMm);
  if (relLen > SKELETON.lenRelEased) return null;
  const exact = dLenMm <= SKELETON.lenAbsMm || relLen <= SKELETON.lenRel;
  const lenScore = exact ? 1 : 0.5;
  let ns: number;
  let said: SeamEvidence['notchScore'];
  let matched = 0;
  let endsTerm = 1;
  if (loop) {
    // A loop has no start to read notches from: equal counts are all a loop can say — and a cap's
    // extra marks (shoulder point, front / back) are no evidence against its armhole.
    said =
      a.notchesMm.length + b.notchesMm.length === 0
        ? null
        : a.notchesMm.length === b.notchesMm.length
          ? 0.7
          : 0.3;
    ns = said === 0.3 && tube ? 0.5 : said ?? 0.5;
  } else {
    const n = notches(a, b);
    ns = n.ns;
    said = n.said;
    matched = n.matched;
    if (!a.range && !b.range) {
      const ia0 = 180 - a.turnStart;
      const ia1 = 180 - a.turnEnd;
      const ib0 = 180 - b.turnStart;
      const ib1 = 180 - b.turnEnd;
      const err = Math.abs(ia0 + ib1 - 180) + Math.abs(ia1 + ib0 - 180);
      endsTerm = Math.max(0, 1 - err / ENDS_SCALE_DEG);
    }
  }
  // An eased pair without agreeing notches is a length coincidence — unless the order says a tube
  // meets the body here (a cap is eased into its armhole, its notches only partly met).
  if (!exact && ns < 0.7 && !tube) return null;
  // A tube onto the body: both sides carry notches and at least one agrees (a stand's SNP notches
  // on the yoke's; a cap's on the armhole's), or both are closed loops — a stand's 412 fits a run
  // over the back's hem by length alone (12.10 corpus, card 5).
  if (tube && !loop && (said === null || said === 0)) return null;
  const chain = (a.parts.length > 1 ? CHAIN : 0) + (b.parts.length > 1 ? CHAIN : 0);
  const score = 0.45 * lenScore + 0.45 * ns + 0.1 * endsTerm - chain + (tube ? TUBE_JOIN_BONUS : 0);
  const sideWords = (s: Side) =>
    `${s.parts.length} part${s.parts.length > 1 ? 's' : ''}${s.range ? ` (${Math.round(s.range[0])} … ${Math.round(s.range[1])} of ${Math.round(s.parts[0].lenMm)})` : ''}`;
  return {
    a,
    b,
    score,
    ia: -1,
    ib: -1,
    evidence: {
      dLenMm,
      relLen,
      notchScore: said,
      curvature: 'flat',
      hand: a.hand && b.hand ? 'same' : 'neutral',
      twin: 'none',
      self: false,
      rule: `composite ${loop ? 'loop' : 'edge'} of «${label}»: ${sideWords(a)} ↔ ${sideWords(b)}, ${Math.round(a.lenMm)} ${exact ? '=' : 'vs'} ${Math.round(b.lenMm)} mm${exact ? '' : ' (eased)'}${matched ? `, ${matched} notch${matched > 1 ? 'es' : ''} agree` : ''}${tube ? ' — a tube / ring onto the body' : ''}${closesAt ? ` · the opening closes at ${closesAt}, a seam the solve did not take` : ''}`,
      aLenMm: a.lenMm,
      bLenMm: b.lenMm,
      notchesMatched: matched,
    },
  };
}

const longest = (s: Side) => s.parts.reduce((m, e) => (e.lenMm > m.lenMm ? e : m)).id;
/** Long side / short side of the piece's box. */
export function aspectOf(p: PieceGeom): number {
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
  const w = x1 - x0;
  const h = y1 - y0;
  return Math.max(w, h) / Math.max(1e-9, Math.min(w, h));
}

/**
 * Composite seams for the operations the pair solve left apart (and tube-onto-body operations),
 * in the order's sequence, each taken onto the board. Returns them as SeamCandidates with the
 * operation they close, and words for the report.
 */
export function compositeSeams(
  P: CandidatePool,
  ops: readonly Operation[],
  perOp: readonly OpSolution[],
  /** Every seam on the board so far: forced, chosen, closures (edges they hold are not free). */
  seams: readonly SeamCandidate[],
  board: Board,
  /** Pieces never sewn as shell here (hardware, interfacing, surface pieces). */
  skip: ReadonlySet<string>,
  lining: ReadonlySet<string>,
): { seams: SeamCandidate[]; words: string[]; joinedOps: Set<string> } {
  const geom = new Map(P.pieces.map((p) => [p.pieceKey, p]));
  /** Operations whose inputs are all one after the composites (pairs, forced seams and these). */
  const joinedOps = new Set<string>();
  const debug = typeof process !== 'undefined' && !!process.env?.ASSIGN_DEBUG;
  const all: SeamCandidate[] = [...seams];
  const added: SeamCandidate[] = [];
  const words: string[] = [];
  const taken = new Set<EdgeId>();
  // (the free remainder of a partially sewn edge: the board holds the edge for the partial; the
  // remainder is free until a composite takes it)
  const free = (id: EdgeId, remainder = false) =>
    !taken.has(id) && (remainder || board.sandwichFree(id, true));
  const sideFree = (s: Side) => s.parts.every((e) => free(e.id, !!s.partRange?.[e.id]));
  const sidesFree = (c: Comp) => sideFree(c.a) && sideFree(c.b);
  // A seam reported on the second ply of a pair is read on the first (the plies are one piece for
  // the boundary; the second ply's edges are never free edges of their own).
  const onFirstPly = (c: SeamCandidate): SeamCandidate => {
    const map = (id: EdgeId) => (board.isSecondPly(pkOf(id)) ? board.plyMateOf(id) ?? id : id);
    // Atomic edges (a chain `P#3+4` is two): remapped one by one; a side on the second ply becomes
    // a parts list on the first (the longest part named as the anchor).
    const side = (s: 'a' | 'b') => {
      const ids = sideIds(c, s).flatMap(edgeIdsOf);
      const mapped = ids.map(map);
      const moved = mapped.some((x, i) => x !== ids[i]);
      return { ids, mapped, moved };
    };
    const A = side('a');
    const B = side('b');
    if (!A.moved && !B.moved) return c;
    const lenOf = (id: EdgeId) => geom.get(pkOf(id))?.edges.find((e) => e.id === id)?.lenMm ?? 0;
    const longest = (ids: EdgeId[]) => ids.reduce((m, x) => (lenOf(x) > lenOf(m) ? x : m));
    return {
      ...c,
      a: A.moved ? longest(A.mapped) : c.a,
      b: B.moved ? longest(B.mapped) : c.b,
      ...(A.moved && A.mapped.length > 1 ? { aParts: A.mapped } : {}),
      ...(B.moved && B.mapped.length > 1 ? { bParts: B.mapped } : {}),
      ...(c.partRange
        ? {
            partRange: Object.fromEntries(
              Object.entries(c.partRange).map(([id, r]) => {
                const i = [...A.ids, ...B.ids].indexOf(id);
                return [i >= 0 ? [...A.mapped, ...B.mapped][i] : id, r];
              }),
            ),
          }
        : {}),
    };
  };
  const sideIds = (c: SeamCandidate, s: 'a' | 'b') =>
    s === 'a' ? c.aParts ?? [c.a] : c.bParts ?? [c.b];
  void ops;
  for (const S of perOp) {
    const op = S.op;
    const tube =
      op.classes.some((c) => TUBE_CLASSES.has(c)) && op.classes.some((c) => !TUBE_CLASSES.has(c));
    if (S.components <= 1 && !tube) continue;
    if (op.kind !== 'order') continue;
    // The lining onto the shell: its edges meet the facings, not the shell's boundary.
    const isLining = op.inputs.map((X) => X.length > 0 && X.every((k) => lining.has(k)));
    if (isLining.some(Boolean) && isLining.some((x) => !x)) continue;
    // Sides per input: the input's pieces glued by the seams inside it.
    const sides: Side[][] = op.inputs.map((X) => {
      const keys = new Set(X.filter((k) => !skip.has(k)));
      const pieces = [...keys].map((k) => geom.get(k)).filter((p): p is PieceGeom => !!p);
      if (!pieces.length) return [];
      // (a closure holds its edges but glues nothing: the neckline does not run on over the
      // front opening — the stand sits on the fronts and the yoke, not on the plackets' tops)
      const inside = all
        .filter((c) => c.kind !== 'closure-not-seam')
        // (nor over a placket: the front opening is sewn as the plackets' seams, and a neckline
        // run that crossed them would read the collar onto the two fronts' CF ends — card 16)
        .filter((c) => ![c.a, c.b].some((id) => roleOf(geom.get(pkOf(id))!) === 'placket'))
        .map(onFirstPly)
        .filter((c) => [...sideIds(c, 'a'), ...sideIds(c, 'b')].every((id) => keys.has(pkOf(id))));
      return sidesOf(
        pieces,
        inside,
        free,
        (k) => board.isSecondPly(k),
        tube ? OPENING_KINK_DEG : SOFT_CORNER_DEG,
        debug
          ? (line) =>
              words.push(
                `debug boundary «${op.label}» input ${X === op.inputs[0] ? 0 : op.inputs.indexOf(X)}: ${line}`,
              )
          : undefined,
      );
    });
    const nm = (id: string) => {
      const at = id.lastIndexOf('#');
      return `${geom.get(id.slice(0, at))?.name ?? id.slice(0, at)}${id.slice(at)}`;
    };
    if (debug)
      words.push(
        `debug composites «${op.label}» inside: ${op.inputs
          .map((X, i) => {
            const keys = new Set(X);
            return `${i}: ${all
              .filter((c) => c.kind !== 'closure-not-seam')
              .map(onFirstPly)
              .filter((c) =>
                [...sideIds(c, 'a'), ...sideIds(c, 'b')].every((id) => keys.has(pkOf(id))),
              )
              .map((c) => `${nm(c.a)}~${nm(c.b)}`)
              .join(' ')}`;
          })
          .join(' | ')}`,
      );
    if (debug)
      words.push(
        `debug composites «${op.label}»: ${sides
          .map(
            (S, i) =>
              `input ${i} (${op.classes[i]}): ${
                S.filter((x) => x.parts.length > 1 || x.closed)
                  .map((x) => `${x.id} ${Math.round(x.lenMm)}${x.closed ? ' loop' : ''}`)
                  .join('; ') || 'no run'
              }`,
          )
          .join(' | ')}`,
      );
    // (by length: a yoke's armhole edge runs down the whole side of the small yoke, the rest of
    // the armhole sits high on the panels)
    const upper = (x: Side) => {
      let t = 0;
      for (const e of x.parts) {
        const p = geom.get(e.pieceKey);
        t += (p ? yMidOf(p, e) : 0.5) * e.lenMm;
      }
      return t / Math.max(1, x.lenMm) >= 0.45;
    };
    // A hem: every part a level edge at the bottom of its piece. A hem is finished, not sewn onto
    // another piece's edge — unless a band / ring takes it (a hem band, a tube operation).
    const hem = (x: Side) =>
      !x.closed &&
      x.parts.every((e) => {
        const p = geom.get(e.pieceKey);
        return level(e) && (!p || yMidOf(p, e) < 0.25);
      });
    // A side of one part on a strip piece (a hem facing, a band: its box STRIP_ASPECT times longer
    // than wide) — what a hem is sewn to.
    const strip = (x: Side) => {
      if (x.parts.length !== 1) return false;
      const p = geom.get(x.parts[0].pieceKey);
      return !!p && aspectOf(p) >= STRIP_ASPECT;
    };
    // The pool's own reading of two edges: where an opening's two ends meet.
    const poolPair = (u: Edge, v: Edge): PoolCand | undefined =>
      P.all.find(
        (c) =>
          c.regular &&
          !c.dropped &&
          c.kind === 'edge' &&
          c.score >= CLOSES_AT_FLOOR &&
          ((c.u.id === u.id && c.v.id === v.id) || (c.u.id === v.id && c.v.id === u.id)),
      );
    // The operation's inputs as the pair solve (and the forced seams) left them: a composite joins
    // two inputs still APART — never a second seam between inputs already joined.
    const root = op.inputs.map((_, i) => i);
    const find = (i: number): number => {
      while (root[i] !== i) i = root[i];
      return i;
    };
    const inputOf = new Map<string, number>();
    op.inputs.forEach((X, i) => X.forEach((k) => inputOf.set(k, i)));
    for (const c of all) {
      if (c.kind === 'closure-not-seam') continue;
      const ins = [
        ...new Set([...sideIds(c, 'a'), ...sideIds(c, 'b')].map((id) => inputOf.get(pkOf(id)))),
      ];
      if (ins.length === 2 && ins[0] !== undefined && ins[1] !== undefined)
        root[find(ins[0])] = find(ins[1]);
    }
    const cands: Comp[] = [];
    for (let i = 0; i < sides.length; i++)
      for (let j = i + 1; j < sides.length; j++) {
        if (find(i) === find(j)) continue;
        // (a boundary of many small pieces: the sides' cross product is bounded, said in words)
        if (sides[i].length * sides[j].length > MAX_PAIRS) {
          words.push(
            `«${op.label}»: ${sides[i].length} × ${sides[j].length} composite sides between inputs ${i} and ${j} — too many to compare, left to the doll`,
          );
          continue;
        }
        // A tube input meets the body along ONE composite edge: its own side is a single edge or a
        // closed cap, never a stretch of several of its edges.
        const tubeI = TUBE_CLASSES.has(op.classes[i]);
        const tubeJ = TUBE_CLASSES.has(op.classes[j]);
        // …and that edge is the longest free edge of ITS PIECE (a cap, a stand's neck edge) or an
        // inner stretch of it — a wrist, a collar end are not where a tube meets the body.
        const longestFree = (S: Side[]) => {
          const m = new Map<string, number>();
          for (const x of S)
            if (x.parts.length === 1 && !x.range && !x.partRange)
              m.set(x.parts[0].pieceKey, Math.max(m.get(x.parts[0].pieceKey) ?? 0, x.lenMm));
          return m;
        };
        // …or one of its closed loops (a two-piece sleeve's cap: both sleeve seams sewn, the cap
        // is a loop of two parts — the wrist is a loop too, and a closed collar's neck loop is the
        // SHORTER of its two: the body side, the lengths and the notches tell them apart).
        const tubeEdge = (x: Side, L: Map<string, number>) =>
          x.closed
            ? true
            : x.parts.length === 1 &&
              !x.partRange &&
              x.parts[0].lenMm >= 0.999 * (L.get(x.parts[0].pieceKey) ?? 0);
        const Li = longestFree(sides[i]);
        const Lj = longestFree(sides[j]);
        const tubeOnBody = tube && tubeI !== tubeJ;
        for (const a of sides[i])
          for (const b of sides[j]) {
            if (
              (tubeI && a.parts.length > 1 && !a.closed) ||
              (tubeJ && b.parts.length > 1 && !b.closed)
            )
              continue;
            if ((tubeI && !tubeJ && !tubeEdge(a, Li)) || (tubeJ && !tubeI && !tubeEdge(b, Lj)))
              continue;
            // A tube meets the body along a long edge (an armhole, a neckline) — not along the
            // ends of two small pieces glued into a ring — and at the TOP of the body's pieces
            // (pieces are drawn upright: an armhole, a neckline, a waist sit in the upper half; a
            // hem does not).
            if (tubeOnBody && Math.min(a.lenMm, b.lenMm) < TUBE_MIN_MM) continue;
            if (tubeOnBody && !upper(tubeI ? b : a)) continue;
            // A hem takes no composite but a band's (12.10 corpus, card 8: a chest piece's curve
            // 362 onto the side panel's hem + the back panel's hem, 361).
            if (!tube && ((hem(a) && !strip(b)) || (hem(b) && !strip(a)))) continue;
            // A pair of single whole edges is the pool's business, not a composite.
            if (a.parts.length === 1 && b.parts.length === 1 && !a.range && !b.range) continue;
            // A closed tube (a cap with both sleeve seams sewn) onto an OPEN run of the body: only
            // when the run is the whole opening and its two ends meet at a seam the pool scored
            // between the body's edges past them (a shoulder the solve left out — card 8: 0.545).
            let closesAt: string | undefined;
            if (tubeOnBody && a.closed !== b.closed) {
              const [tubeSide, body] = tubeI ? [a, b] : [b, a];
              if (!tubeSide.closed || body.closed || !body.ends) continue;
              const q = poolPair(body.ends.before, body.ends.after);
              if (!q) continue;
              closesAt = `${q.u.id} ↔ ${q.v.id} (${q.score.toFixed(2)})`;
            }
            const c = scoreSides(a, b, tubeOnBody, op.label, geom, closesAt);
            if (!c) continue;
            c.ia = i;
            c.ib = j;
            if (tubeOnBody) c.body = tubeI ? 1 : 0;
            cands.push(c);
          }
      }
    const accept = tube ? COMPOSITE_TUBE_ACCEPT : SKELETON.accept;
    cands.sort((x, y) => y.score - x.score || (x.a.id + x.b.id < y.a.id + y.b.id ? -1 : 1));
    if (debug)
      words.push(
        `debug composites «${op.label}»: singles ${sides
          .map(
            (S, i) =>
              `${i}: ${S.filter((x) => x.parts.length === 1 && !x.closed)
                .map((x) => `${x.id} ${Math.round(x.lenMm)}`)
                .join(', ')}`,
          )
          .join(' | ')} · top ${cands
          .slice(0, 6)
          .map((c) => `${c.a.id} ↔ ${c.b.id} ${c.score.toFixed(3)}`)
          .join('; ')}`,
      );
    for (const c of cands) {
      if (Math.round(c.score * 1000) / 1000 < accept) break;
      if (find(c.ia) === find(c.ib)) continue;
      if (!sidesFree(c)) continue;
      // A near rival for the same side is said; the best stands (as the pool's alternatives).
      const rival = cands.find(
        (q) =>
          q !== c &&
          Math.abs(q.score - c.score) <= SKELETON.ambiguity &&
          (q.a.id === c.a.id || q.b.id === c.b.id || q.a.id === c.b.id || q.b.id === c.a.id) &&
          sidesFree(q),
      );
      // The anchor of the body side of a tube composite: the part on the body piece the board sews
      // most (the piece the opening is built round — a back panel, not a front the cap would
      // otherwise seem to hang from); else the side's longest part.
      const sewnIn = (k: string) =>
        all.filter((s) => [...sideIds(s, 'a'), ...sideIds(s, 'b')].some((id) => pkOf(id) === k))
          .length;
      const anchorOf = (s: Side, body: boolean) =>
        body
          ? s.parts.reduce((m, e) =>
              sewnIn(e.pieceKey) > sewnIn(m.pieceKey) ||
              (sewnIn(e.pieceKey) === sewnIn(m.pieceKey) &&
                (e.lenMm > m.lenMm || (e.lenMm === m.lenMm && e.id < m.id)))
                ? e
                : m,
            ).id
          : longest(s);
      const seam: SeamCandidate = {
        a: anchorOf(c.a, c.body === 0),
        b: anchorOf(c.b, c.body === 1),
        ...(c.a.parts.length > 1 ? { aParts: c.a.parts.map((e) => e.id) } : {}),
        ...(c.b.parts.length > 1 ? { bParts: c.b.parts.map((e) => e.id) } : {}),
        ...(c.a.range || c.b.range
          ? { range: { a: c.a.range ?? [0, c.a.lenMm], b: c.b.range ?? [0, c.b.lenMm] } }
          : {}),
        ...(c.a.partRange || c.b.partRange
          ? { partRange: { ...(c.a.partRange ?? {}), ...(c.b.partRange ?? {}) } }
          : {}),
        score: Math.round(c.score * 1000) / 1000,
        kind: 'composite',
        evidence: {
          ...c.evidence,
          rule: `${c.evidence.rule}${rival ? ` · a near reading: ${rival.a.id} ↔ ${rival.b.id} (${rival.score.toFixed(2)})` : ''}`,
        },
        operationId: op.id,
        assignment: {
          margin: rival ? 0 : Math.round(100 * (c.score - accept)),
          confidence: rival ? 'ambiguous' : c.score - accept >= 0.15 ? 'sure' : 'likely',
        },
      };
      for (const e of [...c.a.parts, ...c.b.parts]) taken.add(e.id);
      root[find(c.ia)] = find(c.ib);
      all.push(seam);
      added.push(seam);
      words.push(`«${op.label}»: ${seam.a} ↔ ${seam.b} read as a composite (${c.evidence.rule})`);
    }
    if (new Set(op.inputs.map((_, i) => find(i))).size === 1) joinedOps.add(op.id);
  }
  return { seams: added, words, joinedOps };
}
