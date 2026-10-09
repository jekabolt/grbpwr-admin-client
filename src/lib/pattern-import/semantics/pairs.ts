// Pairs (owner decision 9, D1'): a piece cut twice as a left and a right hand is written as TWO
// blocks, `_L` and `_R`, the second the explicit mirror of the first across its grain line (the
// axis gate G12 checks against). Both hands carry piecesPerGarment for ONE hand; the card cuts the
// pair IDENTICAL from both drawn blocks.
//
// Quantity semantics, from the printed note or the operator:
//   "cut 1 pair" / "1 пара" / "paarig"            → pair, 1 per hand
//   "cut 2" / "2 дет." / "2 x" on an ASYMMETRIC piece → pair, 1 per hand (fabric folded double)
//   "cut 2" on a symmetric piece or on a fold         → 2 identical, no pair
//   "cut 4" on an asymmetric piece (robe's sleeve)    → pair, 2 per hand

import type {
  Affine,
  DrillFeature,
  FoldFeature,
  GrainFeature,
  InternalFeature,
  NotchFeature,
  PieceSizeSpec,
  PtMm,
} from '../types';
import { applyAffine, areaOf, bboxOf, ccw, dist, reflection } from './geom';

/** Mirror of a polyline across the grain line (a→b, infinite). */
export function mirrorAcross(pts: readonly PtMm[], grain: { a: PtMm; b: PtMm }): PtMm[] {
  const M = reflection(grain.a, grain.b);
  return pts.map((p) => applyAffine(M, p));
}

/** Every geometric part of one size spec through an affine map (orientation restored to CCW). */
export function transformSizeSpec(s: PieceSizeSpec, t: Affine): PieceSizeSpec {
  const P = (p: PtMm) => applyAffine(t, p);
  const grain: GrainFeature | null = s.grain
    ? (() => {
        const a = P(s.grain.a);
        const b = P(s.grain.b);
        return { ...s.grain, a, b, angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
      })()
    : null;
  const notches: NotchFeature[] = s.notches.map((n) => ({
    ...n,
    at: P(n.at),
    seg: [P(n.seg[0]), P(n.seg[1])],
  }));
  const drills: DrillFeature[] = s.drills.map((d) => ({ ...d, at: P(d.at) }));
  const internal: InternalFeature[] = s.internal.map((f) => ({ ...f, pts: f.pts.map(P) }));
  const fold: FoldFeature | null = s.fold ? { ...s.fold, a: P(s.fold.a), b: P(s.fold.b) } : null;
  const cut = ccw(s.cut.map(P));
  return {
    ...s,
    cut,
    seam: s.seam ? ccw(s.seam.map(P)) : null,
    grain,
    notches,
    drills,
    internal,
    fold,
    bbox: bboxOf(cut),
    areaMm2: areaOf(cut),
  };
}

/** The other hand of one size: the mirror across that size's grain. Null without a grain. */
export function mirrorSizeAcrossGrain(s: PieceSizeSpec): { size: PieceSizeSpec; t: Affine } | null {
  if (!s.grain || !(dist(s.grain.a, s.grain.b) > 0)) return null;
  const t = reflection(s.grain.a, s.grain.b);
  return { size: transformSizeSpec(s, t), t };
}

export type PairPlan = {
  /** Two blocks `_L`/`_R` (one drawn, one mirrored), or none. */
  pair: boolean;
  /** Pieces per garment of EACH written identity. */
  perIdentity: number;
  why: string;
};

/**
 * From a printed/declared quantity and the shape: is this a pair, and how many per hand?
 * `qty` = pieces per garment as printed (a pair counted 2, `parseQuantity`); `saysPair` = the text
 * itself says pair/paarig/пара.
 */
export function planPair(opts: {
  qty: number | null;
  saysPair: boolean;
  symmetric: boolean;
  onFold: boolean;
  /** The name already carries a hand (FP_L drawn next to FP_R): never re-paired. */
  namedHand: boolean;
}): PairPlan {
  const { qty, saysPair, symmetric, onFold, namedHand } = opts;
  if (namedHand)
    return {
      pair: false,
      perIdentity: Math.max(1, qty && qty % 2 === 0 ? qty / 2 : 1),
      why: 'hand in the name',
    };
  if (saysPair) {
    const n = qty && qty >= 2 ? qty : 2;
    return { pair: true, perIdentity: Math.max(1, Math.floor(n / 2)), why: 'the note says pair' };
  }
  if (qty == null) return { pair: false, perIdentity: 1, why: 'no quantity printed — 1' };
  if (qty >= 2 && qty % 2 === 0 && !symmetric && !onFold)
    return {
      pair: true,
      perIdentity: qty / 2,
      why: `cut ${qty} of an asymmetric piece = ${qty / 2} pair(s)`,
    };
  return {
    pair: false,
    perIdentity: qty,
    why: `cut ${qty}${symmetric ? ' (symmetric piece)' : ''}${onFold ? ' (on fold)' : ''}`,
  };
}

export const PAIR_WORDS =
  /\bpairs?\b|\bpaarig\b|\bpaar\b|\bпар[аыу]?\b|\bpaire\b|\bpara\b|\bpar\b/iu;
