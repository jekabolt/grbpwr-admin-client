import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';

/**
 * A confirmed row whose two sides cannot be one seam (one shoulder against both back shoulders and
 * the other front shoulder; one side seam against three side edges) is several seams a person picked
 * in one go. When its edges pair up into seams that each fit in length and each meet another row at
 * both corners (the two edges' neighbours are sewn by one row — the armhole both shoulders run into),
 * and exactly one such pairing exists, the doll sews those seams instead of pulling the whole run
 * onto one edge. The row stays a contradiction in the report: the card still says it wrong.
 *
 * A row whose one side is two edges of one piece, each as long as the other side (a placket strip
 * whose both long edges are sewn to the front edge), is a strip folded over that edge: one ply on
 * the face, one on the back. Read as one run it pulls twice the strip onto the edge and crumples
 * the front. The doll draws the strip unfolded and sews one of its edges; the row is right.
 */

/** The row as a whole: the same reading the doll's "not one seam" contradiction makes. */
export const MULTI_PICK_DIFF = 0.35;
/** Two edges of one pair: as close in length as a plain seam (mm, share of the longer). */
const PAIR_ABS_MM = 5;
const PAIR_REL = 0.12;
/** Larger runs are not searched: 7 pairings at 4 edges, 105 at 8. */
const MAX_PARTS = 8;

export type MultiPickSplit = {
  /** `a~b` of the row as the report names it. */
  id: string;
  /** Lengths of the row's two sides, mm. */
  la: number;
  lb: number;
  into: [EdgeId, EdgeId][];
  /** A strip folded over `edge`: `ply` is sewn, `over` (its other edge) folds round. */
  fold?: { ply: EdgeId; over: EdgeId; edge: EdgeId[] };
};

const pieceOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
const near = (lx: number, ly: number) =>
  Math.abs(lx - ly) <= Math.max(PAIR_ABS_MM, PAIR_REL * Math.max(lx, ly));
const partsOf = (c: SeamCandidate, side: 'a' | 'b'): EdgeId[] =>
  (side === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b)).flatMap(edgeIdsOf);

