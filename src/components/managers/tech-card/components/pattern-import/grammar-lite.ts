// LIVE grammar feedback for the code column of the details step.
//
// STUB, to be replaced by `lib/pattern-import/dictionary/grammar.ts` (F5) the moment it lands. The
// contract lets the main thread import only types.ts / manifest/ / worker/client, but the code cell
// needs an answer per keystroke, not per stage round-trip — so the dictionary module (pure, tiny)
// should join that list. Until then this mirrors 08-CONTRACT G11: upper-case, a known PREFIX
// (dictionary SL, owner decision 10), modifiers in the order R/L → F/B → number → #, and the last
// token must not read as a size of the run (FP_L vs size L).

/** Owner's SL dictionary, upper-case. Superset of piece-codes.ts until F5 aligns the two. */
export const PIECE_CODES: Record<string, string> = {
  FP: 'front piece',
  BP: 'back piece',
  SP: 'side panel',
  YK: 'yoke',
  SL: 'sleeve',
  CLR: 'collar',
  CUF: 'cuff',
  PLK: 'placket',
  WB: 'waistband',
  BLT: 'belt',
  FL: 'fly piece',
  PCK: 'pocket',
  FAC: 'facing',
  LIN: 'lining',
  GST: 'gusset',
  HD: 'hood',
};

const ORDER = ['hand', 'side', 'n', 'main'] as const;
type ModKind = (typeof ORDER)[number];

function kindOf(mod: string): ModKind | null {
  if (mod === 'L' || mod === 'R') return 'hand';
  if (mod === 'F' || mod === 'B') return 'side';
  if (/^[0-9]+$/.test(mod)) return 'n';
  if (mod === '#') return 'main';
  return null;
}

export type GrammarVerdict = { ok: true } | { ok: false; why: string };

export function checkIdentity(identity: string, sizeTokens: ReadonlySet<string>): GrammarVerdict {
  const id = identity.trim();
  if (!id) return { ok: false, why: 'empty code' };
  if (id !== id.toUpperCase()) return { ok: false, why: 'upper-case only' };
  const [code, ...mods] = id.split('_');
  if (!PIECE_CODES[code]) return { ok: false, why: `${code} is not in the dictionary` };
  let last = -1;
  for (const m of mods) {
    const k = kindOf(m);
    if (!k) return { ok: false, why: `unknown modifier _${m}` };
    const at = ORDER.indexOf(k);
    if (at <= last) return { ok: false, why: 'modifier order is R/L → F/B → number → #' };
    last = at;
  }
  const tail = mods.length ? mods[mods.length - 1] : code;
  if (sizeTokens.has(tail.toLowerCase()))
    return { ok: false, why: `_${tail} reads as a size of the run` };
  return { ok: true };
}

/** "FP" + ["L"] → "FP_L". */
export const identityOf = (code: string, mods: string[]) => [code, ...mods].join('_');
