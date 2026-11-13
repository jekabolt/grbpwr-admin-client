// The base size of a piece's size mapping: the one size every zone is drawn on and carried from.
// One rule for the generator and the piece editor: the preferred size (the card's base sample) when
// the piece has it, else the smallest rank; ties go to the earlier size in the list. The generator
// passes the size rank; the editor its option order as the rank, which keeps its first-option
// fallback.

export function chooseBaseSize<T>(
  sizes: readonly T[],
  isPreferred: (size: T) => boolean,
  rankOf: (size: T, index: number) => number,
): T | null {
  let best: { size: T; preferred: boolean; rank: number } | null = null;
  sizes.forEach((size, index) => {
    const preferred = isPreferred(size);
    const rank = rankOf(size, index);
    if (
      !best ||
      (preferred && !best.preferred) ||
      (preferred === best.preferred && rank < best.rank)
    )
      best = { size, preferred, rank };
  });
  return (best as { size: T } | null)?.size ?? null;
}
