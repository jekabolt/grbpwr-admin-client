// PIECE CODE DICTIONARY — the one list of base codes (08-CONTRACT §2 `dictionary/`, owner decision 10,
// orchestrator decision D2).
//
// The spelling is the pattern maker's, as `nesting/block-code.ts` already reads real files: SLEEVE IS
// `SL` (not SLV), everything UPPER-CASE, modifiers `_R/_L`, `_F/_B`, `_1…`, `_#`. `piece-codes.ts`
// (the card's datalist and legend) reads its base codes from here, so the converter, the AI and the
// card can never spell one piece two ways — two dictionaries would give two pieces instead of one.
//
// D2 (09.10, after K0): SK skirt, HB hem band, LAP lapel, HD hood, TAB tab were missing — the truth
// corpus had to fall back to BP_3/FP_3 for a skirt and flag grammar gaps for the rest.
//
// Main-thread safe: constants and string ops only.

export type PieceCode = { code: string; name: string };

/** Base codes in presentation order. Suggestions, not a closed list for the operator (see isKnownCode). */
export const PIECE_CODES: readonly PieceCode[] = [
  { code: 'FP', name: 'front piece' },
  { code: 'BP', name: 'back piece' },
  { code: 'SP', name: 'side panel' },
  { code: 'YK', name: 'yoke' },
  { code: 'SL', name: 'sleeve' },
  { code: 'CLR', name: 'collar' },
  { code: 'LAP', name: 'lapel' },
  { code: 'HD', name: 'hood' },
  { code: 'CUF', name: 'cuff' },
  { code: 'PLK', name: 'placket' },
  { code: 'WB', name: 'waistband' },
  { code: 'WS', name: 'waist strap' },
  { code: 'BLT', name: 'belt' },
  { code: 'TAB', name: 'tab' },
  { code: 'FL', name: 'fly piece' },
  { code: 'PCK', name: 'pocket' },
  { code: 'FAC', name: 'facing' },
  { code: 'LIN', name: 'lining' },
  { code: 'GST', name: 'gusset' },
  { code: 'SK', name: 'skirt' },
  { code: 'HB', name: 'hem band' },
];

/** The letter/symbol modifiers; a part number 1..20 is always a modifier too. Order = grammar order. */
export const PIECE_MODIFIERS: readonly { mod: string; name: string }[] = [
  { mod: 'R', name: 'right (as worn)' },
  { mod: 'L', name: 'left (as worn)' },
  { mod: 'F', name: 'front' },
  { mod: 'B', name: 'back' },
  { mod: '#', name: 'main piece' },
];

/** What the AI may put after a code (F9 `allowed_modifiers`); part numbers need no listing. */
export const AI_MODIFIERS: readonly string[] = ['L', 'R', 'F', 'B', '#'];

const KNOWN = new Set(PIECE_CODES.map((c) => c.code));

/**
 * Dictionary membership of ONE code word (`LIN_FP_L` has two: LIN and FP). Plugs into
 * `manifest/identity.ts identityProblem({ isKnownCode })`. Exact, upper-case: `fp` and `SLV` are not
 * known — the grammar's case rule and the SL decision are the point of the dictionary.
 */
export function isKnownCode(word: string): boolean {
  return KNOWN.has(word);
}

/** The English name of a base code, '' when unknown. */
export function codeName(code: string): string {
  return PIECE_CODES.find((c) => c.code === code)?.name ?? '';
}
