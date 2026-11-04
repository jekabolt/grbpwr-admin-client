// A strip is shorter than its seam on purpose: elastic is sewn stretched. So its side is read through
// its fit (sewn / fit%), and a whole-mm cut length can land a hair off the seam it was computed from,
// so the comparison allows that rounding on top of the step's own tolerance. A strip whose length a
// person typed (per size, one length, a manual cut) states no relation to the seam at all: exempt.
import type { PieceGeom } from 'lib/assembly-skeleton/types';

import { lengthsDiffer } from '../step-seams/seam-length';

export type StripSideRead =
  | { kind: 'plain' }
  | { kind: 'exempt' }
  | { kind: 'through'; lengthMm: number; allowanceMm: number };

/** How one side of a seam is read, given the side's plain length and its pieces. */
export function readStripSide(
  lengthMm: number,
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): StripSideRead {
  const marks = pieces.flatMap((key) => {
    const mark = geoms.get(key)?.cutStrip;
    return mark ? [mark] : [];
  });
  if (marks.length === 0) return { kind: 'plain' };
  const [mark] = marks;
  // A side of a strip and something else states no one length to compare.
  if (marks.length !== new Set(pieces).size) return { kind: 'exempt' };
  // By its end: the width edge, which no fit stretches.
  if (lengthMm < mark.sewnMm / 2) return { kind: 'plain' };
  if (mark.mode !== 'from_seam' || mark.manual || !(mark.fitPct > 0)) return { kind: 'exempt' };
  const fit = mark.fitPct / 100;
  return { kind: 'through', lengthMm: lengthMm / fit, allowanceMm: Math.ceil(0.5 / fit) };
}

export type SeamLengthCheck = {
  /** The lengths the verdict compares: the plain ones unless a strip is on a side. */
  a: number;
  b: number;
  allowanceMm: number;
  exempt: boolean;
};

/** Both sides of a seam, with the strip rule applied. */
export function seamLengthCheck(
  a: number,
  b: number,
  aPieces: readonly string[],
  bPieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamLengthCheck {
  const left = readStripSide(a, aPieces, geoms);
  const right = readStripSide(b, bPieces, geoms);
  if (left.kind === 'exempt' || right.kind === 'exempt')
    return { a, b, allowanceMm: 0, exempt: true };
  return {
    a: left.kind === 'through' ? left.lengthMm : a,
    b: right.kind === 'through' ? right.lengthMm : b,
    allowanceMm: Math.max(
      left.kind === 'through' ? left.allowanceMm : 0,
      right.kind === 'through' ? right.allowanceMm : 0,
    ),
    exempt: false,
  };
}

/** The editor's verdict: `lengthsDiffer`, with the strip rule. A seam with no strip reads as before. */
export function seamLengthsDiffer(
  a: number,
  b: number,
  aPieces: readonly string[],
  bPieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  toleranceMm: number,
): boolean {
  const check = seamLengthCheck(a, b, aPieces, bPieces, geoms);
  return !check.exempt && lengthsDiffer(check.a, check.b, toleranceMm + check.allowanceMm);
}

/** One side's length as the Δ should read it: a strip through its fit, anything else as it is. */
export function fittedSideMm(
  lengthMm: number,
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): number {
  const read = readStripSide(lengthMm, pieces, geoms);
  return read.kind === 'through' ? read.lengthMm : lengthMm;
}
