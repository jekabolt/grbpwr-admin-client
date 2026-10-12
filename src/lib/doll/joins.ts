// Declared joins → missing seams (P2b §1). The technologist's assembly order (or the skeleton's
// own units when the card has none) says WHICH pieces / units are sewn together; the seam graph
// says which edges. When a declared join has no seam in the graph, the doll searches edge pairs
// only between the two declared sides — free edges, runs of neighbouring free edges, partial
// lengths — and proposes the best one by length, notches, curvature and hand. Such a seam is
// marked «proposed (from the technologist's order)»; it is never a graph seam.
//
// Joins between a tube or ring and the body (sleeve ↔ body, collar ↔ neckline, cuff ↔ sleeve,
// waistband ↔ top) are left to the doll's free-loop proposals: those edges are composites across
// pieces (an armhole is half front, half back), which a pair search would read wrong.

import { handSideOn, sameWayUp, xSideOf } from 'lib/assembly-skeleton/geometry/plies';
import { readName } from 'lib/assembly-skeleton/skeleton';

import { roleOfPiece } from './groups';
import type {
  Edge,
  EdgeId,
  PieceGeom,
  SeamCandidate,
  SeamGraph,
} from 'lib/assembly-skeleton/types';

/** One MACHINE operation of the order: each part is the set of pieces of one input. */
export type DeclaredJoin = { label: string; parts: string[][] };

/** An operation as the card stores it: inputs are piece keys or earlier outputs. */
export type DeclaredOp = { inputs: string[]; output: string; type: string };

/**
 * Operations → joins. `pieceOf` maps an input key to the graph's piece key (null when the key is a
 * unit or a piece the pattern has not got). Units accumulate their leaf pieces in order.
 */
export function joinsFromOps(
  ops: DeclaredOp[],
  pieceOf: (key: string) => string | null,
): DeclaredJoin[] {
  const units = new Map<string, string[]>();
  const leaves = (k: string): string[] => {
    const p = pieceOf(k);
    if (p) return [p];
    return units.get(k) ?? [];
  };
  const out: DeclaredJoin[] = [];
  for (const op of ops) {
    if (op.type !== 'MACHINE' || !op.output) continue;
    const parts = op.inputs.map(leaves);
    units.set(op.output, [...new Set([...(units.get(op.output) ?? []), ...parts.flat()])]);
    const present = parts.filter((p) => p.length);
    if (present.length >= 2) out.push({ label: op.output, parts: present });
  }
  return out;
}

/** Pieces the order sets as hardware (an elastic, a tape): never a shell seam. */
export type DeclaredHardware = { label: string; pieces: string[] };

/**
 * HARDWARE_SET operations → their pieces (inputs that are pieces, or earlier units' leaf pieces).
 * SS26-011: «BLT + BLT_1 → rubber» — the elastic strips inside the waistband, not panels.
 */
export function hardwareFromOps(
  ops: DeclaredOp[],
  pieceOf: (key: string) => string | null,
): DeclaredHardware[] {
  const units = new Map<string, string[]>();
  const leaves = (k: string): string[] => {
    const p = pieceOf(k);
    return p ? [p] : units.get(k) ?? [];
  };
  const out: DeclaredHardware[] = [];
  for (const op of ops) {
    if (!op.output) continue;
    const pieces = [...new Set(op.inputs.flatMap(leaves))];
    if (op.type === 'MACHINE')
      units.set(op.output, [...new Set([...(units.get(op.output) ?? []), ...pieces])]);
    else if (op.type === 'HARDWARE_SET' && pieces.length) out.push({ label: op.output, pieces });
  }
  return out;
}

/** Coarse wrap class of a piece from its name's role (roles.json). */
const classOf = (
  g: PieceGeom,
  graph?: SeamGraph,
): 'body' | 'sleeve' | 'neck' | 'cuff' | 'band' | 'skip' | null => {
  const r = roleOfPiece(g, graph);
  if (!r) return null;
  if (['front', 'back', 'side', 'yoke', 'placket', 'facing', 'fly', 'skirt'].includes(r))
    return 'body';
  if (r === 'sleeve') return 'sleeve';
  if (['collar', 'stand', 'rib', 'hood'].includes(r)) return 'neck';
  if (r === 'cuff') return 'cuff';
  if (r === 'waistband' || r === 'hemband') return 'band';
  if (r === 'pocket' || r === 'loop') return 'skip';
  return null;
};

/** A surface piece (a pocket, a loop): sewn onto a panel's face, never a panel of the wrap. */
export const isSurfacePiece = (g: PieceGeom, graph?: SeamGraph) => classOf(g, graph) === 'skip';

type Run = {
  piece: PieceGeom;
  edges: Edge[];
  id: EdgeId;
  len: number;
  notches: number;
  turn: number;
  dx: number;
  dy: number;
  yMid: number;
  /** Where across its piece the run's middle lies (0 = the drawing's left, 1 = right). */
  xMid: number;
  /** Arc positions (mm from the run's start) where the run turns a sharp corner (multi mode). */
  cornersAt: number[];
  /**
   * Multi mode: a run whose first / last edge is taken only in part — cut at a notch (a strip round
   * a panel's lower U, the flap above the notch left free). The sewn stretch, mm along that EDGE.
   */
  partRange?: Record<EdgeId, [number, number]>;
};

/**
 * A straight strip (a gusset, a binding): at least four times as long as wide, its two long edges
 * straight. Its two long edges go to two DIFFERENT pieces — a strip sewn by both long edges to one
 * piece would be a tube on it.
 */
export const stripLongEdges = (g: PieceGeom): [Edge, Edge] | null => {
  const { w, h } = bboxOf(g);
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (short <= 0 || long < 4 * short) return null;
  const straight = (e: Edge) => {
    const p = e.pts[0];
    const q = e.pts[e.pts.length - 1];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) / Math.max(1, e.lenMm) >= 0.95;
  };
  const longs = g.edges.filter((e) => e.kind === 'edge' && e.lenMm >= 0.8 * long && straight(e));
  return longs.length === 2 ? [longs[0], longs[1]] : null;
};

export type JoinProposal = { seam: SeamCandidate; join: string; note: string };
/** A part of a declared join, by the join's label and the part's pieces. */
export type JoinPart = { join: string; part: string[] };

/**
 * Two parts of one operation that are mirror units of each other: the same number of pieces, each
 * piece of X with a twin (mirror or identical) in Y, or a left and a right piece of one shape. Left
 * and right units are sewn to each other only on their centre line — in a two-part operation; in
 * an operation with a third part they are both sewn onto that part, never to each other (SS26-009's
 * two plackets end to end, SS26-008's left chest piece onto the right one).
 */
export function twinUnits(
  X: readonly string[],
  Y: readonly string[],
  geomOf: ReadonlyMap<string, PieceGeom>,
): boolean {
  if (X.length !== Y.length || !X.length) return false;
  const handOf = (g: PieceGeom) => g.hand ?? readName(g.name).hand;
  const taken = new Set<string>();
  for (const a of X) {
    const ga = geomOf.get(a);
    if (!ga) return false;
    const mate = Y.find((b) => {
      if (taken.has(b) || b === a) return false;
      const gb = geomOf.get(b);
      if (!gb) return false;
      if (ga.twinOf.some((t) => t.key === b)) return true;
      const ha = handOf(ga);
      const hb = handOf(gb);
      return (
        !!ha &&
        !!hb &&
        ha !== hb &&
        Math.abs(ga.perimMm - gb.perimMm) < 0.03 * ga.perimMm &&
        Math.abs(Math.abs(ga.areaMm2) - Math.abs(gb.areaMm2)) < 0.05 * Math.abs(ga.areaMm2)
      );
    });
    if (!mate) return false;
    taken.add(mate);
  }
  return true;
}

const bboxOf = (g: PieceGeom) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of g.rs) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { w: x1 - x0, h: y1 - y0 };
};
/**
 * The short end of a strip (a placket, a belt, a band): a single edge across a piece at least
 * three times as long as wide, no longer than the strip's width. Two strip ends are never sewn end
 * to end by the order's search (a waistband's halves are the doll's own proposal, by their notches).
 */
export const isStripEnd = (g: PieceGeom, e: Edge) => {
  const { w, h } = bboxOf(g);
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (short <= 0 || long < 3 * short) return false;
  const p = e.pts[0];
  const q = e.pts[e.pts.length - 1];
  const dx = Math.abs(q[0] - p[0]);
  const dy = Math.abs(q[1] - p[1]);
  // The end runs across the strip: its chord along the short axis.
  const across = w >= h ? dy > dx : dx > dy;
  return across && e.lenMm <= 1.25 * short;
};
const stripEnd = (r: Run) => r.edges.length === 1 && isStripEnd(r.piece, r.edges[0]);

