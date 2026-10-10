// How many physical pieces one card piece stands for — read from the card's cut symmetry and
// pieces-per-garment, the same for the geometry (lane A) and the order (lane B).
//
//   MIRRORED × 2 — one block cut twice, the second reflected: a LEFT and a RIGHT hand under one key.
//                  Its edges may meet both sides of one symmetric piece (the back's two shoulders),
//                  and the step that sets it covers both hands at once («Set sleeves ×2»).
//   IDENTICAL × n — n layers of one shape under one key (two pocket bags): «×n», no hands.
//   FOLD          — cut on the fold: ONE piece whatever the count says; never a mirrored pair.

import type { SkeletonPieceInput } from './types';

type CutFacts = Pick<SkeletonPieceInput, 'piecesPerGarment' | 'cutSymmetry'>;

/** One key, both hands: a mirrored block cut twice. */
export function isMirroredPair(p: CutFacts): boolean {
  return (p.piecesPerGarment ?? 1) >= 2 && /MIRROR/i.test(p.cutSymmetry ?? '');
}

/** Physical pieces behind the key (FOLD is one piece). */
export function pieceMultiplicity(p: CutFacts): number {
  if (/FOLD/i.test(p.cutSymmetry ?? '')) return 1;
  return Math.max(1, Math.round(p.piecesPerGarment || 1));
}
