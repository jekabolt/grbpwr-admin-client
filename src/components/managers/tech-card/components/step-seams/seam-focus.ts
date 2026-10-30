import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { focusPieces } from './step-picture';

type Group = { name: string; pieces: readonly string[] };

/**
 * The canvas's groups cut to the pieces of the seam on the table, or null when that cut would
 * leave a side of the step with nothing drawn: a lone pick whose partner is not found would hide
 * the other input, and with it every edge the next pick needs (the collar on «place»).
 */
export function seamFocus(
  groups: readonly Group[],
  seamPieces: ReadonlySet<string>,
  inner: readonly SeamCandidate[],
): { name: string; pieces: string[] }[] | null {
  if (!seamPieces.size) return null;
  const cut = groups.map((g) => ({
    name: g.name,
    pieces: focusPieces(g.pieces, seamPieces, inner),
  }));
  const kept = cut.filter((g) => g.pieces.length > 0);
  const twoSides =
    groups.length >= 2
      ? kept.length >= 2
      : (kept[0]?.pieces.length ?? 0) >= 2 || (groups[0]?.pieces.length ?? 0) < 2;
  return twoSides ? kept : null;
}
