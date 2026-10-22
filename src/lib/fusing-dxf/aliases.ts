// BLOCK → PIECE LINKS OF THE GENERATED FUSING SHEETS. Pure; regenerate.ts writes the result in the
// same UpdateTechCard as the sheets themselves.
//
// Piece areas (and so interlining consumption) are measured per fabric scope over the scope's alias
// rows; a generated sheet without rows reads «no piece linked to the drawing». The rebuild knows
// exactly which card piece each block came from, so it OWNS the rows of a scope that only generated
// sheets hold: they are rebuilt from scratch every time (a hand edit there is overwritten — it could
// only repeat the rebuild's answer or contradict the source DXF). A scope that also holds a sheet
// somebody uploaded is never touched (see nextFusingAliases).

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

/**
 * The binding of one generated sheet: `soloPurpose` (the purpose when it owns this line alone) unless
 * an uploaded sheet already holds that purpose scope — then the line scope, which is the generated
 * sheet's alone, so its rows can never be confused with the owner's.
 */
export function pickFusingBinding(
  bomLineKey: string,
  soloPurpose: string,
  otherSheets: readonly { fabricPurpose?: string; bomLineKey?: string }[],
): FusingBinding {
  const purpose = { fabricPurpose: purposeOf(soloPurpose), bomLineKey };
  if (purpose.fabricPurpose) {
    const key = fusingScopeKey(purpose);
    if (!otherSheets.some((sheet) => fusingScopeKey(sheet) === key)) return purpose;
  }
  return { fabricPurpose: UNSET, bomLineKey };
}

const rowKey = (row: FusingAliasRow) =>
  `${fusingScopeKey(row)}|${(row.blockName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()}`;

/**
 * The card's next full alias set, plus the scopes it refused to touch.
 * `previousGenerated` — the generated sheets the card held before this rebuild (their scopes are the
 * rebuild's, even when the sheet is now gone); `otherSheets` — every sheet the rebuild did not make.
 *
 * FAIL CLOSED: the server keys a row only by scope + block, so in a scope that an uploaded sheet
 * also holds nothing proves a row is the rebuild's. Such a scope is never touched — no row removed,
 * none added — and is returned in `shared` for the caller to warn about.
 */
export function nextFusingAliases<A extends FusingAliasRow>(input: {
  current: readonly A[];
  previousGenerated: readonly { fabricPurpose?: string; bomLineKey?: string }[];
  otherSheets: readonly { fabricPurpose?: string; bomLineKey?: string }[];
  sheets: readonly FusingSheetLinks[];
}): { rows: FusingAliasRow[]; shared: string[] } {
  const occupied = new Set(input.otherSheets.map(fusingScopeKey).filter(Boolean));
  const generated = new Set(
    [...input.previousGenerated, ...input.sheets.map((sheet) => sheet.binding)]
      .map(fusingScopeKey)
      .filter(Boolean),
  );
  const shared = [...generated].filter((key) => occupied.has(key));
  const owned = new Set([...generated].filter((key) => !occupied.has(key)));
  const ours: FusingAliasRow[] = [];
  const oursKeys = new Set<string>();
  for (const sheet of input.sheets) {
    if (!owned.has(fusingScopeKey(sheet.binding))) continue;
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
  const kept = input.current.filter((row) => !owned.has(fusingScopeKey(row)));
  return { rows: [...kept, ...ours], shared };
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
