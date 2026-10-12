// Integer costs. The pool's score (0.45·length + 0.45·notches + 0.1·curvature − penalties, with
// the rules' words) is the evidence; the benefit of a seam is how far above the accept line it is,
// in hundredths. Deterministic ties are broken by the candidate's id, never by input order.
//
// Names come LAST: a role matrix only vetoes pairs that never meet (two sleeves, a sleeve and a
// collar). Role-specific ease (the trouser back onto its front +3–5 %) is already in the pool's
// leg rule (legs.ts); the composite / sandwich / partial costs land with those candidates
// (phase 3).

import { readName } from '../skeleton/model';
import { SKELETON, type PieceGeom } from '../types';
import type { PoolCand } from '../geometry/match';

/**
 * Benefit of taking a pool candidate: round(100 · (score − accept)) + a length term. Two equal
 * lengths are evidence in proportion to the length (a 485-mm exact match is no coincidence, a
 * 164-mm one may be — 12.10 corpus: a shirt's shoulders and its back's armhole tops are both 164):
 * +1 per 80 mm of the shorter side, at most +8, so it orders ties and conflicts, never outweighs a
 * notch band (14).
 */
export const benefitOf = (c: PoolCand): number =>
  Math.round(100 * (c.score - SKELETON.accept)) +
  Math.min(8, Math.floor(Math.min(c.u.lenMm, c.v.lenMm) / 80)) -
  // …and the two edges are one sewing line: a straight edge onto a strongly curved one (a shoulder
  // onto an armhole top, 164 = 164) pays by the RMS of their profiles (mm / 3, at most 10).
  Math.min(10, Math.round(c.parts.shapeRmsMm / 3));

/**
 * Candidates below this score are never taken, not even to join an operation's inputs: the order's
 * word orders the acceptable readings, it does not admit a pairing the evidence refuses (12.10: a
 * «collars» step forced the fall's neck edge onto a trim strip at 0.56).
 */
export const FORCE_FLOOR = SKELETON.accept;

/** Roles that never meet edge to edge (both roles read from the names; else no veto). */
const NEVER: [string, string][] = [
  ['sleeve', 'collar'],
  ['sleeve', 'stand'],
  ['sleeve', 'waistband'],
  ['sleeve', 'hemband'],
  ['cuff', 'collar'],
  ['cuff', 'stand'],
  ['cuff', 'waistband'],
  ['collar', 'waistband'],
  ['stand', 'waistband'],
  ['collar', 'hemband'],
  ['pocket', 'sleeve'],
  ['pocket', 'collar'],
  ['pocket', 'stand'],
  ['pocket', 'cuff'],
];

const roleCache = new WeakMap<PieceGeom, string | null>();
export const roleOf = (p: PieceGeom): string | null => {
  let r = roleCache.get(p);
  if (r === undefined) {
    r = readName(p.name).role;
    roleCache.set(p, r);
  }
  return r;
};

/** The role matrix's veto, in words, or null. */
export function roleVeto(a: PieceGeom, b: PieceGeom): string | null {
  if (a === b) return null;
  const ra = roleOf(a);
  const rb = roleOf(b);
  if (!ra || !rb) return null;
  if (NEVER.some(([x, y]) => (ra === x && rb === y) || (ra === y && rb === x)))
    return `a ${ra} and a ${rb} never meet edge to edge`;
  // The left and the right sleeve (cuff) never meet: mirror twins, or named for opposite hands.
  // (an upper and an under sleeve of ONE hand are sewn along both their long edges — allowed)
  if ((ra === 'sleeve' || ra === 'cuff') && ra === rb) {
    const mirror = a.twinOf.some((t) => t.key === b.pieceKey && t.kind === 'mirror');
    if (mirror || (a.hand && b.hand && a.hand !== b.hand))
      return `the left and the right ${ra} never meet`;
  }
  return null;
}
