// Where the current base contour of each card piece comes from: the parsed main pattern file, the
// block linked to the piece, at the base size the fusing generator would use.

import { fusingBaseSizeOf } from './fusing-base';
import type { SigPt } from './signature';

/** A card piece linked to a parsed block (lib/dxf-reconcile PieceShapeReference, structurally). */
export type FusingBaseRef = {
  pieceLineKey: string;
  entry: { sizes: readonly string[]; bySize: ReadonlyMap<string, { poly: readonly SigPt[] }> };
};

/** A card size known by a block token: its id and its place in the card's grade. */
export type CardSizeOfToken = (token: string) => { sizeId: number; rank: number } | undefined;

/**
 * One row per linked piece: the base size and its cut contour in mm (the parse is in cm, ×10 like
 * the generator's `sourcePieces`). Sizes are put in the card's grade order (the generator's rank),
 * tokens the card does not know keep the file order after them; a single unsized block (ungraded)
 * stands for the card's base sample size. Pieces whose base size has no id are left out.
 */
export function fusingBaseRows(
  refs: readonly FusingBaseRef[],
  sizeOfToken: CardSizeOfToken,
  cardBaseSizeId: number | null | undefined,
): { pieceLineKey: string; baseSizeId: number; contour: SigPt[] }[] {
  const out: { pieceLineKey: string; baseSizeId: number; contour: SigPt[] }[] = [];
  for (const ref of refs) {
    const sizes = ref.entry.sizes.map((token, fileOrder) => {
      const known = sizeOfToken(token);
      const ungraded = !known && ref.entry.sizes.length === 1;
      return {
        token,
        sizeId: known?.sizeId ?? (ungraded ? cardBaseSizeId ?? 0 : 0),
        rank: known ? known.rank : 1e6 + fileOrder,
      };
    });
    sizes.sort((a, b) => a.rank - b.rank);
    const base = fusingBaseSizeOf(sizes, cardBaseSizeId);
    const piece = base ? ref.entry.bySize.get(base.token) : undefined;
    if (!base || !base.sizeId || !piece?.poly.length) continue;
    out.push({
      pieceLineKey: ref.pieceLineKey,
      baseSizeId: base.sizeId,
      contour: piece.poly.map((p) => ({ x: p.x * 10, y: p.y * 10 })),
    });
  }
  return out;
}