export function completeFromJoins(
  graph: SeamGraph,
  joins0: DeclaredJoin[],
  /** Pieces never searched (lining at level 0, interfacing). */
  exclude: Set<string> = new Set(),
  /** Graph seams (`a~b`) the doll will not sew (suspect): their edges count as free. */
  ignore: Set<string> = new Set(),
  /** Trousers: each leg is joined on its own (left front to left back), legs meet only at the rise. */
  legs = false,
  opts: {
    /**
     * An item without a body (a bag): every pair of matching free edges between two parts of an
     * operation is a seam (a front and a back meet along the bottom AND both sides), and a run may
     * turn a corner where the partner edge carries a notch (a strip round a panel's three sides).
     */
    multi?: boolean;
    /** Pieces whose joins another reading settled (a ring's panels): no n:n continuation on them. */
    fixed?: ReadonlySet<string>;
  } = {},
): {
  added: JoinProposal[];
  left: string[];
  byLoops: JoinPart[];
  surface: JoinPart[];
  /**
   * Graph seams this reading refuses, each with why: a strip sewn by both long edges to one piece;
   * a ply of a two-ply strip sewn to a second piece; a pairing on edges a notched strip fits round.
   */
  refused: { seam: SeamCandidate; note: string }[];
} {
  const geom0 = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const classOf_ = (g: PieceGeom) => classOf(g, graph);
  // Pockets and loops are surface pieces: they never stand for their unit in an edge search (a
  // pocket sewn to a front would make the back «already joined» to the front through it).
  const isSurface = (k: string) => {
    const g = geom0.get(k);
    return !!g && classOf_(g) === 'skip';
  };
  const surfaceOnly: JoinPart[] = [];
  const joins = joins0
    .map((J) => {
      const parts = J.parts.map((X) => X.filter((k) => !exclude.has(k)));
      for (const X of parts)
        if (X.length && X.every(isSurface)) surfaceOnly.push({ join: J.label, part: X });
      return {
        ...J,
        parts: parts.map((X) => X.filter((k) => !isSurface(k))).filter((X) => X.length),
      };
    })
    .filter((J) => J.parts.length >= 2);
  const handOf = (k: string) => {
    const g = geom0.get(k);
    return g ? g.hand ?? readName(g.name).hand : null;
  };
  // Trousers: an operation over both legs is first read per leg (its left pieces among themselves,
  // its right pieces among themselves), then as a whole.
  if (legs) {
    const perLeg: DeclaredJoin[] = [];
    for (const J of joins)
      for (const h of ['L', 'R'] as const) {
        const parts = J.parts.map((X) => X.filter((k) => handOf(k) === h)).filter((X) => X.length);
        if (parts.length >= 2 && parts.length === J.parts.length)
          perLeg.push({ label: J.label, parts });
      }
    joins.unshift(...perLeg);
  }
  const geomOf = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
  const sides = (s: SeamCandidate) => [...(s.aParts ?? [s.a]), ...(s.bParts ?? [s.b])];
  const ids = (id: string) => {
    const at = id.lastIndexOf('#');
    return id
      .slice(at + 1)
      .split('+')
      .map((k) => `${id.slice(0, at)}#${k}`);
  };
  // Which contour samples are already sewn (graph seams, closures, our own proposals).
  const used = new Map<string, Set<number>>();
  const markUsed = (id: EdgeId) => {
    for (const one of ids(id)) {
      const g = geomOf.get(pk(one));
      const e = g?.edges.find((x) => x.id === one);
      if (!g || !e) continue;
      const n = g.rs.length;
      if (!used.has(g.pieceKey)) used.set(g.pieceKey, new Set());
      const set = used.get(g.pieceKey)!;
      for (let i = e.s; ; i++) {
        set.add(((i % n) + n) % n);
        if (((i % n) + n) % n === ((e.e % n) + n) % n) break;
      }
    }
  };
  // Seams between twins (layers of one collar, a yoke and its facing) do not use the edge up: the
  // layer is sewn to its partner along the same edge.
  const twins = (s: SeamCandidate) => {
    const a = geomOf.get(pk(s.a));
    const b = geomOf.get(pk(s.b));
    if (!a || !b) return false;
    // Same shape (a yoke and its facing, collar layers): drawn as one layer; the seam between
    // them does not use the edge up.
    const same =
      Math.abs(Math.abs(a.areaMm2) - Math.abs(b.areaMm2)) < 0.03 * Math.abs(a.areaMm2) &&
      Math.abs(a.perimMm - b.perimMm) < 0.03 * a.perimMm;
    if (a.pieceKey === b.pieceKey) return false; // a dart uses its legs up
    return s.evidence.twin !== 'none' || a.twinOf.some((t) => t.key === b.pieceKey) || same;
  };
  // GUSSET STRIPS: a strip's two long edges go to two different pieces. Where the graph sews both
  // to one piece (SS26-015's gusset by both edges onto the front), the weaker pairing is refused;
  // the order's search then sews that edge onto the other panel.
  const refused: { seam: SeamCandidate; note: string }[] = [];
  const refuse = (s: SeamCandidate, note: string) => {
    if (ignore.has(`${s.a}~${s.b}`)) return;
    refused.push({ seam: s, note });
    ignore.add(`${s.a}~${s.b}`);
  };
  const single = (s: SeamCandidate) => !s.aParts && !s.bParts;
  const seamOnEdge = (e: Edge) =>
    graph.chosen.find(
      (s) => single(s) && !ignore.has(`${s.a}~${s.b}`) && (s.a === e.id || s.b === e.id),
    );
  const otherPiece = (s: SeamCandidate, e: Edge) => pk(s.a === e.id ? s.b : s.a);
  // (an item without a body only: on a garment a strip-shaped piece may well take two seams from
  // one piece — a two-piece sleeve's halves, a folded band — and the graph's reading stands)
  for (const g of opts.multi ? graph.pieces : []) {
    const L = stripLongEdges(g);
    if (!L) continue;
    const s1 = seamOnEdge(L[0]);
    const s2 = seamOnEdge(L[1]);
    if (!s1 || !s2 || s1 === s2) continue;
    if (otherPiece(s1, L[0]) !== otherPiece(s2, L[1]) || otherPiece(s1, L[0]) === g.pieceKey)
      continue;
    const weak = s2.score < s1.score ? s2 : s1.score < s2.score ? s1 : s2;
    refuse(
      weak,
      `not sewn — the graph sews both long edges of the strip ${g.pieceKey} to the same piece; a strip (a gusset, a binding) runs between two pieces: this weaker pairing is refused, the order places the edge`,
    );
  }
  // TWO-PLY STRIPS (an item without a body): two identical strips the order sews to each other in
  // an operation of their own (two belt strips → a channel, a strap's two plies) are one strip for
  // the rest of the item — their matching long edges go onto ONE edge of ONE piece (a binding
  // sandwiches it; a channel lies on it). Where the graph sews a ply's edge to one piece and the
  // other ply's matching edge to another, the pairing the order makes later is refused; the free
  // matching edge then follows its mate (used, no second partner).
  const plyFollows: EdgeId[] = [];
  if (opts.multi) {
    const opIdx = (x: string, y: string) => {
      const i = joins.findIndex((J) =>
        J.parts.some(
          (X, xi) => X.includes(x) && J.parts.some((Y, yi) => yi !== xi && Y.includes(y)),
        ),
      );
      return i < 0 ? Infinity : i;
    };
    for (const J of joins) {
      if (J.parts.length !== 2 || J.parts[0].length !== 1 || J.parts[1].length !== 1) continue;
      const [ka, kb] = [J.parts[0][0], J.parts[1][0]];
      const ga = geomOf.get(ka);
      const gb = geomOf.get(kb);
      if (!ga || !gb || !ga.twinOf.some((t) => t.key === kb && t.kind === 'identical')) continue;
      const La = stripLongEdges(ga);
      const Lb = stripLongEdges(gb);
      if (!La || !Lb) continue;
      const onLong = (s: SeamCandidate, L: [Edge, Edge]) =>
        L.some((e) => e.id === s.a || e.id === s.b);
      const ply = graph.chosen.find(
        (s) =>
          single(s) &&
          ((pk(s.a) === ka && pk(s.b) === kb) || (pk(s.a) === kb && pk(s.b) === ka)) &&
          onLong(s, La) &&
          onLong(s, Lb),
      );
      // The matching long edges: beyond the ply seam the OTHER long edges match; without one, the
      // edges in the same position.
      const corr: [Edge, Edge][] = ply
        ? [
            [
              La[1 - La.findIndex((e) => e.id === ply.a || e.id === ply.b)],
              Lb[1 - Lb.findIndex((e) => e.id === ply.a || e.id === ply.b)],
            ],
          ]
        : La.map((e, i) => [e, Lb.find((x) => x.k === e.k) ?? Lb[i]]);
      for (const [ea, eb] of corr) {
        const sa = seamOnEdge(ea);
        const sb = seamOnEdge(eb);
        const pa = sa ? otherPiece(sa, ea) : null;
        const pb = sb ? otherPiece(sb, eb) : null;
        const ida = sa ? (sa.a === ea.id ? sa.b : sa.a) : null;
        const idb = sb ? (sb.a === eb.id ? sb.b : sb.a) : null;
        // (two different edges — of two pieces, or of one — cannot both be the one bound edge)
        if (sa && sb && ida !== idb && pa !== kb && pb !== ka) {
          const ia = opIdx(ka, pa!);
          const ib = opIdx(kb, pb!);
          const weak = ia !== ib ? (ia > ib ? sa : sb) : sa.score < sb.score ? sa : sb;
          const keep = weak === sa ? sb : sa;
          refuse(
            weak,
            `not sewn — ${weak.a} ↔ ${weak.b}: ${ka} and ${kb} are two plies of one strip (the order sews them to each other in «${J.label}»); their matching edges go onto one edge of one piece, and ${keep.a} ↔ ${keep.b} has it (the order's earlier join) — this ply follows it`,
          );
        }
        const keptA = sa && !ignore.has(`${sa.a}~${sa.b}`);
        const keptB = sb && !ignore.has(`${sb.a}~${sb.b}`);
        if (keptA && !keptB) plyFollows.push(eb.id);
        if (keptB && !keptA) plyFollows.push(ea.id);
      }
    }
  }
  /** The x-position of an edge's middle across its piece (0 = the drawing's left, 1 = right). */
  const edgeXMid = (g: PieceGeom, e: Edge) => {
    const { w } = bboxOf(g);
    const x0 = Math.min(...g.rs.map((p) => p[0]));
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    return w > 0 ? (mid[0] - x0) / w : 0.5;
  };
  /**
   * A run that is one long edge of a strip whose OTHER long edge a seam already sews: the piece that
   * seam goes to and where across it (the strip's second edge goes elsewhere, mirrored across).
   */
  const stripSide = (r: Run): { piece: string; x: number } | null => {
    if (r.edges.length !== 1) return null;
    const L = stripLongEdges(r.piece);
    if (!L) return null;
    const mine = L.find((e) => e.id === r.edges[0].id);
    if (!mine) return null;
    const otherE = L[0] === mine ? L[1] : L[0];
    const s =
      seamOnEdge(otherE) ??
      added.map((x) => x.seam).find((x) => single(x) && (x.a === otherE.id || x.b === otherE.id));
    if (!s) return null;
    const pid = s.a === otherE.id ? s.b : s.a;
    const pg = geomOf.get(pk(pid));
    const pe = pg?.edges.find((e) => e.id === pid);
    return pg && pe ? { piece: pg.pieceKey, x: edgeXMid(pg, pe) } : null;
  };
  /** A strip somewhere in the item still has a free long edge of about this length. */
  const stripWants = (len: number) =>
    graph.pieces.some((g) => {
      const L = stripLongEdges(g);
      return !!L && L.some((e) => freeFrac(g, e) >= 0.9 && Math.abs(e.lenMm - len) <= 0.03 * len);
    });
  // (a seam on a ring's panel or a lid — identical twins, but panels: its edges are used up)
  const touchesFixed = (s: SeamCandidate) =>
    !!opts.fixed && sides(s).some((id) => opts.fixed!.has(pk(id)));
  /** A ply seam between two strips (a channel's two plies sewn along one edge): the edge is taken. */
  const stripPly = (s: SeamCandidate) => {
    if (!opts.multi || !single(s)) return false;
    const a = geomOf.get(pk(s.a));
    const b = geomOf.get(pk(s.b));
    return !!a && !!b && a !== b && !!stripLongEdges(a) && !!stripLongEdges(b);
  };
  /** The sewn samples of an edge, or of its stretch [r0, r1] mm from its start. */
  const samplesOf = (g: PieceGeom, e: Edge, r?: [number, number] | null) => {
    const n = g.rs.length;
    const out: number[] = [];
    let cnt = 0;
    for (let i = e.s; ; i++) {
      const q = ((i % n) + n) % n;
      out.push(q);
      cnt++;
      if (q === ((e.e % n) + n) % n) break;
      if (cnt > n) break;
    }
    if (!r) return out;
    const step = e.lenMm / Math.max(1, out.length - 1);
    return out.filter((_, k) => k * step >= r[0] - 1 && k * step <= r[1] + 1);
  };
  const markUsedR = (id: EdgeId, r: [number, number]) => {
    const g = geomOf.get(pk(id));
    const e = g?.edges.find((x) => x.id === id);
    if (!g || !e) return;
    if (!used.has(g.pieceKey)) used.set(g.pieceKey, new Set());
    const set = used.get(g.pieceKey)!;
    for (const q of samplesOf(g, e, r)) set.add(q);
  };
  const freeFrac = (g: PieceGeom, e: Edge, r?: [number, number] | null) => {
    const set = used.get(g.pieceKey);
    if (!set) return 1;
    const qs = samplesOf(g, e, r);
    const free = qs.filter((q) => !set.has(q)).length;
    return free / Math.max(1, qs.length);
  };
  /** The point of an edge at d mm from its start. */
  const ptAt = (e: Edge, d: number) =>
    e.pts[Math.max(0, Math.min(e.pts.length - 1, Math.round((d / e.lenMm) * (e.pts.length - 1))))];
  const runsOf = (g: PieceGeom, anyUse = false): Run[] => {
    const plain = g.edges.filter((e) => e.kind === 'edge').sort((a, b) => a.k - b.k);
    const m = plain.length;
    const [y0, y1] = g.rs.reduce(
      ([lo, hi], p) => [Math.min(lo, p[1]), Math.max(hi, p[1])],
      [Infinity, -Infinity],
    );
    const [x0, x1] = g.rs.reduce(
      ([lo, hi], p) => [Math.min(lo, p[0]), Math.max(hi, p[0])],
      [Infinity, -Infinity],
    );
    const out: Run[] = [];
    const isFree = (e: Edge, r?: [number, number] | null) => anyUse || freeFrac(g, e, r) >= 0.9;
    // (a strip's run never goes round its short end: corners are a panel's)
    const corners = opts.multi && !stripLongEdges(g);
    /** One run: `head` = the sewn stretch of the first edge, `tail` = of the last (null = whole). */
    const emit = (
      es: Edge[],
      corners: number[],
      head: [number, number] | null,
      tail: [number, number] | null,
    ) => {
      const L = es.length;
      const first = es[0];
      const last = es[L - 1];
      const cut0 = head ? head[0] : 0;
      const cut1 = tail ? last.lenMm - tail[1] : 0;
      const len = es.reduce((t, e) => t + e.lenMm, 0) - cut0 - cut1;
      if (len < 50) return;
      const a = head ? ptAt(first, head[0]) : first.pts[0];
      const b = tail ? ptAt(last, tail[1]) : last.pts[last.pts.length - 1];
      const mid = es[Math.floor(L / 2)].pts[Math.floor(es[Math.floor(L / 2)].pts.length / 2)];
      const within = (e: Edge, d: number) =>
        (e !== first || !head || d >= head[0] + 1) && (e !== last || !tail || d <= tail[1] - 1);
      const partRange: Record<EdgeId, [number, number]> = {};
      if (head) partRange[first.id] = head;
      if (tail) partRange[last.id] = tail;
      out.push({
        piece: g,
        edges: es,
        id: `${g.pieceKey}#${es.map((e) => e.k).join('+')}`,
        len,
        notches: es.reduce((t, e) => t + e.notchesMm.filter((d) => within(e, d)).length, 0),
        turn: es.reduce((t, e) => t + e.turnDeg, 0),
        dx: Math.abs(b[0] - a[0]),
        dy: Math.abs(b[1] - a[1]),
        yMid: y1 > y0 ? (mid[1] - y0) / (y1 - y0) : 0.5,
        xMid: x1 > x0 ? (mid[0] - x0) / (x1 - x0) : 0.5,
        cornersAt: corners.map((c) => c - cut0),
        ...(head || tail ? { partRange } : {}),
      });
    };
    for (let i = 0; i < m; i++) {
      const cornersAt: number[] = [];
      for (let L = 1; L <= Math.min(3, m - 1); L++) {
        const es = Array.from({ length: L }, (_, j) => plain[(i + j) % m]);
        // (an inner edge of a longer run is taken: no run through it)
        if (es.slice(1, -1).some((e) => !isFree(e))) break;
        // A run follows one line of the contour: it never turns a sharp corner (> 35°) between
        // two of its edges (a waistband's long edge does not continue round its short end) — except
        // on an item without a body, where a strip runs round a panel's corners: such a corner is
        // kept and must meet a notch on the partner edge (checked where the pair is scored).
        if (L > 1) {
          const dir = (p: number[][], end: boolean) => {
            const q = end ? p.slice(-6) : p.slice(0, 6);
            return Math.atan2(q[q.length - 1][1] - q[0][1], q[q.length - 1][0] - q[0][0]);
          };
          const prev = es[L - 2].pts;
          const next = es[L - 1].pts;
          let d = Math.abs(dir(next, false) - dir(prev, true));
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d > (35 * Math.PI) / 180) {
            if (!corners) break;
            cornersAt.push(es.slice(0, L - 1).reduce((t, e) => t + e.lenMm, 0));
          }
        }
        if (es.every((e) => isFree(e))) emit(es, cornersAt, null, null);
        else if (!corners) break;
        // An item without a body: a run round corners may take its first / last edge only from /
        // up to a notch (a strip round a panel's lower U; the flap above the notch stays free).
        if (!corners || L < 2 || !cornersAt.length) continue;
        const first = es[0];
        const last = es[L - 1];
        const heads: ([number, number] | null)[] = [
          null,
          ...first.notchesMm
            .filter((d) => d >= 30 && first.lenMm - d >= 30)
            .map((d) => [d, first.lenMm] as [number, number]),
        ];
        const tails: ([number, number] | null)[] = [
          null,
          ...last.notchesMm
            .filter((d) => d >= 30 && last.lenMm - d >= 30)
            .map((d) => [0, d] as [number, number]),
        ];
        for (const head of heads)
          for (const tail of tails) {
            if (!head && !tail) continue;
            if (!isFree(first, head) || !isFree(last, tail)) continue;
            emit(es, cornersAt, head, tail);
          }
      }
    }
    return out;
  };
  /** Notch positions along a run, mm from its start (within the sewn stretches). */
  const marksOf = (B: Run): number[] => {
    const marks: number[] = [];
    let base = 0;
    const L = B.edges.length;
    B.edges.forEach((e, i) => {
      const r = B.partRange?.[e.id];
      const lo = r ? r[0] : 0;
      const hi = r ? r[1] : e.lenMm;
      for (const d of e.notchesMm) if (d > lo + 1 && d < hi - 1) marks.push(base + d - lo);
      base += hi - lo;
      if (i === L - 1) return;
    });
    return marks;
  };
  const nearMark = (marks: number[], len: number, c: number) =>
    marks.some((m) => Math.abs(m - c) <= 12 || Math.abs(len - m - c) <= 12);
  /**
   * A run that turns corners (multi mode) fits its partner only when the partner carries a notch at
   * every corner — read from either end of the partner (which way round it is sewn is unknown).
   */
  const cornersMarked = (A: Run, B: Run) => {
    if (!A.cornersAt.length) return true;
    const marks = marksOf(B);
    // (one way round for every corner — not one corner read forward and the next reversed)
    return (
      A.cornersAt.every((c) => marks.some((m) => Math.abs(m - c) <= 12)) ||
      A.cornersAt.every((c) => marks.some((m) => Math.abs(B.len - m - c) <= 12))
    );
  };
  /** How many notches of the straight run S find no corner and no notch on the run R round corners. */
  const unmatchedNotches = (S: Run, R: Run) => {
    const marks = [...R.cornersAt, ...marksOf(R)];
    return marksOf(S).filter((c) => !nearMark(marks, R.len, c)).length;
  };
  // A NOTCHED STRIP ROUND A PANEL'S CORNERS (an item without a body): a strip's long edge whose
  // notches sit at the corners of a run of the panel's edges, the lengths equal, FITS that run — the
  // order joining the two. Of several such runs the strip takes the LOWER one in the drawing (the
  // bag's bottom; a panel is drawn upright), then the one whose marks meet more of its notches. A
  // graph pairing of the strip's edge by length alone (a partial onto one edge) yields to the fit;
  // a single-edge pairing of another piece on the fit's edges is refused (the strip goes there; a
  // channel strip then finds the opening edge, two panels do not meet where the strip runs).
  const ids_ = ids;
  const fitsOf = (S: Run, p: PieceGeom, anyUse: boolean): Run[] =>
    runsOf(p, anyUse)
      .filter(
        (R) =>
          R.edges.length >= 2 &&
          R.cornersAt.length > 0 &&
          Math.min(R.len, S.len) / Math.max(R.len, S.len) >= 0.97 &&
          cornersMarked(R, S),
      )
      .sort((x, y) => x.yMid - y.yMid || unmatchedNotches(S, x) - unmatchedNotches(S, y));
  const stripEdgeRun = (g: PieceGeom, e: Edge, anyUse: boolean) =>
    runsOf(g, anyUse).find((r) => r.edges.length === 1 && r.edges[0].id === e.id);
  if (opts.multi) {
    const key = (s: SeamCandidate) => `${s.a}~${s.b}`;
    for (const J of joins)
      for (let i = 0; i < J.parts.length; i++)
        for (const gk of J.parts[i]) {
          const g = geomOf.get(gk);
          const L = g ? stripLongEdges(g) : null;
          if (!g || !L) continue;
          for (let j = 0; j < J.parts.length; j++) {
            if (j === i) continue;
            for (const pkk of J.parts[j]) {
              const p = geomOf.get(pkk);
              if (!p || stripLongEdges(p)) continue;
              for (const e of L) {
                if (!e.notchesMm.length) continue;
                const S = stripEdgeRun(g, e, true);
                const R = S ? fitsOf(S, p, true)[0] : undefined;
                if (!S || !R) continue;
                const where = `${p.pieceKey}'s ${R.edges.map((x) => x.k).join('+')} (${S.len.toFixed(0)} = ${R.len.toFixed(0)} mm, its notches at the corners)`;
                const fitIds = new Set([e.id, ...R.edges.map((x) => x.id)]);
                for (const s of graph.chosen) {
                  if (ignore.has(key(s))) continue;
                  if (!single(s)) {
                    // (a composite over these edges that is not this very fit)
                    const ids = sides(s).flatMap((id) => ids_(id));
                    const over = ids.some((id) => fitIds.has(id));
                    const isFit = over && ids.every((id) => fitIds.has(id)) && ids.includes(e.id);
                    if (over && !isFit)
                      refuse(
                        s,
                        `not sewn — ${s.a} ↔ ${s.b}: the strip ${g.pieceKey}'s edge ${e.k} fits round ${where}; the order «${J.label}» sews it there`,
                      );
                    continue;
                  }
                  if (s.a === e.id || s.b === e.id)
                    refuse(
                      s,
                      `not sewn — ${s.a} ↔ ${s.b}: the strip ${g.pieceKey}'s edge ${e.k} fits round ${where}; the order «${J.label}» sews it there`,
                    );
                  else if (
                    pk(s.a) !== g.pieceKey &&
                    pk(s.b) !== g.pieceKey &&
                    R.edges.some((x) => x.id === s.a || x.id === s.b)
                  )
                    refuse(
                      s,
                      `not sewn — ${s.a} ↔ ${s.b}: the strip ${g.pieceKey} fits round ${where}; nothing else meets ${p.pieceKey} where the strip runs (the order «${J.label}»)`,
                    );
                }
              }
            }
          }
        }
  }
  for (const s of [...graph.chosen, ...graph.rejected.filter((x) => x.kind === 'closure-not-seam')])
    if ((!twins(s) || touchesFixed(s) || stripPly(s)) && !ignore.has(`${s.a}~${s.b}`))
      for (const id of sides(s)) markUsed(id);
  for (const id of plyFollows) markUsed(id);
  /** Parts read as surface pieces (laid on a panel's face): searched no further. */
  const surfaced = new Set<string>();
  const linked = new Set<string>();
  const link = (a: string, b: string) => {
    linked.add(`${a}|${b}`);
    linked.add(`${b}|${a}`);
  };
  for (const s of graph.chosen)
    if (!ignore.has(`${s.a}~${s.b}`))
      for (const a of (s.aParts ?? [s.a]).map(pk))
        for (const b of (s.bParts ?? [s.b]).map(pk)) link(a, b);

  const added: JoinProposal[] = [];
  // WHICH WAY ROUND TWO PANELS FACE (an item without a body). Two faces of a bag are sewn to each
  // other along several edges and through strips between them; all those pairings read ONE way:
  // either the drawing's same side meets (x ↔ x) or the faces mirror (x ↔ 1 − x, the pieces sewn
  // face to face). The reading is fixed by the first off-centre pair between the two pieces, or
  // before that by the strips already sewn to one of them by one long edge: the reading under which
  // their free long edge finds a free edge of its length on the other piece where it would land.
  const chir = new Map<string, 1 | -1>();
  const ck = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const offCentre = (x: number) => Math.abs(x - 0.5) >= 0.2;
  const chirOf = (xa: number, xb: number): 1 | -1 | null =>
    offCentre(xa) && offCentre(xb) ? (Math.abs(xa - xb) < Math.abs(xa - (1 - xb)) ? 1 : -1) : null;
  const addedOn = (e: Edge) =>
    added.map((x) => x.seam).find((x) => single(x) && (x.a === e.id || x.b === e.id));
  const chirality = (ka: string, kb: string): 1 | -1 | null => {
    const k = ck(ka, kb);
    if (chir.has(k)) return chir.get(k)!;
    const ga = geomOf.get(ka);
    const gb = geomOf.get(kb);
    if (!ga || !gb) return null;
    for (const s of [
      ...graph.chosen.filter((x) => !ignore.has(`${x.a}~${x.b}`)),
      ...added.map((x) => x.seam),
    ]) {
      if (!single(s)) continue;
      const [ia, ib] =
        pk(s.a) === ka && pk(s.b) === kb
          ? [s.a, s.b]
          : pk(s.a) === kb && pk(s.b) === ka
            ? [s.b, s.a]
            : [null, null];
      if (!ia || !ib) continue;
      const ea = ga.edges.find((e) => e.id === ia);
      const eb = gb.edges.find((e) => e.id === ib);
      const c = ea && eb ? chirOf(edgeXMid(ga, ea), edgeXMid(gb, eb)) : null;
      if (c) {
        chir.set(k, c);
        return c;
      }
    }
    let same = 0;
    let mirror = 0;
    for (const [P, Q] of [
      [ga, gb],
      [gb, ga],
    ])
      for (const g of graph.pieces) {
        const L = stripLongEdges(g);
        if (!L || g === P || g === Q) continue;
        for (let i = 0; i < 2; i++) {
          const s = seamOnEdge(L[i]) ?? addedOn(L[i]);
          if (!s) continue;
          const pid = s.a === L[i].id ? s.b : s.a;
          if (pk(pid) !== P.pieceKey) continue;
          const pe = P.edges.find((e) => e.id === pid);
          if (!pe) continue;
          const x = edgeXMid(P, pe);
          const other = L[1 - i];
          if (!offCentre(x) || freeFrac(g, other) < 0.9) continue;
          const cands = Q.edges.filter(
            (e) =>
              e.kind === 'edge' &&
              freeFrac(Q, e) >= 0.9 &&
              Math.abs(e.lenMm - other.lenMm) <= 0.03 * other.lenMm,
          );
          if (cands.some((e) => Math.abs(edgeXMid(Q, e) - x) < 0.25)) same++;
          if (cands.some((e) => Math.abs(edgeXMid(Q, e) - (1 - x)) < 0.25)) mirror++;
        }
      }
    if (same === mirror) return null;
    const c: 1 | -1 = same > mirror ? 1 : -1;
    chir.set(k, c);
    return c;
  };
  /**
   * An edge stepped off the contour's line between two short steps (a short step in or out, the
   * edge, a short step back): the bottom of a hanger slot, the top of a hanger tab, a hand hole —
   * an opening or a fitting, not a sewn edge where both panels carry it (multi mode).
   */
  const stepped = (g: PieceGeom, e: Edge) => {
    const plain = g.edges.filter((x) => x.kind === 'edge').sort((a, b) => a.k - b.k);
    const i = plain.findIndex((x) => x.id === e.id);
    if (i < 0 || plain.length < 4) return false;
    const prev = plain[(i - 1 + plain.length) % plain.length];
    const next = plain[(i + 1) % plain.length];
    const short = (x: Edge) => x.lenMm <= 60 && x.lenMm <= 0.5 * e.lenMm;
    if (!short(prev) || !short(next)) return false;
    const c = g.rs.reduce(([x, y], p) => [x + p[0] / g.rs.length, y + p[1] / g.rs.length], [0, 0]);
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const o1 = prev.pts[0];
    const o2 = next.pts[next.pts.length - 1];
    const om = [(o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2];
    return (
      Math.abs(Math.hypot(mid[0] - c[0], mid[1] - c[1]) - Math.hypot(om[0] - c[0], om[1] - c[1])) >
      0.5 * Math.min(prev.lenMm, next.lenMm)
    );
  };
  /**
   * Edges of a panel a notched strip of the item claims, by the strip: a strip's free long edge
   * with notches and its preferred free fit round the panel's corners (fitsOf) — the order joining
   * the two. No other piece meets the panel on those edges: the strip goes there.
   */
  const stripClaims = (g: PieceGeom): Map<EdgeId, string> => {
    const out = new Map<EdgeId, string>();
    if (!opts.multi || stripLongEdges(g)) return out;
    const together = (a: string, b: string) =>
      joins.some((J) =>
        J.parts.some(
          (X, xi) => X.includes(a) && J.parts.some((Y, yi) => yi !== xi && Y.includes(b)),
        ),
      );
    for (const s of graph.pieces) {
      const L = stripLongEdges(s);
      if (!L || !together(s.pieceKey, g.pieceKey)) continue;
      for (const e of L) {
        if (!e.notchesMm.length || freeFrac(s, e) < 0.9) continue;
        const S = stripEdgeRun(s, e, false);
        const R = S ? fitsOf(S, g, false)[0] : undefined;
        if (R) for (const x of R.edges) out.set(x.id, s.pieceKey);
      }
    }
    return out;
  };
  const left: string[] = [];
  const byLoops: JoinPart[] = [];
  const surface: JoinPart[] = [...surfaceOnly];
  const areaOf = (keys: string[]) =>
    keys.reduce((t, k) => t + Math.abs(geomOf.get(k)?.areaMm2 ?? 0), 0);
  const hasRole = (keys: string[], cls: string[]) =>
    keys.some((k) => {
      const g = geomOf.get(k);
      return !!g && cls.includes(classOf_(g) ?? '');
    });
  /**
   * Search one part X of join J against the other parts: the best free edge pair, proposed when it is
   * close enough. `ply` (a ply pair of another part, see below) narrows the search onto that pair's
   * canonical ply with a stricter length band, and nothing is said when no pair is found.
   */
  type Best = { A: Run; B: Run; score: number; ratio: number; pleated: boolean };
  /**
   * The best free edge pair between X and the parts `others` — or why none was looked for. `strict`
   * (the n:n continuation of multi mode) takes only an exact pair: lengths within 3 %, no penalty
   * beyond the slightest.
   */
  const bestPair = (
    X: string[],
    others: string[][],
    ply: { keys: Set<string>; lead: string; sideOk?: (B: Run) => boolean } | undefined,
    strict: boolean,
  ): { best: Best | null; skippedTube: number; skippedTwin: number } => {
    const cx = new Set(
      X.map((k) => geomOf.get(k))
        .filter(Boolean)
        .map((g) => classOf_(g!)),
    );
    let best: Best | null = null;
    let skippedTube = 0;
    let skippedTwin = 0;
    for (const Y of others) {
      const cy = new Set(
        Y.map((k) => geomOf.get(k))
          .filter(Boolean)
          .map((g) => classOf_(g!)),
      );
      // Tube / ring onto the body: the free-loop proposals own it.
      const tube = (c: Set<string | null>) =>
        c.has('sleeve') || c.has('neck') || c.has('cuff') || c.has('band');
      // Two sleeves are never sewn to each other (an order that joins both to the body lists them
      // in one operation).
      const roles = (K: string[]) =>
        new Set(
          K.map((k) => geomOf.get(k))
            .filter(Boolean)
            .map((g) => readName(g!.name).role),
        );
      const rx = roles(X);
      const ry = roles(Y);
      // A collar onto its stand: the stand's top is a free loop the doll proposes against.
      const collarOnStand =
        cx.has('neck') &&
        cy.has('neck') &&
        ((rx.has('collar') && ry.has('stand')) || (rx.has('stand') && ry.has('collar')));
      const hx = new Set(X.map(handOf).filter(Boolean));
      const hy = new Set(Y.map(handOf).filter(Boolean));
      const otherHand = hx.size === 1 && hy.size === 1 && [...hx][0] !== [...hy][0];
      const twoTubes = (cx.has('sleeve') && cy.has('sleeve') && otherHand) || collarOnStand;
      if (
        twoTubes ||
        (cx.has('body') && tube(cy)) ||
        (cy.has('body') && tube(cx)) ||
        (cx.has('sleeve') && cy.has('cuff')) ||
        (cy.has('sleeve') && cx.has('cuff'))
      ) {
        skippedTube++;
        continue;
      }
      // Left and right units in an operation with a third part: both go onto that part, never onto
      // each other (two plackets end to end, a left chest piece onto the right one).
      if (others.length >= 2 && !ply && twinUnits(X, Y, geomOf)) {
        skippedTwin++;
        continue;
      }
      for (const ka of X) {
        const ga = geomOf.get(ka);
        if (!ga || classOf_(ga) === 'skip') continue;
        for (const kb of Y) {
          const gb = geomOf.get(kb);
          if (!gb || ka === kb || classOf_(gb) === 'skip') continue;
          if (ply && kb !== ply.lead) continue;
          const ha = handOf(ka);
          const hb = handOf(kb);
          const lr = !!ha && !!hb && ha !== hb;
          const claimsA = stripClaims(ga);
          const claimsB = stripClaims(gb);
          const fronts =
            ['front', 'placket'].includes(readName(ga.name).role ?? '') &&
            ['front', 'placket'].includes(readName(gb.name).role ?? '');
          for (const A of runsOf(ga))
            for (const B of runsOf(gb)) {
              const ratio = Math.min(A.len, B.len) / Math.max(A.len, B.len);
              if (ratio < (ply || strict ? 0.97 : 0.82)) continue;
              if (ply?.sideOk && !ply.sideOk(B)) continue;
              // Through a ply pair only a plain, clear seam (a shoulder): no short bits (an
              // armhole end of the yoke, a placket's end), no notch disagreement.
              if (ply && (Math.min(A.len, B.len) < 120 || Math.abs(A.notches - B.notches) > 1))
                continue;
              // Two strip ends are never sewn end to end.
              if (stripEnd(A) && stripEnd(B)) continue;
              // The same shallow notch cut into both panels (a hanger slot): an opening, not a seam.
              if (
                opts.multi &&
                A.edges.length === 1 &&
                B.edges.length === 1 &&
                stepped(ga, A.edges[0]) &&
                stepped(gb, B.edges[0])
              )
                continue;
              // Nothing but the strip meets a panel on the edges a notched strip fits round.
              if (
                opts.multi &&
                (A.edges.some((e) => claimsA.has(e.id) && claimsA.get(e.id) !== kb) ||
                  B.edges.some((e) => claimsB.has(e.id) && claimsB.get(e.id) !== ka))
              )
                continue;
              // A strongly curved edge onto a straight one (a chest piece's D-curve onto the centre
              // back): the curvatures neither match nor complement — not a seam.
              if (Math.abs(A.turn + B.turn) > 400) continue;
              // A run round a corner fits only a partner notched at that corner.
              if (!cornersMarked(A, B) || !cornersMarked(B, A)) continue;
              // A strip's two long edges go to two different pieces (a gusset between the front and
              // the back): the piece its other long edge is sewn to takes no second seam.
              const sa = stripSide(A);
              const sb = stripSide(B);
              if (sa?.piece === kb || sb?.piece === ka) continue;
              // Two panels do not meet directly along a length a strip's free long edge still
              // wants (the gusset goes between them): the n:n continuation leaves it to the strip.
              if (
                strict &&
                !sa &&
                !sb &&
                !stripLongEdges(ga) &&
                !stripLongEdges(gb) &&
                stripWants(A.len)
              )
                continue;
              // Left leg onto right leg only at the rise; left front onto right front only as the
              // front opening (a closure, not a seam).
              if (lr && legs && Math.max(A.len, B.len) > 450) continue;
              // …and the rise is in the upper half of both pieces (never two hems).
              if (lr && legs && (A.yMid < 0.5 || B.yMid < 0.5)) continue;
              if (lr && !legs && fronts && Math.max(A.len, B.len) > 300) continue;
              // Mirror halves (left / right, or mirror twins) meet only on their centre line,
              // which runs UP the pieces (a centre back, a rise, a waistband's centre-back end) —
              // never across them: two waists, two hems, a waistband's two long edges (11.10
              // corpus: SS26-007's back waists, SS26-011's waistband halves along their length).
              const mirrorHalves = lr || ga.twinOf.some((t) => t.key === kb && t.kind === 'mirror');
              if (mirrorHalves && (A.dx > A.dy || B.dx > B.dy)) continue;
              // …and off the legs that line is straight (a centre back, a placket's end): two
              // armholes or two necklines of mirror halves run up the pieces too, curved.
              const straight = (r: Run) => Math.hypot(r.dx, r.dy) / r.len >= 0.95;
              if (mirrorHalves && !legs && (!straight(A) || !straight(B))) continue;
              // A pleated edge onto a plain one (a back gathered into a yoke by box pleats): the
              // longer edge carries the pleat notches, the shorter none — its extra length is the
              // pleats' intake, not a mismatch.
              const [lo, sh] = A.len >= B.len ? [A, B] : [B, A];
              const pleated =
                ratio < 0.97 &&
                ratio >= 0.85 &&
                lo.len - sh.len >= 20 &&
                lo.notches >= 2 &&
                sh.notches === 0;
              let score = (1 - ratio) * (pleated ? 0.5 : 1.5);
              // (a run round corners meets a strip's notches with its corners: counted below)
              if (A.notches && B.notches && !A.cornersAt.length && !B.cornersAt.length)
                score += A.notches === B.notches ? -0.05 : 0.04 * Math.abs(A.notches - B.notches);
              score += Math.min(0.15, 0.003 * Math.abs(A.turn + B.turn));
              score += 0.03 * (A.edges.length + B.edges.length - 2);
              const horiz = (r: Run) => r.dx > r.dy;
              // Two hems are never sewn to each other (a garment's; a bag's bottoms are).
              if (!opts.multi && horiz(A) && horiz(B) && A.yMid < 0.4 && B.yMid < 0.4)
                score += 0.15;
              // A vertical edge onto a horizontal one is unlikely.
              if (horiz(A) !== horiz(B) && Math.max(A.dx, A.dy) > 120 && Math.max(B.dx, B.dy) > 120)
                score += 0.1;
              // An item without a body: among equal edges, two panels' pair at the same height (a
              // strip's long edge has no height of its own); a run round corners — the bag's bottom —
              // the lower of two alike; a notched strip's edge on the run whose corners and marks
              // meet all its notches (an exact fit), penalised per notch left unmet; and the two
              // panels facing ONE way round (chirality — see above): the pair that contradicts the
              // reading already fixed is no seam, the rest weighed by how far it strays.
              if (opts.multi) {
                const stripA = !!stripLongEdges(ga);
                const stripB = !!stripLongEdges(gb);
                if (!stripA && !stripB) score += 0.1 * Math.abs(A.yMid - B.yMid);
                if (A.cornersAt.length) score += 0.05 * A.yMid;
                if (B.cornersAt.length) score += 0.05 * B.yMid;
                if (A.cornersAt.length !== B.cornersAt.length) {
                  const [R, S] = A.cornersAt.length ? [A, B] : [B, A];
                  score += 0.02 * unmatchedNotches(S, R);
                }
                const strays = (x: number, want: number) =>
                  offCentre(x) && offCentre(want) && Math.abs(x - want) > 0.5;
                // (unknown yet: mirrored preferred, nothing refused — the first pair fixes it)
                if (sa) {
                  const c = chirality(sa.piece, kb);
                  const want = (c ?? -1) > 0 ? sa.x : 1 - sa.x;
                  if (c && strays(B.xMid, want)) continue;
                  score += 0.05 * Math.abs(B.xMid - want);
                } else if (sb) {
                  const c = chirality(sb.piece, ka);
                  const want = (c ?? -1) > 0 ? sb.x : 1 - sb.x;
                  if (c && strays(A.xMid, want)) continue;
                  score += 0.05 * Math.abs(A.xMid - want);
                } else if (!stripA && !stripB) {
                  const c = chirality(ka, kb);
                  const want = (c ?? -1) > 0 ? B.xMid : 1 - B.xMid;
                  if (c && strays(A.xMid, want)) continue;
                  score += 0.05 * Math.abs(A.xMid - want);
                }
              }
              if (!best || score < best.score - 1e-9) best = { A, B, score, ratio, pleated };
            }
        }
      }
    }
    return { best, skippedTube, skippedTwin };
  };
  /** Take a pair: mark its edges used, link the pieces, list the proposal. */
  const accept = (
    J: DeclaredJoin,
    best: Best,
    ply: { keys: Set<string> } | undefined,
    extra = '',
  ) => {
    const { A, B, ratio, pleated } = best;
    const plyWords = ply
      ? ` · sewn between the two plies ${[...ply.keys].join(' + ')} (one seam through both)`
      : '';
    const pleatWords = pleated
      ? ` · pleated: ${Math.abs(A.len - B.len).toFixed(0)} mm taken up by the pleats marked on the longer edge`
      : '';
    const seam: SeamCandidate = {
      a: A.id,
      b: B.id,
      score: Math.max(0, 1 - best.score),
      kind:
        A.edges.length > 1 || B.edges.length > 1
          ? 'composite'
          : ratio < 0.97 && !pleated
            ? 'partial'
            : 'edge',
      evidence: {
        dLenMm: Math.abs(A.len - B.len),
        relLen: ratio,
        notchScore: null,
        curvature: 'flat',
        hand: 'neutral',
        twin: 'none',
        self: false,
        rule: `from the technologist's order «${J.label}»${plyWords}${pleatWords}${extra}`,
        aLenMm: A.len,
        bLenMm: B.len,
      },
      ...(A.edges.length > 1 ? { aParts: A.edges.map((e) => e.id) } : {}),
      ...(B.edges.length > 1 ? { bParts: B.edges.map((e) => e.id) } : {}),
      ...(A.partRange || B.partRange ? { partRange: { ...A.partRange, ...B.partRange } } : {}),
    };
    for (const R of [A, B])
      for (const e of R.edges) {
        const r = R.partRange?.[e.id];
        if (r) markUsedR(e.id, r);
        else markUsed(e.id);
      }
    link(A.piece.pieceKey, B.piece.pieceKey);
    // Two panels' first off-centre pair fixes which way round they face (see `chirality`).
    if (
      opts.multi &&
      A.edges.length === 1 &&
      B.edges.length === 1 &&
      !stripLongEdges(A.piece) &&
      !stripLongEdges(B.piece)
    ) {
      const k = ck(A.piece.pieceKey, B.piece.pieceKey);
      const c = chirOf(A.xMid, B.xMid);
      if (c && !chir.has(k)) chir.set(k, c);
    }
    added.push({
      seam,
      join: J.label,
      note: `proposed (from the technologist's order «${J.label}») · ${A.id} ↔ ${B.id} · ${A.len.toFixed(0)} ≈ ${B.len.toFixed(0)} mm${A.notches || B.notches ? ` · notches ${A.notches}/${B.notches}` : ''}${pleatWords}${plyWords}${extra}`,
    });
  };
  /**
   * Search one part X of join J against the other parts: the best free edge pair, proposed when it is
   * close enough. `ply` (a ply pair of another part, see below) narrows the search onto that pair's
   * canonical ply with a stricter length band, and nothing is said when no pair is found. In multi
   * mode the search goes on between X and the part it was sewn to while exact pairs remain (a front
   * and a back meet along the bottom and both sides).
   */
  const searchPart = (
    J: DeclaredJoin,
    X: string[],
    others: string[][],
    ply?: { keys: Set<string>; lead: string; sideOk?: (B: Run) => boolean },
  ) => {
    // Already joined to another part of this operation (by the graph or an earlier proposal)? With
    // `ply`: already joined to the ply pair itself.
    // A part already read as a surface piece (laid on a face) is searched no further, either way.
    if (X.every((k) => surfaced.has(k))) return;
    others = others.filter((Y) => !Y.every((k) => surfaced.has(k)));
    if (!others.length) return;
    const joinedTo = (Y: string[]) => X.some((a) => Y.some((b) => linked.has(`${a}|${b}`)));
    if (ply) {
      if (X.some((a) => [...ply.keys].some((b) => linked.has(`${a}|${b}`)))) return;
    } else if (others.some(joinedTo)) {
      // Multi mode: a part already sewn to another may still have exact pairs left with it.
      if (opts.multi) for (const Y of others.filter(joinedTo)) more(J, X, Y);
      return;
    }
    const { best, skippedTube, skippedTwin } = bestPair(X, others, ply, false);
    if (!best || best.score > 0.25) {
      if (ply) return;
      if (skippedTube + skippedTwin === others.length) {
        if (skippedTube) byLoops.push({ join: J.label, part: X });
        return;
      }
      // A small piece onto a big one with no edge to match: a flap, welt or patch sewn onto the
      // panel's face — not an edge-to-edge seam the doll can draw.
      const big = Math.max(...others.map(areaOf));
      const small = Math.min(areaOf(X), big);
      const stripOf = (K: string[]) =>
        opts.multi && K.some((k) => !!stripLongEdges(geomOf.get(k)!));
      const surf = (Y: string[]) =>
        areaOf(Y) < 0.2 * areaOf(X) &&
        !stripOf(Y) &&
        !hasRole(Y, ['body', 'sleeve', 'neck', 'cuff', 'band']);
      if (
        (small < 0.2 * big &&
          !stripOf(X) &&
          !hasRole(X, ['body', 'sleeve', 'neck', 'cuff', 'band'])) ||
        others.every(surf)
      ) {
        surface.push({ join: J.label, part: X });
        return;
      }
      left.push(
        `${J.label}: ${X.join('+')} — no free edge pair of matching length between the declared sides${best ? ` (closest: ${best.A.id} ↔ ${best.B.id}, ${best.A.len.toFixed(0)} vs ${best.B.len.toFixed(0)} mm, score ${best.score.toFixed(2)})` : ''}`,
      );
      return;
    }
    // A small roleless part (a chest piece, a tab) onto a big one takes an edge seam only when the
    // edges truly match; a near miss is the piece laid on the panel's face — a surface piece.
    if (!ply) {
      const big = Math.max(...others.map(areaOf));
      // (on an item without a body a strip — a binding, a bottom strip — is never laid on a face)
      const strip = opts.multi && X.some((k) => !!stripLongEdges(geomOf.get(k)!));
      const small =
        areaOf(X) < 0.2 * big && !strip && !hasRole(X, ['body', 'sleeve', 'neck', 'cuff', 'band']);
      if (small && (best.ratio < 0.97 || best.score > 0.1)) {
        surface.push({ join: J.label, part: X });
        for (const k of X) surfaced.add(k);
        return;
      }
    }
    accept(J, best, ply);
    if (opts.multi && !ply) {
      const Y = others.find((Y) => Y.includes(best.B.piece.pieceKey));
      if (Y) more(J, X, Y);
    }
  };
  /** Multi mode: every further exact free pair between X and Y (each edge sewn once). */
  const more = (J: DeclaredJoin, X: string[], Y: string[]) => {
    const fixed = opts.fixed;
    if (fixed && [...X, ...Y].some((k) => fixed.has(k))) return;
    for (let guard = 0; guard < 24; guard++) {
      const { best } = bestPair(X, [Y], undefined, true);
      if (!best || best.score > 0.1) return;
      accept(J, best, undefined, ' · one of several seams between these two parts');
    }
  };
  for (const J of joins)
    for (let i = 0; i < J.parts.length; i++)
      searchPart(
        J,
        J.parts[i],
        J.parts.filter((_, j) => j !== i),
      );
  // PLY PAIRS. Two congruent layers of one cloth (identical twins: a double yoke, a facing and its
  // piece) that the order puts in the same operation are ONE piece for the joins to other pieces:
  // every seam along their edges goes through both plies (the back sandwiched under the yoke, the
  // fronts' shoulders between the yoke plies). A part linked to another piece of the same unit (the
  // fronts to the back by the side seams) says nothing about the yoke — so each other part of the
  // operation is searched against the pair's lead ply, on edges no seam took yet. Rings (collar,
  // stand, cuff plies) stay with the free-loop proposals.
  const seamsNow = () => [
    ...graph.chosen.filter((s) => !ignore.has(`${s.a}~${s.b}`)),
    ...added.map((x) => x.seam),
  ];
  const edgeById = (id: EdgeId) => geomOf.get(pk(id))?.edges.find((e) => e.id === id);
  const plain = (s: SeamCandidate, w: 'a' | 'b') =>
    (w === 'a' ? s.aParts ?? [s.a] : s.bParts ?? [s.b]).flatMap(ids);
  /**
   * Which of the pair's edges a handed part may take: the side of the pair its hand is on, read
   * from the drawing through the piece sandwiched under the pair (plies.ts). Undefined when the
   * part has no single hand or the drawing does not tell.
   */
  const sideOkFor = (X: string[], pair: Set<string>) => {
    const hx = [...new Set(X.map(handOf).filter(Boolean))] as ('L' | 'R')[];
    if (hx.length !== 1) return undefined;
    let sw: { q: PieceGeom; qe: Edge; p: PieceGeom; pe: Edge } | null = null;
    for (const s of seamsNow())
      for (const [P, Q] of [
        [plain(s, 'a'), plain(s, 'b')],
        [plain(s, 'b'), plain(s, 'a')],
      ]) {
        if (P.length !== 1 || Q.length !== 1) continue;
        if (!pair.has(pk(P[0])) || pair.has(pk(Q[0]))) continue;
        const pe = edgeById(P[0]);
        const qe = edgeById(Q[0]);
        const p = geomOf.get(pk(P[0]));
        const q = geomOf.get(pk(Q[0]));
        if (pe && qe && p && q && (!sw || pe.lenMm > sw.pe.lenMm)) sw = { q, qe, p, pe };
      }
    if (!sw) return undefined;
    const S = sw;
    const links = seamsNow().flatMap((s) => {
      const a = plain(s, 'a');
      const b = plain(s, 'b');
      const out: { qEdge: Edge; hand: 'L' | 'R' | null }[] = [];
      for (const [mine, theirs] of [
        [a, b],
        [b, a],
      ])
        if (mine.length === 1 && pk(mine[0]) === S.q.pieceKey && theirs.length) {
          const e = edgeById(mine[0]);
          const h = handOf(pk(theirs[0]));
          if (e && h && pk(theirs[0]) !== S.q.pieceKey) out.push({ qEdge: e, hand: h });
        }
      return out;
    });
    const want = handSideOn(S.q, links, hx[0]) * sameWayUp(S.q, S.qe, S.p, S.pe);
    if (!want) return undefined;
    return (B: Run) => {
      const e = B.edges[Math.floor(B.edges.length / 2)];
      const twin = S.p.edges.find((x) => x.k === e.k) ?? e;
      return xSideOf(S.p, twin) === want;
    };
  };
  const plyMates = (k: string) =>
    (geomOf.get(k)?.twinOf ?? []).filter((t) => t.kind === 'identical').map((t) => t.key);
  for (const J of joins) {
    const all = J.parts.flat();
    for (const P of J.parts)
      for (const k of P) {
        const mates = plyMates(k).filter((m) => all.includes(m));
        if (!mates.length) continue;
        const keys = [k, ...mates].sort();
        if (keys[0] !== k) continue;
        const g = geomOf.get(k);
        if (!g || classOf_(g) !== 'body') continue;
        const pair = new Set(keys);
        for (const X of J.parts) {
          if (X.some((x) => pair.has(x))) continue;
          searchPart(J, X, [keys], { keys: pair, lead: k, sideOk: sideOkFor(X, pair) });
        }
      }
  }
  return { added, left, byLoops, surface, refused };
}

