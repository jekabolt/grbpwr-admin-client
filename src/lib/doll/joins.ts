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
};

export type JoinProposal = { seam: SeamCandidate; join: string; note: string };
/** A part of a declared join, by the join's label and the part's pieces. */
export type JoinPart = { join: string; part: string[] };

export function completeFromJoins(
  graph: SeamGraph,
  joins0: DeclaredJoin[],
  /** Pieces never searched (lining at level 0, interfacing). */
  exclude: Set<string> = new Set(),
  /** Graph seams (`a~b`) the doll will not sew (suspect): their edges count as free. */
  ignore: Set<string> = new Set(),
  /** Trousers: each leg is joined on its own (left front to left back), legs meet only at the rise. */
  legs = false,
): { added: JoinProposal[]; left: string[]; byLoops: JoinPart[]; surface: JoinPart[] } {
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
  for (const s of [...graph.chosen, ...graph.rejected.filter((x) => x.kind === 'closure-not-seam')])
    if (!twins(s) && !ignore.has(`${s.a}~${s.b}`)) for (const id of sides(s)) markUsed(id);
  const linked = new Set<string>();
  const link = (a: string, b: string) => {
    linked.add(`${a}|${b}`);
    linked.add(`${b}|${a}`);
  };
  for (const s of graph.chosen)
    if (!ignore.has(`${s.a}~${s.b}`))
      for (const a of (s.aParts ?? [s.a]).map(pk))
        for (const b of (s.bParts ?? [s.b]).map(pk)) link(a, b);

  const freeFrac = (g: PieceGeom, e: Edge) => {
    const set = used.get(g.pieceKey);
    if (!set) return 1;
    const n = g.rs.length;
    let tot = 0;
    let free = 0;
    for (let i = e.s; ; i++) {
      const q = ((i % n) + n) % n;
      tot++;
      if (!set.has(q)) free++;
      if (q === ((e.e % n) + n) % n) break;
    }
    return free / Math.max(1, tot);
  };
  const runsOf = (g: PieceGeom): Run[] => {
    const plain = g.edges.filter((e) => e.kind === 'edge').sort((a, b) => a.k - b.k);
    const m = plain.length;
    const [y0, y1] = g.rs.reduce(
      ([lo, hi], p) => [Math.min(lo, p[1]), Math.max(hi, p[1])],
      [Infinity, -Infinity],
    );
    const out: Run[] = [];
    for (let i = 0; i < m; i++)
      for (let L = 1; L <= Math.min(3, m - 1); L++) {
        const es = Array.from({ length: L }, (_, j) => plain[(i + j) % m]);
        if (es.some((e) => freeFrac(g, e) < 0.9)) break;
        // A run follows one line of the contour: it never turns a sharp corner (> 35°) between
        // two of its edges (a waistband's long edge does not continue round its short end).
        if (L > 1) {
          const dir = (p: number[][], end: boolean) => {
            const q = end ? p.slice(-6) : p.slice(0, 6);
            return Math.atan2(q[q.length - 1][1] - q[0][1], q[q.length - 1][0] - q[0][0]);
          };
          const prev = es[L - 2].pts;
          const next = es[L - 1].pts;
          let d = Math.abs(dir(next, false) - dir(prev, true));
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d > (35 * Math.PI) / 180) break;
        }
        const len = es.reduce((t, e) => t + e.lenMm, 0);
        if (len < 50) continue;
        const a = es[0].pts[0];
        const last = es[L - 1].pts;
        const b = last[last.length - 1];
        const mid = es[Math.floor(L / 2)].pts[Math.floor(es[Math.floor(L / 2)].pts.length / 2)];
        out.push({
          piece: g,
          edges: es,
          id: `${g.pieceKey}#${es.map((e) => e.k).join('+')}`,
          len,
          notches: es.reduce((t, e) => t + e.notchesMm.length, 0),
          turn: es.reduce((t, e) => t + e.turnDeg, 0),
          dx: Math.abs(b[0] - a[0]),
          dy: Math.abs(b[1] - a[1]),
          yMid: y1 > y0 ? (mid[1] - y0) / (y1 - y0) : 0.5,
        });
      }
    return out;
  };

  const added: JoinProposal[] = [];
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
  const searchPart = (
    J: DeclaredJoin,
    X: string[],
    others: string[][],
    ply?: { keys: Set<string>; lead: string; sideOk?: (B: Run) => boolean },
  ) => {
    // Already joined to another part of this operation (by the graph or an earlier proposal)? With
    // `ply`: already joined to the ply pair itself.
    if (ply) {
      if (X.some((a) => [...ply.keys].some((b) => linked.has(`${a}|${b}`)))) return;
    } else if (others.some((Y) => X.some((a) => Y.some((b) => linked.has(`${a}|${b}`))))) return;
    const cx = new Set(
      X.map((k) => geomOf.get(k))
        .filter(Boolean)
        .map((g) => classOf_(g!)),
    );
    let best: { A: Run; B: Run; score: number; ratio: number; pleated: boolean } | null = null;
    let skippedTube = 0;
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
          const fronts =
            ['front', 'placket'].includes(readName(ga.name).role ?? '') &&
            ['front', 'placket'].includes(readName(gb.name).role ?? '');
          for (const A of runsOf(ga))
            for (const B of runsOf(gb)) {
              const ratio = Math.min(A.len, B.len) / Math.max(A.len, B.len);
              if (ratio < (ply ? 0.97 : 0.82)) continue;
              if (ply?.sideOk && !ply.sideOk(B)) continue;
              // Through a ply pair only a plain, clear seam (a shoulder): no short bits (an
              // armhole end of the yoke, a placket's end), no notch disagreement.
              if (ply && (Math.min(A.len, B.len) < 120 || Math.abs(A.notches - B.notches) > 1))
                continue;
              // Left leg onto right leg only at the rise; left front onto right front only as the
              // front opening (a closure, not a seam).
              if (lr && legs && Math.max(A.len, B.len) > 450) continue;
              // …and the rise is in the upper half of both pieces (never two hems).
              if (lr && legs && (A.yMid < 0.5 || B.yMid < 0.5)) continue;
              if (lr && !legs && fronts && Math.max(A.len, B.len) > 300) continue;
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
              if (A.notches && B.notches)
                score += A.notches === B.notches ? -0.05 : 0.04 * Math.abs(A.notches - B.notches);
              score += Math.min(0.15, 0.003 * Math.abs(A.turn + B.turn));
              score += 0.03 * (A.edges.length + B.edges.length - 2);
              const horiz = (r: Run) => r.dx > r.dy;
              // Two hems are never sewn to each other.
              if (horiz(A) && horiz(B) && A.yMid < 0.4 && B.yMid < 0.4) score += 0.15;
              // A vertical edge onto a horizontal one is unlikely.
              if (horiz(A) !== horiz(B) && Math.max(A.dx, A.dy) > 120 && Math.max(B.dx, B.dy) > 120)
                score += 0.1;
              if (!best || score < best.score - 1e-9) best = { A, B, score, ratio, pleated };
            }
        }
      }
    }
    if (!best || best.score > 0.25) {
      if (ply) return;
      if (skippedTube === others.length) {
        byLoops.push({ join: J.label, part: X });
        return;
      }
      // A small piece onto a big one with no edge to match: a flap, welt or patch sewn onto the
      // panel's face — not an edge-to-edge seam the doll can draw.
      const big = Math.max(...others.map(areaOf));
      const small = Math.min(areaOf(X), big);
      const surf = (Y: string[]) =>
        areaOf(Y) < 0.2 * areaOf(X) && !hasRole(Y, ['body', 'sleeve', 'neck', 'cuff', 'band']);
      if (
        (small < 0.2 * big && !hasRole(X, ['body', 'sleeve', 'neck', 'cuff', 'band'])) ||
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
        rule: `from the technologist's order «${J.label}»${plyWords}${pleatWords}`,
        aLenMm: A.len,
        bLenMm: B.len,
      },
      ...(A.edges.length > 1 ? { aParts: A.edges.map((e) => e.id) } : {}),
      ...(B.edges.length > 1 ? { bParts: B.edges.map((e) => e.id) } : {}),
    };
    markUsed(A.id);
    markUsed(B.id);
    link(A.piece.pieceKey, B.piece.pieceKey);
    added.push({
      seam,
      join: J.label,
      note: `proposed (from the technologist's order «${J.label}») · ${A.id} ↔ ${B.id} · ${A.len.toFixed(0)} ≈ ${B.len.toFixed(0)} mm${A.notches || B.notches ? ` · notches ${A.notches}/${B.notches}` : ''}${pleatWords}${plyWords}`,
    });
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
  return { added, left, byLoops, surface };
}
