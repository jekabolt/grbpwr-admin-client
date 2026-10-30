import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import { plainEdges } from '../assembly-seams/words';
import { focusPieces, PARTNER_REL } from './step-picture';
import { deltaMm } from './step-seams-model';

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

type PlacePiece = { inner: readonly unknown[]; geom: PieceGeom };

/**
 * Whether «place» has anywhere to drop the part: an inner line on a host to lay it on, or a free
 * host edge a free part edge can snap to by length. Without either the drag can only spring back.
 */
export function placeHasDrop(
  hosts: readonly PlacePiece[],
  part: PlacePiece,
  taken: (id: EdgeId) => boolean,
  ease: number | null,
): boolean {
  if (hosts.some((h) => h.inner.length > 0)) return true;
  const free = (g: PieceGeom) =>
    plainEdges(g)
      .filter((e) => !taken(e.id) && e.lenMm >= 30)
      .map((e) => e.lenMm);
  const partLens = free(part.geom);
  return hosts.some((h) =>
    free(h.geom).some((hl) =>
      partLens.some((pl) => deltaMm(pl, hl, ease) / Math.max(pl, hl) <= PARTNER_REL),
    ),
  );
}
