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
 * Which interlining lines get a generated sheet, and under what binding.
 *
 * An interlining line is its own fabric scope whatever its purpose (L11: three fusibles all marked
 * «interfacing» are three materials, three sheets, three consumptions), so every generated sheet is
 * bound to its LINE — `{purpose UNSET, bomLineKey}` — and every one gets block→piece rows: the
 * rebuild owns the links of the line scopes only generated sheets hold (nextFusingAliases).
 *
 * `effectiveScope` is the line's scope as the BOM resolves it (its own line for interlining);
 * `uploadedScopes` the same resolution of every uploaded sheet. A line whose scope an uploaded sheet
 * already holds is BLOCKED: nothing generated, the uploaded sheet wins.
 */
export function planFusingLines(input: {
  lines: readonly { bomLineKey: string; effectiveScope: string }[];
  uploadedScopes: readonly string[];
}): { bindings: Map<string, FusingBinding>; blocked: Set<string> } {
  const uploaded = new Set(input.uploadedScopes.map((key) => key.trim()).filter(Boolean));
  const bindings = new Map<string, FusingBinding>();
  const blocked = new Set<string>();
  for (const line of input.lines) {
    if (uploaded.has(line.effectiveScope.trim())) {
      blocked.add(line.bomLineKey);
      continue;
    }
    bindings.set(line.bomLineKey, { fabricPurpose: UNSET, bomLineKey: line.bomLineKey });
  }
  return { bindings, blocked };
}

/**
 * The card's next sheet list: uploaded sheets as they are, each generated row replaced by its line's
 * new row (first one only), generated rows of lines without a replacement REMOVED — a blocked line's
 * old generated sheet included: kept beside the uploaded sheet it would sit in one effective scope
 * under a different raw binding, and the areas of that scope would be refused.
 */
export function nextGeneratedPatterns<P extends { bomLineKey?: string }>(
  oldPatterns: readonly P[],
  isGenerated: (pattern: P) => boolean,
  replacements: ReadonlyMap<string, P>,
): P[] {
  const used = new Set<string>();
  const next = oldPatterns.flatMap((pattern) => {
    if (!isGenerated(pattern)) return [pattern];
    const key = pattern.bomLineKey?.trim() ?? '';
    const replacement = replacements.get(key);
    if (!replacement || used.has(key)) return [];
    used.add(key);
    return [replacement];
  });
  for (const [key, replacement] of replacements) if (!used.has(key)) next.push(replacement);
  return next;
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

/**
 * L11 WHOLE-SET RULE FOR LINKS. A line whose links are still the legacy purpose-first set (read for
 * it only while no link is bound to the line) would lose every one of them to the first line-bound
 * link the rebuild wrote. The rebuild rebuilds only rows it owns — of a scope only generated sheets
 * hold (nextFusingAliases) — and never rebinds an owner's rows, so a line with such owner rows is
 * HELD, like a line an uploaded sheet holds. `legacyScopeOf(row)` — the line a row is an ACTIVE
 * legacy link of (bom-purpose activeLegacyScopeOf), else ''.
 */
export function linesHeldByLegacyLinks<A extends FusingAliasRow>(input: {
  current: readonly A[];
  legacyScopeOf: (row: A) => string;
  previousGenerated: readonly { fabricPurpose?: string; bomLineKey?: string }[];
  otherSheets: readonly { fabricPurpose?: string; bomLineKey?: string }[];
}): Set<string> {
  const occupied = new Set(input.otherSheets.map(fusingScopeKey).filter(Boolean));
  const ours = new Set(
    input.previousGenerated.map(fusingScopeKey).filter((key) => key && !occupied.has(key)),
  );
  const held = new Set<string>();
  for (const row of input.current) {
    const line = input.legacyScopeOf(row).trim();
    if (line && !ours.has(fusingScopeKey(row))) held.add(line);
  }
  return held;
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
