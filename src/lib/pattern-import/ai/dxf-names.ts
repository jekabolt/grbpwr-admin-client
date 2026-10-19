// DXF BLOCK NAMES OUTRANK THE AI (D3, owner decisions 9–11; E2E-1010 §4 item 2).
//
// A garment DXF (CLO, Gerber, Lectra…) names its pieces in its blocks: BP, FP_L / FP_R, SL_L,
// CLR_3. Those names are the author's, so they are the piece's name — semantics already reads them
// (`semantics/names.ts readName`, step 2), and pairs come from their `_L` / `_R`. The AI namer
// sits ABOVE that step (its answer travels as a semantics override), so asking it about a named
// block replaced the author's name with a guess and dropped the pair. Here the wizard splits the
// pieces BEFORE the namer is called:
//   · a block whose identity reads as a valid name (the G11 grammar after `readName`'s own
//     clean-up: size token, UNI, word → code) and is not a placeholder (PIECE_1, BLOCK2, P_3,
//     PATTERN, a bare number) is NAMED BY THE DXF — never sent to the AI, no override written;
//   · only the rest (numeric / placeholder / invalid / no block name) is asked.
// So a CLO file whose every block is named makes no AI call at all, and an AI answer can only ever
// fill a name the file does not have.
import { readName } from '../semantics/names';
import { sizeTokenTest } from '../manifest/identity';
import type { NameDecision, PieceFamily, PieceSpec, SeedId } from '../types';

/** The DXF block identity a fast-path candidate carries (segmentation, F8). */
type DxfCarrier = { dxf?: { identity?: string } };

/** Code words that say "a piece" without saying which: a block so named is unnamed. */
const PLACEHOLDER = new Set([
  'P',
  'PC',
  'PCE',
  'PIECE',
  'PIECES',
  'PART',
  'BLOCK',
  'BLK',
  'DETAIL',
  'PATTERN',
  'PAT',
  'SHAPE',
  'OBJECT',
  'OBJ',
  'ITEM',
  'NONAME',
  'UNNAMED',
  'UNTITLED',
  'NEW',
]);

/** The block identity of a family (the first candidate that carries one). */
export function dxfIdentityOf(fam: PieceFamily): string | null {
  for (const c of fam.candidates) {
    const id = (c as DxfCarrier).dxf?.identity?.trim();
    if (id) return id;
  }
  return null;
}

/**
 * The name a DXF block gives, as the names table shows it — or null when the block is unnamed
 * (no identity, a placeholder, a number, or nothing the identity grammar accepts).
 */
export function dxfNameOf(
  seed: SeedId,
  identity: string | null,
  sizeTokens: readonly string[],
): NameDecision | null {
  if (!identity) return null;
  const r = readName({ dxfIdentity: identity, texts: [], isSizeToken: sizeTokenTest(sizeTokens) });
  if (!r) return null;
  const words = r.code.split('_');
  // PIECE_1, BLOCK2, P3: a word of letters + a number, or a placeholder word — not a name
  if (words.some((w) => PLACEHOLDER.has(w.replace(/\d+$/, '')))) return null;
  return {
    seed,
    suggestion: null,
    source: 'dxf',
    evidence: [],
    confidence: 1,
    autoAccepted: false,
    code: r.code,
    // the hand is the pair (FP_L / FP_R), shown in the pair column like any other pair
    mods: r.mods,
    displayName: r.displayName,
  };
}

export type NamingPlan = {
  /** Pieces the DXF names — shown as they are, never sent to the AI. */
  named: NameDecision[];
  /** Pieces to ask the AI about (no usable block name). */
  ask: SeedId[];
};

/** Split the pieces into DXF-named ones and the ones the AI may be asked about. */
export function planNaming(
  families: readonly PieceFamily[],
  sizeTokens: readonly string[],
): NamingPlan {
  const named: NameDecision[] = [];
  const ask: SeedId[] = [];
  for (const f of families) {
    const n = dxfNameOf(f.seed, dxfIdentityOf(f), sizeTokens);
    if (n) named.push(n);
    else ask.push(f.seed);
  }
  return { named, ask };
}

/**
 * The names table after the namer answered: the DXF's names, then the AI's answers for the pieces
 * it was ASKED about only — an answer about a DXF-named piece (a stale cache, a server that ignored
 * the crop list) is dropped, never ranked above the block name.
 */
export function withAiNames(plan: NamingPlan, ai: readonly NameDecision[]): NameDecision[] {
  const asked = new Set(plan.ask);
  return [...plan.named, ...ai.filter((n) => asked.has(n.seed) && n.source !== 'dxf')];
}

/** Where a name came from, as the manifest records it (a DXF block name is the source's text). */
export function nameOriginOf(
  n: NameDecision,
  typed: boolean,
): NonNullable<PieceSpec['nameOrigin']> {
  if (typed) return 'operator';
  // 'text' = the deterministic reader named it (sheet text or the DXF block), no model involved. An
  // AI answer the sheet text agrees with is still the AI's: auto-accepted it stays flagged
  // 'ai-auto' (owner decision 11).
  if (n.source === 'text' || n.source === 'dxf') return 'text';
  return n.autoAccepted ? 'ai-auto' : 'ai';
}

type Override = {
  code?: string;
  mods?: string[];
  displayName?: string;
  nameOrigin?: PieceSpec['nameOrigin'];
  aiConfidence?: number;
};

/**
 * Every name as a semantics override, so the writer spells what the table shows AND the manifest
 * says where the name came from — EXCEPT a DXF-named piece nobody typed over: semantics reads the
 * block itself (with its pair), so its override carries no name at all (a stale one is cleared).
 */
export function overridesFromNames<O extends Override>(
  names: readonly NameDecision[],
  base: Partial<Record<SeedId, O>>,
  edited: ReadonlySet<SeedId>,
): Partial<Record<SeedId, O>> {
  const out: Partial<Record<SeedId, O>> = { ...base };
  for (const n of names) {
    const typed = edited.has(n.seed);
    const {
      aiConfidence: _c,
      code: _k,
      mods: _m,
      displayName: _d,
      nameOrigin: _o,
      ...rest
    } = (out[n.seed] ?? {}) as O;
    if (n.source === 'dxf' && !typed) {
      out[n.seed] = rest as O;
      continue;
    }
    const nameOrigin = nameOriginOf(n, typed);
    out[n.seed] = {
      ...rest,
      code: n.code,
      mods: n.mods,
      displayName: n.displayName,
      nameOrigin,
      ...(nameOrigin === 'ai' || nameOrigin === 'ai-auto' ? { aiConfidence: n.confidence } : {}),
    } as O;
  }
  return out;
}