/**
 * POCKET BAGS. Two pocket pieces the order puts on different sides of one operation, both bag-sized
 * (100 mm or more each way — a bag, not a welt or a binding strip), with an edge pair of equal
 * length (within 3 %, the same notch count), are sewn to each other round the bag: when the
 * operation is just the two of them, when they are identical twins (a slant pocket's two halves,
 * joined only when the front meets the back), or when the equal edges are both curved (an in-seam
 * pocket's bag halves, 314 = 314 round 270°). Never across left and right (hands, mirror twins,
 * or the left and the right unit of the garment); one bag seam per pocket piece. The pieces are
 * surface pieces — the seam is reported, drawn on the panel they are sewn onto, not solved.
 */
export function pocketBagJoins(
  graph: SeamGraph,
  joins: readonly DeclaredJoin[],
  /** Pieces never sewn (lining at level 0, interfacing). */
  exclude: ReadonlySet<string> = new Set(),
): JoinProposal[] {
  const geomOf = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const isSurface = (k: string) => {
    const g = geomOf.get(k);
    return !!g && classOf(g, graph) === 'skip';
  };
  const handOf = (k: string) => {
    const g = geomOf.get(k);
    return g ? g.hand ?? readName(g.name).hand : null;
  };
  const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
  const ids = (id: string) => {
    const at = id.lastIndexOf('#');
    return id
      .slice(at + 1)
      .split('+')
      .map((k) => `${id.slice(0, at)}#${k}`);
  };
  const used = new Set<EdgeId>();
  // (a surface placement — the pocket laid on the panel's face along an edge — is not a seam on
  // that edge: the bag's edge stays free for its other half)
  // (a graph seam between two pocket pieces is the bag seam itself — the graph finds many of them
  // by length and curvature, but drops them with the pieces it does not draw: read again here)
  const pkOf = (id: string) => id.slice(0, id.lastIndexOf('#'));
  for (const s of graph.chosen)
    if (s.kind !== 'surface' && !(isSurface(pkOf(s.a)) && isSurface(pkOf(s.b))))
      for (const id of [...(s.aParts ?? [s.a]), ...(s.bParts ?? [s.b])])
        for (const one of ids(id)) used.add(one);
  const bagOf = new Map<string, string>();
  const out: JoinProposal[] = [];
  /** The one hand of a unit (its handed pieces all left, or all right), else null. */
  const unitHand = (X: readonly string[]) => {
    const hs = new Set(X.map(handOf).filter(Boolean));
    return hs.size === 1 ? [...hs][0] : null;
  };
  const bagSized = (g: PieceGeom) => {
    const { w, h } = bboxOf(g);
    return Math.min(w, h) >= 100;
  };
  for (const J of joins) {
    const parts = J.parts.map((X) => X.filter((k) => !exclude.has(k))).filter((X) => X.length);
    // (an operation of exactly two pocket pieces: the one sews the other — not a pocket piece onto
    // a unit of welts and bags, whose edges match by chance)
    const twoPockets = parts.length === 2 && parts.every((X) => X.length === 1 && isSurface(X[0]));
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const X = parts[i];
        const Y = parts[j];
        // The left and the right unit: their pockets are never sewn to each other.
        const hx = unitHand(X);
        const hy = unitHand(Y);
        // (mirror units: hands apart, or a mirror twin across — identical twins across are the
        // bag halves themselves)
        const mirrorUnits =
          twinUnits(X, Y, geomOf) &&
          X.some((a) =>
            geomOf.get(a)?.twinOf.some((t) => t.kind === 'mirror' && Y.includes(t.key)),
          );
        if ((hx && hy && hx !== hy) || mirrorUnits) continue;
        for (const a of X) {
          if (!isSurface(a) || bagOf.has(a)) continue;
          const ga = geomOf.get(a);
          if (!ga || !bagSized(ga)) continue;
          for (const b of Y) {
            if (!isSurface(b) || bagOf.has(b) || bagOf.has(a) || a === b) continue;
            const gb = geomOf.get(b);
            if (!gb || !bagSized(gb)) continue;
            const ha = handOf(a);
            const hb = handOf(b);
            if (ha && hb && ha !== hb) continue;
            if (ga.twinOf.some((t) => t.key === b && t.kind === 'mirror')) continue;
            const identical = ga.twinOf.some((t) => t.key === b && t.kind === 'identical');
            let best: { ea: Edge; eb: Edge; score: number; curved: boolean } | null = null;
            for (const ea of ga.edges) {
              if (ea.kind !== 'edge' || used.has(ea.id)) continue;
              for (const eb of gb.edges) {
                if (eb.kind !== 'edge' || used.has(eb.id)) continue;
                const ratio = Math.min(ea.lenMm, eb.lenMm) / Math.max(ea.lenMm, eb.lenMm);
                if (ratio < 0.97 || ea.notchesMm.length !== eb.notchesMm.length) continue;
                if (Math.min(ea.lenMm, eb.lenMm) < 80) continue;
                const curved = Math.abs(ea.turnDeg) >= 90 && Math.abs(eb.turnDeg) >= 90;
                if (!(twoPockets || identical || curved)) continue;
                const score =
                  1 - ratio + (curved ? 0 : 0.02) - 0.0001 * Math.min(ea.lenMm, eb.lenMm);
                if (!best || score < best.score) best = { ea, eb, score, curved };
              }
            }
            if (!best) continue;
            const { ea, eb, curved } = best;
            const why = twoPockets
              ? 'the operation sews just these two pocket pieces'
              : identical
                ? 'two identical bag halves'
                : 'both edges curved — the bag halves sewn round';
            const note = `pocket bag (from the technologist's order «${J.label}»): ${a} + ${b} sewn to each other round the bag · ${ea.lenMm.toFixed(0)} = ${eb.lenMm.toFixed(0)} mm${curved ? ` round ${Math.abs(ea.turnDeg).toFixed(0)}°` : ''} · ${why} · drawn on the panel they are sewn onto, not solved`;
            out.push({
              join: J.label,
              note,
              seam: {
                a: ea.id,
                b: eb.id,
                score: 0.75,
                kind: 'edge',
                evidence: {
                  dLenMm: Math.abs(ea.lenMm - eb.lenMm),
                  relLen: Math.min(ea.lenMm, eb.lenMm) / Math.max(ea.lenMm, eb.lenMm),
                  notchScore: null,
                  curvature: curved ? 'both-convex' : 'flat',
                  hand: 'neutral',
                  twin: identical ? 'identical' : 'none',
                  self: false,
                  rule: note,
                  aLenMm: ea.lenMm,
                  bLenMm: eb.lenMm,
                },
              },
            });
            used.add(ea.id);
            used.add(eb.id);
            bagOf.set(a, b);
            bagOf.set(b, a);
            void pk;
          }
        }
      }
  }
  return out;
}
