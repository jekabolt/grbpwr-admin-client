// WHICH PATTERN SLOTS GET A TILE on the PATTERNS tab (owner 11.11).
//
// A slot (fabric scope) is drawn only while it holds at least one sheet. A roll-goods line without
// a file stays in the BOM only — binding, lining, interlining and main alike. The operator can add
// an EMPTY tile for such a line from the «+ slot» menu; that choice is client-only state, keyed by
// the BOM line (a purpose change re-keys the scope, never the line), and is lost on reload.

export type SlotTileScope = { key: string; lines: readonly { lineKey: string }[] };

export type SlotTilePlan<S extends SlotTileScope> = {
  /** Tiles in scope order: every scope with a sheet, plus the added empty ones. */
  tiles: S[];
  /** Scopes without a tile — the «from BOM» rows of the «+ slot» menu. */
  free: S[];
  /** Added tiles that still hold no sheet (the header's «empty: k»). */
  emptyAdded: number;
};

export function slotTilePlan<S extends SlotTileScope>(
  scopes: readonly S[],
  sheetCount: (scopeKey: string) => number,
  addedLineKeys: ReadonlySet<string>,
): SlotTilePlan<S> {
  const tiles: S[] = [];
  const free: S[] = [];
  let emptyAdded = 0;
  for (const scope of scopes) {
    const sheets = sheetCount(scope.key);
    const added = scope.lines.some((line) => addedLineKeys.has(line.lineKey));
    if (sheets > 0) tiles.push(scope);
    else if (added) {
      tiles.push(scope);
      emptyAdded += 1;
    } else free.push(scope);
  }
  return { tiles, free, emptyAdded };
}
