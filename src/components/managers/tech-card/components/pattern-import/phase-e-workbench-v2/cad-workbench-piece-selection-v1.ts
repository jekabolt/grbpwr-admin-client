export type CadWorkbenchScopedPieceV1 = Readonly<{
  scopeKey: string;
  pieceId: string;
  pieceLineKey: string;
}>;

/** Resolves an exact hit against the current projection, whose scope is owned by its caller. */
export function findCadWorkbenchScopedPieceIndexV1(
  selection:
    | Partial<{ [Key in keyof CadWorkbenchScopedPieceV1]: string | null }>
    | null
    | undefined,
  scopeKey: string,
  pieces: readonly Pick<CadWorkbenchScopedPieceV1, 'pieceId' | 'pieceLineKey'>[],
): number {
  if (!selection?.pieceId || !selection.pieceLineKey || selection.scopeKey !== scopeKey) return -1;
  let index = -1;
  for (const [candidateIndex, piece] of pieces.entries()) {
    if (piece.pieceId !== selection.pieceId || piece.pieceLineKey !== selection.pieceLineKey)
      continue;
    if (index >= 0) return -1;
    index = candidateIndex;
  }
  return index;
}
