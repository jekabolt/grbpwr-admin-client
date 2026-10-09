// LOCAL structural identity grammar for G11, until F5's `dictionary/grammar.ts` lands
// (inject it as `CardBlockRules.isValidIdentity`; it adds dictionary membership of the code).
//
//   IDENTITY = CODE ( _MOD )*         upper-case ASCII
//   CODE     = WORD ( _WORD )*        WORD = [A-Z][A-Z0-9]* and not itself a MOD (LIN_FP is a code)
//   MODS     in order R/L → F/B → n → #, each kind at most once
//
// Examples: FP_L, SL_R_B_1_#, PCK_L_#, LIN_FP_L, CLR.  Rejected: fp_l, FP_F_L (order), FP__L.

const stageOf = (t: string): number => {
  if (t === 'L' || t === 'R') return 0;
  if (t === 'F' || t === 'B') return 1;
  if (/^\d+$/.test(t)) return 2;
  if (t === '#') return 3;
  return -1;
};

export function identityGrammarProblem(identity: string): string | null {
  if (!identity) return 'empty identity';
  if (identity !== identity.toUpperCase()) return 'not upper-case';
  if (!/^[A-Z0-9#_]+$/.test(identity)) return 'characters outside A–Z 0–9 # _';
  const toks = identity.split('_');
  if (toks.some((t) => !t)) return 'empty token';
  if (stageOf(toks[0]) >= 0 || !/^[A-Z][A-Z0-9]*$/.test(toks[0]))
    return `code "${toks[0]}" is not a word`;
  let i = 1;
  while (i < toks.length && stageOf(toks[i]) < 0) {
    if (!/^[A-Z][A-Z0-9]*$/.test(toks[i]))
      return `token "${toks[i]}" is neither a code word nor a mod`;
    i++;
  }
  let last = -1;
  for (; i < toks.length; i++) {
    const s = stageOf(toks[i]);
    if (s < 0) return `"${toks[i]}" after the mods`;
    if (s <= last) return `mods out of order at "${toks[i]}" (R/L → F/B → n → #)`;
    last = s;
  }
  return null;
}

export const isValidIdentityLocal = (identity: string) => identityGrammarProblem(identity) === null;
