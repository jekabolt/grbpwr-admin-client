// Solutions → the SeamGraph every reader already works from: the same SeamCandidate shape
// (`operationId` and `assignment` added), closures and stored decisions where the greedy puts them,
// `rejected` best first, components, warnings in words.

import {
  REJECTED_FLOOR,
  candId,
  edgeIdsOf,
  surfaceLayer,
  toCandidate,
  twinKindOf,
  type CandidatePool,
  type PoolCand,
  type Run,
} from '../geometry/match';
import {
  SKELETON,
  type EdgeId,
  type SeamAssignmentSummary,
  type SeamCandidate,
  type SeamGraph,
} from '../types';
import { MARGIN_LIKELY, MARGIN_SURE, type Solution, type Variable } from './model';
import { withRange } from './partials';

const pkOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));

const confidenceOf = (margin: number): NonNullable<SeamCandidate['assignment']>['confidence'] =>
  margin >= MARGIN_SURE ? 'sure' : margin >= MARGIN_LIKELY ? 'likely' : 'ambiguous';

/** Alternatives of a chosen candidate within the ambiguity band (as the greedy lists them). */
function alternativesOf(P: CandidatePool, c: PoolCand, chosen: ReadonlySet<PoolCand>): PoolCand[] {
  const touches = (a: PoolCand, b: PoolCand) => {
    const ea = new Set([...a.u.edges, ...a.v.edges].map((e) => e.id));
    return [...b.u.edges, ...b.v.edges].some((e) => ea.has(e.id));
  };
  const sameAnswer = (x: Run, y: Run) => {
    if (x.chain || y.chain) return false;
    if (Math.abs(x.lenMm - y.lenMm) > SKELETON.lenAbsMm) return false;
    if (x.notchesMm.length !== y.notchesMm.length) return false;
    if (x.piece === y.piece) return P.rules.equivRect && x.piece.rect;
    return P.rules.equivLayers && twinKindOf(x.piece, y.piece) === 'identical';
  };
  const equivalent = (q: PoolCand) =>
    (c.u.id === q.u.id && sameAnswer(c.v, q.v)) ||
    (c.u.id === q.v.id && sameAnswer(c.v, q.u)) ||
    (c.v.id === q.u.id && sameAnswer(c.u, q.v)) ||
    (c.v.id === q.v.id && sameAnswer(c.u, q.u));
  return P.all.filter(
    (q) =>
      q !== c &&
      !q.dropped &&
      q.kind !== 'closure-not-seam' &&
      !chosen.has(q) &&
      Math.abs(q.score - c.score) <= SKELETON.ambiguity &&
      touches(c, q) &&
      !equivalent(q),
  );
}