export function splitMultiPickRows(
  rows: readonly SeamCandidate[],
  pieces: readonly PieceGeom[],
): { rows: SeamCandidate[]; splits: MultiPickSplit[] } {
  const len = new Map<EdgeId, number>();
  const neighbours = new Map<EdgeId, EdgeId[]>();
  for (const piece of pieces) {
    const ring = piece.edges.filter((e) => e.kind === 'edge').sort((x, y) => x.k - y.k);
    ring.forEach((e, i) => {
      len.set(e.id, e.lenMm);
      if (ring.length > 2)
        neighbours.set(e.id, [
          ring[(i - 1 + ring.length) % ring.length].id,
          ring[(i + 1) % ring.length].id,
        ]);
    });
  }
  const confirmed = (c: SeamCandidate) => c.provenance?.status === 'confirmed';
  const support = rows
    .filter((c) => confirmed(c) && !c.surface && c.kind !== 'closure-not-seam')
    .map((c) => ({ c, edges: new Set([...partsOf(c, 'a'), ...partsOf(c, 'b')]) }));
  const splits: MultiPickSplit[] = [];
  const out = rows.flatMap((row): SeamCandidate[] => {
    if (
      !confirmed(row) ||
      row.provenance?.source === 'doll' ||
      row.surface ||
      row.closure ||
      row.kind === 'closure-not-seam' ||
      row.range ||
      row.partRange ||
      row.walk
    )
      return [row];
    const A = partsOf(row, 'a');
    const B = partsOf(row, 'b');
    const all = [...A, ...B];
    if (new Set(all).size !== all.length || all.some((e) => !len.has(e))) return [row];
    const sum = (ids: EdgeId[]) => ids.reduce((t, e) => t + len.get(e)!, 0);
    const la = sum(A);
    const lb = sum(B);
    if (1 - Math.min(la, lb) / Math.max(la, lb, 1e-9) <= MULTI_PICK_DIFF) return [row];
    const id = `${row.a}~${row.b}`;
    // Each seam is one edge to one edge: the run's parts and alternatives do not carry over.
    const base: SeamCandidate = { ...row };
    delete base.aParts;
    delete base.bParts;
    delete base.ambiguousWith;
    const foldedOver = (S: EdgeId[], O: EdgeId[]) =>
      S.length === 2 &&
      pieceOf(S[0]) === pieceOf(S[1]) &&
      O.every((e) => pieceOf(e) !== pieceOf(S[0])) &&
      S.every((e) => near(len.get(e)!, sum(O)));
    const strip = foldedOver(A, B) ? 'a' : foldedOver(B, A) ? 'b' : null;
    if (strip) {
      const [S, O] = strip === 'a' ? [A, B] : [B, A];
      const lo = sum(O);
      const off = (e: EdgeId) => Math.abs(len.get(e)! - lo);
      const ply = off(S[1]) < off(S[0]) ? S[1] : S[0];
      const lp = len.get(ply)!;
      splits.push({
        id,
        la,
        lb,
        into: [],
        fold: { ply, over: S.find((e) => e !== ply)!, edge: O },
      });
      const many = O.length > 1;
      const sides: Pick<SeamCandidate, 'a' | 'b' | 'aParts' | 'bParts'> =
        strip === 'a'
          ? { a: ply, b: many ? row.b : O[0], ...(many ? { bParts: O } : {}) }
          : { a: many ? row.a : O[0], b: ply, ...(many ? { aParts: O } : {}) };
      return [
        {
          ...base,
          ...sides,
          kind: many ? ('composite' as const) : ('edge' as const),
          evidence: {
            ...row.evidence,
            dLenMm: Math.abs(lp - lo),
            relLen: Math.abs(lp - lo) / Math.max(lp, lo, 1e-9),
            aLenMm: strip === 'a' ? lp : lo,
            bLenMm: strip === 'a' ? lo : lp,
          },
        },
      ];
    }
    if (all.length < 4 || all.length % 2 || all.length > MAX_PARTS) return [row];
    // Corners: a pair is borne out when one other row sews a neighbour of each of its edges.
    const others = support.filter(({ c }) => c !== row);
    const score = (x: EdgeId, y: EdgeId) => {
      const nx = neighbours.get(x) ?? [];
      const ny = neighbours.get(y) ?? [];
      return others.filter(
        ({ edges }) => nx.some((u) => edges.has(u)) && ny.some((v) => edges.has(v)),
      ).length;
    };
    const fits = (x: EdgeId, y: EdgeId) =>
      pieceOf(x) !== pieceOf(y) && near(len.get(x)!, len.get(y)!);
    const matchings: { pairs: [EdgeId, EdgeId][]; total: number }[] = [];
    const walk = (left: EdgeId[], pairs: [EdgeId, EdgeId][], total: number) => {
      if (!left.length) {
        matchings.push({ pairs, total });
        return;
      }
      const [x, ...rest] = left;
      rest.forEach((y, j) => {
        if (!fits(x, y)) return;
        const s = score(x, y);
        if (s < 1) return;
        walk(
          rest.filter((_, k) => k !== j),
          [...pairs, [x, y]],
          total + s,
        );
      });
    };
    walk(all, [], 0);
    const inA = new Set(A);
    const crossing = matchings.filter(({ pairs }) =>
      pairs.some(([x, y]) => inA.has(x) !== inA.has(y)),
    );
    if (!crossing.length) return [row];
    crossing.sort((p, q) => q.total - p.total);
    if (crossing.length > 1 && crossing[1].total >= crossing[0].total) return [row];
    const into = crossing[0].pairs.map(([x, y]): [EdgeId, EdgeId] =>
      inA.has(y) && !inA.has(x) ? [y, x] : [x, y],
    );
    splits.push({ id, la, lb, into });
    return into.map(([x, y]) => {
      const lx = len.get(x)!;
      const ly = len.get(y)!;
      return {
        ...base,
        a: x,
        b: y,
        kind: 'edge' as const,
        evidence: {
          ...row.evidence,
          dLenMm: Math.abs(lx - ly),
          relLen: Math.abs(lx - ly) / Math.max(lx, ly, 1e-9),
          aLenMm: lx,
          bLenMm: ly,
        },
      };
    });
  });
  return { rows: out, splits };
}
