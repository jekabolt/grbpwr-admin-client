// Piece IDENTITY grammar (08-CONTRACT §5 G11) — ONE rule for the gate and the wizard.
//
// Pure string ops, so it lives in manifest/ (main-thread importable, 08 §2): the wizard checks the
// code cell per keystroke with exactly the function G11 runs inside the worker. F5's dictionary
// plugs in through `isKnownCode`; without it the check is structural.
//
//   IDENTITY = CODE ( _MOD )*         upper-case ASCII
//   CODE     = WORD ( _WORD )*        WORD = [A-Z][A-Z0-9]* and not itself a MOD (LIN_FP is a code)
//   MODS     in order R/L → F/B → n → #, each kind at most once
//   and the identity's LAST token is not a size token of the run (FP_L vs size L) — EXCEPT the
//   declared hand of a real pair (pairHand = that token AND pairOf set): owner decision 9 makes
//   `_L`/`_R` mandatory, and the card splits `FP_L_L` → FP_L / L correctly (G9 proves it per file).
//
// Examples: FP_L, SL_R_B_1_#, PCK_L_#, LIN_FP_L, CLR.  Rejected: fp_l, FP_F_L (order), FP__L,
// SL_L on a run with size L when SL_L is not a declared pair.

import type { PairHand } from '../types';

/** 0 hand (L/R) · 1 side (F/B) · 2 part number · 3 main (#) · −1 not a modifier. */
export const modStage = (t: string): number => {
  if (t === 'L' || t === 'R') return 0;
  if (t === 'F' || t === 'B') return 1;
  if (/^\d+$/.test(t)) return 2;
  if (t === '#') return 3;
  return -1;
};

const WORD = /^[A-Z][A-Z0-9]*$/;

/** Code words of a structurally valid identity (`LIN_FP_L` → ['LIN', 'FP']). */
export function codeWordsOf(identity: string): string[] {
  const toks = identity.split('_');
  const out: string[] = [];
  for (const t of toks) {
    if (out.length && modStage(t) >= 0) break;
    out.push(t);
  }
  return out;
}

/** Structural grammar only: null = ok, else why not. */
export function identityGrammarProblem(identity: string): string | null {
  if (!identity) return 'empty identity';
  if (identity !== identity.toUpperCase()) return 'not upper-case';
  if (!/^[A-Z0-9#_]+$/.test(identity)) return 'characters outside A–Z 0–9 # _';
  const toks = identity.split('_');
  if (toks.some((t) => !t)) return 'empty token';
  if (modStage(toks[0]) >= 0 || !WORD.test(toks[0])) return `code "${toks[0]}" is not a word`;
  let i = 1;
  while (i < toks.length && modStage(toks[i]) < 0) {
    if (!WORD.test(toks[i])) return `token "${toks[i]}" is neither a code word nor a mod`;
    i++;
  }
  let last = -1;
  for (; i < toks.length; i++) {
    const s = modStage(toks[i]);
    if (s < 0) return `"${toks[i]}" after the mods`;
    if (s <= last) return `mods out of order at "${toks[i]}" (R/L → F/B → n → #)`;
    last = s;
  }
  return null;
}

/** Size-token comparison key — the card's `bareToken` (block-code.ts): letters + digits, lower. */
export const bareSizeToken = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** `isSizeToken` for a card run given as tokens in any case/decoration. */
export function sizeTokenTest(tokens: Iterable<string>): (token: string) => boolean {
  const set = new Set([...tokens].map(bareSizeToken));
  return (t) => set.has(bareSizeToken(t));
}

export type IdentityRules = {
  /** Is this token a size of the card's run? */
  isSizeToken: (token: string) => boolean;
  /** The piece's declared pair (PieceSpec/ManifestPiece pairHand + pairOf). */
  pair?: { hand: PairHand | null; of: string | null } | null;
  /** Dictionary membership of a code word (F5 `dictionary/`). Absent = structural only. */
  isKnownCode?: (word: string) => boolean;
};

/** The full G11 identity rule. null = ok, else why not (operator words). */
export function identityProblem(identity: string, rules: IdentityRules): string | null {
  const g = identityGrammarProblem(identity);
  if (g) return g;
  if (rules.isKnownCode)
    for (const w of codeWordsOf(identity))
      if (!rules.isKnownCode(w)) return `${w} is not in the dictionary`;
  const toks = identity.split('_');
  const last = toks[toks.length - 1];
  const declaredHand = !!rules.pair?.of && rules.pair.hand === last;
  if (toks.length > 1 && rules.isSizeToken(last) && !declaredHand)
    return `_${last} reads as a size of the run (only a declared L/R pair may end in it)`;
  return null;
}

/**
 * The identities a seed is written as: one, or BOTH hands of a pair (owner decision 9), the hand
 * being the first modifier. Each comes with the pair fields the writer/manifest carry — so a check
 * run on these gets the pair exemption exactly as G11 will.
 */
export function identitiesOf(
  code: string,
  mods: readonly string[],
  hand: PairHand | null,
): { identity: string; mods: string[]; pairHand: PairHand | null; pairOf: string | null }[] {
  const join = (m: readonly string[]) => [code, ...m].filter(Boolean).join('_');
  if (!hand) return [{ identity: join(mods), mods: [...mods], pairHand: null, pairOf: null }];
  const rest = mods.filter((m) => m !== 'L' && m !== 'R');
  const L = join(['L', ...rest]);
  const R = join(['R', ...rest]);
  return [
    { identity: L, mods: ['L', ...rest], pairHand: 'L', pairOf: R },
    { identity: R, mods: ['R', ...rest], pairHand: 'R', pairOf: L },
  ];
}
