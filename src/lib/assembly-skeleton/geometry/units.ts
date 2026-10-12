// Units of the technologist's order, read into the seam graph before the doll groups its pieces
// (11.10 prod corpus: SS26-011's back yoke is TWO pieces per side — the order sews
// «Back_Top_L_R + Back_Top_R_R → BACK TOP LEFT» first, then that unit onto the left back leg).
//
//  1. A unit sewn first from two single pieces is laid flat, side by side: of the graph's seams
//     between the two, the one whose joint makes the unit's composite edge that fits the piece the
//     order sews the unit onto next is kept (length within 3 %, both ends true up, the joint on a
//     notch of that edge when it has one); the others between the same two pieces are dropped —
//     a second seam would close the unit into a tube (two yoke bottoms sewn to each other, a centre
//     back onto an outer side). The composite edge onto that piece is added as a seam.
//  2. Pieces the order sets as hardware (HARDWARE_SET: an elastic) are not shell: their seams go.
//  3. A seam sewn on top of a leg panel (the yoke on the back leg) continues the leg's seams across
//     it: the back's outseam runs on up the yoke's outer edge (one composite edge against the
//     front's outseam, within the leg ease), and the crotch runs on up the yoke's centre edges.
//
// Geometry and the order only — no piece name is read here.

import { gluedRuns, type GluedRun } from './composite';
import { legPanels, sameLeg } from './legs';
import { cornerTurn } from './match';
import {
  SKELETON,
  type Edge,
  type EdgeId,
  type PieceGeom,
  type SeamCandidate,
  type SeamGraph,
} from '../types';

/** One operation of the technologist's order: each part is the set of pieces of one input. */
export type OrderJoin = { label: string; parts: string[][] };

export type UnitsResult = {
  graph: SeamGraph;
  /** Graph seams taken out, with why (said in the report). */
  dropped: { id: string; a: EdgeId[]; b: EdgeId[]; note: string }[];
  /** Seams added (composite edges of units, continuations), with why and the order's operation. */
  added: { seam: SeamCandidate; note: string; join: string }[];
  words: string[];
};

/** A unit's composite edge onto the next piece: length within this share (or lenAbsMm). */
const UNIT_REL = 0.03;
/** Leg ease the back may carry over the front (as in the matcher's leg rule). */
const LEG_EASE_REL = 0.05;
const LEG_EASE_MM = 40;
/** Summed end error (deg) above which two runs do not true up. */
const ENDS_MAX_DEG = 45;
/** A joint lies on a notch when within this (mm, scaled to the edge's length). */
const JOINT_NOTCH_MM = 8;
/** Boundary turn at a joint (deg) for the run to continue across it. */
const SOFT_DEG = 45;

const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const sideIds = (c: SeamCandidate, w: 'a' | 'b') =>
  (w === 'a' ? c.aParts ?? [c.a] : c.bParts ?? [c.b]).flatMap((id) => {
    const at = id.lastIndexOf('#');
    return id
      .slice(at + 1)
      .split('+')
      .map((k) => `${id.slice(0, at)}#${k}`);
  });
const piecesOf = (c: SeamCandidate) => new Set([...sideIds(c, 'a'), ...sideIds(c, 'b')].map(pk));

type Fit = { rel: number; endsErr: number; notch: boolean; score: number };

/**
 * How a run of parts (in boundary order) lies on edge `f` of piece `P`, face up: the run's start
 * sits on f's end. Null when the lengths are further apart than `maxRel` / `maxMm`.
 */
function fitRun(
  R: { lenMm: number; turnStart: number; turnEnd: number; joints: number[] },
  f: Edge,
  P: PieceGeom,
  maxRel: number,
  maxMm = Infinity,
): Fit | null {
  const d = Math.abs(R.lenMm - f.lenMm);
  const rel = d / Math.max(R.lenMm, f.lenMm, 1e-9);
  if (d > SKELETON.lenAbsMm && (rel > maxRel || d > maxMm)) return null;
  const tf0 = cornerTurn(P, f.s);
  const tf1 = cornerTurn(P, f.e);
  const endsErr =
    Math.abs(180 - R.turnStart + (180 - tf1) - 180) + Math.abs(180 - R.turnEnd + (180 - tf0) - 180);
  if (endsErr > ENDS_MAX_DEG) return null;
  const scale = f.lenMm / Math.max(1e-9, R.lenMm);
  const fromEnd = f.notchesMm.map((x) => f.lenMm - x);
  const notch = R.joints.some((j) =>
    fromEnd.some((x) => Math.abs(x - j * scale) <= JOINT_NOTCH_MM),
  );
  const score =
    1 - 0.3 * Math.min(1, rel / Math.max(maxRel, 1e-9)) - 0.3 * (endsErr / 60) + (notch ? 0.2 : 0);
  return { rel, endsErr, notch, score };
}