export function graphOf(
  P: CandidatePool,
  sol: Solution,
  forced: readonly SeamCandidate[],
  forcedSame: ReadonlySet<PoolCand>,
  engineClosures: readonly PoolCand[],
  warnings: string[],
  summary: SeamAssignmentSummary,
  /** The corresponding edge on the other ply of a pair (solve.ts Board.plyMateOf). */
  plyMateOf: (e: EdgeId) => EdgeId | undefined = () => undefined,
  /** Composite seams read after the pair solve (composites.ts), appended to `chosen`. */
  composites: readonly SeamCandidate[] = [],
): SeamGraph {
  const { pieces, decisions, rules } = P;
  const chosenC = new Set<PoolCand>();
  for (const v of sol.chosen) {
    chosenC.add(v.cand);
    if (v.origin) chosenC.add(v.origin);
  }
  const byId = new Map(P.all.map((c) => [candId(c), c]));
  const assigned: SeamCandidate[] = [];
  for (const s of sol.perOp)
    for (const v of s.chosen) {
      // A ply pair sewn onto another ply pair (a second collar on the collar): the second plies
      // take the same seam — said as a seam of their own, as the greedy says it (the doll draws
      // both as layers; the pool scored the pair the same way).
      if (!v.ply && !v.self && v.ea.length === 1 && v.eb.length === 1) {
        const ma = plyMateOf(v.ea[0]);
        const mb = plyMateOf(v.eb[0]);
        const twin = ma && mb ? byId.get([ma, mb].sort().join('~')) : undefined;
        if (twin && !chosenC.has(twin)) {
          chosenC.add(twin);
          const c = toCandidate(twin);
          assigned.push({
            ...c,
            operationId: s.op.id,
            ...(sol.margin.has(v)
              ? {
                  assignment: {
                    margin: sol.margin.get(v)!,
                    confidence: confidenceOf(sol.margin.get(v)!),
                  },
                }
              : {}),
            evidence: {
              ...c.evidence,
              rule: `${c.evidence.rule ? `${c.evidence.rule} · ` : ''}the second plies take the same seam as ${v.cand.u.id} ↔ ${v.cand.v.id} (assigned in «${s.op.label}»)`,
            },
          });
        }
      }
      const margin = sol.margin.get(v);
      const alts = alternativesOf(P, v.cand, chosenC).map((q) => toCandidate(q));
      const c = withRange(toCandidate(v.cand, alts), v.cand);
      const words = `assigned in «${s.op.label}»${
        margin === undefined
          ? ''
          : margin >= MARGIN_SURE
            ? ` — nothing else fits these edges (margin ${margin})`
            : margin >= MARGIN_LIKELY
              ? ` — the next reading is close (margin ${margin})`
              : ` — a near tie (margin ${margin}): check it`
      }`;
      assigned.push({
        ...c,
        operationId: s.op.id,
        ...(margin !== undefined
          ? { assignment: { margin, confidence: confidenceOf(margin) } }
          : {}),
        evidence: {
          ...c.evidence,
          rule: c.evidence.rule ? `${c.evidence.rule} · ${words}` : words,
        },
      });
    }
  const chosen = [...forced, ...assigned, ...composites];

  const decidedClosures = decisions?.closures ?? [];
  const rejected: SeamCandidate[] = [
    ...decidedClosures,
    ...engineClosures.map((c) => toCandidate(c)),
    ...P.all
      .filter(
        (c) =>
          P.excluded.has(c) ||
          (!chosenC.has(c) &&
            !forcedSame.has(c) &&
            c.kind !== 'closure-not-seam' &&
            c.score >= REJECTED_FLOOR),
      )
      .map((c) => toCandidate(c)),
  ];

  if (rules.surface) chosen.push(...surfaceLayer(P, rejected, warnings));

  // Connected components over seams (closures do not join pieces; surface joins do).
  const parent = new Map(pieces.map((p) => [p.pieceKey, p.pieceKey]));
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    parent.set(k, r);
    return r;
  };
  for (const c of chosen) {
    if (c.kind === 'closure-not-seam') continue;
    if (c.surface) {
      parent.set(find(c.surface.host), find(c.surface.part));
      continue;
    }
    const ks = [...(c.aParts ?? edgeIdsOf(c.a)), ...(c.bParts ?? edgeIdsOf(c.b))]
      .map(pkOf)
      .filter((k) => parent.has(k));
    for (const k of ks) parent.set(find(k), find(ks[0]));
  }
  const groups = new Map<string, string[]>();
  for (const p of pieces) {
    const r = find(p.pieceKey);
    groups.set(r, [...(groups.get(r) ?? []), p.pieceKey]);
  }

  const unnotched = pieces.filter((p) => p.notchIdx.length === 0).length;
  if (pieces.length && unnotched === pieces.length)
    warnings.push('no notches in the pattern — every pair rests on length alone');
  else if (unnotched > 0) warnings.push(`${unnotched} of ${pieces.length} pieces carry no notches`);
  if (decisions) warnings.push(...decisions.words);

  return {
    pieces: [...pieces],
    chosen,
    rejected,
    components: [...groups.values()],
    warnings,
    assignment: summary,
  };
}

/** The pool candidate a stored (forced) seam stands for, when the engine scored the same two runs. */
export function sameAs(P: CandidatePool, c: SeamCandidate): PoolCand | undefined {
  const id = [c.a, c.b].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).join('~');
  return P.all.find((q) => candId(q) === id);
}

export type { Variable };
