export type PieceNameMatchBasis = 'exact' | 'loose' | 'none';

// CAD exporters disagree about case, spacing and punctuation. This is the same tier-2 key used by
// the piece matcher when it proposes an existing cut piece for a DXF identity.
export function loosePieceName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Exact (case-insensitive) wins over loose, matching PieceMatchModal's proposal order. */
export function pieceNameMatches<T extends { name: string }>(
  names: readonly string[],
  pieces: readonly T[],
): { basis: PieceNameMatchBasis; matches: T[] } {
  const exact = pieces.filter((piece) =>
    names.some((name) => piece.name.toLowerCase() === name.toLowerCase()),
  );
  if (exact.length > 0) return { basis: 'exact', matches: exact };

  const loose = pieces.filter((piece) =>
    names.some((name) => loosePieceName(piece.name) === loosePieceName(name)),
  );
  return loose.length > 0 ? { basis: 'loose', matches: loose } : { basis: 'none', matches: [] };
}