const composite = (
  f: Edge,
  parts: Edge[],
  fit: Fit,
  lenParts: number,
  rule: string,
): SeamCandidate => {
  const longest = parts.reduce((m, e) => (e.lenMm > m.lenMm ? e : m));
  return {
    a: f.id,
    b: longest.id,
    bParts: parts.map((e) => e.id),
    score: Math.round(Math.max(SKELETON.accept, Math.min(0.95, fit.score)) * 1000) / 1000,
    kind: 'composite',
    evidence: {
      dLenMm: Math.abs(f.lenMm - lenParts),
      relLen: fit.rel,
      notchScore: fit.notch ? 0.7 : null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
      rule,
      aLenMm: f.lenMm,
      bLenMm: lenParts,
      notchesMatched: fit.notch ? 1 : 0,
    },
  };
};

export function orderUnits(
  graph: SeamGraph,
  joins: readonly OrderJoin[],
  /** Pieces never sewn as shell here (surface pieces, lining at level 0, interfacing). */
  skip: ReadonlySet<string>,
  /** The order's hardware pieces, by key → the operation's label. */
  hardware: ReadonlyMap<string, string>,
): UnitsResult {
  const geom = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const name = (k: string) => geom.get(k)?.name ?? k;
  let chosen = [...graph.chosen];
  const rejected = [...graph.rejected];
  const dropped: UnitsResult['dropped'] = [];
  const added: UnitsResult['added'] = [];
  const words: string[] = [];
  const drop = (c: SeamCandidate, note: string) => {
    chosen = chosen.filter((x) => x !== c);
    rejected.unshift({ ...c, evidence: { ...c.evidence, rule: note } });
    dropped.push({ id: `${c.a}~${c.b}`, a: sideIds(c, 'a'), b: sideIds(c, 'b'), note });
  };

  // 2. Hardware is not shell.
  for (const c of [...chosen]) {
    const hw = [...piecesOf(c)].find((k) => hardware.has(k));
    if (!hw) continue;
    const others = [...piecesOf(c)].filter((k) => !hardware.has(k));
    if (!others.length) continue; // hardware plies sewn to each other: their own business
    if (c.provenance?.status === 'confirmed') continue; // a person's decision stands, said in L4
    drop(
      c,
      `not sewn — ${name(hw)} is hardware in the order («${hardware.get(hw)}»: an elastic / tape inside the garment), not a panel: ${c.a} ↔ ${c.b} paired it by length alone`,
    );
  }

  const edgeById = new Map<EdgeId, Edge>();
  for (const g of graph.pieces) for (const e of g.edges) edgeById.set(e.id, e);
  /** Edge `id` is taken by a seam to a piece the doll draws (not a surface / skipped piece). */
  const takenByShell = (id: EdgeId) =>
    chosen.some((c) => {
      const a = sideIds(c, 'a');
      const b = sideIds(c, 'b');
      const [mine, other] = a.includes(id) ? [a, b] : b.includes(id) ? [b, a] : [null, null];
      return !!mine && !!other && other.some((x) => !skip.has(pk(x)) && pk(x) !== pk(id));
    });

  // 1. Units of two single pieces sewn first.
  const shellOf = (X: string[]) => X.filter((k) => !skip.has(k) && geom.has(k));
  joins.forEach((J, i) => {
    if (J.parts.length !== 2) return;
    const [P0, P1] = J.parts.map(shellOf);
    if (P0.length !== 1 || P1.length !== 1 || P0[0] === P1[0]) return;
    const A = P0[0];
    const B = P1[0];
    // The next operation sewing the unit onto a shell piece (a pocket laid on it first is not one).
    const partnersOf = (J2: OrderJoin) =>
      J2.parts.some((X) => X.includes(A) && X.includes(B))
        ? J2.parts
            .filter((X) => !(X.includes(A) && X.includes(B)))
            .flatMap(shellOf)
            .filter((k) => k !== A && k !== B)
        : [];
    const next = joins.slice(i + 1).find((J2) => partnersOf(J2).length > 0);
    if (!next) return;
    const Y = partnersOf(next);
    const AB = chosen.filter((c) => {
      if (c.kind !== 'edge' || c.aParts || c.bParts) return false;
      const ks = piecesOf(c);
      return ks.size === 2 && ks.has(A) && ks.has(B);
    });
    if (!AB.length) return;
    const gA = geom.get(A)!;
    const gB = geom.get(B)!;
    let best: { s: SeamCandidate; R: GluedRun; f: Edge; fit: Fit } | null = null;
    for (const s of AB)
      for (const R of gluedRuns([gA, gB], [s])) {
        if (R.closed || R.pieces.length !== 2) continue;
        for (const k of Y) {
          const P = geom.get(k)!;
          for (const f of P.edges) {
            if (takenByShell(f.id)) continue;
            const ft = fitRun(R, f, P, UNIT_REL);
            if (ft && (!best || ft.score > best.fit.score)) best = { s, R, f, fit: ft };
          }
        }
      }
    if (!best) return;
    const B0 = best;
    // A person's confirmed seam between the two is never dropped: the unit reading stands only
    // when it is laid along that seam.
    if (AB.some((c) => c !== B0.s && c.provenance?.status === 'confirmed')) return;
    for (const c of AB)
      if (c !== B0.s)
        drop(
          c,
          `not sewn — the order sews ${name(A)} and ${name(B)} first, as one unit («${J.label}»), laid flat side by side along ${B0.s.a} ↔ ${B0.s.b}: a second seam between them would close the unit into a tube`,
        );
    // The unit's edge onto the next piece: a pocket / facing seam on that edge is a layer, kept.
    const lenParts = B0.R.lenMm;
    const seam = composite(
      B0.f,
      B0.R.parts,
      B0.fit,
      lenParts,
      `the order's unit «${J.label}» (${name(A)} + ${name(B)}, sewn first) onto ${name(pk(B0.f.id))} («${next.label}»): its edge ${B0.R.parts.map((e) => e.id).join(' + ')} ${Math.round(lenParts)} ${B0.fit.rel <= SKELETON.lenRel ? '=' : '≈'} ${Math.round(B0.f.lenMm)} mm${B0.fit.notch ? ', the unit’s seam on the notch' : ''}, both ends true up`,
    );
    chosen.push(seam);
    added.push({ seam, note: seam.evidence.rule ?? '', join: next.label });
    words.push(
      `the order's unit «${J.label}»: ${name(A)} + ${name(B)} sewn side by side, then onto ${name(pk(B0.f.id))} along their joint edge (${Math.round(lenParts)} mm)`,
    );
  });

  // 3. Leg seams continued across a unit sewn on top of a leg panel.
  const legs = legPanels(graph.pieces);
  /** The order's operation that sewed the unit piece `k` on (for the report's order joins). */
  const unitJoinOf = (k: string) =>
    added.find((x) => (x.seam.bParts ?? []).some((id) => pk(id) === k))?.join ?? '';
  if (legs.size >= 2 && added.length) {
    /** The edge of the unit continuing leg edge `e` across composite seam `c` at e's waist end. */
    const across = (e: Edge, P: PieceGeom): { g: Edge; G: PieceGeom; after: boolean } | null => {
      for (const c of chosen) {
        if (c.kind !== 'composite' || !c.bParts || c.aParts) continue;
        const f = edgeById.get(c.a);
        if (!f || f.pieceKey !== P.pieceKey) continue;
        const parts = c.bParts.map((id) => edgeById.get(id)).filter((x): x is Edge => !!x);
        if (parts.length !== c.bParts.length) continue;
        // (contour indices wrap on the ring of the piece that owns them: P's for f / e, the
        // unit piece's for its own edges)
        const near = (Q: PieceGeom, i: number, j: number) => {
          const n = Q.rs.length;
          return Math.min(Math.abs(i - j), n - Math.abs(i - j)) <= 2;
        };
        // Face up: the run's start sits on f's end, its end on f's start.
        if (near(P, f.e, e.s)) {
          const first = parts[0];
          const G = geom.get(first.pieceKey)!;
          const g = G.edges.find((x) => near(G, x.e, first.s) && x !== first);
          const turn = cornerTurn(P, e.s) + cornerTurn(G, first.s) - 180;
          if (g && Math.abs(turn) <= SOFT_DEG) return { g, G, after: false };
        }
        if (near(P, f.s, e.e)) {
          const last = parts[parts.length - 1];
          const G = geom.get(last.pieceKey)!;
          const g = G.edges.find((x) => near(G, x.s, last.e) && x !== last);
          const turn = cornerTurn(P, e.e) + cornerTurn(G, last.e) - 180;
          if (g && Math.abs(turn) <= SOFT_DEG) return { g, G, after: true };
        }
      }
      return null;
    };
    const sewn = (x: Edge, y: Edge) =>
      chosen.some((c) => {
        const a = sideIds(c, 'a');
        const b = sideIds(c, 'b');
        return (a.includes(x.id) && b.includes(y.id)) || (a.includes(y.id) && b.includes(x.id));
      });
    const list = [...legs.values()];
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < list.length; j++) {
        const F = list[i];
        const Bk = list[j];
        if (i === j || !sameLeg(F, Bk)) continue;
        for (const role of ['outseam', 'inseam'] as const) {
          const ef = F[role];
          const eb = Bk[role];
          if (sewn(ef, eb) || takenByShell(ef.id) || takenByShell(eb.id)) continue;
          const x = across(eb, Bk.piece);
          if (!x || takenByShell(x.g.id)) continue;
          const parts = x.after ? [eb, x.g] : [x.g, eb];
          const P0 = geom.get(parts[0].pieceKey)!;
          const P1 = geom.get(parts[parts.length - 1].pieceKey)!;
          const R = {
            lenMm: eb.lenMm + x.g.lenMm,
            turnStart: cornerTurn(P0, parts[0].s),
            turnEnd: cornerTurn(P1, parts[parts.length - 1].e),
            joints: [parts[0].lenMm],
          };
          const ft = fitRun(R, ef, F.piece, LEG_EASE_REL, LEG_EASE_MM);
          if (!ft) continue;
          const seam = composite(
            ef,
            parts,
            ft,
            R.lenMm,
            `trouser leg: ${F.piece.name} ${role} ↔ ${Bk.piece.name} ${role} running on up ${x.G.name} (the unit sewn on top of it): ${Math.round(eb.lenMm)} + ${Math.round(x.g.lenMm)} = ${Math.round(R.lenMm)} ${ft.rel <= SKELETON.lenRel ? '=' : '≈'} ${Math.round(ef.lenMm)} mm${ft.notch ? ', the joint on its notch' : ''}`,
          );
          chosen.push(seam);
          added.push({ seam, note: seam.evidence.rule ?? '', join: unitJoinOf(x.G.pieceKey) });
        }
      }
    // The crotch runs on up the units on top of the two rises: the centre seam is one composite
    // from the crotch point to the waist, through the units (the back rise, then the yoke's centre
    // edge) — it replaces the rise-to-rise seam.
    for (const c of [...chosen]) {
      const a = sideIds(c, 'a');
      const b = sideIds(c, 'b');
      if (a.length !== 1 || b.length !== 1) continue;
      const La = legs.get(pk(a[0]));
      const Lb = legs.get(pk(b[0]));
      if (!La || !Lb || La.rise.id !== a[0] || Lb.rise.id !== b[0]) continue;
      const xa = across(La.rise, La.piece);
      const xb = across(Lb.rise, Lb.piece);
      if (!xa || !xb || xa.G === xb.G || sewn(xa.g, xb.g)) continue;
      if (takenByShell(xa.g.id) || takenByShell(xb.g.id)) continue;
      const d = Math.abs(xa.g.lenMm - xb.g.lenMm);
      if (d > Math.max(SKELETON.lenAbsMm, 0.03 * Math.max(xa.g.lenMm, xb.g.lenMm))) continue;
      const partsA = xa.after ? [La.rise, xa.g] : [xa.g, La.rise];
      const partsB = xb.after ? [Lb.rise, xb.g] : [xb.g, Lb.rise];
      const lenA = La.rise.lenMm + xa.g.lenMm;
      const lenB = Lb.rise.lenMm + xb.g.lenMm;
      const dd = Math.abs(lenA - lenB);
      const seam: SeamCandidate = {
        a: La.rise.id,
        b: Lb.rise.id,
        aParts: partsA.map((e) => e.id),
        bParts: partsB.map((e) => e.id),
        score: c.score,
        kind: 'composite',
        evidence: {
          ...c.evidence,
          dLenMm: dd,
          relLen: dd / Math.max(lenA, lenB),
          rule: `crotch: the centre seam runs from the crotch point up ${La.piece.name} / ${Lb.piece.name} and on up ${xa.G.name} / ${xb.G.name} (the units sewn on top of the rises): ${Math.round(La.rise.lenMm)} + ${Math.round(xa.g.lenMm)} ≈ ${Math.round(Lb.rise.lenMm)} + ${Math.round(xb.g.lenMm)} mm`,
          aLenMm: lenA,
          bLenMm: lenB,
        },
      };
      chosen = chosen.filter((x) => x !== c);
      chosen.push(seam);
      added.push({
        seam,
        note: seam.evidence.rule ?? '',
        join: unitJoinOf(xa.G.pieceKey) || unitJoinOf(xb.G.pieceKey),
      });
    }
  }

  if (!dropped.length && !added.length) return { graph, dropped, added, words };
  // Components over the seams now chosen.
  const parent = new Map(graph.pieces.map((p) => [p.pieceKey, p.pieceKey]));
  const root = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  for (const c of chosen) {
    if (c.kind === 'closure-not-seam') continue;
    const ks = [...piecesOf(c)].filter((k) => parent.has(k));
    for (const k of ks) parent.set(root(k), root(ks[0]));
  }
  const comps = new Map<string, string[]>();
  for (const p of graph.pieces)
    comps.set(root(p.pieceKey), [...(comps.get(root(p.pieceKey)) ?? []), p.pieceKey]);
  return {
    graph: { ...graph, chosen, rejected, components: [...comps.values()] },
    dropped,
    added,
    words,
  };
}
