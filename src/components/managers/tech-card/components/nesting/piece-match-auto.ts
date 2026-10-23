export const CREATE_PIECE_CHOICE = '+create';

export type AutoPieceMatchRow = {
  block: string;
  suggested: string;
  choice: string;
};

/** Accept every current proposal without overwriting a decision the operator already made. */
export function autoPieceMatchRows<T extends AutoPieceMatchRow>(
  rows: readonly T[],
  changedBlocks: ReadonlySet<string>,
): T[] {
  return rows.map((row) => {
    if (changedBlocks.has(row.block.toLowerCase())) return row;
    const choice = row.suggested.trim() || CREATE_PIECE_CHOICE;
    return choice === row.choice ? row : { ...row, choice };
  });
}

/** AUTO and SAVE share one guard, so the shortcut can never bypass a blocked apply. */
export function pieceMatchActionDisabled(
  canSave: boolean,
  saving: boolean,
  blocked: boolean,
): boolean {
  return canSave && (saving || blocked);
}
