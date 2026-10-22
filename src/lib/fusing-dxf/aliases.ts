// BLOCK → PIECE LINKS OF THE GENERATED FUSING SHEETS. Pure; regenerate.ts writes the result in the
// same UpdateTechCard as the sheets themselves.
//
// Piece areas (and so interlining consumption) are measured per fabric scope over the scope's alias
// rows; a generated sheet without rows reads «no piece linked to the drawing». The rebuild knows
// exactly which card piece each block came from, so it OWNS the rows of a scope that only generated
// sheets hold: they are rebuilt from scratch every time (a hand edit there is overwritten — it could
// only repeat the rebuild's answer or contradict the source DXF). A scope that also holds a sheet
// somebody uploaded keeps its other rows; only the rows of the rebuild's own blocks are replaced.

export type FusingAliasRow = {
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
  pieceLineKey?: string;
};

export type FusingBinding = { fabricPurpose: string; bomLineKey: string };

export type FusingSheetLinks = {
  binding: FusingBinding;
  links: readonly { blockName: string; pieceLineKey: string }[];
};

const UNSET = 'TECH_CARD_BOM_PURPOSE_UNSET';
const PREFIX = 'TECH_CARD_BOM_PURPOSE_';

const purposeOf = (value: string | undefined) => {
  const v = (value ?? '').trim();
  return !v || v === UNSET ? '' : v;
};

/** The server's scope key of a sheet or alias row: the purpose (wire spelling), else the BOM line. */
export function fusingScopeKey(row: { fabricPurpose?: string; bomLineKey?: string }): string {
  const p = purposeOf(row.fabricPurpose);
  if (p) return (p.startsWith(PREFIX) ? p.slice(PREFIX.length) : p).toLowerCase();
  return (row.bomLineKey ?? '').trim();
}

const rowKey = (row: FusingAliasRow) =>
  `${fusingScopeKey(row)}|${(row.blockName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()}`;

/**
 * The card's next full alias set.
 * `previousGenerated` — the generated sheets the card held before this rebuild (their scopes are the
 * rebuild's, even when the sheet is now gone); `otherSheets` — every sheet the rebuild did not make.
 */
export function nextFusingAliases<A extends FusingAliasRow>(input: {
  current: readonly A[];
  previousGenerated: readonly { fabricPurpose?: string; bomLineKey?: string }[];
  otherSheets: readonly { fabricPurpose?: string; bomLineKey?: string }[];
  sheets: readonly FusingSheetLinks[];
}): FusingAliasRow[] {
  const shared = new Set(input.otherSheets.map(fusingScopeKey).filter(Boolean));
  const owned = new Set(
    [...input.previousGenerated, ...input.sheets.map((sheet) => sheet.binding)]
      .map(fusingScopeKey)
      .filter((key) => key && !shared.has(key)),
  );
  const ours: FusingAliasRow[] = [];
  const oursKeys = new Set<string>();
  for (const sheet of input.sheets) {
    for (const link of sheet.links) {
      const blockName = link.blockName.trim();
      const pieceLineKey = link.pieceLineKey.trim();
      if (!blockName || !pieceLineKey) continue;
      const row: FusingAliasRow = {
        bomLineKey: sheet.binding.bomLineKey,
        fabricPurpose: purposeOf(sheet.binding.fabricPurpose) || UNSET,
        blockName,
        pieceLineKey,
      };
      const key = rowKey(row);
      if (oursKeys.has(key)) continue;
      oursKeys.add(key);
      ours.push(row);
    }
  }
  const kept = input.current.filter(
    (row) => !owned.has(fusingScopeKey(row)) && !oursKeys.has(rowKey(row)),
  );
  return [...kept, ...ours];
}

/** Same rows regardless of order (the server may read them back sorted differently). */
export function sameAliasSet(
  left: readonly FusingAliasRow[],
  right: readonly FusingAliasRow[],
): boolean {
  const canon = (rows: readonly FusingAliasRow[]) =>
    rows
      .map((row) =>
        JSON.stringify([
          (row.bomLineKey ?? '').trim(),
          purposeOf(row.fabricPurpose),
          (row.blockName ?? '').trim(),
          (row.pieceLineKey ?? '').trim(),
        ]),
      )
      .sort();
  return JSON.stringify(canon(left)) === JSON.stringify(canon(right));
}
