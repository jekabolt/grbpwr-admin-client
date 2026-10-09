// Piece identity = CODE(_MOD)* (manifest/identity.ts is THE grammar; G11 runs the same function).
//
// Where a name comes from, strongest first:
//   1. `pieceOverrides[seed]` — the operator's or the AI's answer (code, mods, displayName,
//      nameOrigin incl. 'ai-auto', aiConfidence) — taken as given, only CHECKED;
//   2. the DXF block identity (F8 `dxf.identity`: block name minus size / AAMA PIECE NAME) —
//      upper-cased, the author's `UNI` token read as "ungraded" and removed, modifiers put in
//      grammar order (R/L → F/B → n → #), a trailing size token of the run removed;
//   3. printed text inside the piece (`dictionary/ readPieceText`: EN/DE/RU/FR/NL/PL/ES/DA) → code
//      + F/B; a lining label makes the code `LIN_<code>` (K1: lining names differ from the shell's).
// Size tokens are NEVER part of an identity: the card reads the last token as the size (FP_L vs L)
// unless it is the declared hand of a pair.

import { codeName, isKnownCode, readPieceText } from '../dictionary';
import {
  codeWordsOf,
  identityGrammarProblem,
  identityProblem,
  modStage,
} from '../manifest/identity';
import type { PairHand, PieceSpec } from '../types';

export type NameReading = {
  code: string;
  /** Modifiers WITHOUT the hand (the hand is `hand`). */
  mods: string[];
  /** L/R written in the name (`FP_L`): a drawn hand. */
  hand: PairHand | null;
  displayName: string;
  nameOrigin: PieceSpec['nameOrigin'];
  aiConfidence?: number;
  /** The source declared the piece ungraded (`PCK_L_UNI`). */
  uni: boolean;
  notes: string[];
};

/** Split an identity-like string into code words + modifiers in grammar order. */
export function parseIdentity(
  raw: string,
  isSizeToken: (t: string) => boolean,
): { code: string; mods: string[]; hand: PairHand | null; uni: boolean; notes: string[] } | null {
  const notes: string[] = [];
  const toks = raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]+/g, '_')
    .replace(/[<>()[\]]/g, '')
    .split('_')
    .filter(Boolean);
  let uni = false;
  const kept: string[] = [];
  for (const t of toks) {
    if (t === 'UNI') {
      uni = true;
      continue;
    }
    kept.push(t);
  }
  if (uni) notes.push('UNI in the name: ungraded');
  // a trailing size token (FP_M from a single-size export) is the size, not the identity
  while (
    kept.length > 1 &&
    isSizeToken(kept[kept.length - 1]) &&
    modStage(kept[kept.length - 1]) !== 0
  ) {
    notes.push(`size token ${kept[kept.length - 1]} removed from the name`);
    kept.pop();
  }
  const code: string[] = [];
  let i = 0;
  while (i < kept.length && (code.length === 0 || modStage(kept[i]) < 0)) code.push(kept[i++]);
  const mods = kept.slice(i);
  if (!code.length) return null;
  const ordered = [...mods].sort((a, b) => modStage(a) - modStage(b));
  if (ordered.join('_') !== mods.join('_'))
    notes.push(`modifiers reordered ${mods.join('_')} → ${ordered.join('_')}`);
  const hands = ordered.filter((m) => m === 'L' || m === 'R');
  const hand = hands.length === 1 ? (hands[0] as PairHand) : null;
  return {
    code: code.join('_'),
    mods: ordered.filter((m) => !(hand && m === hand)),
    hand,
    uni,
    notes,
  };
}

/** A readable name for the names table when nobody gave one. */
export function defaultDisplayName(
  code: string,
  mods: readonly string[],
  hand: PairHand | null,
): string {
  const words = codeWordsOf([code, ...mods].join('_')).map((w) => codeName(w) || w.toLowerCase());
  const side = mods.includes('F') ? 'front ' : mods.includes('B') ? 'back ' : '';
  const num = mods.find((m) => /^\d+$/.test(m));
  const h = hand === 'L' ? ' left' : hand === 'R' ? ' right' : '';
  return `${side}${words.join(' ')}${num ? ` ${num}` : ''}${h}`.trim();
}

export function readName(opts: {
  override?: Partial<
    Pick<PieceSpec, 'code' | 'mods' | 'displayName' | 'nameOrigin' | 'aiConfidence' | 'pairHand'>
  >;
  dxfIdentity?: string | null;
  texts: string[];
  isSizeToken: (t: string) => boolean;
}): NameReading | null {
  const { override, dxfIdentity, texts, isSizeToken } = opts;
  if (override?.code) {
    const mods = override.mods ?? [];
    const hands = mods.filter((m) => m === 'L' || m === 'R');
    const hand = hands.length === 1 ? (hands[0] as PairHand) : null;
    return {
      code: override.code,
      mods: mods.filter((m) => !(hand && m === hand)),
      hand,
      displayName: override.displayName ?? defaultDisplayName(override.code, mods, hand),
      nameOrigin: override.nameOrigin ?? 'operator',
      ...(override.aiConfidence != null ? { aiConfidence: override.aiConfidence } : {}),
      uni: false,
      notes: [],
    };
  }
  if (dxfIdentity) {
    const p = parseIdentity(dxfIdentity, isSizeToken);
    // A block named in words (`pocket_l_1`, `FRONT`) gets the dictionary code for the words.
    if (p && !p.code.split('_').every(isKnownCode)) {
      const r = readPieceText(p.code.replace(/_/g, ' '));
      if (r.code) {
        p.notes.push(`"${p.code}" read as ${r.code}`);
        p.code = r.code;
        if (r.side && r.code !== 'FP' && r.code !== 'BP' && !p.mods.includes(r.side))
          p.mods = [...p.mods, r.side].sort((a, b) => modStage(a) - modStage(b));
      }
    }
    if (p && !identityGrammarProblem([p.code, ...p.mods].join('_'))) {
      return {
        ...p,
        displayName: override?.displayName ?? defaultDisplayName(p.code, p.mods, p.hand),
        nameOrigin: 'text',
        notes: [`name from the DXF block ${dxfIdentity}`, ...p.notes],
      };
    }
  }
  for (const t of texts) {
    const r = readPieceText(t);
    if (!r.code) continue;
    const code = r.fabric === 'lining' && r.code !== 'LIN' ? `LIN_${r.code}` : r.code;
    const mods = r.side && r.code !== 'FP' && r.code !== 'BP' ? [r.side] : [];
    return {
      code,
      mods,
      hand: null,
      displayName: override?.displayName ?? t.trim().slice(0, 60),
      nameOrigin: 'text',
      uni: false,
      notes: [`name read from «${t.trim().slice(0, 40)}» (${r.matched})`],
    };
  }
  return null;
}

/** G11 for one identity, with the dictionary only for AI names (F10: the operator's list is open). */
export function identityCheck(
  identity: string,
  origin: PieceSpec['nameOrigin'],
  pair: { hand: PairHand | null; of: string | null },
  isSizeToken: (t: string) => boolean,
): string | null {
  return identityProblem(identity, {
    isSizeToken,
    pair,
    isKnownCode: origin === 'ai' || origin === 'ai-auto' ? isKnownCode : undefined,
  });
}
